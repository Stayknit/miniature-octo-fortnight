# StayKnit — Android & iOS App Store Rollout To-Do

**Approach chosen:** Wrap the existing PWA (Android = Trusted Web Activity via PWABuilder/Bubblewrap; iOS = WKWebView shell via PWABuilder).
**Why this path:** StayKnit is already a mature, installable PWA (standalone display, service worker `public/sw.js`, offline cache, install prompt, maskable 192/512 icons). Wrapping reuses 100% of the live app at `www.stayknit.org` — no second front-end to maintain. The apps are thin native shells that load the hosted site.

> **Not legal/store-policy advice.** Apple and Google review rules change. The payments item (Phase 5) is the single biggest risk for a subscription app and should be confirmed before submitting — see the note there.

---

## Phase 0 — Decisions & accounts (blockers, do first)

- [ ] **Confirm the wrapper toolchain.** Default: [PWABuilder](https://www.pwabuilder.com) (generates both an Android AAB and an iOS Xcode project from the manifest URL). Alternative for Android only: Bubblewrap CLI.
- [ ] **Google Play Developer account** — one-time USD $25. Register as the business (StayKnit (Pty) Ltd), not a personal identity. Requires D-U-N-S-style org verification for organisation accounts (allow days).
- [ ] **Apple Developer Program account** — USD $99/year. Enrol as the **organisation** (needs a D-U-N-S number for StayKnit (Pty) Ltd; free to request, can take 1–2 weeks). Personal enrolment is faster but publishes under an individual's name.
- [ ] **Decide the app identity:** app name ("StayKnit"), bundle/package IDs (e.g. `org.stayknit.app`), primary category (Business), age rating, support URL, marketing URL, privacy-policy URL (already live: `www.stayknit.org` legal pages).
- [ ] **Mac access for iOS.** Building/signing the iOS shell and uploading to App Store Connect needs Xcode on macOS (or a Mac cloud/CI runner). Confirm how you'll get this.

## Phase 1 — Make the PWA store-ready (code changes in this repo)

- [ ] **Add `screenshots` to `app/manifest.ts`** (mobile + optionally wide/desktop). Improves the richer PWA install and is reused for the Play listing. *(Currently missing.)*
- [ ] **Add `.well-known/assetlinks.json`** served from the site root, containing the Play app's package name + signing-key SHA-256 fingerprint. Required so the Android TWA runs **without a browser URL bar**. (Fingerprint comes from Phase 2, so this is a two-step: add the route now, fill the fingerprint after signing.)
- [ ] **Verify `apple-touch-icon` + iOS status-bar meta** are correct for the WKWebView shell (already have `apple-icon.png`; confirm sizes 180×180).
- [ ] **Confirm deep-link / start URL** (`start_url` in manifest) lands on the right authed entry and that Better Auth cookies work in the webview (`sameSite`/`secure` already handled for previews — verify in a real device webview).
- [ ] **Test offline + auth flows** inside a real Android Chrome Custom Tab and an iOS WKWebView before packaging (login, payment redirect return, session persistence).

## Phase 2 — Build & sign Android (TWA)

- [ ] Generate the Android package from `https://www.stayknit.org/manifest.webmanifest` via PWABuilder (or `bubblewrap init`).
- [ ] Let Google **Play App Signing** hold the upload key (recommended). Record the **SHA-256 fingerprint** it gives you.
- [ ] Paste that fingerprint into `.well-known/assetlinks.json` (Phase 1) and redeploy the site. Verify the TWA opens full-screen with no address bar.
- [ ] Produce the signed **AAB** for upload.

## Phase 3 — Build & sign iOS (WKWebView shell)

- [ ] Generate the iOS project from PWABuilder; open in Xcode.
- [ ] Set bundle ID, signing team (Apple org account), app icons, launch screen.
- [ ] Add capabilities as needed (push via APNs if you enable notifications — see Phase 6).
- [ ] Archive and upload the build to **App Store Connect** (TestFlight first).

## Phase 4 — Store listings & assets

- [ ] **App icon** high-res: 512×512 (Play), 1024×1024 (App Store).
- [ ] **Screenshots** per device class: Play (phone + optional tablet); App Store (6.7" and 5.5" iPhone, iPad if you support it). Capture from real host + owner screens.
- [ ] **Copy:** short + full description, keywords, promo text. Reuse the SEO hero line ("The channel manager for short-stay rentals") and FAQ content.
- [ ] **Privacy:** complete Apple **App Privacy** questionnaire and Google **Data safety** form. StayKnit collects account data, booking/guest data, payment metadata (Paystack) — declare accurately and align with the POPIA-based privacy policy.
- [ ] **Content rating** questionnaires (IARC for Play; Apple age rating).
- [ ] Support + marketing URLs, contact email (`info@stayknit.org`).

## Phase 5 — Payments review risk (READ BEFORE SUBMITTING) ⚠️

StayKnit sells subscriptions via **Paystack** in-app. This is the highest-risk item for both stores:

- [ ] **Apple (Guideline 3.1.1 – In-App Purchase).** Apple generally requires its own IAP for digital subscriptions "consumed within the app," taking a commission. A **business/enterprise B2B SaaS** used to run a real-world business *may* qualify under the reader/business exceptions, but this is not guaranteed. **Confirm the classification before building the iOS payment flow.** Mitigations: position as a business-management tool, or handle sign-up/billing entirely on the web (account created and paid on `www.stayknit.org`, app is login-only), which is the common workaround.
- [ ] **Apple (Guideline 4.2 – Minimum Functionality).** Pure web wrappers get rejected if they feel like "just a website." Mitigate with native touches: push notifications, share, proper offline handling, native splash — so it reads as an app, not a bookmark.
- [ ] **Google Play (Payments policy).** More lenient for services consumed outside Play, but review whether Play Billing applies to your subscription. Confirm current policy.
- [ ] Decide the definitive billing model for mobile (web-only sign-up vs in-app) and implement/adjust the flow accordingly. *(May require follow-up code changes — flag to me once decided.)*

## Phase 6 — Native niceties (optional, strengthens App Store approval)

- [ ] **Push notifications** (booking alerts, "needs you" items). Android TWA + iOS shell both need native push wiring (FCM / APNs) — this is extra work beyond a plain wrapper.
- [ ] Splash screen + themed status bar polish.
- [ ] Handle external links (Paystack, iCal) so they open correctly from the webview.

## Phase 7 — Test, submit, launch

- [ ] **Internal testing:** Play Internal testing track + Apple **TestFlight** on real devices (host and owner logins, payment round-trip, offline).
- [ ] Fix review-blocking issues; prepare reviewer notes + a **demo login** (reviewers need a working test account that shows real functionality).
- [ ] Submit for review (Apple review days; Play review hours–days).
- [ ] **Staged rollout** on Play (e.g. 10% → 100%); phased release on App Store.
- [ ] Post-launch: monitor crashes (Sentry already wired), reviews, and store health.

## Phase 8 — Maintenance

- [ ] Because the shell loads the live site, most updates ship by deploying the web app — **no new store build needed** for content/logic changes.
- [ ] Rebuild + resubmit only when the wrapper, icons, native capabilities, or OS target requirements change.
- [ ] Keep Apple membership renewed annually; watch for store policy changes (especially payments).

---

## Quick reference

| Item | Android (Play) | iOS (App Store) |
|---|---|---|
| Account cost | $25 one-time | $99 / year |
| Wrapper | TWA (PWABuilder/Bubblewrap) | WKWebView shell (PWABuilder) |
| Build tool | Any OS | Xcode on macOS |
| Signing artifact | AAB + Play App Signing | Archive via Xcode → App Store Connect |
| URL-bar hiding | `.well-known/assetlinks.json` (SHA-256) | n/a |
| Biggest risk | Payments policy review | 3.1.1 IAP + 4.2 minimum functionality |
| Test track | Internal testing | TestFlight |

**Repo changes needed now (Phase 1):** add manifest `screenshots`, add `.well-known/assetlinks.json` route, verify apple-touch-icon sizes. Tell me to proceed and I'll implement those in this codebase.
