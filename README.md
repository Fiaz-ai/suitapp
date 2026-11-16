# IIK — Tailoring & Brand Management (Pakistan)

A free, offline-first app for **anyone to register their own tailoring brand
and shop**. Customers order, provide measurements, track progress and pay.
Shop staff and the owner manage customers, orders, payments, fittings and
reports — from one system, in **English and Urdu (RTL)**, in **PKR**, on
**budget Android phones**. Each shop is fully isolated in its own local
database; one device can host several brands/shops.

**Stack:** plain HTML + CSS + JavaScript (a Progressive Web App). **Zero paid
services, zero subscriptions, zero API keys, zero build step, zero
dependencies.** Data lives in the browser's IndexedDB on the device; a single
JSON file backs each shop up.

---

## 1. Why this stack (assumptions, limits)

| Requirement | How it's met | Limitation |
|---|---|---|
| Android-first | Installable PWA ("Add to Home screen" in Chrome) | Not in the Play Store by default (see §10) |
| Works on cheap phones / slow networks | Single-page, small payload, offline cache (service worker) | First load needs the internet (or the file on device) |
| Offline-friendly | All data in IndexedDB; works fully offline after first load | Data is per-device; no automatic cross-device sync |
| Urdu + English | Language toggle; `dir="rtl"` for Urdu | Urdu uses system fonts; on very old Android a Urdu font may be missing |
| Zero cost | Free static hosting / LAN server / USB | No cloud sync, no SMS, no backend |
| Works over plain http | Pure-JS PBKDF2 fallback when `crypto.subtle` is unavailable (browsers disable Web Crypto off HTTPS) | JS fallback uses fewer iterations (slower-but-fine); use https for the strongest hashing |
| PKR, Pakistan phones, terminology | Built-in; `03XX…` / `+92…` accepted | — |
| Customer notifications | In-app status + **manual** WhatsApp share links (`wa.me`) | No automated SMS/WhatsApp (would need a paid/unofficial service) |
| Security | PBKDF2-hashed PINs, per-role access, input sanitisation | Hashing is client-side (a real server would use bcrypt) |

**I chose a PWA over Flutter/React Native deliberately:** no Android SDK is
needed to run it, it installs on Android from a URL with no Play Store gate,
and it is genuinely free and self-hostable. Flutter/RN would need a full
native build toolchain and a Play Store account. If you specifically need a
Play Store APK later, see §10.

---

## 2. Register your brand & shop (first run)

- **First run** shows **"Register your brand & shop"** (brand name, shop name,
  city, phone, owner name, owner phone, PIN) or **"Try the demo shop"**.
- Registering creates a shop, its own isolated database, the default catalog
  (garments, styles, fabrics), and the owner account.
- The owner can add **more brands/shops** from **Settings → Brands & shops**
  and switch between them. Each shop's data is separate.
- A shop owner's PIN, staff accounts and per-shop settings live in that shop.

### How login works (multi-shop)

One device = a "building" holding several shops, each in its own isolated
database.

- **One shop on the device:** the sign-in screen says *"You are at: [Shop]"*.
- **Several shops on the device:** a **Shop dropdown** appears on the sign-in
  screen. Pick your shop, then sign in with phone + password (customer) or
  phone + PIN (staff). Login finds the account in that shop's database and
  switches to it for the whole session — so every shop's customers, staff,
  orders and payments stay fully separate.
- **Customers of the same shop** all sign in to that one shop and each sees
  only their own orders.
- **Important (per-device model):** this is offline-first, so data lives on
  the shop's device. A customer on their *own* phone cannot reach the shop's
  data until a shared backend is added (see §11). Until then, customers use
  the shop's device/tablet, or the shop shares updates via WhatsApp/print.

## 3. Main user flows & screens

**Customer (no app needed for lookups):**
- Sign up / sign in with phone + password → `Home`
- `Home` → New Order → wizard: **Garment → Style & Fabric → Measurements → Review**
- Track orders (login **or** order number + phone lookup) → order status stepper
- Order detail: payments, delivery date, WhatsApp share, "report an issue"

**Staff / Owner:**
- Sign in with phone + PIN → `Dashboard` (stats: new, overdue, due soon,
  in stitching, ready, revenue, outstanding)
- `Customers` (search by name/phone), customer detail (orders, profiles,
  measurement history), walk-in customer creation
- `Orders` → order manage: stage advance, assign staff, tailor notes, payments,
  fittings, resolve issues, final price, receipt/job-card print, WhatsApp message
- `Catalog` (garments + measurement fields, styles, fabrics)
- `Reports` (by status, revenue, outstanding, popular garments, repeat customers, CSV export)
- `Settings` (shop info, working days, delivery rules, staff accounts + PIN reset,
  export/import backup, clear demo, audit history, delete all)

---

## 4. Data model (IndexedDB stores)

