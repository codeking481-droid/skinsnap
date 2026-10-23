# Privacy and compliance test results

**Date:** 2026-10-22

## Automated tests added or extended

- Photo upload tests cover native camera/gallery file URI multipart parts, JPEG field/name/MIME, server size limit, and temporary prepared-file cleanup behavior.
- Privacy consent test verifies consent is false when absent or stale and true only for the current version.
- Routine presentation tests verify restricted medical, beauty-score, and guaranteed-outcome language is rejected.
- Worker tests verify unsafe Gemini observations and Groq guidance are rejected before result persistence.
- Worker deletion test confirms the deletion target is the Supabase-authenticated user and ignores a client-supplied different ID.
- Existing Worker quota/admin/idempotency tests remain in place.

## Not run / not proven by automated tests

- Real Android camera/gallery URI behavior and native `File.delete()` semantics.
- Photo cleanup after OS process termination, timeout, upload cancellation, or OS storage errors.
- Live provider behavior, Google/Groq account privacy settings, and provider-side deletion.
- Auth deletion against a disposable Supabase user and verification that every related table row is gone.
- Cross-user live database access tests or current production RLS policy semantics.
- Public web deletion request handling; no configured support address or verification channel exists.
- Real AI analysis or verified saved history on a device.
- Production APK/AAB manifest, permissions, or Google Play review.

## Validation run

- `npm test`: passed, 51 tests; includes the Worker safety-screening and authenticated deletion tests above.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed for the app and Worker TypeScript projects.
- Expo Go LAN status endpoint: HTTP 200, `packager-status:running`, at `http://10.27.36.23:8082/status`.

Expo export/config validation and Wrangler dry-run were not run as part of this validation.
