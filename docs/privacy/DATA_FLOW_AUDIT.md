# SkinSnap data-flow and privacy audit

**Audit date:** 2026-10-22  
**Scope:** Local repository implementation and prior read-only Supabase schema evidence. This is an engineering inventory, not a legal opinion. Status labels describe evidence, not certification.

## End-to-end data flow

| Stage | Data and destination | Evidence | Status |
|---|---|---|---|
| Camera/gallery selection | Source image URI is held in `PhotoContext` memory. Camera permission is requested only for capture; gallery uses the system image picker. | `src/app/upload.tsx`, `src/PhotoContext.tsx`, `app.json` | VERIFIED in source; device behavior not re-tested in this audit |
| Local preparation | `expo-image-manipulator` normalizes the chosen image to JPEG, resizes it, and compresses it. Expo FileSystem verifies existence, byte length, MIME type, and dimensions. | `src/services/analysisApi.ts`, `src/photoUpload.ts`, `src/photoValidation.ts` | IMPLEMENTED BUT UNTESTED on device |
| Upload | A multipart field named `photo` is sent over HTTPS to the configured Cloudflare Worker with a bearer session and idempotency key. No manual multipart Content-Type is set by the native uploader. | `src/services/analysisApi.ts`, `worker/src/index.ts` | VERIFIED in source; live request not re-run |
| Authentication | Worker calls Supabase Auth `/auth/v1/user` with the bearer token and uses that authenticated user ID for authorization. The development route checks a server-side exact-ID allowlist and reservation limit. | `worker/src/index.ts` | VERIFIED in source; current production bindings not re-inspected |
| Image analysis | Worker reads the uploaded file, creates an in-memory base64 representation, and sends the image inline to `gemini-3.8-flash` at Google's `generateContent` endpoint. It does not use a Gemini file-upload endpoint. | `worker/src/index.ts` | VERIFIED in source |
| Routine generation | Groq `openai/gpt-oss-20b` receives serialized text observations and returns routine/precaution text. The photo is not included in that request. | `worker/src/index.ts` | VERIFIED in source |
| Structured-output checks | Worker validates observation categories, confidence values, lengths, and non-diagnostic content. Mobile parsing validates the response again; routine screens filter disallowed medical/diagnostic language. | `worker/src/index.ts`, `src/services/analysisApi.ts`, `src/routinePresentation.ts` | IMPLEMENTED; automated tests added |
| Persistence | Completion RPC stores the result on `analysis_jobs`, writes structured observations to `skin_analyses`, and routine rows to `skincare_routines`. History reads completed job results. | `supabase/migrations/202610220001_skinsnap_live_schema_compat.sql`, `worker/src/index.ts` | VERIFIED against prior schema query recorded in session checkpoint; not re-queried in this audit |
| Local routine progress | Completion days and checked steps are written as JSON in Expo's app document directory. The file is scoped by account UUID when authenticated. | `src/routineStorage.ts` | VERIFIED in source; cleanup added for account deletion |
| Result display | Analysis text, routine guidance, and timestamp are displayed; the result screen states the observations are non-diagnostic and affected by image quality. No image URL is stored in the result schema. | `src/app/results.tsx`, `worker/src/index.ts` | VERIFIED in source |
| Telemetry/logging | Client development diagnostics contain stage, safe code, status, and sanitized request reference. Worker errors log an error class/name, not request bodies. Cloudflare observability is enabled in `wrangler.jsonc`; invocation metadata/logging is therefore possible. | `src/analysisDiagnostics.ts`, `src/services/analysisApi.ts`, `worker/src/index.ts`, `wrangler.jsonc` | VERIFIED in source; Cloudflare retention/settings UNKNOWN |

## Photo lifecycle

- SkinSnap does not persist the uploaded raw image in the current Worker/Supabase result path.
- The Worker processes the request body in memory and passes the bytes inline to Gemini.
- The app now deletes its normalized temporary JPEG in a `finally` path after the request and response handling. If deletion fails, it produces a file-access diagnostic and a user-visible error when the analysis otherwise succeeded.
- The selected source URI is not deleted. It may refer to the user's gallery item or a camera/picker cache copy; the app cannot safely infer ownership from the URI alone. Operating-system cache cleanup, app termination before `finally`, and provider-side copies are outside this cleanup guarantee.
- No image is intentionally written to Supabase Storage in the current source. Production bucket inventory should still be checked before release.

## Authentication, authorization, and access

- The native app uses HTTPS URLs and stores session tokens with `expo-secure-store`.
- The Worker asks Supabase Auth to validate the bearer token, then uses that returned user ID for data requests.
- The Worker uses a server-side Supabase secret for database and Auth-admin operations. It is not part of the Expo configuration.
- The published-key value in Expo configuration is a client/public key, not an admin credential.
- Supabase RLS was reported enabled on all seven live public tables in the earlier schema verification. The Worker uses privileged server access and must continue to scope all reads/writes/deletions by the authenticated ID.
- The admin AI development exception is restricted to a server-side user-ID secret and a finite reservation cap. Ordinary development users remain at two charged attempts; production analysis still checks subscription entitlement.
- Current live Worker version, bindings, RLS policy definitions, deletion cascades, and observability retention were not independently re-verified in this audit.

## Findings and blockers

1. The camera/gallery and consent flow is present, but the original selected URI is not actively deleted; the app cannot claim immediate device-side or global deletion.
2. A versioned, affirmative consent is now bound to the selected photo in memory. It is not persisted as a user profile or server-side consent record; this minimizes collection but means SkinSnap cannot prove historical consent from a database audit trail.
3. Account deletion authenticates the user and asks Supabase Auth to delete that user. The live schema's full foreign-key `ON DELETE` behavior is unknown; do not claim all related rows were deleted until a disposable-account integration test and metadata query pass.
4. The external account-deletion page has no verified operator contact channel or secure web deletion mechanism. It is not production-ready.
5. Gemini billing status is unknown. Google's current terms materially distinguish paid from unpaid Gemini API use. Confirm the Cloud Project has active billing and the applicable terms before processing real consumer photos or releasing in restricted regions.
6. Groq Data Controls, Google provider settings, Supabase region/retention, Cloudflare log retention, and any provider deletion obligations require account-owner confirmation.
7. Legal entity form, public support/privacy contact, children's age policy, and jurisdiction-specific legal disclosures are not available in the repository. Draft public pages must not be deployed until supplied and reviewed.

## Evidence sources

- `src/app/upload.tsx`, `src/app/analysis.tsx`, `src/app/results.tsx`, `src/PhotoContext.tsx`
- `src/services/analysisApi.ts`, `src/services/authApi.ts`, `src/services/session.ts`, `src/routineStorage.ts`
- `src/photoUpload.ts`, `src/photoValidation.ts`, `src/routinePresentation.ts`
- `worker/src/index.ts`, `wrangler.jsonc`
- `supabase/diagnostics/inspect_existing_schema.sql`
- `supabase/migrations/202610220001_skinsnap_live_schema_compat.sql`
- Prior session checkpoint `008-adapting-live-schema-for-analy.md` records the additive migration and read-only verification; this audit did not repeat remote queries.
