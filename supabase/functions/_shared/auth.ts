import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type Profile = { id: string; tenant_id: string | null; branch_id: string | null; role: string; full_name: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Klien atas nama pengguna (RLS berlaku) + profilnya. Null jika token tidak valid. */
export async function userContext(req: Request): Promise<{ db: SupabaseClient; profile: Profile } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const db = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u, error } = await db.auth.getUser();
  if (error || !u.user) return null;
  const { data: profile } = await db.from("profiles").select("id, tenant_id, branch_id, role, full_name").eq("id", u.user.id).single();
  return profile ? { db, profile } : null;
}

/** Cek matriks RBAC lewat fungsi database (sumber kebenaran yang sama dengan RLS). */
export async function hasPerm(db: SupabaseClient, feature: number, action: string): Promise<boolean> {
  const { data } = await db.rpc("has_perm", { p_feature: feature, p_action: action });
  return data === true;
}

/** Klien service role — melewati RLS. Pakai hanya untuk menulis log/event sistem. */
export const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
