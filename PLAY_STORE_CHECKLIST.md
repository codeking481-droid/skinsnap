# SkinSnap Google Play release checklist

Status checked against the current source and local build configuration on 2026-10-27. A successful JavaScript export is not a signed Android App Bundle and does not replace Play Console or a licensed-device purchase test.

## Ready in source/config

- [x] Android application ID is `com.skinsnap.app` in Expo config and the local generated Android project.
- [x] Android target SDK is explicitly set to API 36. Expo's installed Gradle defaults also resolve to 36. Google Play requires API 36 or higher for new apps and updates from August 31, 2026.
- [x] EAS production profile uses `distribution: "store"` and Android `buildType: "app-bundle"`; preview/development profiles intentionally produce APKs.
- [x] RevenueCat code uses shared product IDs `skinsnap_weekly_499`, `skinsnap_monthly_1299`, and `skinsnap_yearly_4999`, with entitlement `skinsnap_premium`. The existing tests assert these identifiers.
- [x] First-run flow sends users from onboarding to the normal Home dashboard. Camera/gallery entry, the client analysis request, personalized saved results, and both Worker analysis endpoints require RevenueCat-verified premium access.
- [x] UK GBP product targets are £4.99/week, £9.99/month, and £39.99/year. A GBP store product with a different configured amount is rejected; the app displays the live localized store price.
- [x] Monthly plan is initially selected and marked **MOST POPULAR**. Annual is marked **BEST VALUE**; savings are calculated from store prices. At the listed UK amounts, the annual plan saves 67% versus 12 monthly payments, not 68%.
- [x] Restore Purchases invokes RevenueCat restore and verifies the active entitlement. Paywall Terms and Privacy actions open configured public URLs or fall back to their in-app information screens.
- [x] App icon artwork and Android adaptive icon assets exist at 1024×1024.
- [x] Inspected generated Android manifest requests CAMERA and INTERNET. Legacy media/storage, microphone, system-alert-window and vibration permissions are explicitly removed; image selection uses the system picker.
- [x] Privacy and terms information screens exist in the app.

## Blocked / required before Play upload

- [ ] **RevenueCat is not connected to a live Play configuration in this checkout.** No Android public SDK key or Worker secret API key is configured locally, and live products/prices could not be verified. Configure `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` in the EAS `production` environment and `REVENUECAT_SECRET_API_KEY` as a Worker secret after configuration and testing.
- [ ] In RevenueCat, connect the Google Play app/package `com.skinsnap.app`; create/import `skinsnap_weekly_499`, `skinsnap_monthly_1299`, and `skinsnap_yearly_4999`; attach them to `skinsnap_premium`; put them in the `default` offering; set UK base-plan prices to £4.99/week, £9.99/month, and £39.99/year; confirm billing periods and no introductory/free-trial offers match the app's product validation.
- [ ] Configure RevenueCat's Google Play service credentials and verify the Play Console app is linked. Run purchase, pending purchase, restore, renewal/cancel, and entitlement tests using Play license testers or a closed testing track.
- [x] Published public legal pages on Cloudflare Pages: [Privacy Policy](https://skinsnap-legal.pages.dev/privacy-policy.html), [Terms of Service](https://skinsnap-legal.pages.dev/terms-of-service.html), and [Account Deletion](https://skinsnap-legal.pages.dev/account-deletion.html). The `.html` URLs redirect to their canonical HTTPS pages and have been deployed to the production branch.
- [x] Configured `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`, and `EXPO_PUBLIC_LEGAL_URLS_VERIFIED=true` in the EAS `production` profile. The public support contact is `alphatekxcompany@gmail.com`.
- [ ] Create Play Store listing screenshots on supported Android device sizes. No store screenshot set is present in the repository.
- [ ] Prepare and upload the Play Console 512×512 store listing icon and 1024×500 feature graphic. Source icon artwork exists, but these listing deliverables are not checked in.
- [ ] Complete the Play Console store listing: app name, short/full descriptions, category, contact/support details, and reviewer instructions for gated features.
- [ ] Complete Data Safety declarations from the final deployed build and actual vendor settings (Supabase, Cloudflare, Groq, RevenueCat, Google Play), including photo processing, account data, retention, deletion, and sharing. Complete Ads, target audience, content rating, app access, and any other required App content declarations.
- [ ] Verify the EAS project identity, owner/build account, production environment values, and EAS-managed Android signing credentials. Do not use the generated local Android release configuration: it uses the debug signing config and is not suitable for Play upload.
- [ ] Build a signed production `.aab` with EAS, inspect its final package ID, target SDK, merged permissions, version code and signing, then upload it to internal testing and complete a real-device regression pass before production release.

## Local verification completed

```sh
npm test
npm run typecheck
npx expo export --platform android
```

- [x] `npm test`, `npm run typecheck`, `npm run lint`, and `npx expo export --platform android` completed after the hard-paywall changes on 2026-10-27.
- [x] Resolved Expo config reports package `com.skinsnap.app` and target SDK 36.
- [x] Android JavaScript bundle exported to `dist`.

The export validates the Android JavaScript bundle, not a signed Android App Bundle, native signing, Play billing, or Play Console compliance.

## References

- [Google Play target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Google Play app review preparation and privacy policy requirements](https://support.google.com/googleplay/android-developer/answer/9859455)
