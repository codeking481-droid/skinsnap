# Synthetic evaluation fixtures

These are fictional adults generated with the built-in imagegen tool, not customer images or clinical ground truth. Do not use them for marketing accuracy claims. Images remain in this directory; generated originals were preserved.

Generation prompts used photorealistic-natural style, single-image unretouched smartphone framing, neutral expression, no makeup, no labels, no real-person reference:

- `shine-light.png`: fictional adult, light skin, front-facing close-up, mild localized forehead/nose shine, natural texture, sharp focus and diffuse daylight.
- `texture-dark.png`: fictional adult, deep brown skin, close-up, subtle cheek texture variation and visible pores where resolution permits, diffuse daylight; preserve natural tone.
- `blemishes-medium.png`: fictional adult, medium brown skin, close-up, three small localized cosmetic blemish-like cheek marks, sharp focus and diffuse daylight.
- `uneven-light.png`: edit the shine reference only for strong one-sided window lighting and opposite-side shadow; keep skin and focus unchanged.
- `blur.png`: edit the shine reference to extreme defocus/motion blur so fine skin detail is not discernible.
- `non-face.png`: existing application icon, no person or skin.

Image generation and the larger evaluation were stopped at the user's request. Overexposed and filtered cases in the manifest are marked pending and are not run by default. The intended evaluations also include comparing different skin tones and two different valid photographs; those are review criteria, not proven results.

`scripts/evaluate-analysis.mjs` requires an explicitly configured isolated local remote-preview endpoint. It converts these originals to resized JPEGs to match the Android upload format, never uses customer photos, paces calls, and writes local JSON reports. It does not alter the production API or consume Supabase analysis reservations. Live provider inference can still incur Groq usage charges.
