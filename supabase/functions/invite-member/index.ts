// Kirim undangan akun (Owner/GM/Staf/Dokter) lewat Supabase Auth.
// POST { invite_id }  — JWT pengguna wajib. Wewenang diperiksa oleh fungsi database prepare_invite_send()
// atas nama pemanggil (hierarki: Superadmin→Owner, Owner→GM/Staf/Dokter, GM→Staf/Dokter di cabangnya).
// Service role HANYA dipakai setelah wewenang lolos, untuk membuat akun Auth + profil.
import { json, corsHeaders } from "../_shared/cors.ts";
import { userContext, admin } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/redis.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method tidak didukung" }, 405);

  const ctx = await userContext(req);
  if (!ctx) return json(req, { error: "Tidak terautentikasi" }, 401);
  if (!(await rateLimit(`invite:${ctx.profile.id}`, 20, 3600))) return json(req, { error: "Terlalu banyak undangan, coba lagi nanti" }, 429);

  const { invite_id } = await req.json().catch(() => ({}));
  if (!invite_id || typeof invite_id !== "string") return json(req, { error: "invite_id wajib" }, 400);

  const { data: inv, error: perr } = await ctx.db.rpc("prepare_invite_send", { p_id: invite_id });
  if (perr || !inv) return json(req, { error: perr?.message ?? "Undangan tidak ditemukan" }, 403);

  // Tautan kembali SELALU dari konfigurasi server (bukan dari klien) agar tidak bisa dibelokkan.
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl) return json(req, { error: "APP_URL belum diatur di secrets Edge Function" }, 500);

  const svc = admin();
  const sent = await svc.auth.admin.inviteUserByEmail(inv.email, {
    data: { full_name: inv.full_name, invite_id: inv.id },
    redirectTo: `${appUrl.replace(/\/$/, "")}/masuk`,
  });
  let userId: string | undefined = sent.data?.user?.id ?? inv.auth_user_id ?? undefined;
  if (sent.error) {
    // Pengguna sudah ada di Auth (kirim ulang): pakai id yang tersimpan; bila tidak ada, laporkan jelas.
    if (!inv.auth_user_id) return json(req, { error: `Gagal mengirim undangan: ${sent.error.message}` }, 502);
    userId = inv.auth_user_id;
  }
  if (!userId) return json(req, { error: "Akun Auth tidak terbentuk" }, 502);

  const branches: string[] = inv.branch_ids ?? [];
  const main = inv.role === "gm" || inv.role === "owner" ? null : branches[0] ?? null;
  const { error: e1 } = await svc.from("profiles").upsert({
    id: userId, tenant_id: inv.tenant_id, branch_id: main, role: inv.role,
    full_name: inv.full_name, email: inv.email, phone: inv.phone, is_active: true,
  }, { onConflict: "id" });
  if (e1) return json(req, { error: `Profil gagal dibuat: ${e1.message}` }, 500);

  await svc.from("member_branches").delete().eq("profile_id", userId);
  if (branches.length && inv.role !== "owner") {
    const { error: e2 } = await svc.from("member_branches").insert(branches.map((b) => ({ profile_id: userId, branch_id: b, tenant_id: inv.tenant_id })));
    if (e2) return json(req, { error: `Penugasan cabang gagal: ${e2.message}` }, 500);
  }
  await svc.from("staff_invites").update({ sent_at: new Date().toISOString(), auth_user_id: userId }).eq("id", inv.id);
  return json(req, { ok: true, sent_to: inv.email });
});
