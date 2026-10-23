# SkinSnap public legal pages (draft)

This directory is a lightweight static-site source suitable for Cloudflare Pages. It must **not** be deployed yet:

- Replace draft markers with the verified legal operator name/form and actual privacy/support contact.
- Implement a functioning external account-deletion request channel with account-ownership verification.
- Verify every policy statement against live Supabase deletion constraints, provider settings, and retention.
- Obtain appropriate legal review and set the effective date.
- Confirm Gemini paid-service eligibility and target-age restrictions.

The Worker remains configured by the repository-root `wrangler.jsonc`; do not run `wrangler deploy` from this directory. Once prerequisites are resolved, create/confirm an approved Pages project and deploy only the `website` directory using that project's exact name:

```powershell
npx wrangler pages deploy .\website --project-name <approved-pages-project>
```

Verify HTTPS accessibility and the contents of `/privacy.html` and `/delete-account.html` before adding either URL to the app or Play Console. No live website URL is claimed.
