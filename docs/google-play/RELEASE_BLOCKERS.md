# Production release blockers

**As of:** 2026-10-22

The current project is **not ready for a public Google Play production release**. These blockers require owner decisions, real account settings, deployment, or verification beyond unit tests.

## Must resolve

1. **Public legal identity and contact:** Only the product/developer brand "SkinSnap / Alphatekx" is present. Legal entity form, support/privacy email or web contact, address where legally required, and jurisdictional details are missing. Do not publish the draft pages with placeholders.
2. **External account deletion:** In-app authenticated deletion exists. There is no live external deletion request page, contact channel, or secure web identity verification flow.
3. **Deletion completeness:** Verify live FK cascade behavior and every user-owned table with a disposable account. The app's direct Supabase Auth deletion alone does not prove that every related row or provider copy was removed.
4. **Gemini terms and age:** Confirm active Cloud Billing for the Gemini project and regional eligibility. Google's current terms prohibit unpaid-service use of personal/sensitive content and restrict API clients from being directed to or likely accessed by under-18s. SkinSnap's target age and age enforcement are not confirmed. Gemini use in the EEA, Switzerland, and UK requires paid services under the current terms.
5. **Provider controls:** Confirm Groq ZDR/settings, Google project configuration, Supabase region/retention/backups, and Cloudflare Workers Logs retention/export.
6. **Data retention policy:** No database expiry is configured for analysis history. Set retention and individual deletion behavior, then update user-facing policy.
7. **Public Privacy Policy:** Website source is a draft and contains deployment-blocking placeholders. No verified live policy URL is available in this task.
8. **Play declarations:** Data safety and Health apps declarations have not been completed. Skin care is explicitly referenced by Google's health declaration guidance; category must be selected by the Play Console owner with legal review.
9. **Production artifact:** The inspected Android manifest is a local generated manifest, not a verified final production bundle. Build and inspect the release manifest, permissions, network security, and SDK behavior.
10. **Real-device privacy/deletion tests:** No disposable account was used for end-to-end deletion, cleanup failure, cancellation, or real-photo provider processing in this task.

## Not blockers for the task, but not claimed

- The existing Expo Go LAN server is operational on the current Wi-Fi at port 8082.
- Unit tests/type checks do not prove Play approval, production release readiness, live account deletion, provider retention, or real-device behavior.
- RevenueCat production billing remains separate and is not represented as operational by this compliance work.
