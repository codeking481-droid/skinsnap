# Android retention verification checklist

Date: 2026-10-24. **No physical Android verification has been performed for this upgrade.** Use an approved migrated staging backend and the tested mobile candidate. Never record credentials or personal diary content in diagnostic screenshots/logs.

## Setup and identity

- [ ] Fresh installation can explore without email registration. Opening account-backed features securely creates/reuses the existing guest identity.
- [ ] A normal restart preserves that identity and loads saved preferences/routine/diary. Clearing app data/reinstalling is correctly explained as potentially losing guest access.
- [ ] Signing out/in to another account never briefly reveals the prior account's records. Slow responses after leaving screens cannot repopulate old records.
- [ ] Back button, Android hardware/predictive back, keyboard dismissal, small screen and large font settings work. Dirty drafts prompt before the app's back action; saving blocks edits until the request completes.
- [ ] TalkBack announces fields, checkboxes, scheduled days, save state and errors. Existing reduced-motion scanner behavior remains intact; new screens add no animation.

## Smart Capture: test camera and gallery separately

- [ ] Camera permission denied/permanently denied: gallery fallback works; Settings link works; no request/quota is used.
- [ ] Cancel gallery selection: current photo/consent is unchanged.
- [ ] Normal portrait, landscape and rotated JPEG/PNG/WebP/HEIC: preview orientation/aspect ratio remains correct. Android's actual supported decoder formats must be verified.
- [ ] A valid selfie can continue after consent; no automatic upload occurs during local checks.
- [ ] Low light/blur: useful guidance is present; no invented brightness, blur, face-detection or accuracy claim. These properties are not measured locally.
- [ ] Small or very wide/narrow photo: mild warning, retake option, and explicit continue option work.
- [ ] Corrupt/unreadable/empty/unsupported or over-32-MiB/over-100-megapixel source: submission stays blocked, explanation and retake/gallery options work, no AI request/reservation occurs.
- [ ] Local decode probe is removed; camera/gallery source remains intact. A deletion failure blocks continuation with an honest local-check error.
- [ ] Prepared upload still uses the established native JPEG compression, orientation and upload implementation. Existing analysis cleanup and cinematic scanner work.

## Saved preferences

- [ ] Every field can be skipped/cleared. Region/products lengths are bounded; accents and multiple product lines work.
- [ ] Save permission is required; no preference profile is silently saved from the upload form.
- [ ] Save, edit, reopen after restart and reset work for a guest and email account.
- [ ] Saved answers appear in the next upload session. Changes made only in the upload form remain session-only.
- [ ] Products/region/fragrance/experience reach only routine generation in a consented analysis; photo observations are not altered to match self-report.
- [ ] Offline load does not show another user's data. Failed save/reset keeps the draft and shows no false confirmation.

## Editable routines

- [ ] Existing older analysis reports still display without a customization record.
- [ ] Edit name/description, add/remove steps, reorder, change morning/evening and choose days. Empty custom routines have a useful state.
- [ ] Save/reload twice produces no duplicate steps. An invalid empty name or no selected day produces a useful error.
- [ ] Today's scheduled steps only are presented. Ticks reference stable IDs after reorder/rename; unrelated newly added steps are not already checked.
- [ ] Reset today's checks preserves prior completed days; moving to a new local date resets step checks.
- [ ] Restore original AI suggestion changes the draft only until Save. Original analysis/history is never rewritten. Remove custom routine returns to the saved AI fallback.
- [ ] Custom product names/instructions are labeled user-entered and never described as reviewed recommendations.
- [ ] No routine edit, save or checkmark calls Groq or consumes an analysis.

## My Skin Diary

- [ ] First visit has a useful empty state. Feeling/note/concern/product fields are optional.
- [ ] Save twice on one date yields one entry; edit updates it; delete removes only that date.
- [ ] Browse recent history and a date older than the recent 366-entry window; existing older entries are fetched, not silently overwritten as blank.
- [ ] Local midnight, week boundary, daylight-saving locations and travel/time-zone changes do not shift an existing entry's date. The saved date/time-zone label is explicit.
- [ ] Today's actual routine checkmarks are shown when available; copying them into the diary is explicit and does not overwrite a saved self-report automatically.
- [ ] Weekly counts match saved diary entries/completion reports, including after edit/delete. No cosmetic improvement percentages or health claims appear.
- [ ] Offline save/delete preserves the current draft, reports uncertainty, and allows retry without duplicate records. No photos or AI calls are introduced.

## Security, deletion and release

- [ ] Execute two-user and anonymous-JWT runtime RLS tests from the migration plan.
- [ ] Disposable staging account deletion removes preferences, custom routine, diary, existing account records and local routine completion. Auth is not removed after a blocking database deletion failure.
- [ ] Existing analysis subscription gates, quotas, server admin restrictions and prices remain unchanged.
- [ ] Approve and verify the five SDK 58 patch updates flagged by Expo Doctor, or document the accepted release decision. Do not upgrade SDK major versions blindly.
- [ ] Complete billing configuration, verified public support/privacy contact, final age approval and public legal publication separately. No signed release/AAB or production readiness is implied by a JavaScript/Hermes export.
