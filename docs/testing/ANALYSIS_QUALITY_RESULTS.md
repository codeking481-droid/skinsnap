# Analysis quality verification — 2026-10-23

## Current status: backend upgrade rolled back

The user's upgraded Android scan failed with `vision-invalid-response` despite the limited synthetic tests passing. The stricter contract was not reliable enough for real input. Production has been restored to the exact user-confirmed checkpoint Worker source, deployed as `91600c74-970d-40a2-8d64-9922c872550b`. The Worker tests and routine text filter were restored as well. The new preference form and request header are disabled. Corrected Groq consent remains. The rejected upgrade was copied into ignored `artifacts/analysis-repair/failed-upgrade/` for investigation; it is not the active backend. Earlier results below describe the attempted upgrade, not current production capabilities. A new phone test is required to confirm recovery.

## Scope

Working checkpoint retained: `skinsnap-working-analysis-2026-10-23` (`827b0b51`), Worker `1965b799-556b-4d7a-b40c-bb3a3f7d8f39`.

Models preserved: Groq `qwen/qwen3.8-27b` receives the base64 photo; `openai/gpt-oss-20b` receives validated text observations and optional enum-only self-reported preferences. No extra production provider or inference stage was introduced.

Changes include suitability validation before routine generation, up to four supported observations, title/location/visibility/limitation metadata, explicit photo limitations, optional preferences, simpler routine prompts, bounded routine sizes, additional output guards, label-based sunscreen guidance, and updated Groq consent. Provider JSON-object mode is retained with explicit contracts and strict server validation after provider-enforced schema trials proved inconsistent.

## Compatibility

The original category identifiers, low/moderate/high legacy field, routine string arrays, result ID/date and JSON result persistence remain. New metadata is optional for old saved results. Legacy confidence is displayed as "Visibility not recorded", never as calibrated certainty. New results display descriptive visibility labels. Routine strings continue to contain product category and instructions; no new routine-step database schema was introduced. No database migration, subscription change, photo-upload replacement or scanner redesign.

Preferences are optional, in-memory for the session, and sent in a bounded validated header to the existing Worker. They are passed only to routine generation, not the image model. Their effect can appear in saved routine text, but there is no separate persisted preference profile. CORS permits the header. Consent version is `2026-10-23-groq`; the mobile and draft website disclosures now describe the actual provider.

## Checks and live evidence

- 67 automated tests passed, including no-skin/blur/exposure/distance/occlusion/altered/ambiguous rejection contracts, reservation failure release, no routine call for rejected images, inconsistent certainty rejection, preference isolation, legacy metadata compatibility, upload behavior and existing controls.
- Mobile/Worker TypeScript and ESLint passed (old dependency backup excluded from lint).
- Worker dry run passed.
- Android entry, upload, results and details bundles passed; the upload route contains the new preferences and consent version. Expo Router loads route code separately from the entry bundle.
- Final isolated live JPEG test: a synthetic portrait was accepted, returned visible blemish-like features, texture and shine plus a short morning/evening routine. Total provider pipeline elapsed time: 2,338 ms for this single sample, not a latency guarantee.
- Final isolated unrelated-image test: `no-skin`, no observations, no routine. Elapsed time: 30,980 ms including transient provider delays.
- Earlier trials surfaced unsupported capture descriptions and a skin-health judgment; prompts were adjusted, skin-health wording blocked, and internal vision tile handling clarified. These trials are evidence of model limitations, not proof they have been eliminated.

The full eight-case live evaluation was not completed: the user asked to stop image generation and accelerate delivery. Do not claim calibrated confidence, clinical accuracy, reliable filter detection or validated performance across all skin tones. Contract tests exercise logic with mocks; they do not prove visual correctness. Runtime logs contain elapsed time and numeric token counts when available, not raw photos or AI responses. There is no reliable aggregate per-scan cost estimate from this limited test; Groq limits and charges still apply.

Cloudflare deployment completed with existing dashboard variables preserved. New Worker version: `5012a258-54e3-443f-a8b7-585353d3ed32`. The live API health check passed after deployment. Live inference tests used the final source in an isolated preview with the existing Groq secret; an upgraded end-to-end authenticated Android scan still requires the user's controlled phone test. The draft website policy was updated locally, not published to separate website hosting.

## Controlled Android test

Reload Expo Go on the same Wi-Fi at `exp://10.214.243.23:8081`. Choose one sharp, evenly lit photo without a beauty filter. Optionally choose sensitivity and a simple routine preference. Read and confirm the updated Groq consent, then run one scan. Check that observations describe visible areas, limitations are shown, and routines respect the optional answers. Avoid repeated scans while a request is processing. A new user-confirmed checkpoint should be made only after this upgraded phone test passes.

## Changed source groups

- Worker and shared contracts: `worker/src/index.ts`, `src/analysisQuality.ts`, `tsconfig.worker.json`.
- Mobile request/context: `src/services/analysisApi.ts`, `src/PhotoContext.tsx`.
- Presentation: `src/components/AnalysisPreferencesForm.tsx`, upload/analysis/results/details screens.
- Safety/disclosure: `src/routinePresentation.ts`, `src/privacy.ts`, mobile privacy screen, draft `website/privacy.html`.
- Validation: Worker/quality tests, synthetic fixture manifest and assets, opt-in evaluation script, these notes.
