// Kirim event Hermes Agent (WhatsApp / Discord).
//
// Event dibuat oleh database (RPC SQL memanggil _hermes() → hermes_events berstatus 'queued').
// Fungsi ini yang mengantarkannya:
//   1. Database Webhook INSERT pada public.hermes_events  → header x-webhook-secret = WEBHOOK_SECRET
//   2. Cron (pg_cron + pg_net) tiap menit                  → header x-cron-secret = CRON_SECRET, menguras antrean
//   3. Pengguna Owner/GM (fitur 2) mengirim pesan manual   → JWT pengguna, dibatasi 20 pesan/menit (Upstash)
// @ts-nocheck
declare const Deno: any;

import { json, corsHeaders } from "../_shared/cors.ts";
import { userContext, hasPerm, admin } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/redis.ts";

const KINDS = ["z_report", "low_stock", "void_alert", "margin_drop", "inquiry", "receipt", "satusehat"];
type Ev = { id: string; tenant_id: string; channel: string; target: string; kind: string; message: string; payload: unknown; status: string };

async function deliver(db: ReturnType<typeof admin>, ev: Ev) {
  // Klaim: hanya event 'queued' yang dikirim, sekali.
  const { data: claimed } = await db.from("hermes_events").update({ status: "sending" }).eq("id", ev.id).eq("status", "queued").select().maybeSingle();
  if (!claimed) return { id: ev.id, skipped: true };
  const { data: integ } = await db.from("tenant_integrations").select("hermes_enabled, whatsapp_owner, whatsapp_gm").eq("tenant_id", ev.tenant_id).maybeSingle();
  const hook = Deno.env.get("HERMES_WEBHOOK_URL");
  let status = "simulated";
  if (hook && integ?.hermes_enabled) {
    let resolvedTarget = ev.target;
    if (/owner/i.test(ev.target) && integ?.whatsapp_owner) {
      resolvedTarget = integ.whatsapp_owner;
    } else if (/gm/i.test(ev.target) && integ?.whatsapp_gm) {
      resolvedTarget = integ.whatsapp_gm;
    }
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("HERMES_TOKEN") ?? ""}` },
      body: JSON.stringify({
        tenant_id: ev.tenant_id,
        channel: ev.channel,
        target: resolvedTarget,
        original_target: ev.target,
        kind: ev.kind,
        message: ev.message,
        payload: ev.payload,
        whatsapp_owner: integ?.whatsapp_owner,
        whatsapp_gm: integ?.whatsapp_gm
      }),
    }).catch(() => null);
    status = res?.ok ? "sent" : "failed";
  }
  await db.from("hermes_events").update({ status }).eq("id", ev.id);
  return { id: ev.id, status };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const db = admin();
  const body = await req.json().catch(() => ({}));

  const hook = req.headers.get("x-webhook-secret");
  const cron = req.headers.get("x-cron-secret");
  if (hook && hook === Deno.env.get("WEBHOOK_SECRET") && body?.record?.id) {
    return json(req, await deliver(db, body.record as Ev));
  }
  if (cron && cron === Deno.env.get("CRON_SECRET")) {
    // Fase 3.3: susun laporan terjadwal yang jatuh tempo menjadi event 'queued' sebelum antrean dikuras.
    const { error: schedErr } = await db.rpc("run_due_reports");
    if (schedErr) console.error("run_due_reports:", schedErr.message);
    // Fase 4: tagihan bulanan, dunning, dan benchmark. Semuanya idempotent, aman dipanggil tiap menit.
    for (const fn of ["generate_invoices", "run_dunning", "refresh_benchmark"]) {
      const { error: e } = await db.rpc(fn);
      if (e) console.error(`${fn}:`, e.message);
    }
    const { data } = await db.from("hermes_events").select("*").eq("status", "queued").order("created_at").limit(50);
    const out = [];
    for (const ev of (data ?? []) as Ev[]) out.push(await deliver(db, ev));
    return json(req, { processed: out.length, results: out });
  }

  // Pesan manual dari Owner/GM.
  const ctx = await userContext(req);
  if (!ctx) return json(req, { error: "Tidak terautentikasi" }, 401);
  if (!(await hasPerm(ctx.db, 2, "r"))) return json(req, { error: "Akses ditolak (fitur 2)" }, 403);
  try {
    if (!(await rateLimit(`hermes:${ctx.profile.id}`, 20, 60))) return json(req, { error: "Terlalu banyak pesan, coba lagi sebentar" }, 429);
  } catch { /* Upstash belum dikonfigurasi: lanjut tanpa rate limit */ }
  const { channel, target, kind = "inquiry", message, payload = {}, tenant_id } = body;
  const tenant = ctx.profile.tenant_id ?? tenant_id; // superadmin wajib menyebut tenant
  if (!tenant || !["whatsapp", "discord"].includes(channel) || !KINDS.includes(kind) || !message || !target) {
    return json(req, { error: "tenant/channel/kind/target/message tidak valid" }, 400);
  }
  const { data: ev, error } = await db.from("hermes_events")
    .insert({ tenant_id: tenant, channel, target, kind, message, payload, status: "queued" }).select().single();
  if (error) return json(req, { error: error.message }, 500);
  return json(req, await deliver(db, ev as Ev));
});
