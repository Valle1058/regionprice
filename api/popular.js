import { popular } from "./_lib.js";

// GET /api/popular  -> Liste beliebter AppIDs (ohne Preise)
export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json(await popular());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
