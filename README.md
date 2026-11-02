# skinsnap

## SkinSnap Android-first mobile app

SkinSnap is an Expo Router / React Native / TypeScript skincare app with camera and gallery capture, onboarding, subscriptions, routines, progress, account sign-in, and a fail-closed Cloudflare analysis API.

## Run

```sh
npm install
npm start
```

Press `a` to open an installed Android emulator, or run `npm run web` for a browser preview. This project targets Expo SDK 57 for Android Expo Go compatibility. If your Play Store Expo Go is on a different SDK, install the matching Android build from [expo.dev/go](https://expo.dev/go); Expo Go and the project SDK versions must match. Start the server with `npx expo start --lan`, connect the phone and computer to the same Wi-Fi network, then scan the terminal QR code with Expo Go. If the local network blocks the connection, try `npx expo start --tunnel` (requires a working internet connection). The interface and onboarding work in Expo Go; real RevenueCat purchases require a native Android development or Play internal-testing build because `react-native-purchases` includes native code. For production, use EAS Build rather than Expo Go.

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform web
npx expo export --platform android
```

## Scope and interactions

- Responsive charcoal-and-beige dashboard with routine completion, streaks, private diary check-ins, saved observations, and Home / Scan / Diary / Profile navigation.
- Responsive onboarding and dashboard layouts use safe-area insets and scroll on shorter screens.
- The first-run flow is Splash → onboarding → Home. Home is available immediately after onboarding; the subscription offer remains available in Settings and before paid analysis.
- SkinSnap is 18+ for launch. Onboarding requires an adult confirmation; selecting “I am under 18” blocks continuation and shows “SkinSnap is 18+ for launch. Join waitlist for 16+ version.” No date of birth or parental-consent flow is used.
- Gallery selection and camera capture use Expo-compatible native APIs. Any readable image can be selected regardless of original file size or dimensions; the device keeps the photo local through preview and paywall.
- The camera's dashed purple oval is a positioning guide only; face detection is not performed. Image preview uses aspect-preserving fit instead of cropping arbitrary gallery images.
- A paid analysis request is sent only after explicit consent, a verified active entitlement, authenticated sign-in, and a user request. The app prepares a JPEG with a 2048-pixel longest edge; the Cloudflare Worker has a separate 12 MiB prepared-image ceiling.
- The privacy screen includes demo copy. Before launch, publish and review real privacy/terms pages and complete Play Data Safety disclosures for Supabase, Cloudflare, RevenueCat, and Groq processing.
- The welcome footer follows the supplied reference copy. Footer portraits are decorative images and should be replaced with approved customer imagery before release if presented as testimonials.
- First launch follows Splash → onboarding → Home. Photo selection and local image-readability validation happen only when a user chooses to start a scan. A purchase can proceed to the analysis request only after the RevenueCat SDK reports a verified active entitlement; no scan animation or sample result is presented as real.
- RevenueCat integration is prepared for the weekly, standard annual, and exclusive annual product IDs documented below. Store-localised prices and billing periods are displayed from RevenueCat; target USD amounts are not hardcoded as checkout prices.
- Expo Go does not fetch or display example subscription prices: no RevenueCat native SDK is loaded, no purchase can be made, and no premium entitlement or analysis access is granted.
- Routine checklist state and completed-week days are stored locally. A day is recorded as complete only after all morning and evening steps are checked.
- The homepage settings shortcut opens account/data, skin preferences, diary, subscription/restore, and legal information. Progress summarizes saved analyses, diary check-ins, and routine-completion history; it does not fabricate skin scores or photo comparisons because submitted photos are not retained in analysis history.
- No numeric glow score or fabricated scan history is shown. Cosmetic tiers appear only when a clear image and matching visible observation support them. A skin-age appearance estimate uses the 16–35 cosmetic range, is labelled “estimated”, and is returned only for a clear front-facing photo. The result disclaimer is “Cosmetic tracking only, not medical diagnosis.” UK product ideas link to Boots, show a price check, and remind users to check ingredients for their sensitivity. Fragrance is an optional, user-selected mood/vibe idea, not a skin diagnosis.
- Supabase account sign-in, Cloudflare API routes, server-side RevenueCat verification, history/routine sync, and account deletion are implemented but require external project configuration. No Worker deployment or Supabase migration was performed from this checkout.
- No fabricated analysis or demo entitlement is produced. Analysis and purchases remain unavailable until the matching Supabase, Worker, RevenueCat, store-product, and legal configuration is present.

## Subscription and analysis integration

### Play age and Data Safety review

SkinSnap is intended for adults (18+) at launch. The age gate is a self-confirmation, not independent age verification: it does not collect a date of birth and does not provide a parental-consent path. The app and Worker require an affirmative 18+ assertion before a scan can be submitted, but a request header is not proof of a person's age. Under-18 selections stop onboarding and do not unlock scans, purchases, or results.

The current analysis is cosmetic-only. It describes visible characteristics, does not diagnose medical conditions or infer skin type/hydration, and provides evidence-bound tiers. An optional skin-age appearance estimate is labelled “estimated”, ranges 16–35, and is only returned for a clear front-facing photo. Every result displays: “Cosmetic tracking only, not medical diagnosis.”

**Draft Play Console Data Safety description — verify against the deployed build and vendor settings before submission:** When a user consents to a scan, the app sends a prepared photo to the authenticated SkinSnap Worker and Groq for cosmetic observations. The app database stores structured analysis results and account/history data when the corresponding backend and migrations are configured; raw photos are not intentionally saved to the app database. Supabase, Cloudflare, Groq, RevenueCat, and Google Play may process account, request, analysis, or purchase data as described in the reviewed privacy policy and current vendor settings. Confirm all data types, purposes, retention, deletion, and third-party SDK disclosures in Play Console; this draft is not a completed Data Safety declaration.

### Identifiers

- RevenueCat entitlement: `SkinSnap Pro`
- RevenueCat default offering: `default`
- Weekly Google Play product: `skinsnap_weekly_499` (one-week auto-renewing base plan)
- Monthly Google Play product: `skinsnap_monthly_1299` (one-month auto-renewing base plan)
- Standard annual Google Play product: `skinsnap_yearly_4999` (one-year auto-renewing base plan)
- Exclusive annual Google Play product: `skinsnap_yearly_downsell` (one-year auto-renewing base plan)
- RevenueCat downsell offering: `yearly_downsell`

Configure the Google Play base-plan prices in RevenueCat. Regional prices are localized by Google Play and fetched from the `default` offering at runtime; the app does not substitute hard-coded prices when products are unavailable. Configure no free trials or introductory prices. Attach the weekly, monthly, and annual products to the single `SkinSnap Pro` entitlement and put all three packages in `default`.

### Runtime configuration

Provide these non-secret/public app values in the appropriate EAS `development`, `preview`, or `production` environment. Do not put a RevenueCat secret API key or any AI provider key in the app:

- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` — RevenueCat Android public SDK key for that environment.
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` — optional iOS public SDK key.
- `EXPO_PUBLIC_API_URL` — HTTPS URL for the existing `skinsnap` Cloudflare Worker.
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable/anon key only; never a service-role key.
- `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` — published HTTPS legal documents.

The store purchase CTA stays disabled unless `EXPO_PUBLIC_SUBSCRIPTION_PURCHASES_ENABLED=true`, store products are configured, the user has a securely stored authenticated session, the backend URL exists, and both legal URLs are available. Keep the flag false until native development-build purchases have been tested. Email/password sign-in and account creation use Supabase Auth; Expo Go can use account and history endpoints but cannot make purchases or gain premium access.

### Backend contract and security requirements

The Cloudflare Worker is implemented in `worker/src/index.ts` and configured by `wrangler.jsonc`; it is not yet deployed from this checkout. The mobile API client fails closed and expects:

- `POST /v1/analysis` and `POST /v1/dev/analysis` to include `X-SkinSnap-Adult-Eligibility: 18+`. This is a required self-attestation, not independent age verification; missing or invalid values are rejected before photo processing.
- `GET /v1/session` to validate the current bearer token and return the stable, server-issued `revenueCatAppUserId` bound to that authenticated account. The app uses that ID to log in to RevenueCat and checks the same ID before allowing purchases or photo submission. Do not accept an app user ID supplied by the client as the identity authority.
- `POST /v1/subscriptions/yearly-downsell/claim` with an authenticated user session. The server must atomically determine eligibility and irreversibly record the one-time impression **before** returning `{ "eligible": true, "claimId": "...", "productIdentifier": "skinsnap_yearly_downsell" }`. Eligibility and the used/impression state must be stored per authenticated account in a durable server-side database, not inferred from SecureStore or a client flag.
- `POST /v1/subscriptions/yearly-downsell/dismiss` to record a dismissal. The claim endpoint must also consume the only impression so reinstalling or losing a dismissal request cannot reissue the same offer.
- `POST /v1/analysis` as authenticated multipart with `photo`, `Authorization: Bearer <session token>`, and `Idempotency-Key`. The server must validate the session, resolve the RevenueCat customer ID from that authenticated identity, independently verify the active `skinsnap_premium` entitlement with the RevenueCat secret API key, reject inactive/unverified customers before inference, enforce per-user quotas and upload-size limits, deduplicate idempotency keys, and avoid logging or publicly retaining facial photos. Never trust a client entitlement boolean or a client-supplied RevenueCat user ID.
- Analysis responses include `imageQuality`, visible observations, observation-backed cosmetic tiers, optional `{ "value": 22, "label": "estimated" }` skin-age appearance estimate (clear front-facing images only), the exact cosmetic disclaimer, and separate morning/evening routine guidance. The Worker accepts either the current `description` or legacy `observation` field, ignores unrelated legacy metadata, and treats omitted optional tiers/age estimates as unavailable while retaining safety validation. The backend/model must keep observations non-diagnostic, avoid sensitive-attribute inference, and retain AI keys only server-side.

### Supabase and Cloudflare setup

Apply `supabase/migrations/202610210001_skinsnap_core.sql` to the intended Supabase project before deploying the Worker. It enables RLS on user tables, scopes user-facing policies to `auth.uid()`, denies direct client writes to analysis results and downsell claims, caps inference attempts at 20 per account in a rolling 30-day window, allows one bounded retry per idempotency key, and creates no photo bucket. The backend stores result JSON only; facial photo files are not persisted.

Configure these **Cloudflare Worker secrets** for the existing `skinsnap` production service. Do not commit or display their values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REVENUECAT_SECRET_API_KEY`
- `GROQ_API_KEY` (required server-side secret; not configured in this checkout)

The app also needs `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Copy the Worker HTTPS URL from Cloudflare’s **Settings → Domains & Routes**; a dashboard link does not reveal its `workers.dev` hostname. Fill `.env` from `.env.example` for local development and configure the same public values in the appropriate EAS environment.

For browser-based development, set the Worker’s `ALLOWED_ORIGINS` to the exact web app origin(s); add localhost origins only to a separate non-production Worker. The current web preview origin must be explicitly allowed for its analysis preflight. Android native requests do not use browser CORS.

The camera/gallery accepts any readable image without a pixel or input-file-size cutoff. Before a paid analysis request, the native image manipulator converts it to JPEG and scales the longest edge to at most 2048 pixels. The Worker rejects a converted request larger than 12 MiB to protect inference and platform limits.

### Existing Worker deployment

The GitHub Actions workflow is gated for both pushes and manual `workflow_dispatch`: deployments remain disabled until the repository variable `CLOUDFLARE_WORKER_DEPLOY_ENABLED` is set to `true`; manual dispatch does not bypass it. The job then checks the account ID and confirms that the existing Worker named `skinsnap` is present. Configure Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (`6d01b949907068a4764bb639a173e789`); the token needs access to that account’s Workers scripts.

The local Wrangler login is not authenticated to the account selected by `wrangler.jsonc`. Do not deploy until Wrangler is authenticated to the intended account and the existing target Worker is verified. `npm run worker:check` is a non-deploying dry run; `npm run worker:dev` runs the Worker locally. In this restricted checkout, the dry run currently fails because Wrangler cannot write its user-level log file or read the parent directory; TypeScript and app bundle checks remain available.

The Supabase schema must be applied manually or with `npx supabase db push` before a Worker deployment. Groq generates cautious visual observations and separate general morning/evening routine guidance from those observations only. The raw photo is sent to Groq for visual analysis. The provider key remains server-side. No API credentials are present in this checkout. The Worker additionally requires Supabase and RevenueCat server credentials before analysis can run.

### Restricted development analysis

For end-to-end provider testing before RevenueCat production billing is enabled, the Worker exposes `POST /v1/dev/analysis`. This route is disabled unless `AI_DEV_TEST_ENABLED=true` and requires a valid Supabase bearer session. Ordinary development testers must match the exact UUID in `AI_DEV_TEST_USER_ID` and remain limited to two charged attempts per rolling 30 days. An optional, separate server-side `AI_ADMIN_TEST_USER_ID` grants the matching authenticated account a configurable `AI_ADMIN_TEST_MONTHLY_LIMIT` (default 20, hard-bounded to 1–100) in the same analysis ledger. The admin cap is a finite inference-attempt safety cap, not an unlimited exemption; each idempotency key also retains its existing two-attempt retry limit. The client cannot assert admin status. At the admin cap, the Worker returns `admin-test-cap-reached` before calling Groq. The Groq key remains Worker-side; the app never receives provider credentials. Results are saved to the signed-in user's normal history.

Use this only on a separate, non-production development Worker and Supabase test account. Never set the enable flag, tester UUID, admin UUID, or admin cap on the production Worker. Configure `AI_ADMIN_TEST_USER_ID` as a Worker-side secret; do not add it to the app or `.env`. Set `AI_ADMIN_TEST_MONTHLY_LIMIT` only as a Worker-side variable or secret. For a development Expo build only, set `EXPO_PUBLIC_AI_DEV_TEST_MODE=true`; keep it false/unset in preview and production. The development build still needs explicit photo consent and an authenticated session. RevenueCat billing remains disabled for this test path, and the production `/v1/analysis` endpoint continues to require server-verified active entitlement and its ordinary account limit.

### Reconciling a manually created Supabase schema

Seven tables were reported as manually created, but the live project URL/credentials are not present in this checkout, so their columns, constraints, RLS policies, indexes, functions, and triggers have not been compared. Do not apply the initial migration again or create a reconciliation migration from assumptions. First run the metadata-only query in `supabase/diagnostics/inspect_existing_schema.sql` in the intended Supabase SQL Editor and save its output. It reads schema metadata only, not user or photo data. Compare that output with `supabase/migrations/202610210001_skinsnap_core.sql`; only then prepare a narrowly scoped, idempotent reconciliation migration for the actual differences.

### Testing purchases

Expo Go supports the UI, onboarding, camera, gallery, and authenticated Supabase account/history endpoints. RevenueCat's native module requires an Android development or Play internal-testing build; Expo Go never grants premium access. Build and launch the native app with `npx expo run:android`. Configure Google Play license testers, upload the Android package/products, connect the Play app to RevenueCat, and use the platform's public SDK key from a non-production RevenueCat project for development. Never place a RevenueCat secret API key in the client. Do not publish a production offering, submit an app, or turn on live billing until the product IDs/prices/legal URLs/backend are reviewed and explicitly approved.

The paywall reads localized prices from RevenueCat's `default` offering (and `yearly_downsell` for eligible offers). On Android, RevenueCat obtains those product details from Google Play. Configure the matching public SDK key in the EAS environment used to build the app, and attach active products with valid store pricing to the matching RevenueCat offerings. Expo Go, web, missing configuration, or missing products show a price-unavailable/loading message instead of sample amounts. Prices cannot be verified in this checkout without a configured RevenueCat project and supported Android build.

## Assets and fidelity

`assets/images/welcome-portrait.png` is a standalone generated portrait used without baked-in interface. Its lighting is warm-neutral to match SkinSnap's charcoal and beige palette. Local Inter fonts keep typography consistent; the device status bar varies by platform. Inter is distributed under the SIL Open Font License included at `assets/fonts/OFL.txt`.

The portrait at `assets/images/upload-sample.png` is used in onboarding and the analysis transition. It shows an adult Black woman with medium-deep brown skin, long neat braids, subtle makeup, luminous skin, and a charcoal studio backdrop with soft, warm-neutral light; no UI, text, or watermark.

Decorative footer photographs are from Unsplash, downloaded locally under the [Unsplash license](https://unsplash.com/license):

- Image CDN ID: photo-1616683693504-3ea7e9ad6fec
- Image CDN ID: photo-1534528741775-53994a69daeb
- Image CDN ID: photo-1531123897727-8f129e1688ce
- Image CDN ID: photo-1524504388940-b1c1722653e1

Original working-tree deletions from the prior project were left in place; the app now uses `src/app` routes.
