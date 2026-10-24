# SkinSnap retention upgrade engineering report

Date: 2026-10-24. Brand: Alphatekx, Nigeria. No company-registration claim is made.

**Status: implemented as a local candidate; NOT deployed or ready for production sign-off.** Server-backed preferences, custom routines and diary require the reviewed migration and an approved Worker rollout. Existing analysis remains on its existing production backend. No physical Android test is claimed.

| Area | Implemented/local evidence | Still required |
|---|---|---|
| Smart Capture | Local rules and mocked native decoder/cleanup/cancel tests; Android export | Camera/gallery permission, decoder and orientation checks on a phone |
| Saved preferences | Validated CRUD, consent, owner scoping, routine-only personalization tests | Approved migration/deployment; restart persistence and real RLS checks |
| Editable routines | Stable IDs, schedules, independent edits/restore, scoped CRUD; Android export | Staging round-trip, physical editing/checkmark/back-navigation walkthrough |
| My Skin Diary | Daily upserts, CRUD, local dates, exact older-date lookup and factual summaries tested | Migration/deployment; real-device/time-zone/offline verification |

The source recovery point exists in Git; the feature candidate is not yet a live end-to-end verified service. No deferred feature is presented as implemented.

## 1. Recovery checkpoint and changed files

Before modifications, Git status, the two existing migrations, architecture/navigation, upload preparation, routine/progress storage and `SKINSNAP_AI_2_0_REPORT.md` were inspected. All 96 baseline tests passed. Existing local work was committed without reset or overwrite as **`f37a995f` — Checkpoint SkinSnap before retention upgrade**.

New implementation:

- `src/smartCapture.ts`, `src/services/captureQuality.ts`
- `src/retention.ts`, `src/services/retentionApi.ts`, `src/services/routineCompletion.ts`
- `src/components/RetentionUI.tsx`
- `src/app/skin-preferences.tsx`, `src/app/routine-edit.tsx`, `src/app/skin-diary.tsx`
- `worker/src/retention.ts`
- `supabase/migrations/202610240001_retention_upgrade.sql`
- `tests/captureQuality.test.mjs`, `tests/retention.test.mjs`

Existing implementation extended:

- `src/app/upload.tsx`, `routine.tsx`, `index.tsx`, `progress.tsx`, `sign-in.tsx`, `privacy.tsx`
- `src/components/AnalysisPreferencesForm.tsx`
- `src/analysisQuality.ts`, `src/flowLogic.ts`, `src/navigation.ts`, `src/services/analysisApi.ts`
- `worker/src/index.ts`, `tests/worker.test.mjs`, `tsconfig.json`
- `website/privacy.html` (unpublished draft), `docs/privacy/data-flow-audit.md`, `docs/privacy/RETENTION_AND_DELETION.md`, `docs/google-play/data-safety-review.md`
- This report, `RETENTION_ANDROID_TEST_CHECKLIST.md`, `RETENTION_MIGRATION_PLAN.md`.

No package manifest/lockfile, AI provider, model ID, price, entitlement, quota, secret or production configuration was changed by this upgrade. TypeScript now allows explicit `.ts` imports for shared dependency-free contracts used by both Worker and Node tests.

## 2. Existing features reused

Expo Camera/Image Picker/Image Manipulator/File System, native upload preparation, consent, cinematic scanner, optional preference chips, secure guest/email session management, authenticated history, local per-owner completion files, dark/pink cards, Expo Router and safe back navigation. No new dependency or bottom-tab navigation was added.

## 3–4. Smart Capture and supported checks

Both camera and gallery previews invoke a **local-only** check: file exists/nonempty, dimensions are readable, supported supplied MIME, source size at most 32 MiB, source area at most 100 megapixels, and successful image decoding into a small temporary JPEG. The JPEG probe is removed; the source is not deleted. Existing production preparation still normalizes/compresses the actual upload without cropping and cleans up its upload copy.

Unreadable/corrupt/unsupported/oversized images cannot continue from preview. Small or unusually wide/narrow images receive a mild warning and an explicit retake/continue choice. Local checks run before paywall/analysis submission, consume no quota and upload no photo. The existing analysis service also prepares/validates the file before the paid analysis POST.

