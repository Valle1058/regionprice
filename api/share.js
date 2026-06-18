import { game } from "./_lib.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// /game/:appid  -> HTML mit spielspezifischer Teilen-Vorschau, leitet Besucher zur App
export default async function handler(req, res) {
  const appid = req.query.appid;
  const redirect = "/?game=" + encodeURIComponent(appid || "");
  let title = "RegionPrice", desc = "Steam-Preise weltweit vergleichen – finde das günstigste Land.";
  let image = "https://regionprice.vercel.app/og.png";
  try {
    const g = await game(appid);
    if (g) {
      const best = g.countries[0];
      title = g.title;
      desc = `Günstigstes Land: ${best.code} · ab ${best.price.toFixed(2).replace(".", ",")} € — Steam-Preise weltweit vergleichen.`;
      if (g.image) image = g.image;
    }
  } catch { /* Fallback bleibt */ }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
  res.status(200).send(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${esc(title)} – RegionPrice</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="RegionPrice">
<meta property="og:title" content="${esc(title)} – RegionPrice">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="https://regionprice.vercel.app/game/${esc(appid)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} – RegionPrice">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${redirect}">
<script>location.replace(${JSON.stringify(redirect)})</script>
</head><body style="background:#0a0c11;color:#eee;font-family:system-ui;padding:40px">
Weiterleitung zu <a href="${redirect}" style="color:#7b8cff">RegionPrice</a> …
</body></html>`);
}
