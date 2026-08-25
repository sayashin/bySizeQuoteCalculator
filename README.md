[README.md](https://github.com/user-attachments/files/31403410/README.md)
# By Size Quote Calculator

A quoting tool for signage brokers. Enter a size or a quantity, pick a product
and a customer type, and it works out the price. Items go into a cart, the cart
becomes an estimate, and the estimate exports to PDF.

The same codebase runs in three places:

| Where | How |
| --- | --- |
| **Web / phone** | [sayashin.github.io/bySizeQuoteCalculator](https://sayashin.github.io/bySizeQuoteCalculator/) — installable as a PWA on Android and iOS |
| **Android** | Packaged with Capacitor, published on Google Play |
| **Windows / macOS / Linux** | Packaged with Electron — see [Releases](../../releases/latest) |

---

## Features

- **Two pricing modes.** Products are priced either by area (per sqft/sqm) or
  by quantity (per unit). The mode is set per product; unit-priced products
  hide the size fields, and neither the high-quality surcharge nor the minimum
  charge applies to them.
- **CSV price import.** Load prices from a spreadsheet. Blank cells keep the
  current value, so an import updates and adds without wiping anything.
- **Editable estimates.** A saved estimate can be loaded back into the cart to
  add or remove lines. Saving creates a new estimate; the original is kept.
- **Customer types.** Broker, customer, and a third configurable type.
- **PDF export** of any estimate, plus JSON backup and restore of all prices.

Prices live in the browser's local storage on each device. Nothing is sent to a
server.

---

## Project layout

```
web/            The entire app — HTML, CSS, JS. Everything else wraps this.
  index.html      Calculator screen
  app.js          Pricing, cart, PDF export
  settings.html   Prices, quote settings, CSV/JSON import
  settings.js     CSV parsing and price storage
  estimates.html  Saved estimates
  estimates.js    Estimate list, PDF, edit handoff
  prices.json     Default prices, used on first run
  vendor/         jsPDF and html2canvas (checked in, not from npm)
android/        Capacitor Android project
main.js         Electron entry point
preload.js      Electron IPC bridge
server.js       Small local server for testing in a browser
```

> **Note on `web/` vs `docs/`:** GitHub Pages only publishes from the repo root
> or from `docs/`, so on GitHub this folder is named `docs/`. Locally it is
> `web/`, which is what `capacitor.config.json` points at. If you clone this
> repo fresh, rename `docs/` to `web/` before running any Capacitor command,
> or `npx cap sync` will fail looking for a folder that isn't there.

---

## Rebuilding from scratch

### Requirements

- **Node.js 22 LTS or newer** — [nodejs.org](https://nodejs.org). Capacitor's
  CLI requires it, and Electron's installer fails on Node 20.
  You do *not* need the "automatically install the necessary tools" checkbox
  in the installer; nothing here compiles native code.
- **Android Studio** — only if you are building the Android app.

### First-time setup

Open the project folder in VS Code (**File → Open Folder**), then open a
terminal with **Ctrl + `** and run:

```
npm install
```

> On Windows, use **Command Prompt**, not PowerShell. PowerShell blocks script
> execution by default and `npm` is installed as a script, so it will refuse to
> run. Either set CMD as the default (**Ctrl+Shift+P** →
> `Terminal: Select Default Profile` → *Command Prompt*), or type `npm.cmd`
> instead of `npm`.

### Run it

```
npm start          # Electron desktop window
node server.js     # or serve it in a browser at localhost
```

Opening `web/index.html` by double-clicking will *not* work — the browser
blocks `fetch('prices.json')` over `file://`, so the app starts with no
products. It has to be served.

### Build the desktop installer

```
npm run dist:win     # Windows  -> dist/*.exe
npm run dist:mac     # macOS    -> dist/*.dmg
npm run dist:linux   # Linux    -> dist/*.AppImage
```

Bump `"version"` in `package.json` first — the installer takes its filename
from there.

### Build the Android app

```
npx cap sync android
npx cap open android
```

`cap sync` copies `web/` into `android/app/src/main/assets/public/`. Never copy
those files by hand; the two folders drift apart and you end up debugging a
version you aren't running.

Then in Android Studio: **Build → Generate Signed App Bundle or APK**. Version
numbers live in `android/app/build.gradle` (`versionCode`, `versionName`) and
the target SDK in `android/variables.gradle`.

---

## Things that will bite you

**Don't run `npm audit fix`.** It upgrades Electron past what this project
pins and the install breaks. The reported vulnerabilities are all in build
tooling — electron-builder, the Capacitor CLI, sharp — which runs on your
machine at build time and never ships to a user's phone or browser.

**Bump the service worker cache on every release.** `web/service-worker.js`
serves JavaScript cache-first under a fixed cache name. If `CACHE_NAME` isn't
changed, browsers keep serving the old JS against the new HTML, and the app
misbehaves in ways that look impossible to debug.

**Keep the signing keystore safe.** Google Play rejects any update signed with
a different key, and it cannot be regenerated. Store the `.jks` file, its
password and its alias somewhere backed up — and never in this repo.

**`node_modules/` and `dist/` stay out of Git.** Both contain paths longer than
Windows' 260-character limit, which makes Git fail outright. Desktop installers
are published as GitHub Releases instead.

---

## Price CSV format

Columns are matched by header name, so their order doesn't matter, and English
or Spanish headers both work.

| Category | Product | Broker | Customer | Other | Mode |
| --- | --- | --- | --- | --- | --- |
| Banners | Vinyl 13oz | 2.42 | 5.00 | 3.50 | area |
| Banners | Mesh Banner | 3.10 | 6.50 | 4.25 | |
| | Fabric Banner | 4.00 | 7.25 | 5.00 | |
| Accessories | Grommet | 0.50 | 1.00 | 0.75 | unit |

- **Category** — blank repeats the row above, so you can group without repeating.
- **Product** — required; the row is skipped without it.
- **Prices** — blank keeps the current value. A new product with blank prices
  is created at 0 and reported back to you.
- **Mode** — `unit` for per-item pricing; blank or anything else means per area.

Comma, semicolon and tab separators are all detected automatically, as are
`2.42`, `$2.42`, `1,234.56` and `2,42`. Save from Excel as **CSV UTF-8** so
accented characters survive.

The Settings screen has a **Download CSV template** button that exports your
current prices in this exact format — the easiest place to start.
