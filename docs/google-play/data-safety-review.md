# Google Play Data safety review — SkinSnap

**Prepared:** 23 October 2026  
**Status:** Engineering evidence worksheet; not a completed Play Console declaration. Complete against the final Android artifact, provider contracts, and live settings before release.

## Do not submit “No data collected”

SkinSnap transmits a selected photo, authentication data, analysis results, and optional user preferences off-device. The final Data safety answers must cover the app and every included SDK/service, including RevenueCat/Google Play billing and operational providers.

## Data inventory and declaration guidance

| Data or Google Play category | Evidence in current source | Collection / sharing / purpose direction | Status |
|---|---|---|---|
| Photos and videos — photos | A selected camera/gallery image is prepared and sent over HTTPS to SkinSnap's Worker; the Worker sends it to Groq for visual analysis. | Treat the photo as collected because it leaves the device. Disclose use for app functionality and AI analysis. Groq receives it as an AI provider; declare sharing unless the final Google service-provider exception and contractual facts are confirmed. | Transmission verified in code; final classification and vendor contract review required. |
| Health and fitness — health information | The app generates cosmetic observations about visible appearance and general skincare routines; it does not diagnose or ask for medical records. | Do not assume skin observations are outside Google's health-data definition. Get a final taxonomy/legal review; consider declaring the generated observation/routine data under health information if required by the current Play definition. | Requires owner/legal confirmation. |
| Personal info — email address and user IDs | A Supabase Auth UUID is created for a guest profile when protected account-backed features are used; email/password are optional and submitted to Supabase Auth when users choose registered accounts. The UUID scopes database records and RevenueCat identity. | Declare relevant account identifiers for account management, authentication, and service functionality. Email/password are optional for exploration, sent to Supabase Auth for registered accounts, and not saved in app local storage by SkinSnap. | Guest flow is implemented in source; Supabase anonymous-auth settings, abuse controls, and final configuration require owner verification. |
| App activity / user-generated content | User-selected concerns and routine preferences; saved analysis history, routine content, and progress data. | Describe personalization and app functionality. Evaluate each current Google category against the exact final data and fields. | Data processing verified; final form mapping requires review. |
| Financial info / purchase history | RevenueCat SDK and subscription purchase code are conditionally available in a supported configured build. Google Play processes Android purchases. | Verify the actual SDK/configuration and Play Console form. Disclose subscription/transaction/entitlement data where the definitions require. SkinSnap does not request payment-card details in the inspected flow. | Production availability and final SDK collection unverified. |
| Device or other identifiers | Network services can receive IP address, request metadata, and account/app-user identifiers. No first-party advertising SDK appears in the inspected manifest. | Review Cloudflare, Supabase, Groq, RevenueCat, and transitive SDK collection; include identifiers where required. | Provider-specific collection unverified. |
| Diagnostics and logs | Worker observability is enabled; custom logs include safe stage, correlation, model/provider, image byte count/MIME type, status, and attempt details. | Inspect Cloudflare request logs, retention, IP/user-agent collection, and any SDK diagnostics. Never include selfie bytes, credentials, tokens, or unnecessary analysis text in app logs. | Custom source logging reviewed; live log settings and final SDK behavior unverified. |

## Data handling facts to use in the final form

- **Required vs optional:** A photo is optional for using non-photo features but required for a photo analysis. Photo upload requires explicit consent. Routine preferences are optional. Email/password registration is optional; a guest Supabase identity is created only when a protected account-backed feature needs one. Guest identity recovery after app data loss is not currently available.
- **Purpose:** app functionality, account management, photo analysis, personalized routine guidance, progress/history, subscription entitlement verification, and service security/abuse prevention.
- **Sharing:** photos go to Groq for vision; text observations and optional preferences go to Groq for routine generation. Supabase provides authentication/database; Cloudflare hosts the API and receives app requests. RevenueCat/Google Play may process billing identifiers when configured. Whether a processor qualifies for a Google “service provider” sharing exception must be confirmed from contracts and actual settings.
- **Retention:** no automatic expiry for completed analysis results is configured in inspected source. Failed attempts can leave job status/attempt metadata. The app attempts temporary JPEG cleanup; interruptions can prevent it. Provider, infrastructure, database backup, and log retention settings are not verified. Do not claim a fixed deletion window.
- **Deletion:** in-app authenticated account deletion exists and removes the known user-scoped records before requesting Supabase Auth deletion. Partial deletion is possible on a service failure and retry is the recovery mechanism. Device photos on other devices and provider-held copies are not removed. The external web deletion page is currently disabled and must be enabled, deployed, and tested before Google Play submission.
- **Encryption in transit:** inspected mobile auth/API and Worker provider calls use HTTPS. Confirm the final release manifest, all runtime URLs, redirects, and the hosted external deletion page; release-artifact verification has not been completed.
- **Age:** the confirmed minimum age is 18. The app collects a local boolean age attestation, not date of birth. This is not an age-verification service.

## Required pre-submission checks

- [ ] Review current Google Play Data safety definitions and map each final SDK/service data field to the current form categories.
- [ ] Confirm the skin-image/observation classification under Health and fitness.
- [ ] Confirm whether Groq, Supabase, Cloudflare, and RevenueCat meet Google's service-provider criteria and what data each may use independently.
- [ ] Inspect final Android merged manifest and release artifact for cleartext traffic, device permissions, SDKs, and telemetry.
- [ ] Verify current Supabase schema, storage inventory, backup retention, project region, and deletion behavior with a disposable account.
- [ ] Verify Groq data settings, Cloudflare observability/log retention, RevenueCat configuration, and Google Play purchase flow.
- [ ] Publish an approved HTTPS Privacy Policy URL and a working external account-deletion URL; configure both in Play Console and in-app links.
- [ ] Test account deletion and partial-failure retry without touching production user data.
- [ ] Reconcile the stale `gemini` provider value in SQL model metadata; it does not match the current Groq-only Worker path.

## References

- Google's [Data safety section guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- Google's [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- Google's [account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- Repository evidence: `src/services/analysisApi.ts`, `src/app/upload.tsx`, `src/services/authApi.ts`, `src/services/billing.ts`, `worker/src/index.ts`, `wrangler.jsonc`, and `supabase/migrations/`.
