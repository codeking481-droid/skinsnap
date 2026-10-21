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

- Full-bleed local portrait, split-color wordmark, custom vector feature icons, translucent gradient tiles, glowing pink CTA, and overlapping decorative portraits.
- Responsive portrait composition with scrolling on shorter screens and enlarged text. Real device status bar and safe-area bottom inset.
- Welcome screen's Get Started button opens onboarding. Next advances through the introduction, inclusivity, and privacy pages. Privacy Continue opens photo upload.
- Gallery selection and camera capture use Expo-compatible native APIs. Any readable image can be selected regardless of original file size or dimensions; the device keeps the photo local through preview and paywall.
- The camera's oval is a positioning guide only; face detection is not performed. Image preview uses aspect-preserving fit instead of cropping arbitrary gallery images.
- A paid analysis request is sent only after explicit consent, a verified active entitlement, authenticated sign-in, and a user request. The app prepares a JPEG with a 2048-pixel longest edge; the Cloudflare Worker has a separate 12 MiB prepared-image ceiling.
- The privacy screen includes demo copy. Before launch, publish and review real privacy/terms pages and complete Play Data Safety disclosures for Supabase, Cloudflare, RevenueCat, and Gemini processing.
- The welcome footer follows the supplied reference copy. Footer portraits are decorative images and should be replaced with approved customer imagery before release if presented as testimonials.
- First launch follows Welcome → onboarding → photo selection and local image-readability validation → subscription offer. A purchase can proceed to the analysis request only after the RevenueCat SDK reports a verified active entitlement; no scan animation or sample result is presented as real.
- RevenueCat integration is prepared for the weekly, standard annual, and exclusive annual product IDs documented below. Store-localised prices and billing periods are displayed from RevenueCat; target USD amounts are not hardcoded as checkout prices.
- Expo Go always uses a labelled development-only billing preview: no RevenueCat native SDK is loaded, no purchase can be made, and no premium entitlement or analysis access is granted.
- Routine checklist state and completed-week days are stored locally. A day is recorded as complete only after all morning and evening steps are checked.
- No fabricated analysis scores or scan history are shown. Results and detailed recommendations render only validated responses from the secure analysis API. Routine consistency remains available without an analysis subscription.
- Supabase account sign-in, Cloudflare API routes, server-side RevenueCat verification, history/routine sync, and account deletion are implemented but require external project configuration. No Worker deployment or Supabase migration was performed from this checkout.
- No fabricated analysis or demo entitlement is produced. Analysis and purchases remain unavailable until the matching Supabase, Worker, RevenueCat, store-product, and legal configuration is present.

## Subscription and analysis integration

### Identifiers

- RevenueCat entitlement: `skinsnap_premium`
- RevenueCat default offering: `default`
- Weekly Google Play product: `skinsnap_weekly` (one-week auto-renewing base plan)
- Standard annual Google Play product: `skinsnap_yearly` (one-year auto-renewing base plan)
- Exclusive annual Google Play product: `skinsnap_yearly_downsell` (one-year auto-renewing base plan)
- RevenueCat downsell offering: `yearly_downsell`

Set the US Google Play base-plan prices to $6.99/week, $29.99/year, and $24.99/year respectively. Configure no free trials and no introductory prices. Attach all three products to the single `skinsnap_premium` entitlement. Put the weekly and standard annual packages in `default`, and the separate annual downsell package in `yearly_downsell`. Configure the downsell as a separate annual subscription product/base plan, not a client-selected Play offer: Google Play offer eligibility is store-controlled and cannot guarantee that a particular promotional offer is purchasable for every account. Regional prices must be configured in Play Console and are always fetched from RevenueCat at runtime. The displayed downsell saving is calculated from the two returned annual store prices and is hidden unless both are available in the same currency.

### Runtime configuration

Provide these non-secret/public app values in the appropriate EAS `development`, `preview`, or `production` environment. Do not put a RevenueCat secret API key or any AI provider key in the app:

- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` — RevenueCat Android public SDK key for that environment.
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` — optional iOS public SDK key.
- `EXPO_PUBLIC_API_URL` — HTTPS URL for the existing `skinsnap` Cloudflare Worker.
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable/anon key only; never a service-role key.
- `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` — published HTTPS legal documents.

The store purchase CTA intentionally stays disabled until the store products are configured, the user has a securely stored authenticated session, the backend URL exists, and both legal URLs are available. Email/password sign-in and account creation use Supabase Auth; Expo Go can use account and history endpoints but cannot make purchases or gain premium access.

### Backend contract and security requirements

The Cloudflare Worker is implemented in `worker/src/index.ts` and configured by `wrangler.jsonc`; it is not yet deployed from this checkout. The mobile API client fails closed and expects:

- `GET /v1/session` to validate the current bearer token and return the stable, server-issued `revenueCatAppUserId` bound to that authenticated account. The app uses that ID to log in to RevenueCat and checks the same ID before allowing purchases or photo submission. Do not accept an app user ID supplied by the client as the identity authority.
- `POST /v1/subscriptions/yearly-downsell/claim` with an authenticated user session. The server must atomically determine eligibility and irreversibly record the one-time impression **before** returning `{ "eligible": true, "claimId": "...", "productIdentifier": "skinsnap_yearly_downsell" }`. Eligibility and the used/impression state must be stored per authenticated account in a durable server-side database, not inferred from SecureStore or a client flag.
- `POST /v1/subscriptions/yearly-downsell/dismiss` to record a dismissal. The claim endpoint must also consume the only impression so reinstalling or losing a dismissal request cannot reissue the same offer.
- `POST /v1/analysis` as authenticated multipart with `photo`, `Authorization: Bearer <session token>`, and `Idempotency-Key`. The server must validate the session, resolve the RevenueCat customer ID from that authenticated identity, independently verify the active `skinsnap_premium` entitlement with the RevenueCat secret API key, reject inactive/unverified customers before inference, enforce per-user quotas and upload-size limits, deduplicate idempotency keys, and avoid logging or publicly retaining facial photos. Never trust a client entitlement boolean or a client-supplied RevenueCat user ID.
- Analysis responses shaped as `{ "resultId": "...", "createdAt": "<ISO date>", "imageQuality": "clear|limited", "summary": "...", "observations": [{ "category": "visible-shine|apparent-dryness|uneven-looking-tone|visible-blemishes|general-texture", "observation": "...", "confidence": "low|moderate|high" }], "morningRoutine": ["..."], "eveningRoutine": ["..."], "precautions": ["..."] }`. The backend/model must keep observations non-diagnostic, avoid sensitive-attribute inference, and retain AI keys only server-side.

