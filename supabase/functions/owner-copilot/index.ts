// AI Copilot Owner: database menyiapkan FAKTA (copilot_snapshot, dibatasi RLS + peran Owner); model hanya merangkum.
// Alur: JWT Owner → copilot_snapshot() → 9router (lewat konfigurasi yang sama dengan ai-gateway) → jawaban + log.
// Model dilarang mengarang angka: seluruh angka harus berasal dari snapshot. Tidak ada PII pelanggan/pasien di snapshot.
import { json, corsHeaders } from "../_shared/cors.ts";
import { userContext, admin } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/redis.ts";

declare const Deno: any;

const SYSTEM = `Anda analis bisnis untuk pemilik usaha. Jawab singkat dalam Bahasa Indonesia.
Gunakan HANYA angka pada DATA. Jika data tidak cukup, katakan tidak tahu. Jangan memberi saran hukum/pajak/medis.
Tandai asumsi, dan beri maksimal 3 tindakan konkret.`;

// Parser tangguh dua mode: membaca JSON standar ATAU agregasi stream Server-Sent Events (SSE)
async function parseLlmResponse(res: Response): Promise<{ answer: string; totalTokens: number }> {
  const text = await res.text();
  let answer = "";
  let totalTokens = 0;

  // 1. Coba parse JSON langsung (respons standar non-streaming)
  try {
    const data = JSON.parse(text);
    answer = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? "";
    totalTokens = data?.usage?.total_tokens ?? 0;
    if (answer) return { answer: answer.trim(), totalTokens };
  } catch {
    // bukan JSON mentah tunggal, lanjut ke fallback parser SSE
  }

  // 2. Fallback: jika provider mengirim text/event-stream data: {...}
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") break;
    try {
      const chunk = JSON.parse(payload);
      const delta = chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.message?.content ?? "";
      if (delta) answer += delta;
      if (chunk?.usage?.total_tokens) totalTokens = chunk.usage.total_tokens;
    } catch {
      // Lewati baris non-JSON
    }
  }

  return { answer: answer.trim(), totalTokens };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const ctx = await userContext(req);
  if (!ctx) return json(req, { error: "Tidak terautentikasi" }, 401);
  const { db, profile } = ctx;
  if (profile.role !== "owner") return json(req, { error: "Copilot hanya untuk Owner" }, 403);
  try {
    if (!(await rateLimit(`copilot:${profile.id}`, 10, 60))) return json(req, { error: "Terlalu banyak pertanyaan, coba lagi sebentar" }, 429);
  } catch { /* Upstash belum dikonfigurasi: lanjut */ }

  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 1000) return json(req, { error: "Pertanyaan 3–1000 karakter" }, 400);

  const sb = admin();
  const { data: integ } = await sb.from("tenant_integrations").select("ai_enabled").eq("tenant_id", profile.tenant_id).maybeSingle();
  if (!integ?.ai_enabled) return json(req, { error: "AI belum diaktifkan untuk tenant ini" }, 403);

  const { data: quota } = await sb.rpc("ai_quota_check", { p_tenant: profile.tenant_id });
  if (quota && quota.allowed === false) return json(req, { error: "Kuota token AI bulan ini habis", used: quota.used, quota: quota.quota }, 402);

  const { data: snap, error: e1 } = await db.rpc("copilot_snapshot");
  if (e1) return json(req, { error: e1.message }, 400);

  const { data: setting } = await sb.from("platform_settings").select("value").eq("key", "ai_gateway").maybeSingle();
  const cfg = setting?.value ?? {};

  // Normalisasi Base URL / Endpoint 9router
  const rawBase = (cfg.base_url || Deno.env.get("NINEROUTER_API_BASE") || "http://43.134.43.146:20128/v1").trim().replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/chat/completions") ? rawBase : `${rawBase}/chat/completions`;

  const key = Deno.env.get(cfg.secret_name ?? "NINEROUTER_API_KEY") || Deno.env.get("NINEROUTER_API_KEY");
  if (!key) return json(req, { error: "API key 9router belum diset sebagai secret" }, 500);

  const primaryModel = cfg.default_model || Deno.env.get("NINEROUTER_PRIMARY_MODEL") || "harumin-combos";
  const fallbackList: string[] = Array.isArray(cfg.fallback_chain) ? cfg.fallback_chain : ["hermes-combos", "bemfkgumi-combos"];
  const modelsToTry = [primaryModel, ...fallbackList.filter((m) => m !== primaryModel)];

  const timeoutMs = Number(cfg.timeout_ms || Deno.env.get("NINEROUTER_TIMEOUT_MS") || 30000);

  let lastError = "Model tidak memberi jawaban";

  for (const model of modelsToTry) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: `DATA:\n${JSON.stringify(snap)}\n\nPERTANYAAN: ${question.trim()}` },
          ],
          stream: false,
          temperature: 0.3,
        }),
      });

      const { answer } = await parseLlmResponse(res);

      if (res.ok && answer) {
        // Sistem Kuota: 1 pertanyaan sukses = 1 token kuota terpakai
        await sb.rpc("ai_record_usage", { p_tenant: profile.tenant_id, p_tokens: 1 });
        await db.rpc("log_copilot", { p_question: question.trim(), p_answer: answer, p_tokens: 1 });
        return json(req, { answer, snapshot_at: snap?.generated_at, model, tokens_used: 1 });
      }

      lastError = `Model ${model} gagal (${res.status}): ${answer || "Jawaban kosong"}`;
    } catch (e) {
      lastError = `9router (${model}) tidak terjangkau: ${(e as Error).message}`;
    } finally {
      clearTimeout(timer);
    }
  }

  return json(req, { error: lastError }, 502);
});
