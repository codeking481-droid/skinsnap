# Google Play Health apps declaration — review

**Prepared:** 23 October 2026
**Status:** Requires Play Console owner and legal review; this is not a submitted declaration.

## Product evidence

SkinSnap accepts a face/skin photo, returns observations limited to visible cosmetic features, and generates general cosmetic routines. The current Worker uses Groq's Qwen vision model and Groq text generation. It does not claim disease detection, diagnosis, treatment, prevention, medical-device status, or clinical use. The user interface directs medical concerns to a qualified healthcare professional.

Google's Health apps declaration materials include skin care in their examples. The app's cosmetic and non-diagnostic positioning does not determine by itself which Play Console health category applies.

## Required owner review

1. Review the current Google Play Health apps declaration and Health Content and Services policy.
2. Ask qualified counsel whether Google's Medical category applies to this photo-based skincare feature.
3. Declare only categories supported by the actual final app. Do not claim regulated medical-device status or disease-management functionality without evidence and authorization.
4. Ensure the listing and screenshots clearly describe the cosmetic, non-diagnostic purpose and limitations.
5. Reassess if the app later adds symptom tracking, diagnosis, disease claims, treatment advice, or clinical integrations.

## Controls and limitations

- The Worker prompt instructs the vision model to report only supported visible features and prohibits identity, age, ethnicity, attractiveness, disease, prescription, or guaranteed-result inferences.
- The Worker validates category, confidence, length, and restricted medical language; client parsing validates the response again.
- Language filters and synthetic tests do not establish clinical validation, accuracy, safety, or regulatory status.
- Lighting, camera quality, filters, and image detail can affect the output.

## References

- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Health app categories and additional information](https://support.google.com/googleplay/android-developer/answer/13996367?hl=en)
- [Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