`settings` (shop name/logo/address/phone, working days, estimate days, policies, order stages)
`users` (staff: owner/manager/staff/tailor, PBKDF2 pass; plus customer logins)
`customers` (name, phone, email, city, address, consent, active)
`profiles` (measurement profiles: "Me", "Son", "Other child" — owner name, DOB/age)
`measurements` (**append-only** records: profile, garment, values, date, measured-by — never overwritten)
`garments` (men/children, configurable measurement fields per garment)
`styles` (name, extra price) · `fabrics` (name, price per order, stock)
`orders` (order no `SK-YYYYMMDD-###`, items[], stage, assigned staff, prices,
payments[], promised date, issues[], audit[])
`fittings` (date, kind, result, missed, notes)
`audit` (who changed what/when) · `meta` (counters, seed flag)

Order stages (configurable): `new → confirmed → measurements → cutting → stitching → fitting → ready → delivered → closed`.

---

## 5. Run it (shop owner, non-technical)

**Simplest — no server at all:**
1. Copy the `suitapp` folder to any computer or phone.
2. Double-click `index.html` (or open it in Chrome/Edge on Android).
3. It works, fully offline. To install on a phone: open in Chrome → menu →
   **Add to Home screen**.

**Share with staff / customers (a real URL):**
1. Put the folder on any free/static host, e.g. GitHub Pages, Netlify Drop,
   Cloudflare Pages, or any cheap shared hosting.
2. Everyone opens the URL. **Important:** it must be served over `http(s)`
   (not opened as `file://`) for the service worker + install prompt to work.
3. On a shop LAN, one PC can host it with the included zero-dependency server:

   ```bash
   node serve.js          # serves on http://localhost:8000
   node serve.js 8080     # custom port
   ```

   It prints the PC's Wi-Fi address (e.g. `http://192.168.70.137:8000`) so a
   phone on the same network can open it directly.

   > Why not `npx serve`? On Windows, PowerShell's execution policy blocks
   > `npx.ps1` (an unsigned script). `node serve.js` uses `node.exe`, which is
   > never blocked, and needs no `npm install`. If you prefer `npx`, run it via
   > cmd: `cmd /c npx serve C:\Users\Office\suitapp`.

**First-run:** demo data loads automatically (shop name ends in **"(DEMO)"**,
and a banner shows). The demo **owner PIN is `1111`** (phone `03001234567`).
Explore, then **Settings → Clear demo data** before going live.

> ⚠️ Each device keeps its own data. Two phones are not the same database.
> See §5 for sharing/backup.

---

## 6. Backup, export & restore

**Export (backup):** Settings → **Export JSON** → saves
`suitapp_backup_YYYY-MM-DD.json` (all customers, orders, measurements,
settings, catalog). Keep it safe (it contains private customer data).

**Restore:** Settings → **Import JSON** → choose the file. It **overwrites**
current data. Always export before importing.

**CSV reports:** Reports → **Export CSV** (orders, payments, balances).

**Privacy / deletion:** Settings → privacy notice explains what is stored and
where. Customers can be deactivated (kept for records) or permanently deleted.
**Delete all data** wipes the device.

---

## 7. Developer setup & tests

No install needed (Node only for tests).

```bash
node test/core.test.js    # 46 unit tests: order numbers, dates, prices, phones, status, messages, hashing, SHA-256 vectors
node test/fallback.test.js# 6 tests: PIN hashing when crypto.subtle is absent (plain http on a phone)
node test/ui-smoke.js     # 17 headless smoke tests: boot, staff login, views, signup, wizard, backup
node --check js/*.js      # syntax check
node scripts/gen-icons.js # regenerate app icons
```

The unit tests run against the real domain logic (`js/core.js`). The smoke test
runs the actual UI code paths against a fake DOM + in-memory IndexedDB — it
verifies boot, login, view rendering and the order wizard **end-to-end without
a browser**. The fallback test reproduces the plain-`http` phone condition
(Web Crypto disabled) and confirms PIN login still works.

**What was tested:** all 46 unit tests, 6 fallback tests and 17 smoke tests
pass; every JS file syntax-checks; the app serves correctly over HTTP
(`index.html`, `app.js`, `manifest.json`, icons all return 200). The pure-JS
PBKDF2 fallback is verified **byte-identical** to Web Crypto output.

**What was NOT tested:** real-browser rendering, real IndexedDB persistence
across reloads, the PWA install flow, and print layout — those need a manual
pass in a browser (see §7).

---

## 8. Manual test checklist

Open the app (double-click `index.html` or serve it). Test in **Chrome on
Android** and **desktop Chrome**:

1. **First load:** demo banner shows; sign in as staff → phone `03001234567`,
   PIN `1111` → Dashboard shows demo stats.
2. **Customer sign-up:** sign out → customer tab → Create account → new
   customer logs in → Home greets by name.
3. **New order wizard:** pick a garment → style → fabric → measurements →
   review → Place order → order number shown; it appears in "My Orders".
4. **Staff order manage:** as owner, open the order → advance stage → add a
   payment → balance updates; WhatsApp button opens a prefilled `wa.me` link.
5. **Track without account:** sign out → Track order → enter order number +
   phone → order detail shows.
6. **Urdu/RTL:** toggle language in the header → layout flips, labels in Urdu.
7. **Report an issue:** customer submits; owner sees it on the order.
8. **Backup:** Settings → Export JSON → file downloads; Clear demo data;
   Import the file back.
