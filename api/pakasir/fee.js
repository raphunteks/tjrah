// Serverless Proxy Handler untuk Kalkulator Fee Pakasir di Produksi (Vercel)
// Endpoint: /api/pakasir/fee?amount=2500000

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { amount } = req.query || {};
  const nominal = Number(amount) || 0;

  if (nominal <= 0) {
    return res.status(400).json({ error: "Parameter amount wajib diisi dan lebih besar dari 0." });
  }

  try {
    const apiBase = process.env.PAKASIR_API_BASE || "https://app.pakasir.com/api/v2";
    const remoteRes = await fetch(`${apiBase}/payment-fee/${nominal}`, {
      headers: { Accept: "application/json" }
    });

    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.status(200).json(data);
    }

    // Fallback formula resmi jika upstream sedang tidak dapat dihubungi
    const fallbackFees = {
      bri_va: 3500,
      bni_va: 3500,
      cimb_niaga_va: 3500,
      maybank_va: 3500,
      danamon_va: 3500,
      bnc_va: 3500,
      bsi_va: 3500,
      muamalat_va: 3500,
      ocbc_va: 3500,
      payment_link: 3500,
      qris: nominal <= 105000 ? Math.round(nominal * 0.007 + 310) : Math.round(nominal * 0.01)
    };
    return res.status(200).json(fallbackFees);
  } catch (err) {
    // Formula resmi fallback deterministik
    const fallbackFees = {
      bri_va: 3500,
      bni_va: 3500,
      cimb_niaga_va: 3500,
      maybank_va: 3500,
      danamon_va: 3500,
      bnc_va: 3500,
      bsi_va: 3500,
      muamalat_va: 3500,
      ocbc_va: 3500,
      payment_link: 3500,
      qris: nominal <= 105000 ? Math.round(nominal * 0.007 + 310) : Math.round(nominal * 0.01)
    };
    return res.status(200).json(fallbackFees);
  }
}
