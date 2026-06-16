// GET /api/region -> Besucherland aus Vercel-Header (kein externes Limit)
export default function handler(req, res) {
  const c = (req.headers["x-vercel-ip-country"] || "").toUpperCase();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ country: c || null });
}
