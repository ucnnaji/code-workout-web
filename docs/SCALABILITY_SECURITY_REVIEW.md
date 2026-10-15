# v4.0.4 scalability and security hardening

This release preserves the current question text and consent wording while hardening the existing design for a large scheduled cohort.

## Load-related changes

- Campus/NAT-aware IP rate ceilings were raised while per-Participant-ID limits remain strict, avoiding a false lockout when hundreds of students share one public address.
- Activity heartbeats run every 30 seconds and no longer perform an extra state round-trip. The database still atomically verifies participant ownership and current-stage status.
- Judge0 language discovery is coalesced so a first-use burst performs one runtime lookup rather than hundreds.
- Judge0 and OpenAI outbound work is bounded to 120 concurrent requests per Node process to reduce socket/memory exhaustion during a lab burst.
- Transient OpenAI 429/5xx failures get one bounded retry; Judge0 polling tolerates transient provider failures inside its existing deadline.
- The Node request timeout is 120 seconds so a valid sandbox-plus-scoring operation has headroom under provider latency.
- A recent-operation database index speeds the latest execution/score lookups.

## Security-related changes/checks

- Participant authentication remains an HttpOnly/Secure/SameSite cookie with server-side token hashes and CSRF protection for authenticated mutations.
- Cross-origin JSON mutations are rejected.
- Supabase service credentials remain backend-only and RLS/revoked browser privileges remain in force.
- PII remains AES-256-GCM encrypted with record-bound associated data.
- Judge0 receives network-disabled, CPU, wall-time, memory, and file-size limits; student programs are never executed by the Render process.
- OpenAI requests still use `store:false` and receive no participant/session/email identifier from the application. Score responses now request a strict JSON schema to reduce malformed-score failures.
- Hidden `expected_concepts` are retained in immutable server-side assignment snapshots for reproducible scoring but are stripped from participant-facing assignment/review responses.
- The included security review checks environment-variable coverage, generated SQL consistency, hard-coded-secret signatures, runtime shell/eval primitives, and critical security controls.

## Synthetic 500-user test

Run `npm run test:load`. It concurrently exercises 500 access-key verifications, 500 mocked AI-scoring operations, and 500 mocked Judge0 runs. This test is intended to detect process-level queue, memory, and thundering-herd defects. It is not a substitute for a staging load test against the exact paid Render/Supabase/Judge0/OpenAI capacity used for data collection.

## Deployment capacity note

This package targets Render's Pro-equivalent `2c-4g` web-service compute plan because the deployment has been upgraded for the study. The application still bounds OpenAI and Judge0 concurrency, so provider quotas and the actual Supabase tier remain part of the end-to-end capacity envelope. The included 500-user test is synthetic and should be supplemented with a staging rehearsal against the exact production services before a large scheduled session.
