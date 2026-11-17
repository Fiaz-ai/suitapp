# IIK — Google Play Store Listing & Publishing Guide

Everything is ready except the one step only you can do: **creating the
Google Play Developer account**.

## ✅ Ready to publish (in `C:\Users\Office\suitapp\`)
- **`app-release-bundle.aab`** — signed App Bundle (v3), verified (`jar verified`).
  This is the artifact Play Console accepts.
- **`iik.keystore`** + password in `.signing-password.txt` — your **upload key**.
  ⚠️ **Keep these safe and never lose them.** They cannot be recovered.

## 🚫 What only you can do
1. **Create a Google Play Developer account** at https://play.google.com/console
   — one-time **$25**, needs your Google account + **identity verification** + payment.
2. Create the app and click **Publish**. (I can't create the account, pay, or
   verify your identity on your behalf.)

## 📝 Store listing draft (copy into Play Console)
| Field | Value |
|-------|-------|
| App name | **IIK** |
| Short description | Premium men's fashion & custom tailoring — suits, shirts, shalwar kameez and more. |
| Full description | IIK is your one-stop shop for premium men's fashion and bespoke tailoring. Browse a curated collection of pant coats, shirts, trousers, shalwar kameez, kurtas and waistcoats — or order a fully custom design tailored just for you. Add to cart, save favorites, and track your orders, all from a fast, elegant storefront. |
| Category | Shopping |
| Tags | Fashion, Shopping, Tailoring, Men's Fashion |
| Content rating | Everyone |
| Price | Free |
| Contact email | (add yours) |
| Contact website | https://fiaz-ai.github.io/suitapp/ |
| App type | App (not game) |

**Screenshots:** capture your app at phone size from `home.html` (Home, Categories,
Product, Cart, Orders). Play needs at least 2 screenshots (16:9 or 9:16, 320–3840px).
A **feature graphic** (1024×500) is recommended.

## 🧭 Step-by-step (once you have the account)
1. **Play Console → Create app** — name `IIK`, default language English,
   App or game = **App**, Free.
2. **Store listing** — fill in the draft above; upload screenshots + feature graphic.
3. **Content rating** — complete the questionnaire (Everyone).
4. **Pricing & distribution** — leave free; select available countries.
5. **App signing** — enroll in **Play App Signing**; your upload key is `iik.keystore`
   (upload the public cert or the keystore per the console's instructions).
6. **Production → Create release** — upload `app-release-bundle.aab`, add
   release notes (e.g., "First public release — IIK storefront v3"), review.
7. **Roll out** — after Google's review (typically a few hours to a few days).

## 🔁 Releasing future versions
1. Bump `appVersionCode` / `appVersionName` in `twa-manifest.json` (and the web
   `manifest.json` version), then rebuild: `bubblewrap build`.
2. Upload the new `app-release-bundle.aab` in Play Console as a new release.

## 🛠 If you'd rather skip the $25 / account
- **Sideload the APK**: share `app-release-signed.apk` directly — users enable
  "Install from unknown sources". Works now, no account needed.
- **Publish to another store** (Amazon Appstore, APKPure, etc.) — different
  registration, generally cheaper/easier than Play.
