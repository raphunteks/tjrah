// Shared Helper: Strict CORS configuration for Tijarah Serverless Functions
const ALLOWED_ORIGINS = new Set([
  "https://harumin.my.id",
  "https://www.harumin.my.id",
  "https://tijaarah.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

export function setCorsHeaders(req, res, methods = "POST, OPTIONS") {
  const origin = req.headers?.origin;
  const isAllowed =
    !origin ||
    ALLOWED_ORIGINS.has(origin) ||
    (typeof origin === "string" && (origin.endsWith(".vercel.app") || origin.startsWith("http://localhost:")));

  res.setHeader("Access-Control-Allow-Origin", isAllowed ? (origin || "*") : "https://harumin.my.id");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  res.setHeader("Vary", "Origin");
}