**Unsupported measurements:** brightness, blur, face detection, face identity, makeup/filter detection and precise centering. Guidance covers even lighting, shadows, steadiness, visible centered face and avoiding heavy beauty filters; it does not claim those properties were measured. No confidence percentage or “perfect photo” label. Actual Android decoder format/orientation support still needs device verification.

## 5. Saved preferences

My Skin Preferences supports existing skin characteristics, primary cosmetic goal, sensitivity, routine length and budget, plus region, owned products, fragrance preference and experience. All are optional and self-reported. Save requires explicit permission; fields can be cleared; reset removes the record and in-memory analysis preferences.

The server stores one private consented preference record per verified owner. Upload loads saved preferences when available, and the existing inline questions remain session-only unless explicitly saved from the preference screen. Extended fields in the saved screen are unavailable until its backend is ready. No new local persistent preference cache is introduced. Server persistence survives normal app restarts through the existing securely stored identity; this must be confirmed against staging on Android. Reinstallation does not guarantee guest recovery.

## 6. Editable routines

Separate versioned customization in the existing `routines` table; immutable original AI guidance remains in existing analysis history. Add/remove, edit name/description, move order, assign morning/evening, select weekdays, save, cancel, restore available original AI guidance and remove customization are implemented. Maximum 24 steps, bounded text and nonempty day selection; duplicate IDs are rejected.

Stable step IDs survive ordinary rename/reorder/save. The existing local completion sanitizer accepts these IDs. Your Routine shows scheduled steps for today, daily progress and reset controls. New-day or different-source checks reset; historical completed dates remain. Original legacy AI reports still load. Unversioned generic customization records are left untouched and treated as absent by the new editor until an explicit new save; they are not automatically rewritten. Restore is available when the source report remains in fetched history.

User products/notes are labeled custom, with a clear non-verification notice. Ordinary edits/checkmarks never invoke Groq. Concurrent server edits use last-write-wins upserts, not automatic multi-device merging; checkmarks remain device-local.

## 7. My Skin Diary

One entry per owner and explicit local calendar date. Stores the entry's time-zone context, optional feeling/note/cosmetic concerns/products, and explicitly recorded morning/evening completion. Add, edit, delete, recent history and exact-date lookup are implemented. The recent query is bounded to 366 entries; older dates are fetched explicitly before editing. History renders 14 rows initially with a “show older” control.

Today's routine checkmarks can be reviewed and explicitly copied into an entry. They never silently overwrite a diary self-report. Weekly summaries count saved check-ins and recorded completion only. No improvement percentage, diagnostic claim or photo field. Time-zone changes do not reinterpret stored calendar-date keys.

No AI/quota use. Offline/server failures retain the current in-memory draft while its screen remains open and never display a false saved/deleted confirmation. No offline persistent diary cache or offline sync queue is added. Repeated saves upsert the same date. Unsaved drafts are not guaranteed after process death.

## 8. Navigation and UX

Home, Progress and account settings link to preferences and diary. Photo preview links to preferences. Your Routine links to editing and diary. Existing analysis → insights → routine flow stays intact. New pages reuse dark/pink styling, bounded layouts, accessible labels/check states/status text, keyboard-aware scrolling, explicit save/cancel/delete confirmations and Android hardware-back draft prompts. Edits are locked while a network save is pending. No new animations were added; the existing reduced-motion scanner is unchanged.

## 9–10. Database and security

See [migration plan](./RETENTION_MIGRATION_PLAN.md). The migration adds two new tables and reuses/creates the existing customization table. All have owner foreign keys and RLS; the diary composite primary key prevents duplicate daily records. Existing rows are preserved.

Every route first authenticates the Supabase user, including valid anonymous profiles, and uses that verified ID. Client-supplied IDs never control ownership. Inputs have enum/text/count validation and streamed-body limits. New routes are disabled by default unless `RETENTION_ENABLED=true`. Database failures/conflicts cannot be acknowledged as success. No diary note/preference text is written to logs. Worker service-role operations are owner-scoped independently of RLS.

**Runtime RLS verification is pending:** no local PostgreSQL/Supabase/Docker database tool was available. Static migration regression checks are not evidence that live RLS has been applied or tested. No production schema or customer data was touched.

## 11. Deletion

