# SkinSnap analysis presentation

## Scope

This change is limited to presentation of an existing analysis result. It does not request another AI analysis, change analysis data, or modify the retention backend.

## What changed

- Replaced the results screen's previous presentation with a focused report built from the validated `SkinAnalysisResult`.
- Added a photo-centered snapshot, the existing analysis summary, evidence-backed cosmetic observation cards, and a Skin Focus based on the user's saved analysis preference and supported observations.
- Added an at-a-glance routine preview using the current custom routine when available, otherwise the routine guidance already associated with that result. Completion indicators come only from recorded routine progress.
- Kept limited-image and no-observation messages explicit. Missing optional observation fields are omitted rather than invented.
- Honors the device's reduced-motion setting for the snapshot-ring animation.
- Routine loading errors are shown as errors instead of being presented as an empty or fallback saved routine.
- Preserved existing navigation to detailed insights and the routine screen.

## Verification

- Analysis presentation unit tests: passed.
- Full automated test suite: 135 passed, 0 failed.
- TypeScript checks for the app and Worker: passed.
- ESLint: passed.
- Diff whitespace check: passed.
- Android export: passed (`npx expo export --platform android`).

No physical Android device visual test was performed. This change has not been deployed.
