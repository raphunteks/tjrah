// CORS: izinkan hanya origin aplikasi (set ALLOWED_ORIGINS="https://harum.in,https://dashboard.harum.in").
const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173").split(",").map((s) => s.trim());

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
