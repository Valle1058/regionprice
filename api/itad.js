import { itad } from "./_lib.js";

// GET /api/itad?appid=...  -> { deals:[...], history:[...] }  (nur wenn ITAD_KEY gesetzt)
export default async function handler(req, res) {
  try {
    const appid = req.query.appid;
    if (!appid) return res.status(400).json({ error: "appid fehlt" });
    const d = await itad(appid);
    if (!d) return res.status(200).json({ deals: [], history: [] });
    res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
    res.status(200).json(d);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
