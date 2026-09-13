Fresh verification artifacts for the requested-modifications build.
- browser-report.json: participant workflow smoke-test result.
- modified-flow-smoke.png: screenshot captured by the participant browser smoke test.
Run `npm test`, `npm run build:verify`, `npm run test:browser`, and `npm run test:admin-browser` to reproduce the verification passes.
The optional PGlite/Postgres-compatible integration test requires devDependencies and is skipped when @electric-sql/pglite is unavailable.
