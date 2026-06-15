import { game } from "./_lib.js";

// GET /api/game?appid=1245620
export default async function handler(req, res) {
  try {
    const appid = req.query.appid;
    if (!appid) return res.status(400).json({ error: "appid fehlt" });
    const g = await game(appid);
    if (!g) {
      res.setHeader("Cache-Control", "s-maxage=600"); // nur kurz cachen (könnte Rate-Limit sein)
      return res.status(404).json({ error: "keine Preise gefunden" });
    }
    res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
    res.status(200).json(g);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
