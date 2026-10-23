# Google Play Data safety worksheet — SkinSnap

**Prepared:** 2026-10-22  
**Status:** Draft for owner/legal review; do not submit from this worksheet without checking the final build and vendor settings.

## Evidence-based data inventory

| Google data type / question | Evidence in SkinSnap | Draft response direction | Status |
|---|---|---|---|
| Photos and videos → Photos | Camera/gallery selected photo is transmitted over HTTPS to the Worker and then inline to Gemini. | Treat as collected because it leaves the device. Explain the analysis purpose and provider processing. Whether this is "shared" depends on Google's service-provider definition and the contract/relationship; verify before answering. | VERIFIED transmission in source; final form classification REQUIRES OWNER CONFIRMATION |
| Health and fitness → Health info | Skin appearance observations and cosmetic routine guidance are produced. The app does not ask for diagnoses or medical records. Google does not explicitly classify every skin image as health information. | Decide with Google definitions/legal review whether the specific functionality/data constitute health info. Do not mark "not collected" solely because the product is cosmetic. | REQUIRES MANUAL CONFIRMATION |
| Personal info → User IDs/account | Supabase Auth email/password account flow; auth UUID scopes account data. | Declare account information/identifiers as applicable to current Google taxonomy. Password is submitted to Supabase Auth, not SkinSnap AI. | VERIFIED in source |
| App activity / user-generated content | Structured observations, routines, and progress records stored in Supabase. | Review applicable Play categories; describe saved analysis data and its purpose. | VERIFIED in source |
| Device or other identifiers | Cloudflare/Supabase/provider requests may include IP and operational metadata; no app analytics SDK appears in direct dependencies. | Inspect provider dashboards and final merged SDK behavior. | UNKNOWN |
| Diagnostics | Worker observability is enabled. Client logs contain only development diagnostics, stage/error code, HTTP status, and a sanitized request reference. | Determine if operational logs include data in Google’s diagnostics taxonomy and include vendor SDK telemetry. | Partially verified; final declaration UNKNOWN |
| Data sharing | Photo goes to Google Gemini; text observations go to Groq; account/results go to Supabase; app API is hosted on Cloudflare. | Determine whether each is a processor/service provider under written terms and whether Play's third-party sharing definition/exception applies. Server-to-server transfer is still relevant to the sharing analysis. | REQUIRES MANUAL CONFIRMATION |
| Encryption in transit | Source uses HTTPS for external API endpoints. | Confirm release builds never allow cleartext traffic and verify all endpoints. | VERIFIED in code; release artifact UNTESTED |
| Deletion | In-app authenticated account deletion exists; external request resource is not yet functional; provider deletion is not integrated. | Do not claim complete deletion until live cascade and external request process are verified. | INCOMPLETE |

## Required owner checks

- [ ] Inspect final Android merged manifest and production build.
- [ ] Confirm Gemini is a paid service with active Cloud Billing; establish eligible service regions.
- [ ] Check Groq Data Controls/ZDR and contract role.
- [ ] Confirm Supabase region, backups, retention, and service-provider terms.
- [ ] Confirm Cloudflare Workers Logs retention/export settings.
- [ ] Inspect RevenueCat/Expo SDK telemetry if billing is enabled in a later build.
- [ ] Decide the Health info and sharing answers based on actual use and provider contracts.
- [ ] Publish an accessible Privacy Policy URL in Play Console and inside the app.
- [ ] Complete the Play form for every required track. Google exempts apps exclusively on internal testing from Data safety, but that does not remove other declarations or release obligations.

## Official Google references

Accessed 2026-10-22:

- [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
