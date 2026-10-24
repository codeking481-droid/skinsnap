# SkinSnap privacy and Play preparation checklist

**Reviewed:** 23 October 2026. These checks report implementation evidence, not legal approval or Play Console submission.

## Implemented in current source

- [x] Photo consent is an explicit unchecked choice before upload.
- [x] Consent text identifies the SkinSnap API and Groq photo/text processing, account-saved results, cleanup caveat, and deletion route.
- [x] Consent is versioned and held in app memory; no server-side consent audit record exists.
- [x] The mobile upload and authentication use HTTPS, authenticated session, and idempotency.
- [x] Worker analysis calls Groq for Qwen vision and Groq text routine generation; no current request calls Gemini.
- [x] Worker does not intentionally persist raw image bytes; structured analysis and job metadata are stored.
- [x] Prepared JPEG cleanup is attempted after request handling; cleanup failure is surfaced.
- [x] The confirmed 18+ age policy is enforced by explicit onboarding/sign-up confirmation and route gating; date of birth is not collected.
- [x] Authenticated in-app account deletion is implemented with server-scoped user identity and partial-failure messaging.
- [x] Session tokens use `expo-secure-store`.
- [x] Camera permission is limited to capture; gallery selection uses the system picker.

## Outstanding before public release

- [ ] Supply and verify the public privacy/support contact; review and approve the legal operator description.
- [ ] Obtain legal review, assign effective dates, and approve the final Privacy Policy and Terms.
- [ ] Configure and test the external account-deletion page; it is disabled in the review build.
- [ ] Verify live Supabase tables, storage inventory, retention, backups, RLS, and deletion constraints.
- [ ] Test valid, unauthorized, repeated, and partial-failure deletion using a disposable account only.
- [ ] Verify Groq, Cloudflare, Supabase, RevenueCat, and Google Play account controls/terms and retention.
- [ ] Reconcile the old Gemini value in SQL model metadata with current Groq processing, preserving historical accuracy.
- [ ] Define result retention and consider individual result deletion.
- [ ] Inspect final Android release manifest, cleartext/network configuration, dependencies, and SDK telemetry.
- [ ] Complete Data safety and Health apps declarations in Play Console using the final build and current Google definitions.
- [ ] Verify hosted legal pages and the Play Console Privacy Policy and deletion URLs over HTTPS.
- [ ] Conduct jurisdiction-specific privacy/legal review.

## Google Play documentation

- [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
