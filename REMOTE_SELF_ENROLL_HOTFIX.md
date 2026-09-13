# Remote self-enrollment hotfix (v4.0.5)

This build was patched directly from the uploaded `code-workout-web-main.zip` baseline.

## What changed

- Remote students can create their own Participant ID and Private Access Key when:
  - the saved study configuration has `deliveryMode` set to `remote`,
  - Render has `LIVE_COLLECTION_ENABLED=true`, and
  - deployment startup checks pass.
- A draft/admin release-review record no longer blocks the participant self-enrollment endpoint for remote delivery.
- New live Session 1 creation uses the same remote live-deployment rule, so a newly enrolled participant is not blocked immediately after generating credentials.
- Consent acceptance/version checking, typed signature, Participant ID validation, duplicate-entry protection, rate limiting, one-time key display, and salted key hashing remain in place.
- The admin dashboard now explicitly reports whether remote participant self-enrollment is open.
- Researcher/admin manual creation of non-test participant accounts retains the stricter release-readiness gate.

## Deployment requirements

1. Supabase study config: `deliveryMode = remote`.
2. Render: `LIVE_COLLECTION_ENABLED=true`.
3. Session 1 must be open in the saved study configuration.
4. Deploy this code to Render.
5. Verify in a private/incognito browser at the public study URL.

## Important content note

This hotfix does not rewrite `content/consent.json`. The consent wording in the uploaded current codebase is preserved exactly. Review that participant-facing wording separately if the deployed study is remote.
