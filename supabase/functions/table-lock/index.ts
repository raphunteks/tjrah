// Kunci transaksi & state denah meja (Upstash Redis).
// POST { action: "acquire" | "release" | "state" | "set", branch_id, table?, ttl_ms?, status? }
import { json, corsHeaders } from "../_shared/cors.ts";
import { userContext, hasPerm } from "../_shared/auth.ts";
import { redis, rateLimit } from "../_shared/redis.ts";

const RELEASE_LUA = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;
const STATUSES = ["available", "occupied", "cooking", "reserved", "dirty"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method tidak didukung" }, 405);

  const ctx = await userContext(req);
  if (!ctx) return json(req, { error: "Tidak terautentikasi" }, 401);
  const { db, profile } = ctx;
  if (!profile.tenant_id) return json(req, { error: "Akun tanpa tenant" }, 400);

  if (!(await rateLimit(`lock:${profile.id}`, 120, 60))) return json(req, { error: "Terlalu banyak permintaan" }, 429);

  const body = await req.json().catch(() => ({}));
  const { action, branch_id, table, ttl_ms = 15000, status } = body;
  if (!branch_id) return json(req, { error: "branch_id wajib" }, 400);
  if (profile.role === "staff" && profile.branch_id !== branch_id) return json(req, { error: "Cabang tidak sesuai" }, 403);

  const lockKey = `lock:${profile.tenant_id}:${branch_id}:${table}`;
  const stateKey = `tables:${profile.tenant_id}:${branch_id}`;

  switch (action) {
    case "acquire": {
      // Fitur 5 (Register transaksi POS): butuh Create.
      if (!(await hasPerm(db, 5, "c"))) return json(req, { error: "Akses ditolak (fitur 5)" }, 403);
      const ttl = Math.min(Math.max(Number(ttl_ms), 1000), 60000);
      const ok = await redis(["SET", lockKey, profile.id, "NX", "PX", ttl]);
      return json(req, { locked: ok === "OK", holder: ok === "OK" ? profile.id : await redis(["GET", lockKey]) });
    }
    case "release": {
      const n = await redis<number>(["EVAL", RELEASE_LUA, 1, lockKey, profile.id]);
      return json(req, { released: n === 1 });
    }
    case "state": {
      if (!(await hasPerm(db, 7, "r"))) return json(req, { error: "Akses ditolak (fitur 7)" }, 403);
      const flat = await redis<string[]>(["HGETALL", stateKey]);
      const tables: Record<string, unknown> = {};
      for (let i = 0; i < flat.length; i += 2) tables[flat[i]] = JSON.parse(flat[i + 1]);
      return json(req, { tables });
    }
    case "set": {
      // Fitur 7 (Denah meja): Staff = RU, Owner/GM/Superadmin = CRUD.
      if (!(await hasPerm(db, 7, "u"))) return json(req, { error: "Akses ditolak (fitur 7)" }, 403);
      if (!table || !STATUSES.includes(status)) return json(req, { error: "table/status tidak valid" }, 400);
      await redis(["HSET", stateKey, table, JSON.stringify({ status, by: profile.id, at: Date.now() })]);
      return json(req, { ok: true });
    }
    default:
      return json(req, { error: "action tidak dikenal" }, 400);
  }
});
