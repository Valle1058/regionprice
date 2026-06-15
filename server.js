/*
 * server.js – RegionPrice Backend + statischer Webserver
 * --------------------------------------------------------------
 * Liefert die Webseite aus UND stellt zwei API-Endpunkte bereit,
 * damit Spiele "on demand" gesucht und live verglichen werden:
 *
 *   GET /api/search?q=elden      -> Trefferliste (Name, AppID, Bild)
 *   GET /api/game?appid=1245620  -> Preis pro Land (in EUR) + günstigstes Land
 *
 * Start:  node server.js   ->  http://localhost:3000
 * Voraussetzung: Node.js 18+ (eingebautes fetch)
 * --------------------------------------------------------------
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();

/* Länder, die verglichen werden (Steam-Code -> Anzeige) */
const COUNTRIES = ["TR","AR","IN","BR","UA","PL","DE","US"];

/* ---------- einfacher Cache (RAM) ---------- */
const cache = new Map(); // key -> { exp, data }
const getCache = (k) => { const e = cache.get(k); return e && e.exp > Date.now() ? e.data : null; };
const setCache = (k, data, ttlMs) => cache.set(k, { exp: Date.now() + ttlMs, data });

/* ---------- Wechselkurse (6h gecached) ---------- */
async function rates() {
  const hit = getCache("rates"); if (hit) return hit;
  const r = await fetch("https://open.er-api.com/v6/latest/EUR");
  const d = await r.json();
  setCache("rates", d.rates, 6 * 3600e3);
  return d.rates;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GENRE_EMOJI = { Action:"🎯", RPG:"🐉", Strategie:"♟️", Indie:"🎨", Simulation:"🎛️", Sport:"🏆", Rennspiel:"🏎️", Abenteuer:"🗺️", Gelegenheitsspiele:"🎲", "Massively Multiplayer":"🌐" };
const PALETTE = ["#4f8cff","#7c5cff","#36d399","#ff6b6b","#ffd166","#22d3ee","#f472b6","#a78bfa"];

/* ---------- Steam: beliebte AppIDs (ohne Preise) ---------- */
async function popular() {
  const hit = getCache("popular"); if (hit) return hit;
  const ids = [];
  for (const start of [0, 100]) {
    try {
      const r = await (await fetch(`https://store.steampowered.com/search/results/?query&start=${start}&count=100&filter=topsellers&cc=de&l=german&infinite=1`)).json();
      for (const m of (r.results_html || "").matchAll(/data-ds-appid="(\d+)"/g)) ids.push(+m[1]);
    } catch { /* skip */ }
  }
  try {
    const mp = await (await fetch("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/")).json();
    for (const r of (mp.response?.ranks || [])) ids.push(r.appid);
  } catch { /* skip */ }
  const data = [...new Set(ids)].slice(0, 80);
  setCache("popular", data, 6 * 3600e3);
  return data;
}

/* ---------- Steam: Spiele suchen ---------- */
async function search(q) {
  const key = "s:" + q.toLowerCase();
  const hit = getCache(key); if (hit) return hit;
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=de&l=german`);
  const d = await r.json();
  const items = (d.items || []).slice(0, 10).map((x) => ({
    appid: x.id, title: x.name,
    image: x.tiny_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.id}/header.jpg`,
  }));
  setCache(key, items, 3600e3); // 1h
  return items;
}

/* ---------- Steam: Preise über alle Länder ---------- */
async function game(appid) {
  const key = "g:" + appid;
  const hit = getCache(key); if (hit) return hit === "NONE" ? null : hit;

  const rate = await rates();
  const countries = [];
  let title = null, genre = "Spiel", image = null, gotResponse = false;

  for (const cc of COUNTRIES) {
    try {
      let r, tries = 0;
      do {
        r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&l=german&filters=basic,price_overview,genres`);
        if (r.status === 429) await sleep(1500 * ++tries);
      } while (r.status === 429 && tries < 3);
      const j = await r.json();
      const e = j[appid];
      if (!e?.success) continue;
      gotResponse = true; // Steam hat geantwortet (kein Rate-Limit-Fehler)
      if (!title) { title = e.data.name; if (e.data.genres?.length) genre = e.data.genres[0].description; }
      if (!image && e.data.header_image) image = e.data.header_image; // echte Bild-URL von Steam
      const p = e.data.price_overview;
      if (!p) continue;
      const f = rate[p.currency];
      if (!f) continue;
      const eur = +(p.final / 100 / f).toFixed(2);
      countries.push({ code: cc, price: eur, localPrice: p.final / 100, currency: p.currency, shop: "Steam", shops: [{ s: "Steam", p: eur }] });
    } catch { /* skip */ }
    await sleep(120);
  }
  // nur echte Free-to-Play-Spiele negativ cachen, NICHT rate-limit-Fehlschläge
  if (countries.length < 4) { if (gotResponse) setCache(key, "NONE", 6 * 3600e3); return null; }

  countries.sort((a, b) => a.price - b.price);
  const base = countries[countries.length - 1].price;
  const result = {
    appid: +appid, title: title || `App ${appid}`, genre,
    image: image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    emoji: GENRE_EMOJI[genre] || "🎮", color: PALETTE[appid % PALETTE.length],
    base, disc: -Math.round((1 - countries[0].price / base) * 100), countries,
  };
  setCache(key, result, 12 * 3600e3); // 12h
  return result;
}

/* ---------- statische Dateien ---------- */
const MIME = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json", ".css":"text/css", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("Forbidden"); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end("Not found"); }
}

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

/* ---------- Router ---------- */
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/popular") {
      return json(res, 200, await popular());
    }
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return json(res, 200, []);
      return json(res, 200, await search(q));
    }
    if (url.pathname === "/api/game") {
      const appid = url.searchParams.get("appid");
      if (!appid) return json(res, 400, { error: "appid fehlt" });
      const g = await game(appid);
      return g ? json(res, 200, g) : json(res, 404, { error: "keine Preise gefunden" });
    }
    return serveStatic(req, res);
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`RegionPrice läuft auf http://localhost:${PORT}`));
