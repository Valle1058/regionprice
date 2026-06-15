# RegionPrice – echte Preise einbauen

Vergleicht, **in welchem Land** ein Steam-Spiel am günstigsten ist
(nicht in welchem Shop). Alle Länderpreise werden in **Euro** umgerechnet,
damit der Vergleich fair ist.

## Wie es funktioniert

```
fetch-prices.js   →  fragt Steam für JEDES Land ab, rechnet in € um  →  games.json
index.html        →  lädt games.json und zeigt alles an
```

`index.html` läuft auch **ohne** `games.json` – dann zeigt sie Demo-Daten.

## Echte Preise holen (3 Schritte)

1. **Node.js installieren** (Version 18 oder neuer): https://nodejs.org
2. **Spiele festlegen:** in `fetch-prices.js` oben die Liste `APPS` bearbeiten.
   Die AppID steht in jeder Steam-URL:
   `store.steampowered.com/app/1245620/...` → AppID = `1245620`.
   Bei `COUNTRIES` kannst du Länder ergänzen/entfernen.
3. **Skript starten** (im Projektordner):
   ```
   node fetch-prices.js
   ```
   Das erzeugt `games.json` mit echten Preisen pro Land.

Danach die Seite neu laden – sie nutzt jetzt die echten Daten.

## Automatisches Update alle 12 Stunden

Du musst die Preise **nicht** selbst aktualisieren. In
`.github/workflows/update-prices.yml` liegt ein fertiger GitHub-Actions-Job:

- läuft automatisch **alle 12 Stunden** (00:00 und 12:00 UTC),
- holt die Preise (`node fetch-prices.js`),
- committet die neue `games.json` zurück ins Repo.

So aktivierst du es:
1. Projekt zu **GitHub** pushen.
2. Tab **Actions** öffnen → einmalig „Workflows aktivieren" bestätigen.
3. Fertig. (Manuell testen: Actions → „Preise aktualisieren" → *Run workflow*.)

Das läuft komplett kostenlos auf GitHubs Servern – **unabhängig davon, wo
die Webseite später gehostet wird** (GitHub Pages, Vercel, eigener Server …).

## On-demand: jedes Steam-Spiel live suchen

Damit man **jedes** Spiel suchen kann (nicht nur die vorab geladenen),
gibt es `server.js` – ein kleiner Server, der die Seite ausliefert UND als
Proxy für Steam dient (umgeht die CORS-Sperre des Browsers):

```
npm start          # oder:  node server.js
```

Dann http://localhost:3000 öffnen und oben ins Suchfeld tippen –
Vorschläge erscheinen live, ein Klick lädt die Länderpreise on-demand.

Endpunkte:
- `GET /api/popular`             → Liste beliebter AppIDs (meistgespielt + Topseller)
- `GET /api/search?q=elden`      → Trefferliste (Name, AppID, Bild)
- `GET /api/game?appid=1245620`  → Preis pro Land in € + günstigstes Land

**On-demand-Startseite:** Mit laufendem Server lädt das Raster die beliebten
Spiele live (`/api/popular` → je `/api/game`), mit Skeleton-Animation. Ergebnisse
werden gecached (Spiele 12 h, Free-to-Play als „leer" 6 h), daher ist nur der
erste Aufruf langsam – danach sofort. Steam drosselt bei zu vielen Anfragen
gleichzeitig; das Laden ist deshalb bewusst gedrosselt. Ohne Server zeigt die
Seite die vorgeladene `games.js`.

Ergebnisse werden im Server zwischengespeichert (Spiele 12 h, Suche 1 h),
das schont Steams Rate-Limit. **Ohne** laufenden Server funktioniert die
Seite weiter – dann durchsucht das Suchfeld nur die vorab geladenen Spiele.

## Kostenlos online stellen (Vercel)

Im Ordner `api/` liegen zwei Serverless-Funktionen (`search.js`, `game.js`),
die dieselbe Logik wie `server.js` nutzen. Damit läuft alles gratis auf
**Vercel** – ohne eigenen Server.

1. Projekt auf **GitHub** pushen (siehe oben).
2. Auf https://vercel.com mit dem GitHub-Konto anmelden (kostenlos).
3. **Add New → Project** → dein Repo auswählen → **Deploy**.
   Vercel erkennt automatisch:
   - die statischen Dateien (`index.html`, `games.js`, …) → Webseite
   - den Ordner `api/` → die Endpunkte `/api/search` und `/api/game`
4. Nach ~1 Minute ist die Seite live unter `https://dein-projekt.vercel.app`
   – inklusive funktionierender Live-Suche.

Updates: einfach neuen Commit pushen → Vercel deployt automatisch neu.
Der 12-h-Preis-Cron (GitHub Actions) läuft davon unabhängig weiter.

> Alternative ohne Vercel: `server.js` läuft auf **jedem** Node-Host
> (eigener VPS, Render, Railway …) per `node server.js`.

## Lokal starten / Seite über einen Server öffnen

`games.json` wird per `fetch()` geladen. Das funktioniert **nicht**, wenn du
die Datei direkt per Doppelklick (`file://`) öffnest – der Browser blockt das.
Starte stattdessen einen kleinen lokalen Server im Ordner:

```
npx serve            # oder:  python -m http.server
```

und öffne die angezeigte Adresse (z. B. http://localhost:3000).
Im Claude-Vorschaufenster läuft das automatisch.

## Hinweise / Grenzen

- **Wechselkurse** kommen gratis von `open.er-api.com` (kein Key nötig).
- **Preis-Historie** liefert Steam nicht – der Trend-Chart wird daher
  geschätzt. Für echte Verläufe bräuchtest du z. B. die IsThereAnyDeal-API.
- **Multi-Shop pro Land:** Steam liefert nur Steam-Preise. Möchtest du je Land
  mehrere Shops vergleichen, lässt sich `fetch-prices.js` um die
  IsThereAnyDeal-API erweitern (kostenloser API-Key) – das Feld `shops`
  pro Land ist dafür schon vorbereitet.
- Sei nett zur Steam-API: das Skript wartet 350 ms zwischen Anfragen.
