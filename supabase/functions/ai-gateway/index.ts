// Proxy ke 9router (OpenAI-compatible /v1/chat/completions). API key tidak pernah sampai ke browser.
// Secret: NINEROUTER_API_KEY. Konfigurasi non-rahasia: platform_settings.ai_gateway.
import { json, corsHeaders } from "../_shared/cors.ts";
import { userContext, admin } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/redis.ts";

declare const Deno: any;

async function parseLlmResponse(res: Response): Promise<{ choices: any[]; usage?: any; model?: string; rawText: string }> {
  const text = await res.text();
  // 1. Coba parse JSON langsung
  try {
    const data = JSON.parse(text);
    if (data?.choices) return { choices: data.choices, usage: data.usage, model: data.model, rawText: text };
  } catch {
    // SSE Fallback
  }

  // 2. Parse SSE
  let accumulated = "";
  let usage: any = null;
  let model: string | undefined;

  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") break;
    try {
      const chunk = JSON.parse(payload);
      if (chunk?.model) model = chunk.model;
      if (chunk?.usage) usage = chunk.usage;
      const delta = chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.message?.content ?? "";
      if (delta) accumulated += delta;
    } catch { /* abaikan chunk parsial */ }
  }

  return {
    choices: [{ index: 0, message: { role: "assistant", content: accumulated } }],
    usage: usage ?? { total_tokens: 100 },
    model,
    rawText: text,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const ctx = await userContext(req);
  if (!ctx) return json(req, { error: "Tidak terautentikasi" }, 401);
  const { profile } = ctx;

  if (!(await rateLimit(`ai:${profile.tenant_id ?? "platform"}`, 30, 60))) {
    return json(req, { error: "Kuota AI per menit habis" }, 429);
  }

  const sb = admin();
  const { data: setting } = await sb.from("platform_settings").select("value").eq("key", "ai_gateway").maybeSingle();
  const cfg = setting?.value ?? {};
  if (profile.tenant_id) {
    const { data: integ } = await sb.from("tenant_integrations").select("ai_enabled").eq("tenant_id", profile.tenant_id).single();
    if (!integ?.ai_enabled) return json(req, { error: "AI belum diaktifkan untuk tenant ini" }, 403);
  }

  if (profile.tenant_id) {
    const { data: quota } = await sb.rpc("ai_quota_check", { p_tenant: profile.tenant_id });
    if (quota && quota.allowed === false) return json(req, { error: "Kuota token AI bulan ini habis", used: quota.used, quota: quota.quota }, 402);
  }

  const rawBase = (cfg.base_url || Deno.env.get("NINEROUTER_API_BASE") || "http://43.134.43.146:20128/v1").trim().replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/chat/completions") ? rawBase : `${rawBase}/chat/completions`;

  const key = Deno.env.get(cfg.secret_name ?? "NINEROUTER_API_KEY") || Deno.env.get("NINEROUTER_API_KEY");
  if (!key) return json(req, { error: "API key 9router belum diset sebagai secret" }, 500);

  const { messages, model } = await req.json().catch(() => ({}));
  if (!Array.isArray(messages) || messages.length === 0) return json(req, { error: "messages wajib" }, 400);

  const targetModel = model ?? cfg.default_model ?? Deno.env.get("NINEROUTER_PRIMARY_MODEL") ?? "harumin-combos";
  const timeoutMs = Number(cfg.timeout_ms || Deno.env.get("NINEROUTER_TIMEOUT_MS") || 30000);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: targetModel, messages, stream: false }),
    });

    const parsed = await parseLlmResponse(res);
    const data = {
      choices: parsed.choices,
      usage: parsed.usage,
      model: parsed.model ?? targetModel,
    };

    if (profile.tenant_id) await sb.rpc("ai_record_usage", { p_tenant: profile.tenant_id, p_tokens: parsed.usage?.total_tokens ?? 0 });
    await sb.from("audit_logs").insert({
      tenant_id: profile.tenant_id, actor_id: profile.id, actor_role: profile.role,
      action: "ai_call", entity: "ai_gateway", detail: { status: res.status, model: parsed.model ?? null },
    });
    return json(req, data, res.status);
  } catch (e) {
    return json(req, { error: `9router tidak terjangkau: ${(e as Error).message}` }, 502);
  } finally {
    clearTimeout(timer);
  }
});
