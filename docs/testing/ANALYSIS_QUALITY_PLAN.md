# Analysis quality upgrade

Baseline: tag `skinsnap-working-analysis-2026-10-23`, user-confirmed Android scan.

Current flow: local consent and authenticated session -> native multipart JPEG upload -> Worker authentication and subscription/development gate -> one idempotent Supabase reservation -> Groq Qwen 3.8 27B receives base64 image input -> validated cosmetic observations -> Groq GPT OSS 20B receives text only -> validated routine -> completion RPC -> results, details, routine and history.

Observed limitations: JSON object mode does not enforce field presence; irrelevant images receive generic routines; no explicit suitability decision or structured limitations; up to twelve observations encourages overreporting; confidence labels are uncalibrated; no voluntary routine preferences; provider consent copy still describes Gemini. Safety is currently a keyword filter, which cannot establish whether an observation is visually true.

Incremental changes: explicit vision JSON contract and strict server validation, at most four grounded observations, suitability gate before the routine call, optional location/title/limitation metadata, voluntary enum-only routine preferences, visibility labels, accurate Groq consent. Keep the previously working Groq JSON-object request mode: provider-enforced strict schema mode was inconsistent in live trials. Keep the existing categories and routine string arrays so stored history and routine/progress readers continue to work. Redness/color variation maps to uneven-looking-tone; pore appearance maps to general-texture without pore measurements.

No database migration, provider switch, extra production AI call, billing change, quota bypass, or scanner redesign. Existing reservations and failure release remain in place. Evaluation uses synthetic images and mocked contracts; these checks are not clinical validation or proof of visual accuracy.
