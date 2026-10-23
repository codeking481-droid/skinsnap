# Google Play Health apps declaration — recommendation

**Prepared:** 2026-10-22  
**Status:** Requires Play Console owner review; this document is not a submitted declaration.

## Evidence from the product

SkinSnap accepts a face/skin photograph, returns visible skin observations, and generates cosmetic routines. It explicitly disclaims diagnosis and medical advice. It does not currently claim disease detection, treatment, prevention, medical-device status, or clinical use in the inspected UI and Worker prompts.

Google's current Health apps declaration guidance lists "skin care" as an example under Medical → Diseases and Conditions Management. This makes a no-health-features declaration unsafe to assume. It does not by itself determine the correct category for SkinSnap's specifically cosmetic, non-diagnostic feature.

## Recommended declaration review

1. Declare the photo-based skin-care functionality accurately.
2. Review the Medical category and specifically whether Google's "skin care" example applies to this non-diagnostic cosmetic product.
3. Do not mark the app as a regulated medical device or disease-management tool without evidence/authorization.
4. If the Play Console form permits more than one category, select only those accurately supported by implemented features.
5. Ensure the store listing clearly says the app is not a medical device, does not diagnose/treat/cure/prevent a condition, and tells users with medical concerns to consult a qualified healthcare professional, as required by the applicable current policy.
6. State device compatibility for camera-based health functions in the store description.
7. Reassess if the app adds symptom tracking, diagnosis, disease claims, treatment recommendations, or clinical integrations.

## Risks and controls

- The Gemini prompt restricts observations to visible characteristics and prohibits diagnosis and sensitive-attribute inference.
- The Worker validates enumerated categories, confidence, length, and a restricted-health language list. Client parsing validates again; routines are filtered.
- Language filters are not a substitute for model evaluation or human review. False negatives and false positives are possible.
- Output moderation tests are synthetic unit tests only. No clinical validation is claimed.
- Gemini's API terms prohibit clinical use or providing medical advice. Keep SkinSnap strictly cosmetic and obtain provider/legal review before changing product claims.

## Official references

Accessed 2026-10-22:

- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Health app categories and additional information](https://support.google.com/googleplay/android-developer/answer/13996367?hl=en)
- [Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Gemini API Terms](https://ai.google.dev/gemini-api/terms)
