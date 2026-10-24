# Public release blockers

**Reviewed:** 23 October 2026
**Status:** SkinSnap is not ready for a public Google Play release.

## Must resolve

1. **Public support/privacy contact:** A verified working contact email has not been supplied. No placeholder or invented contact may be published.
2. **Legal approval:** Privacy Policy and Terms are review drafts without effective dates and require jurisdiction-specific legal review.
3. **External account deletion:** A secure browser flow is present in source but intentionally disabled. Configure the public Supabase client and Worker CORS origin, verify the hosted HTTPS page, and complete a disposable-account end-to-end deletion test before Play Console submission.
4. **Live deletion coverage:** Verify live schema, all user-linked tables/constraints, storage buckets/objects, and deletion outcomes using a disposable account. Repository code and unit tests do not establish production deletion completeness.
5. **Provider and infrastructure settings:** Confirm Groq data controls/retention, Cloudflare logs, Supabase project region/backups, RevenueCat/Google Play configuration, contracts, and relevant transfer safeguards.
6. **Play declarations:** Complete Data safety and the Health apps declaration against the final Android build and current Google definitions. SkinSnap's photo-based cosmetic functionality requires an owner/legal decision on Google's health taxonomy.
7. **Privacy data accuracy:** The compatibility migration's model metadata still says Gemini/Groq while the active Worker calls Groq for both vision and routine generation. Reconcile future metadata without rewriting historical records.
8. **Release artifact:** Build and inspect the final Android manifest, permissions, network security, SDKs, cleartext policy, and telemetry.
9. **Final-device checks:** Test consent, 18+ gating, photo cleanup, account deletion, and failure/retry behavior on supported devices using test accounts only.
10. **Policy URLs:** No public legal URL is deployed or verified. Do not place draft paths in the Play Console or claim they are live.

Automated source tests and type checks cannot prove legal compliance, provider retention, production deletion, Play approval, or real-device behavior.
