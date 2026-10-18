// Kirim kunjungan yang sudah ditutup dokter (tabel satusehat_outbox) ke SATUSEHAT Kemenkes (HL7 FHIR R4).
//
// Pemicu:
//   1. Database Webhook INSERT pada public.satusehat_outbox  → header x-webhook-secret = WEBHOOK_SECRET
//   2. Cron tiap menit (pg_cron + pg_net)                     → header x-cron-secret = CRON_SECRET, menguras antrean
//
// Mode:
//   - SIMULASI (default): tanpa kredensial, status 'simulated' + ID encounter palsu "SIM-…". Tidak ada data keluar.
//   - NYATA: tenant_integrations.satusehat_enabled = true DAN kredensial tersedia
//            (Vault: satusehat_client_id:<tenant_id> / satusehat_client_secret:<tenant_id>, atau env SATUSEHAT_CLIENT_ID/SECRET).
//
// Catatan: alur NYATA ditulis mengikuti dokumentasi publik SATUSEHAT tetapi BELUM diuji ke sandbox Kemenkes.
// Uji dulu di sandbox (satusehat_env = 'sandbox') sebelum production. Celah yang sudah diketahui:
//   - MedicationRequest memakai medicationCodeableConcept teks; SATUSEHAT umumnya meminta Medication berkode KFA
//     (Kamus Farmasi & Alat Kesehatan). Petakan produk obat ke kode KFA sebelum production.
//   - Katalog ICD bawaan hanya subset; impor tabel ICD-10/ICD-9-CM resmi ke public.icd_codes.
import { json, corsHeaders } from "../_shared/cors.ts";
import { admin } from "../_shared/auth.ts";

const HOSTS = {
  sandbox: { auth: "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1", fhir: "https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1" },
  production: { auth: "https://api-satusehat.kemkes.go.id/oauth2/v1", fhir: "https://api-satusehat.kemkes.go.id/fhir-r4/v1" },
} as const;
const NIK_SYSTEM = "https://fhir.kemkes.go.id/id/nik";

type Outbox = { id: string; tenant_id: string; visit_id: string; payload: Record<string, unknown>; status: string; attempts: number };

async function credentials(db: ReturnType<typeof admin>, tenant: string) {
  const { data } = await db.rpc("satusehat_credentials", { p_tenant: tenant });
  const row = Array.isArray(data) ? data[0] : data;
  const id = row?.client_id ?? Deno.env.get("SATUSEHAT_CLIENT_ID");
  const secret = row?.client_secret ?? Deno.env.get("SATUSEHAT_CLIENT_SECRET");
  return id && secret ? { id, secret } : null;
}

