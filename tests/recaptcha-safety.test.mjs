// Unit Test: Keamanan Google reCAPTCHA v3 & Hardening Header CSP (TIJARAH_SAFETY)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("CSP Header: vercel.json memuat Content-Security-Policy yang lengkap & aman", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  assert.ok(vercelConfig.headers, "vercel.json harus memiliki konfigurasi headers");

  const globalHeaders = vercelConfig.headers.find((h) => h.source === "/(.*)");
  assert.ok(globalHeaders, "Harus ada header global untuk /(.*)");

  const cspHeader = globalHeaders.headers.find((h) => h.key === "Content-Security-Policy");
  assert.ok(cspHeader, "Header Content-Security-Policy wajib terpasang");

  const cspValue = cspHeader.value;
  assert.match(cspValue, /https:\/\/www\.google\.com\/recaptcha\//, "CSP wajib mengizinkan Google reCAPTCHA");
  assert.match(cspValue, /https:\/\/www\.gstatic\.com\/recaptcha\//, "CSP wajib mengizinkan Google gstatic reCAPTCHA");
  assert.match(cspValue, /https:\/\/qtokrvloisrwjmxtyvzn\.supabase\.co/, "CSP wajib mengizinkan Supabase API");
  assert.match(cspValue, /https:\/\/nominatim\.openstreetmap\.org/, "CSP wajib mengizinkan OpenStreetMap nominatim geocoding");
  assert.match(cspValue, /https:\/\/www\.gstatic\.com/, "CSP wajib mengizinkan gstatic resources");
  assert.match(cspValue, /frame-src[^;]*https:\/\/www\.google\.com\/recaptcha\//, "CSP wajib mengizinkan iframe reCAPTCHA");

  assert.match(cspValue, /https:\/\/translate-pa\.googleapis\.com/, "CSP wajib mengizinkan Google Translate Personal Assistant API");
  assert.match(cspValue, /https:\/\/translate\.google\.com/, "CSP wajib mengizinkan Google Translate");
  assert.match(cspValue, /frame-src[^;]*https:\/\/translate\.google\.com/, "CSP wajib mengizinkan frame Google Translate");
  assert.match(cspValue, /frame-src[^;]*https:\/\/maps\.google\.com/, "CSP wajib mengizinkan frame Google Maps");
  assert.match(cspValue, /frame-src[^;]*https:\/\/www\.google\.com/, "CSP wajib mengizinkan frame Google Maps www subdomain");
  assert.match(cspValue, /https:\/\/photon\.komoot\.io/, "CSP wajib mengizinkan fallback geocoding Photon Komoot");
  assert.match(cspValue, /https:\/\/places\.googleapis\.com/, "CSP wajib mengizinkan Google Places New API");
  assert.match(cspValue, /media-src[^;]*blob:/, "CSP wajib mengizinkan media stream webcam absensi");
  assert.match(cspValue, /worker-src[^;]*'self'/, "CSP wajib mengizinkan worker self");

  const hstsHeader = globalHeaders.headers.find((h) => h.key === "Strict-Transport-Security");
  assert.ok(hstsHeader, "Header Strict-Transport-Security wajib terpasang");
  assert.match(hstsHeader.value, /max-age=63072000/, "HSTS wajib memiliki max-age 2 tahun");
});

test("index.html: Memiliki konfigurasi Google Translate & deklarasi bahasa internasional yang kompatibel", () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(indexHtml, /<html\s+lang="en">/, "HTML root wajib lang='en' agar memicu fitur Omnibox Google Translate");
  assert.match(indexHtml, /<meta name="google" content="translate"/, "Meta google translate harus terpasang");
  assert.ok(!indexHtml.includes('http-equiv="Content-Language"'), "Content-Language tidak boleh membatasi bahasa halaman");
  assert.ok(!indexHtml.includes("translate_a/element.js"), "Script deprecated Google Translate widget tidak boleh ada");
});

