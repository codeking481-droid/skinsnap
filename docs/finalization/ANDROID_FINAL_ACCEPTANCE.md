# SkinSnap Android Final Acceptance

**Status:** PENDING — no physical Android device was available during verification.
**Use:** Internal/staging build only until production migration, privacy, billing, and legal gates are approved.

## Build and test setup

1. Identify the approved staging Worker and Supabase project with the owner. Confirm the app build points to staging, never an unknown production target.
2. Configure a staging-only Google Play test application/account and RevenueCat sandbox project. Use test identities and synthetic or explicitly consented images.
3. Build a preview APK after native configuration and signing are ready:

   ```powershell
   eas build --platform android --profile preview
   ```

   EAS CLI, EAS project ownership, and signing credentials were not available/verified in the verification environment. Do not install or share signing secrets through chat.
4. Install the returned internal APK using the EAS download link or a trusted local transfer. Do not treat `npx expo export --platform android` as an installable APK; it only exported the JavaScript/Hermes bundle.
5. Use the physical device's Android version, model, screen size, app build number, and test account IDs in the test record. Do not log emails, tokens, diary text, or image contents.
6. Ensure the staging retention migration and staging Worker flag are enabled before testing saved preferences, routines, diary, or deletion.

## Numbered acceptance procedure

### Install, onboarding, age, and privacy

1. [ ] Install the preview APK fresh and launch SkinSnap. Confirm no crash, infinite splash, broken route, or blank screen.
2. [ ] Complete welcome/onboarding. Confirm users cannot enter restricted app routes until they attest they are 18 or older; confirm no date of birth is requested.
3. [ ] Open Privacy and Terms pages from the app. Confirm their status and links are accurate; do not treat local draft pages as published policy URLs.
4. [ ] Continue without compulsory email/password registration. Confirm guest-backed features explain guest identity/reinstall limitations accurately.
5. [ ] Review sample/demo results. Confirm they are conspicuously labelled as demo and never presented as real analysis.
6. [ ] Test Android back navigation, predictive/hardware back, smaller screen, large text, safe areas, keyboard dismissal, TalkBack, and background/resume.

### Camera, gallery, and Smart Capture

7. [ ] Deny camera permission. Confirm the gallery path remains available and the app explains how to enable permission.
8. [ ] Grant permission and capture a normal portrait selfie. Confirm orientation, preview, retake, and camera/gallery replacement work.
9. [ ] Open the gallery, cancel once, then select a valid JPEG, PNG, WebP, HEIC/HEIF, and any other supported Android format. Confirm cancel preserves the current image/consent and supported images preview correctly.
10. [ ] Test rotated/landscape, small, and wide/tall images. Confirm measured file/dimension checks and non-blocking warnings are accurate. Do not claim blur, low-light, face, or filter detection; these are not implemented measurements.
11. [ ] Test a corrupt/unreadable, unsupported, empty, over-32-MiB, and over-100-megapixel image. Confirm local validation blocks analysis and does not call the Worker or consume quota.
12. [ ] Confirm the local decoder probe is removed, the selected source is not deleted, and no photo is uploaded before consent and an authorized analysis request.
13. [ ] Read the photo-processing notice, confirm consent is required before continuing, and withdraw/retake. Confirm consent resets for a replacement photo.

### Entitlement, scan, and results

14. [ ] Without an active entitlement, confirm the premium access gate appears and no paid AI request starts. Confirm the development exemption is available only for an authorized staging test identity.
15. [ ] In a configured RevenueCat/Play internal test build, test an authorized active entitlement, no entitlement, purchase cancellation, pending payment, store failure, network failure, and restore. No pending/cancelled/failed purchase may unlock premium.
16. [ ] With a verified staging entitlement or separately authorized test exemption, submit one consented synthetic/approved image. Confirm exactly one request per idempotency key, scanner progress, completion/error state, and no duplicate charge on retry.
17. [ ] Confirm the returned Glow Snapshot and Detailed Insights are cosmetic, non-diagnostic, cautious, and may contain fewer than seven findings or none. Confirm optional explanation/suggestion/region fields do not render placeholder text.
18. [ ] Confirm morning/evening routines use only available findings and explicit preferences; no brands, prices, or user preferences are invented.
19. [ ] Simulate airplane mode, timeout, upstream error, and app background/resume. Confirm a truthful error/retry, no endless spinner, and no success-shaped fallback. Do not repeat real paid calls.

### Persistence and account isolation

20. [ ] Add, rename, edit, delete, reorder, reschedule, save, and reload custom routine steps. Confirm stable IDs, no duplicate steps, morning/evening assignment, weekday schedule, original AI guidance preservation, and local completion checkmarks.
21. [ ] Save optional preferences only after explicit opt-in. Edit, clear, reload after app restart, and reset. Confirm an unsaved preference is not stored.
22. [ ] Save, edit, and delete diary entries for today and past dates. Verify local date/timezone behavior around midnight and timezone changes. Confirm routine checkmarks copy only after explicit action.
23. [ ] Force quit and relaunch. Verify staging preferences, custom routines, diary, and history persist only for the same test account. Switch to a second test identity and confirm no previous account data flashes or appears.
24. [ ] Confirm routine/diary/preference changes do not request AI, use analysis quota, or make unconsented photo uploads.

### Deletion and final evidence

25. [ ] On a disposable staging account only, create a preference, custom routine, diary entry, history result, and local routine completion. Invoke authenticated in-app account deletion and verify the exact account is removed.
26. [ ] Repeat deletion after the account has been removed; confirm honest, safe behavior. Test a controlled staging DB failure and confirm no false success or premature Auth deletion.
27. [ ] Confirm the app clears account-scoped local progress and SecureStore tokens, and explains any local cleanup failure. Confirm Google Play subscription cancellation remains a separate user action.
28. [ ] Capture a test record with build number, device/Android version, results per step, and redacted request IDs only. Do not attach selfies, credentials, provider payloads, or unredacted logs.

## Acceptance criteria

- All relevant steps pass on the supported Android device matrix.
- No unresolved crash, cross-user data exposure, unsafe purchase success, duplicate paid analysis, photo upload before consent, or false deletion confirmation remains.
- Live Supabase RLS/deletion and RevenueCat/Play sandbox tests are recorded separately from local automated tests.
- Failed or untested steps are marked **BLOCKED** or **FAIL** with evidence; do not mark the app launch-ready based on JS export alone.

**Current result:** all 28 steps are pending physical-device execution.
