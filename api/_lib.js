/*
 * Geteilte Steam-Logik für die Vercel-Serverless-Funktionen.
 * (Dateiname mit "_" -> Vercel behandelt sie NICHT als eigene Route.)
 */
export const COUNTRIES = ["TR","AR","IN","BR","UA","PL","DE","US"];
const GENRE_EMOJI = { Action:"🎯", RPG:"🐉", Strategie:"♟️", Indie:"🎨", Simulation:"🎛️", Sport:"🏆", Rennspiel:"🏎️", Abenteuer:"🗺️", Gelegenheitsspiele:"🎲", "Massively Multiplayer":"🌐" };
const PALETTE = ["#4f8cff","#7c5cff","#36d399","#ff6b6b","#ffd166","#22d3ee","#f472b6","#a78bfa"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Editionen aus package_groups erkennen ---- */
const EDITION_RE = /edition|deluxe|premium|ultimate|gold|complete|definitive|game of the year|goty|anniversary|legendary|collector|standard/i;
const JUNK_RE = /points|soundtrack|\bost\b|currency|coins|credits|wallet|gift|season pass|upgrade|\bdlc\b|character pack|skin/i;
function editionName(optionText) {
  let n = optionText || "";
  const i = n.lastIndexOf(" - ");
  if (i > 0) n = n.slice(0, i);
  return n.replace(/<[^>]*>/g, "").trim();
}
function isEdition(name, baseName) {
  const l = name.toLowerCase();
  if (JUNK_RE.test(l)) return false;
  if (name === baseName) return true;
  return EDITION_RE.test(l);
}

/* warmer Instanz-Cache (zusätzlich zum CDN-Cache via Header) */
let ratesCache = null;
async function rates() {
  if (ratesCache && ratesCache.exp > Date.now()) return ratesCache.data;
  const d = await (await fetch("https://open.er-api.com/v6/latest/EUR")).json();
  ratesCache = { data: d.rates, exp: Date.now() + 6 * 3600e3 };
  return d.rates;
}

/* Liste beliebter AppIDs (meistgespielt + Topseller), ohne Preise -> schnell */
let popCache = null;
export async function popular() {
  if (popCache && popCache.exp > Date.now()) return popCache.data;
  const ids = [];
  // Topseller zuerst (Kauf-Spiele -> haben Preise)
  for (const start of [0, 100]) {
    try {
      const r = await (await fetch(`https://store.steampowered.com/search/results/?query&start=${start}&count=100&filter=topsellers&cc=de&l=german&infinite=1`)).json();
      for (const m of (r.results_html || "").matchAll(/data-ds-appid="(\d+)"/g)) ids.push(+m[1]);
    } catch { /* skip */ }
  }
  // danach meistgespielte (oft Free-to-Play, aber zur Auffüllung)
  try {
    const mp = await (await fetch("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/")).json();
    for (const r of (mp.response?.ranks || [])) ids.push(r.appid);
  } catch { /* skip */ }
  const data = [...new Set(ids)].slice(0, 80);
  popCache = { data, exp: Date.now() + 6 * 3600e3 };
  return data;
}

export async function search(q) {
  const d = await (await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=de&l=german`)).json();
  return (d.items || []).slice(0, 10).map((x) => ({
    appid: x.id, title: x.name,
    image: x.tiny_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.id}/header.jpg`,
  }));
}

/* ---- IsThereAnyDeal: echter Preisverlauf + andere Shops ----
   Nur aktiv, wenn ITAD_KEY gesetzt ist; sonst null (Feature bleibt aus). */