test("reCAPTCHA Serverless: Handler menolak method selain POST", async () => {
  const { default: handler } = await import("../api/verify-recaptcha.js");

  let statusCode = 0;
  let responseData = null;
  const req = {
    method: "GET",
    headers: {}
  };
  const res = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  await handler(req, res);
  assert.equal(statusCode, 405, "Method GET wajib mengembalikan HTTP 405 Method Not Allowed");
  assert.equal(responseData.ok, false);
});

test("reCAPTCHA Serverless: Handler menolak request tanpa token", async () => {
  const prevKey = process.env.RECAPTCHA_SECRET_KEY;
  process.env.RECAPTCHA_SECRET_KEY = "example_mock_recaptcha_secret_xxxx";

  try {
    const { default: handler } = await import("../api/verify-recaptcha.js");

    let statusCode = 0;
    let responseData = null;
    const req = {
      method: "POST",
      headers: { "x-forwarded-for": "192.168.1.100" },
      body: { action: "login" } // Tanpa token
    };
  const res = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

    await handler(req, res);
    assert.equal(statusCode, 400, "Request tanpa token wajib ditolak dengan HTTP 400");
    assert.equal(responseData.ok, false);
  } finally {
    process.env.RECAPTCHA_SECRET_KEY = prevKey;
  }
});

test("reCAPTCHA Rate Limiter: Menolak IP yang mengirim lebih dari 5 request per menit", async () => {
  const { default: handler } = await import("../api/verify-recaptcha.js");

  const testIp = "203.0.113.195"; // IP simulasi uji coba
  let lastStatus = 0;

  for (let i = 0; i < 6; i++) {
    const req = {
      method: "POST",
      headers: { "x-forwarded-for": testIp },
      body: { token: "dummy_test_token", action: "login" }
    };
    const res = {
      setHeader() {},
      status(code) {
        lastStatus = code;
        return {
          json() {}
        };
      }
    };
    await handler(req, res);
  }

  assert.equal(lastStatus, 429, "Percobaan ke-6 dari IP yang sama wajib mengembalikan HTTP 429 Too Many Requests");
});

test("reCAPTCHA Serverless: Handler mendukung parameter versi v2 dan v3", async () => {
  const prevKeyV2 = process.env.RECAPTCHA_V2_SECRET_KEY;
  process.env.RECAPTCHA_V2_SECRET_KEY = "example_mock_recaptcha_v2_secret_xxxx";

  try {
    const { default: handler } = await import("../api/verify-recaptcha.js");
    let statusCode = 0;
    let responseData = null;
    const req = {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.22" },
      body: { action: "login", version: "v2" } // Tanpa token
    };
    const res = {
      setHeader() {},
      status(code) {
        statusCode = code;
        return {
          json(data) {
            responseData = data;
          }
        };
      }
    };

    await handler(req, res);
    assert.equal(statusCode, 400, "Request v2 tanpa token wajib ditolak dengan HTTP 400");
    assert.equal(responseData.ok, false);
  } finally {
    process.env.RECAPTCHA_V2_SECRET_KEY = prevKeyV2;
  }
});

test("Hermes Dispatch Serverless: Handler menolak method selain POST dengan 405", async () => {
  const { default: handler } = await import("../api/hermes-dispatch.js");
  let statusCode = 0;
  let responseData = null;
  const req = {
    method: "GET",
    headers: {}
  };
  const res = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };

  await handler(req, res);
  assert.equal(statusCode, 405, "Method GET wajib mengembalikan HTTP 405 Method Not Allowed");
  assert.equal(responseData.ok, false);
});

test("Hermes Dispatch Serverless: Handler merespons preflight OPTIONS dengan 200", async () => {
  const { default: handler } = await import("../api/hermes-dispatch.js");
  let statusCode = 0;
  let ended = false;
  const req = {
    method: "OPTIONS",
    headers: {}
  };
  const res = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return {
        end() {
          ended = true;
        }
      };
    }
  };

  await handler(req, res);
  assert.equal(statusCode, 200, "Preflight OPTIONS wajib mengembalikan HTTP 200");
  assert.equal(ended, true);
});