9. **Catalog:** add a garment with measurement fields → appears in wizard.
10. **Offline:** serve over http, load once, then go offline → app still works.
11. **Shop takes measurements:** as a customer, order with "I need the shop to
    take measurements" → the order shows "Measurements pending at shop"; as the
    owner, open the order → **Add measurements** → save → the pending flag clears
    and the customer's measurement history is updated.

---

## 9. Completed features

- **Register your brand & shop** (first run) — anyone can create a shop; multiple shops/brands per device with full isolation
- Customer sign-up/sign-in (phone+password), order lookup by order no + phone
- Measurement profiles ("Me", "Son", …) with append-only measurement history
- New-order wizard (garment → style → fabric source → measurements → review),
  multi-garment-ready structure, per-garment measurement templates
- **"I need the shop to take measurements"** — customer skips measurement entry;
  the order is flagged "Measurements pending at shop", and **staff enter/update
  the measurements** from the order screen (written as an append-only record)
- Auto order number `SK-YYYYMMDD-###`, auto suggested delivery date (working days + workload)
- Order status stepper, payment ledger (cash/bank/**JazzCash/Easypaisa**), balance
- **Configurable JazzCash & Easypaisa account numbers** shown to customers for payment
- Issue/alteration requests, fitting records (incl. missed appointments)
- WhatsApp share via `wa.me` (manual, clearly labelled), copyable bilingual messages
- Staff dashboard (new/overdue/due soon/in-stitching/ready/revenue/outstanding)
- Customer management (search, walk-in, deactivate/delete, consent)
- Catalog management (garments + measurement fields, styles, fabrics, stock)
- Reports (status, revenue, outstanding, popular, repeat) + CSV export
- Receipt / job-card print (measurements + payments)
- Role-based access (owner/manager/staff/tailor), PIN reset
- Audit history for stage/price/payment/measurement changes
- Settings (brand, shop, city, working days, delivery rules, policies, advance %)
- Bilingual EN/UR with RTL, PKR formatting, Pakistan phone normalization
- Offline-first PWA, JSON backup/restore, clearly-labelled demo data
- Privacy notice + consent, data deletion controls

## 10. Known limitations

- **No automatic cross-device sync** — each device keeps its own shops. Use
  Export/Import to move a shop between devices. (A small self-hosted sync
  server is the natural next step and is the way to make "anyone registers
  their shop" a shared, multi-device platform.)
- **No automated SMS/WhatsApp** — only in-app status + manual `wa.me` share
  (deliberate: avoids unofficial/paid integrations).
- **Client-side password hashing** — acceptable for a local-first app; a
  server would move this to bcrypt.
- **Photos**: reference-photo upload is not included (kept out to avoid
  storage/bloat on cheap phones). Design notes are supported; photos are a
  future step.
- **Urdu fonts** depend on the device (Android has Noto Nastaliq/Urdu).

## 11. Publish, deploy & protect

### Publish (get it online, free)
1. **Host the folder** on a free static host — **Cloudflare Pages**,
   **Netlify**, **GitHub Pages**, or your own domain. It must be served over
   **HTTPS** (this also enables Web Crypto for the strongest PIN hashing).
2. Give the URL to your shop's team and customers. Each device keeps its own
   shop data (offline-first).
3. **Install on Android:** open the URL in Chrome → menu → **Add to Home
   screen**. It behaves like an app (full-screen, offline).

### A real multi-shop platform (the bigger step)
"Anyone can register their brand & shop" works fully offline on one device
today. To make it a **shared platform** (many shops, each logging in from any
phone, one central system), add a small self-hosted backend:
- **Backend:** Node + Express + SQLite (free, self-hostable), an API for
  `register`, `login`, and syncing orders/customers/measurements.
- **Client:** the IndexedDB layer already stores per-shop data — the API
  mirrors those records, and the app syncs when online.
- **Auth:** move PIN hashing to the server with **bcrypt**.
- **Play Store (optional):** wrap the PWA in a native shell (Capacitor/TWA)
  once the backend exists; requires an Android SDK + a Google Play account.

### Copyright & ownership (general guidance, not legal advice)
- You own this code. The copyright is yours from the moment it was written —
  in Pakistan, the **Copyright Ordinance 1962** protects original works
  automatically; you do **not** have to register to own it.
- To make ownership enforceable and easy to prove, **register it** with the
  **Pakistan Copyright Office / IPO-Pakistan** (a short application, small
  fee) and record the date. Keep an early dated copy.
- Add a **copyright notice** and a **LICENSE** file: e.g. a header in each
  file `© <year> <your name>. All rights reserved.`, plus a `LICENSE` that
  says the source may not be copied, modified or resold without your written
  permission. Keep the source private (don't publish it) if you don't want
  others copying the code.
- **Trademark "IIK"** separately at IPO-Pakistan (or use a "™" now, "®" after
  registration) to stop others using the name for similar services. A name is
  not protected as a trademark just by using it — registration gives the
  exclusive right.
- For a commercial launch, have a lawyer review your terms/privacy notice and
  the registration filings — this summary is general information, not legal
  advice.
