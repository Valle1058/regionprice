/*
 * fetch-prices.js
 * --------------------------------------------------------------
 * Holt fuer eine Liste von Steam-Spielen (appids) den Preis in
 * JEDEM konfigurierten Land, rechnet alle Preise in EUR um und
 * schreibt das Ergebnis nach games.json.
 *
 * Start:  node fetch-prices.js
 * Voraussetzung: Node.js 18+ (eingebautes fetch)
 * --------------------------------------------------------------
 */

import { writeFileSync, readFileSync } from "node:fs";

/* ----------------------------------------------------------------
 * 1) Welche Spiele?  -> Steam AppIDs.
 *    Die AppID steht in jeder Steam-Store-URL:
 *    store.steampowered.com/app/1245620/ELDEN_RING/  ->  1245620
 * ---------------------------------------------------------------- */
const APPS = [
  { appid: 1245620, genre: "RPG",       emoji: "🐉", color: "#f472b6" }, // Elden Ring
  { appid: 1174180, genre: "Action",    emoji: "🤠", color: "#ffd166" }, // RDR2
  { appid: 1091500, genre: "RPG",       emoji: "⚡", color: "#7c5cff" }, // Cyberpunk 2077
  { appid: 271590,  genre: "Action",    emoji: "🚗", color: "#36d399" }, // GTA V
  { appid: 1086940, genre: "RPG",       emoji: "🎲", color: "#4f8cff" }, // Baldur's Gate 3
  { appid: 292030,  genre: "RPG",       emoji: "🐺", color: "#22d3ee" }, // Witcher 3
];

/* ----------------------------------------------------------------
 * 2) Welche Laender vergleichen?  (Steam Country-Code -> Anzeige)
 *    Du kannst hier beliebig viele ergaenzen.
 * ---------------------------------------------------------------- */
const COUNTRIES = {
  TR: { flag: "🇹🇷", name: "Türkei" },
  AR: { flag: "🇦🇷", name: "Argentinien" },
  IN: { flag: "🇮🇳", name: "Indien" },
  BR: { flag: "🇧🇷", name: "Brasilien" },
  UA: { flag: "🇺🇦", name: "Ukraine" },
  PL: { flag: "🇵🇱", name: "Polen" },
  DE: { flag: "🇩🇪", name: "Deutschland" },
  US: { flag: "🇺🇸", name: "USA" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------
 * 3) Wechselkurse holen (gratis, ohne Key) -> alles in EUR.
 * ---------------------------------------------------------------- */
async function getRates() {
  const res = await fetch("https://open.er-api.com/v6/latest/EUR");
  const data = await res.json();
  if (data.result !== "success") throw new Error("Wechselkurse fehlgeschlagen");
  return data.rates; // z.B. { USD: 1.08, TRY: 35.1, ARS: ... }  (1 EUR = x WAEHRUNG)
}

/* ----------------------------------------------------------------
 * 4) Einen Titel in einem Land abfragen.
 *    Steam liefert Preis in Cent + lokale Waehrung.
 * ---------------------------------------------------------------- */
async function fetchCountry(appid, cc) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&l=german&filters=basic,price_overview`;
  try {
    const res = await fetch(url, { headers: { "Accept-Language": "de" } });
    const json = await res.json();
    const entry = json[appid];
    if (!entry?.success) return null;
    const data = entry.data;
    const p = data.price_overview;
    if (!p) return null; // kostenlos oder in diesem Land nicht verkauft
    return {
      title: data.name,
      currency: p.currency,            // z.B. "TRY"
      localPrice: p.final / 100,       // lokaler Endpreis
      discount: p.discount_percent,    // aktueller Rabatt
    };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
 * 5) Hauptlauf
 * ---------------------------------------------------------------- */
async function main() {
  console.log("Hole Wechselkurse …");
  const rates = await getRates();

  const games = [];

  for (const app of APPS) {
    const countries = [];
    let title = null;
    let maxDiscount = 0;

    for (const cc of Object.keys(COUNTRIES)) {
      const r = await fetchCountry(app.appid, cc);
      await sleep(350); // freundlich zu Steam (Rate-Limit vermeiden)
      if (!r) continue;
      title = title || r.title;

      // lokalen Preis -> EUR
      const rate = rates[r.currency];
      if (!rate) {
        console.warn(`  ! Kein Kurs fuer ${r.currency} (${cc}) – uebersprungen`);
        continue;
      }
      const eur = +(r.localPrice / rate).toFixed(2);
      maxDiscount = Math.max(maxDiscount, r.discount);

      countries.push({
        code: cc,
        price: eur,                     // <-- vergleichbarer EUR-Preis
        localPrice: r.localPrice,
        currency: r.currency,
        shop: "Steam",
        shops: [{ s: "Steam", p: eur }],// spaeter via ITAD erweiterbar
      });
      console.log(`  ${COUNTRIES[cc].flag} ${cc}: ${eur} € (${r.localPrice} ${r.currency})`);
    }

    if (!countries.length) {
      console.warn(`AppID ${app.appid}: keine Preise gefunden – uebersprungen`);
      continue;
    }

    countries.sort((a, b) => a.price - b.price);
    const best = countries[countries.length - 1].price; // teuerstes als "UVP"
    games.push({
      appid: app.appid,
      title: title || `App ${app.appid}`,
      genre: app.genre,
      emoji: app.emoji,
      color: app.color,
      base: best,                       // Referenzpreis (teuerstes Land)
      disc: -Math.round((1 - countries[0].price / best) * 100), // Ersparnis ggü. teuerstem
      countries,
    });
    console.log(`✔ ${title}: günstigstes Land ${COUNTRIES[countries[0].code].name} (${countries[0].price} €)\n`);
  }

  const json = JSON.stringify(games, null, 2);
  writeFileSync("games.json", json, "utf8");
  // games.js zusaetzlich, damit die Seite auch per Doppelklick (file://) laeuft
  writeFileSync("games.js", `window.GAMES_DATA = ${json};`, "utf8");
  console.log(`\nFertig! ${games.length} Spiele in games.json + games.js geschrieben.`);
}

main().catch((e) => {
  console.error("Fehler:", e);
  process.exit(1);
});
