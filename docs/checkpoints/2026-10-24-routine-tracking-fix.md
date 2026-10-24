# Routine and tracking repair ? 2026-10-24

Scope: routine and tracking screens only; existing unfinished release/privacy work retained.

- Removed a second client-side purchase check that hid already-saved routines in Expo Go. The authenticated history endpoint remains in use; authorization for new AI analyses is unchanged.
- Routine and progress reload on navigation focus, so returning after an analysis or completion updates the screens.
- Removed the delayed progress write that could be cancelled by opening Track immediately.
- Stored the local calendar day and analysis result ID alongside checked steps. A new day or a different routine resets step checks; historical completed dates remain.
- Prevented outdated history requests from updating a screen after navigation away.

Validation: 94 automated tests passed; mobile and Worker TypeScript checks passed; targeted ESLint passed. Android routine and progress bundles both returned HTTP 200 from Metro on port 8081. No paid AI calls, quota changes, backend deployment, dependency upgrades, or legal publication were performed for this repair.

Limits: completion tracking is local to the signed-in account on this device. Actual Android taps, sign-in and persisted progress still require a device check; this is not a guarantee of universal correctness. Legacy step checks without a day/routine stamp reset once; past completed days remain.
