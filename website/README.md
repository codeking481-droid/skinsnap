# SkinSnap legal-site review candidate

The responsive static pages in this directory are review drafts, not published legal policies. The 18+ minimum age is confirmed and enforced by the mobile app. The public support/privacy email and legal approval are still missing, so public deployment and Play Console use are blocked.

Build a local staging copy without installing dependencies:

```powershell
node scripts/build-legal-site.mjs
node scripts/preview-legal-site.mjs
node scripts/verify-legal-site.mjs
```

The preview is `http://127.0.0.1:8795`; it is not a public URL. The staging build reads only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_URL` from the root `.env`. It must never receive a service-role key or Worker secret. The external deletion form stays disabled unless explicitly enabled with `--enable-account-deletion` after legal publication, age policy, contact, Supabase, API, Worker CORS, and public-key configuration are approved.

The web deletion client signs in through Supabase Auth, verifies the returned account identity with the Worker, and asks the authenticated Worker to delete that identity. It does not accept an account ID from the browser or store passwords/tokens in web storage. The site configuration is not currently complete, the form is disabled, and no end-to-end production deletion test has been performed for this review task.

Before deployment:

- Supply and verify the public support/privacy email.
- Obtain legal review and approve the policy content/effective date.
- Confirm the live database tables, deletion behavior, storage inventory, provider settings, and retention.
- Configure exact Supabase and Worker origins; add the Pages origin to Worker `ALLOWED_ORIGINS`.
- Test app and external deletion using a disposable account, including partial failure and retry. Never test against a real user.
- Confirm the public Pages project name and deploy only after review approval.
- After the hosted Privacy Policy and Terms have been verified, set `EXPO_PUBLIC_LEGAL_URLS_VERIFIED=true` together with their HTTPS URLs in the app build environment. Without this confirmation flag, the app does not label either URL as published.

The Worker uses the repository-root `wrangler.jsonc`; do not run Worker deployment commands from this directory. After the blockers are cleared, build and inspect the staging output, then deploy it with the approved Pages project:

```powershell
node scripts/build-legal-site.mjs
npx wrangler pages deploy .\artifacts\finalization\legal-site --project-name <approved-pages-project>
```

Verify HTTPS, mobile layout, all navigation links, and `/privacy`, `/terms`, and `/delete-account` on the hosted site before configuring app or Play Console URLs. No public URL is currently claimed.