const itadCache = new Map();
export async function itad(appid) {
  const key = process.env.ITAD_KEY;
  if (!key) return null;
  const hit = itadCache.get(appid); if (hit && hit.exp > Date.now()) return hit.data;
  try {
    const lu = await (await fetch(`https://api.isthereanydeal.com/games/lookup/v1?key=${key}&appid=${appid}`)).json();
    if (!lu.found) return null;
    const id = lu.game.id;
    // aktuelle Deals (EUR)
    let deals = [];
    try {
      const pr = await (await fetch(`https://api.isthereanydeal.com/games/prices/v2?key=${key}&country=DE&deals=true`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([id]) })).json();
      const entry = Array.isArray(pr) ? pr[0] : pr;
      deals = (entry?.deals || []).slice(0, 6).map((d) => ({ shop: d.shop.name, price: d.price.amount, cut: d.cut, url: d.url }));
    } catch { /* skip */ }
    // Verlauf (12 Monate)
    let history = [];
    try {
      const since = new Date(Date.now() - 365 * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");
      const h = await (await fetch(`https://api.isthereanydeal.com/games/history/v2?key=${key}&id=${id}&country=DE&since=${since}`)).json();
      const pts = (h || []).map((x) => ({ t: x.timestamp, p: x.deal?.price?.amount })).filter((x) => x.p != null)
        .sort((a, b) => new Date(a.t) - new Date(b.t));
      const step = Math.max(1, Math.floor(pts.length / 24));
      history = pts.filter((_, i) => i % step === 0).map((x) => ({ p: +(+x.p).toFixed(2), t: x.t }));
    } catch { /* skip */ }
    const result = { deals, history };
    itadCache.set(appid, { data: result, exp: Date.now() + 12 * 3600e3 });
    return result;
  } catch { return null; }
}

export async function game(appid) {
  const rate = await rates();
  const countries = [];
  const editions = {};
  let title = null, genre = "Spiel", image = null, notGame = false;
  for (const cc of COUNTRIES) {
    try {
      let r, tries = 0;
      do {
        r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&l=german`);
        if (r.status === 429) await sleep(1500 * ++tries);
      } while (r.status === 429 && tries < 3);
      const j = await r.json();
      const e = j[appid];
      if (!e?.success) continue;
      if (e.data.type && e.data.type !== "game") { notGame = true; break; } // Hardware/DLC/Soundtrack raus
      if (!title) { title = e.data.name; if (e.data.genres?.length) genre = e.data.genres[0].description; }
      if (!image && e.data.header_image) image = e.data.header_image;
      const p = e.data.price_overview;
      if (!p) continue;
      const f = rate[p.currency];
      if (!f) continue;
      const eur = +(p.final / 100 / f).toFixed(2);
      countries.push({ code: cc, price: eur, localPrice: p.final / 100, currency: p.currency, discount: p.discount_percent || 0, shop: "Steam", shops: [{ s: "Steam", p: eur }] });
      for (const grp of (e.data.package_groups || [])) {
        for (const s of (grp.subs || [])) {
          const cents = s.price_in_cents_with_discount;
          if (!cents) continue;
          const nm = editionName(s.option_text);
          if (!isEdition(nm, e.data.name)) continue;
          const ee = +(cents / 100 / f).toFixed(2);
          (editions[s.packageid] ||= { id: s.packageid, name: nm, countries: [] })
            .countries.push({ code: cc, price: ee, localPrice: cents / 100, currency: p.currency, shop: "Steam", shops: [{ s: "Steam", p: ee }] });
        }
      }
    } catch { /* skip */ }
    await sleep(120);
  }
  if (notGame) return null;          // kein Spiel (Hardware/DLC/...)
  if (countries.length < 4) return null;
  countries.sort((a, b) => a.price - b.price);
  const base = countries[countries.length - 1].price;
  let editionList = Object.values(editions)
    .map((ed) => { ed.countries.sort((a, b) => a.price - b.price); return ed; })
    .filter((ed) => ed.countries.length >= 4);
  editionList.sort((a, b) => (a.name === title ? -1 : b.name === title ? 1 : a.countries[0].price - b.countries[0].price));
  editionList.forEach((ed) => { ed.label = ed.name === title ? "Standard" : (ed.name.replace(title, "").trim() || ed.name); });
  return {
    appid: +appid, title: title || `App ${appid}`, genre,
    image: image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    emoji: GENRE_EMOJI[genre] || "🎮", color: PALETTE[appid % PALETTE.length],
    base, disc: -Math.round((1 - countries[0].price / base) * 100), countries,
    editions: editionList.length > 1 ? editionList : undefined,
  };
}
