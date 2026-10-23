# One extra administrator test — 2026-10-23

At the user's explicit request, the deployed `AI_ADMIN_TEST_MONTHLY_LIMIT` was raised from the default 20 to 21. This grants one additional reservation when rolling usage is at the prior cap. No usage records were deleted, no subscription rules were changed, and the maximum code-enforced admin cap remains 100. The ordinary development-account allowance remains unchanged.

Worker version: `2e4d3e0c-6d3b-4dc8-8dd7-5fffb01304f0`. Working checkpoint Worker source retained. Deployed with `--keep-vars true`; dashboard variables and secrets preserved. The override is on the deployed Worker, not added to local configuration. Avoid lowering it during a later deployment or accidentally removing it; review usage before changing it again.