async function token(env: keyof typeof HOSTS, cred: { id: string; secret: string }) {
  const res = await fetch(`${HOSTS[env].auth}/accesstoken?grant_type=client_credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cred.id, client_secret: cred.secret }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`OAuth SATUSEHAT gagal (${res.status})`);
  return body.access_token as string;
}

/** Cari ID IHS dari NIK (Patient/Practitioner). */
async function lookup(env: keyof typeof HOSTS, tok: string, kind: "Patient" | "Practitioner", nik: string) {
  const res = await fetch(`${HOSTS[env].fhir}/${kind}?identifier=${encodeURIComponent(`${NIK_SYSTEM}|${nik}`)}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const body = await res.json().catch(() => ({}));
  const id = body?.entry?.[0]?.resource?.id;
  if (!id) throw new Error(`${kind} dengan NIK tersebut tidak ditemukan di SATUSEHAT`);
  return id as string;
}

async function sendReal(db: ReturnType<typeof admin>, row: Outbox, env: keyof typeof HOSTS, cred: { id: string; secret: string }) {
  const tok = await token(env, cred);
  // Ganti referensi sementara "Patient/NIK:…" & "Practitioner/NIK:…" dengan ID IHS.
  let text = JSON.stringify(row.payload);
  const resolved: Record<string, string> = {};
  for (const m of text.matchAll(/"(Patient|Practitioner)\/NIK:(\d{16})"/g)) {
    const key = `${m[1]}/NIK:${m[2]}`;
    if (!resolved[key]) resolved[key] = `${m[1]}/${await lookup(env, tok, m[1] as "Patient" | "Practitioner", m[2])}`;
  }
  for (const [k, v] of Object.entries(resolved)) text = text.split(`"${k}"`).join(`"${v}"`);
  if (text.includes("UNRESOLVED") || text.includes("BELUM-DIATUR")) {
    throw new Error("ID Organization/Location/Practitioner belum diatur di Integrasi tenant");
  }
  const res = await fetch(HOSTS[env].fhir, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: text,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`SATUSEHAT menolak bundle (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  const enc = (body.entry ?? []).find((e: { response?: { resourceType?: string } }) => e.response?.resourceType === "Encounter");
  // Simpan ID IHS pasien agar kunjungan berikutnya tidak perlu lookup lagi.
  const patientIhs = Object.entries(resolved).find(([k]) => k.startsWith("Patient/"))?.[1]?.split("/")[1];
  if (patientIhs) {
    const { data: v } = await db.from("visits").select("patient_id").eq("id", row.visit_id).single();
    if (v) await db.from("patients").update({ satusehat_ihs: patientIhs }).eq("id", v.patient_id);
  }
  return { status: "sent", encounter_id: enc?.response?.resourceID ?? null, response: body };
}

async function processRow(db: ReturnType<typeof admin>, row: Outbox) {
  // Klaim baris (cegah dua pemanggil mengirim bersamaan).
  const { data: claimed } = await db.from("satusehat_outbox").update({ status: "sending", attempts: row.attempts + 1 })
    .eq("id", row.id).eq("status", "queued").select().maybeSingle();
  if (!claimed) return { id: row.id, skipped: true };

  const { data: integ } = await db.from("tenant_integrations").select("satusehat_enabled, satusehat_env").eq("tenant_id", row.tenant_id).maybeSingle();
  const cred = integ?.satusehat_enabled ? await credentials(db, row.tenant_id) : null;
  let patch: Record<string, unknown>;
  try {
    patch = cred
      ? await sendReal(db, row, (integ?.satusehat_env ?? "sandbox") as keyof typeof HOSTS, cred)
      : { status: "simulated", encounter_id: `SIM-${crypto.randomUUID().slice(0, 8)}`, response: { note: "Mode simulasi: tidak ada data yang dikirim ke Kemenkes." } };
  } catch (e) {
    patch = { status: "failed", error: String((e as Error).message ?? e) };
    await db.from("hermes_events").insert({
      tenant_id: row.tenant_id, channel: "discord", target: "#alert-sistem", kind: "satusehat", status: "queued",
      message: `Kirim SATUSEHAT gagal untuk kunjungan ${row.visit_id.slice(0, 8)}: ${patch.error}`,
    });
  }
  await db.from("satusehat_outbox").update({ ...patch, sent_at: new Date().toISOString() }).eq("id", row.id);
  return { id: row.id, ...patch, response: undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const hook = req.headers.get("x-webhook-secret");
  const cron = req.headers.get("x-cron-secret");
  const okHook = hook && hook === Deno.env.get("WEBHOOK_SECRET");
  const okCron = cron && cron === Deno.env.get("CRON_SECRET");
  if (!okHook && !okCron) return json(req, { error: "Tidak diizinkan" }, 401);

  const db = admin();
  const body = await req.json().catch(() => ({}));
  let rows: Outbox[] = [];
  if (okHook && body?.record?.id) {
    rows = [body.record as Outbox];
  } else {
    const { data } = await db.from("satusehat_outbox").select("*").eq("status", "queued").order("created_at").limit(20);
    rows = (data ?? []) as Outbox[];
  }
  const results = [];
  for (const r of rows) results.push(await processRow(db, r));
  return json(req, { processed: results.length, results });
});