Individual preference reset, custom-routine removal and per-date diary deletion are available. Account deletion explicitly attempts both new tables before Auth, even if the feature switch is later disabled. New tables also cascade from Auth deletion.

The audit found legacy relations may be absent in the live-compatible schema. Only a precise 404/`PGRST205` for an optional legacy/new relation is tolerated during deletion; authorization/database errors and conflicts still stop before Auth deletion. Existing local per-owner completion cleanup is retained. Mocked deletion tests pass; new live/staging deletion verification remains required. No deletion promise is made about provider logs, backups or copies on other devices.

## 12. AI integration

Groq vision remains `qwen/qwen3.8-27b`; routine generation remains `openai/gpt-oss-20b`. Existing AI 2.0 evidence/usability contracts remain intact. Bounded, user-consented profile fields reach routine generation only. Owned product names/region are explicitly unverified context, never instructions, ingredient verification or proof of local availability. Header text is safely JSON-escaped for non-ASCII values. No new image data enters the routine request.

No diary/customization call invokes Groq, billing verification or quota reservation. Existing premium analysis authorization remains unchanged. No paid AI calls were made in this task.

## 13. Validation results

- Baseline: **96/96 tests passed**.
- Retention regression suite: **114/114 tests passed** (18 added). Covers capture/decode/probe cleanup/cancellation, bounded opt-in preferences, schedules/stable IDs/immutable source, diary dates/time zones/duplicate saves/exact older-date lookup, owner-scoped CRUD, anonymous authentication, disabled routes, database conflict failures, RLS source structure and deletion, plus the full existing analysis suite.
- TypeScript mobile + Worker: passed.
- Full ESLint: passed after correcting JSX punctuation errors found during implementation.
- Worker dry-run build: passed. An initial sandbox filesystem denial was resolved by running the local build with the required permission; nothing was deployed.
- Git whitespace/diff check: passed.
- Expo Doctor: **19/20 passed**, one compatibility check reports five newer SDK 58 patches. `expo install --check` also reports these updates. No blind installation or SDK upgrade was performed.

| Package | Installed | Doctor expected |
|---|---|---|
| expo | 58.0.17 | ~58.0.19 |
| expo-dev-client | 58.0.14 | ~58.0.15 |
| expo-file-system | 58.0.10 | ~58.0.11 |
| expo-font | 58.0.9 | ~58.0.10 |
| expo-router | 58.0.25 | ~58.0.26 |

React Native/React remain on the baseline versions. Resolve or explicitly accept the patch-version check before final release validation; do not suppress it or upgrade SDK major versions blindly. Low-light/blur/face-detection accuracy and physical permission flows were not tested as implemented detectors because no such detectors were added.

## 14. Android export

`npx.cmd expo export --platform android --output-dir artifacts/retention/android-export` succeeded with a Hermes Android bundle and metadata. The initial sandbox denied `hermesc.exe`; rerunning with execution permission resolved that environment issue. This is a local export, not a signed AAB or Play release. Generated artifacts are ignored by Git.

## 15–16. Deployment and real-device status

**No production Worker deployment, database migration, feature-switch activation, public legal publication, new provider/secret, quota increase, customer deletion, billing change or store submission.** The legal contact and final age approval remain pending under the owner's explicit hold. The local privacy screen, data-flow audit, retention notes, Data Safety draft and unpublished website draft disclose the candidate data flows.

**No physical Android QA performed.** Use [Android checklist](./RETENTION_ANDROID_TEST_CHECKLIST.md). Until approved rollout, existing production APIs will show the new screens' server-update message; this is not a claim that live persistence already works.

## 17. Remaining release gates

1. Review/apply the migration to approved staging; run two-user/guest RLS and deletion tests against the database.
2. Approve a staging Worker rollout, then complete the Android checklist including restart persistence and unchanged analysis behavior.
3. Review the five Expo patch mismatches and repeat final checks after any dependency change.
4. Explicitly approve production migration/Worker activation/mobile rollout after sign-off.
5. Finish existing billing/store testing, signing/EAS setup, verified public contact, final age-policy approval and legal/privacy review. No public legal draft should be published with missing details.

Deferred by scope: diary photos, barcode/product catalog, ingredient compatibility, face localization/measurement scores, reminders, new AI providers, offline database sync and clinical accuracy claims. No additional feature expansion is proposed before verification and release work.
