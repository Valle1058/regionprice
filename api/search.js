import { search } from "./_lib.js";

// GET /api/search?q=elden
export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.status(200).json([]);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(await search(q));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
