/*
 * fetch-prices.js – baut die Startseiten-Daten vor (für sofortigen Aufbau).
 * Holt die aktuell beliebten Spiele inkl. Preisen pro Land, Editionen, Bild,
 * Sale-Status und schreibt games.json + games.js.
 *
 * Läuft automatisch alle 12 h via GitHub Actions, oder manuell:  node fetch-prices.js
 * Nutzt dieselbe Logik wie das Backend (api/_lib.js).
 */
import { writeFileSync } from "node:fs";
import { popular, game } from "./api/_lib.js";

const LIMIT = 30; // so viele Spiele vorab laden

async function main() {
  const ids = await popular();
  const games = [];
  for (const appid of ids) {
    if (games.length >= LIMIT) break;
    try {
      const g = await game(appid);
      if (g) { games.push(g); console.log(`✔ ${games.length}/${LIMIT}  ${g.title}`); }
    } catch { /* skip */ }
  }
  const json = JSON.stringify(games, null, 2);
  writeFileSync("games.json", json, "utf8");
  writeFileSync("games.js", `window.GAMES_DATA = ${json};`, "utf8");
  console.log(`\nFertig: ${games.length} Spiele in games.json + games.js`);
}

main().catch((e) => { console.error("Fehler:", e); process.exit(1); });
