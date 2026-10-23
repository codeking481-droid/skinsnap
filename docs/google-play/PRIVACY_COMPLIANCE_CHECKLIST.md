# SkinSnap privacy/compliance checklist

**Reviewed:** 2026-10-22. Checkboxes identify evidence, not legal approval.

## Implemented in current repository

- [x] Explicit unchecked per-photo consent is required before navigation to analysis.
- [x] Consent is bound to version `2026-10-22` in memory and is cleared on photo replacement or session reset.
- [x] Native upload uses HTTPS, authenticated bearer session, and idempotency.
- [x] Worker does not intentionally persist raw photo bytes; structured results are stored separately.
- [x] Temporary normalized JPEG cleanup runs after analysis request handling; failure is surfaced.
- [x] Gemini receives the photo; Groq receives text observations only.
- [x] UI and backend prompts describe non-diagnostic cosmetic use; structured output and restricted language are validated.
- [x] Account deletion is available from Progress → Account & data settings.
- [x] App does not request broad external media storage permissions in inspected Android manifest. Camera permission is declared; system picker is used for gallery selection.
- [x] Session tokens use `expo-secure-store`.
- [x] Admin exception is a server-side exact-ID allowlist with finite cap; production subscription enforcement remains separate.

## Outstanding release requirements

- [ ] Publish an accurate, accessible, non-geofenced Privacy Policy URL, with actual legal operator identity and contact.
- [ ] Provide a functioning external account-deletion-request web resource and verified ownership workflow.
- [ ] Confirm all live user-related foreign keys cascade or explicitly delete owned records; validate using disposable account.
- [ ] Confirm provider deletion/retention settings and written processor terms.
- [ ] Confirm Gemini paid-service billing, regional eligibility, and minimum age/target audience restrictions.
- [ ] Confirm Groq ZDR/data settings and Cloudflare log retention.
- [ ] Add and verify consent withdrawal behavior for in-flight requests and account deletion; no server-side consent audit record currently exists.
- [ ] Define result-history retention and single-result deletion policy.
- [ ] Verify complete release manifest and cleartext traffic settings from an actual production Android build.
- [ ] Complete the Data safety and Health apps declarations in Play Console.
- [ ] Review all health-related store description, screenshots, and onboarding claims.
- [ ] Supply operator support contact and applicable legal jurisdiction disclosures.
- [ ] Run device tests using a disposable account, not a production account, including deletion and failure paths.
- [ ] Conduct independent privacy/legal review for each launch jurisdiction.

## Google Play documentation

- [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
