# Third-party services in the current source

**Reviewed:** 23 October 2026. This repository review does not verify live account settings, contracts, or retention.

| Service | Data processed by the inspected implementation | Unverified items |
|---|---|---|
| Cloudflare Workers | Authenticated API requests and uploaded photo; the Worker sends the photo to Groq. Custom logs include safe correlation/stage information, model/provider, byte count/MIME type, status, and attempt. | Workers observability is enabled. Request metadata, sampling, retention, access, and exports require account-owner review. |
| Supabase Auth and database | Email/password authentication, account IDs, profile, analysis job/results, routines, progress and offer/entitlement records. | Live schema, project region, storage inventory, backups, deletion constraints, RLS policies, and retention require verification. |
| Groq | Qwen vision receives the selected photo. Groq text generation receives structured observations and optional routine preferences, not the photo. | Current provider contract, account-specific retention/zero-retention setting, processing region, and deletion options require owner review. See [Groq data controls](https://console.groq.com/docs/your-data); no no-retention promise is made here. |
| RevenueCat | The installed billing SDK may process app-user, purchase, and entitlement identifiers when a supported build has configured keys. | Whether the SDK is configured in a release build, any vendor telemetry, account terms, and retention require verification. |
| Google Play | Processes Android subscription purchase and payment information when the store flow is configured. | Current products, regions, SDK collection, refunds, and account configuration require verification against the final store setup. |
| Expo / React Native libraries | Device capability, image selection/manipulation, secure storage, rendering, and runtime operations. | No first-party analytics/crash SDK is listed in the inspected manifest; transitive SDK telemetry and final merged build behavior require review. |

The Worker source declares a `GEMINI_API_KEY` binding for compatibility, and an older SQL migration's `model_metadata` value names Gemini. The current analysis request path does not call Gemini; the legacy metadata is stale and must not be used to infer current photo transmission.

No service is given an app-mediated provider deletion request by the current account-deletion flow. Removing the local temporary JPEG or SkinSnap database records does not prove removal of provider-side data or backups.
