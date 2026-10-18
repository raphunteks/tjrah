// Klien Upstash Redis via REST — hanya berjalan di server (Edge Function).
// Secret: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (supabase secrets set ...).
const URL_ = Deno.env.get("UPSTASH_REDIS_REST_URL");
const TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export type Cmd = (string | number)[];

export async function redis<T = unknown>(cmd: Cmd): Promise<T> {
  if (!URL_ || !TOKEN) throw new Error("Upstash belum dikonfigurasi (UPSTASH_REDIS_REST_URL/TOKEN)");
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Redis: ${data.error ?? res.status}`);
  return data.result as T;
}

export async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  if (!URL_ || !TOKEN) throw new Error("Upstash belum dikonfigurasi");
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Redis pipeline: ${res.status}`);
  return (data as { result?: unknown; error?: string }[]).map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

/** Rate limit jendela tetap. true = boleh lanjut. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  const [count] = (await pipeline([["INCR", k], ["EXPIRE", k, windowSec]])) as [number, number];
  return count <= limit;
}
