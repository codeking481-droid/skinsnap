# SkinSnap RevenueCat and Google Play Billing Handoff

**Purpose:** Configuration and test handoff only. No products, prices, entitlements, or live purchases were changed or tested in this verification.

## Current implementation status

- Native SDK dependency: `react-native-purchases` 10.15.1.
- Android application ID: `com.alphatekx.skinsnap`.
- RevenueCat entitlement identifier: `skinsnap_premium`.
- Product identifiers:
  - `skinsnap_weekly`
  - `skinsnap_yearly`
  - `skinsnap_yearly_downsell` (one-time eligible offer)
- Offering identifiers:
  - `default`
  - `yearly_downsell`
- Client purchase release gate: `SUBSCRIPTION_PURCHASES_ENABLED = false`.
- Client reads store-provided localized prices; development preview prices are explicitly development-only.
- Client differentiates active/verified, cancelled, pending, inactive, and error states; restore is implemented.
- Worker independently checks the RevenueCat subscriber entitlement before production analysis. A client flag alone cannot authorize analysis.
- Worker analysis is currently limited to 20 per rolling 30-day period for paid users. The admin exemption is only on the allowlisted development route.
- Expo Go is not suitable for billing validation; a custom Android development/store build is required.

### Blocking configuration evidence

Read-only Cloudflare secret-name inspection found `GROQ_API_KEY`, `SUPABASE_SECRET_KEY`, `AI_ADMIN_TEST_USER_ID`, and `GEMINI_API_KEY`, but did not find `REVENUECAT_SECRET_API_KEY`. Secret values were not read. The Worker requires `REVENUECAT_SECRET_API_KEY` to call RevenueCat's subscriber endpoint, so production entitlement verification is not configured/verified.

The current purchase gate remains closed. No real billing or subscription authorization success is claimed.

## Owner configuration steps

### 1. Google Play Console

1. Confirm the Play application/package is `com.alphatekx.skinsnap`.
2. Create the approved weekly and annual subscription products with IDs matching the app:
   - `skinsnap_weekly`
   - `skinsnap_yearly`
3. Configure base plans, countries/regions, billing periods, grace/account-hold behavior, and tax/pricing in Play Console. Prices must come from Play/RevenueCat; do not copy development preview prices into production.
4. Add license testers and an internal testing track. Do not publish products or test using a customer account.
5. If the one-time downsell offer is retained, configure `skinsnap_yearly_downsell` and the associated `yearly_downsell` offering only after reviewing eligibility and consumer disclosures.
6. Confirm Play subscription cancellation, renewal, grace period, refund, and account-deletion messaging.

### 2. RevenueCat dashboard

1. Create/confirm the Android app with package ID `com.alphatekx.skinsnap`.
2. Import/link the exact Play product identifiers and base plans.
3. Create entitlement `skinsnap_premium`, and attach only the intended subscriptions.
4. Create offering `default` containing the weekly/yearly packages expected by the app.
5. If used, create offering `yearly_downsell` containing the exact downsell product.
6. Verify package product identifiers, billing periods (`P1W` and `P1Y`), and no unexpected free/intro phases. The app rejects products with incompatible periods or introductory/free phases.
7. Enable RevenueCat entitlement verification and confirm that the SDK returns a `VERIFIED`, active, unexpired entitlement in the test build.
8. Configure a RevenueCat **server API key** for the Worker. This is distinct from the public Android SDK key.

### 3. Build environment and secrets

- Set the RevenueCat Android **public SDK key** as `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` in the appropriate EAS build environment. It is bundled in the app and must be treated as a public client key, not as a server secret.
- Set the RevenueCat **secret API key** as the Cloudflare Worker secret named `REVENUECAT_SECRET_API_KEY`, using an approved secret-management process. Never place it in `.env`, mobile code, EAS client variables, Git, chat, or logs.
- Confirm Worker Supabase URL/public key/service key and CORS settings separately, without printing values.
- Confirm dev/preview/production builds use the intended environment. The production EAS profile sets `EXPO_PUBLIC_AI_DEV_TEST_MODE=false`; verify production Worker variables cannot expose the development endpoint.
- Build a custom Android preview/internal APK. Expo Go does not include the native RevenueCat module.
- Keep `SUBSCRIPTION_PURCHASES_ENABLED` false until the sandbox flow and server entitlement checks pass. Enable only through a reviewed release change.

The EAS project, build credentials, and environment variables were not available for inspection in this verification. EAS CLI/build was not run.

## Required sandbox test matrix

Use a Play license tester and disposable Supabase identity. Verify each path on the actual Android APK:

1. Weekly purchase succeeds; store returns the expected entitlement; Worker verifies it.
2. Annual purchase succeeds; Worker verifies it.
3. Purchase cancellation remains locked and does not show success.
4. Pending purchase remains locked until store confirmation.
5. Purchase failure/offline state remains locked and gives retry guidance.
6. No products, wrong period, unexpected intro/free phase, or wrong entitlement does not enable purchase.
7. Restore an active purchase and verify access after app reinstall/sign-in.
8. Restore with no purchase leaves premium locked.
9. RevenueCat API outage does not grant access; Worker returns a clear verification-unavailable response.
10. Client-side tampering or fabricated customer info does not bypass the Worker gate.
11. Production `/v1/analysis` rejects an unauthenticated or unsubscribed user and enforces the normal quota.
12. Development admin exemption works only for the exact allowlisted identity and only on the development endpoint.
13. Account deletion removes SkinSnap records but does not claim to cancel the Play subscription; verify the user can separately manage cancellation in Google Play.

Do not use real production purchases during these tests. No test may increase production quotas or use customer accounts.

## Safe release activation

Only after sandbox results, policy/legal review, final price disclosures, Play Console setup, and production server-key verification:

1. Review a dedicated code change enabling `SUBSCRIPTION_PURCHASES_ENABLED`.
2. Build a signed Android artifact from the approved production EAS environment.
3. Verify server-side entitlement checks using an authorized test account and monitor redacted correlation IDs.
4. Publish through a staged Play rollout only after explicit owner approval.
5. Test restoration/cancellation and subscription-management links using Play-approved accounts.

**Current recommendation:** GO to begin RevenueCat and Play **sandbox/catalog configuration only**. NO-GO to enable purchases, claim billing readiness, or launch until the missing server secret, physical purchase tests, production entitlement checks, and release gates are resolved.
