# Administrator development analysis allowance — 2026-10-23

At the user's explicit request, the exact server-allowlisted administrator account is exempt from the rolling monthly analysis limit on the development-only endpoint. Other development accounts remain limited to two charged attempts in 30 days, and production analysis limits are unchanged. Existing usage records are not deleted. This exemption permits ongoing AI-provider usage and can incur charges.

Idempotency and per-request retry limits remain enforced. The exception is keyed exclusively to the authenticated user ID configured as `AI_ADMIN_TEST_USER_ID`; client-supplied flags cannot obtain it.