### Supabase and Cloudflare setup

Apply `supabase/migrations/202610210001_skinsnap_core.sql` to the intended Supabase project before deploying the Worker. It enables RLS on user tables, scopes user-facing policies to `auth.uid()`, denies direct client writes to analysis results and downsell claims, caps inference attempts at 20 per account in a rolling 30-day window, allows one bounded retry per idempotency key, and creates no photo bucket. The backend stores result JSON only; facial photo files are not persisted.

Configure these **Cloudflare Worker secrets** for the existing `skinsnap` production service. Do not commit or display their values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REVENUECAT_SECRET_API_KEY`
- `GEMINI_API_KEY` (already reported as configured)
- `GROQ_API_KEY` (already reported as configured; the Worker currently uses Gemini)

The app also needs `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Copy the Worker HTTPS URL from Cloudflare’s **Settings → Domains & Routes**; a dashboard link does not reveal its `workers.dev` hostname. Fill `.env` from `.env.example` for local development and configure the same public values in the appropriate EAS environment.

The camera/gallery accepts any readable image without a pixel or input-file-size cutoff. Before a paid analysis request, the native image manipulator converts it to JPEG and scales the longest edge to at most 2048 pixels. The Worker rejects a converted request larger than 12 MiB to protect inference and platform limits.

### Existing Worker deployment

The GitHub Actions workflow is gated: automatic deployments remain disabled until the repository variable `CLOUDFLARE_WORKER_DEPLOY_ENABLED` is set to `true`. Manual `workflow_dispatch` is available, and the job first checks the account ID and confirms that the existing Worker named `skinsnap` is present. Configure Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (`6d01b949907068a4764bb639a173e789`); the token needs access to that account’s Workers scripts.

The local Wrangler login currently belongs to account `7290552febb1c1d7421aef7a1f87ce62`, not the account `6d01b949907068a4764bb639a173e789` in the supplied dashboard URL. Do not deploy until Wrangler is authenticated to the intended account and the target Worker is verified. `npm run worker:check` is a non-deploying dry run; `npm run worker:dev` runs the Worker locally.

The Supabase schema must be applied manually or with `npx supabase db push` before a Worker deployment. Gemini generates cautious visual observations; Groq generates general morning/evening routine guidance from those observations only. The raw photo is sent to Gemini, not Groq. Both provider keys remain server-side. The Worker additionally requires Supabase and RevenueCat server credentials before analysis can run.

### Testing purchases

Expo Go supports the UI, onboarding, camera, gallery, and authenticated Supabase account/history endpoints. RevenueCat's native module requires an Android development or Play internal-testing build; Expo Go never grants premium access. Configure Google Play license testers, upload the Android package/products, connect the Play app to RevenueCat, and use a non-production RevenueCat project/public SDK key for development. Do not publish a production offering, submit an app, or turn on live billing until the product IDs/prices/legal URLs/backend are reviewed and explicitly approved.

## Assets and fidelity

`assets/images/welcome-portrait.png` was created using the built-in image generation tool from the user-supplied reference. It is a standalone photograph with no baked-in interface. It approximates the reference portrait; this is not a claim of pixel-identical reproduction. Local Inter fonts keep typography consistent; the device status bar varies by platform. Inter is distributed under the SIL Open Font License included at `assets/fonts/OFL.txt`.

Generation prompt: recreate only the reference's vertical close-up beauty photograph of an adult woman with deep brown luminous skin, wet curly black hair, closed eyes, head tilted up and right, glossy lips, a gold hoop earring, and a hand with pink nails touching her cheek; hot pink rim lighting, black background with magenta wisps, dark bottom half; no text, logos, icons, status bar, buttons, or interface.

The onboarding photo strip at `assets/images/skin-tone-strip.png` was also generated with the built-in image generation tool. Prompt: create a four-panel horizontal montage without text or borders, with close-up beauty portraits of adult women representing deep brown, medium brown, tan, and fair freckled skin; soft, glossy natural skin, black backgrounds, and matching pink rim lighting. The second portrait echoes the welcome-screen model. The app crops this image into individual portrait cards.

The photo-upload sample at `assets/images/upload-sample.png` was generated with the built-in image generation tool. Prompt: a single adult Black woman with medium-deep brown skin, centered front-facing head and shoulders, looking at camera, long neat braids, subtle makeup, realistic luminous skin, muted mauve studio backdrop, and soft light; no UI, text, or watermark.

Decorative footer photographs are from Unsplash, downloaded locally under the [Unsplash license](https://unsplash.com/license):

- Image CDN ID: photo-1616683693504-3ea7e9ad6fec
- Image CDN ID: photo-1534528741775-53994a69daeb
- Image CDN ID: photo-1531123897727-8f129e1688ce
- Image CDN ID: photo-1524504388940-b1c1722653e1

Original working-tree deletions from the prior project were left in place; the app now uses `src/app` routes.
