# Privacy, security and operational responsibilities

## What is implemented

Research identity uses a random study code and persistent internal UUID. A separate high-entropy private access key authenticates access; salted scrypt hashes, not the plaintext keys, are stored. Session cookies are opaque, HttpOnly, SameSite Strict, Secure in production, and expire after seven days. Resetting a key revokes existing tokens. Participant mutation routes require a CSRF token and reject cross-origin requests. Direct session/assignment access checks the authenticated participant's ownership.

Only the server sees the Supabase secret key. It sends modern `sb_secret_` keys through `apikey`, not as JWT bearer tokens; legacy service-role JWTs are supported separately. Startup rejects a publishable key and a legacy token not carrying the service role. New tables enable RLS and remove browser-role grants; the sole workflow RPC is executable only by the service role. Backend authorization remains essential because a service key bypasses RLS.

Consent signatures and compensation emails are separate records encrypted with AES-256-GCM, unique IVs and record-bound authenticated data. Research export endpoints omit these tables, authentication tables and the compensation mapping. The compensation console needs a separate random token and only exposes claim/contact/status records. This is **logical separation inside one Supabase project/backend**, not physical separation between independently administered systems. A service-key or server compromise can cross these boundaries. Separate payment storage or a university-approved payment service may be required by institutional review.

Requests and fields are bounded. Persistent rate-limit keys use a keyed HMAC instead of storing raw IPs in application rate-limit rows; expired buckets are cleaned up. No application analytics cookies, third-party tracking pixels or recording of full keystrokes are installed. Acknowledged draft snapshots are collected, not every keypress. Provider results/errors are bounded and user content is escaped on rendering. CSV formula injection is neutralized. Stack traces, API keys, signature plaintext and payment email are not intentionally written to application logs.

## External services

Participant Python/Java is sent only to a configured Judge0-compatible sandbox with CPU/wall/file/memory limits and network execution disabled in the submission. The remote provider still needs correct isolation, patches, network controls, quotas and approved data handling. This application does not certify that a public or self-hosted Judge0 instance is secure. Do not run student code through `child_process`, Python, Java or an unrestricted container inside the web service.

OpenAI receives the task, code, explanation and a matching recorded execution result where available, not the study's participant/session identifier or incentive email. A student could still type identifying information into free text. Request `store:false` is implemented, but it does not guarantee zero retention or eliminate abuse-monitoring logs. Review provider contracts/data controls and user-provided identifiers before real use. AI/execution timing and availability can influence measured outcomes; record failures and pilot the actual providers.

Official references:
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://developers.openai.com/api/docs/guides/your-data
- https://github.com/judge0/judge0

## What the team must do

Use university-approved hosting, storage, access controls and exports. The uploaded consent requires that; the choice of a vendor does not itself establish approval. Use approved password management, least-privilege project access and MFA for cloud/operator accounts. Shared research/payment tokens are a simple deployment mechanism; they do not provide individual operator audit attribution. Review institutional SSO/MFA and per-person admin roles before wider deployment.

Maintain the identity-to-study-code roster separately and restrict it to approved staff. Send participant access keys privately; never derive them from names, birthdays, A-numbers or guessable course IDs. Lost keys require verification through the approved roster, not an unauthenticated reset email endpoint. Do not place credentials in Git or screenshots. Back up the encryption key with the encrypted records; rotate it only with an explicit re-encryption procedure and a recoverable prior key.

Have a documented retention/deletion schedule for consent, compensation, the linkage roster, research content, exports, backups and vendor logs. The source says the roster link is deleted when no longer needed and before protocol closure, with de-identified research data potentially retained three years after completion; required consent/compensation retention is university-specific. This build records data-withdrawal requests but does not automatically delete rows or infer deadlines. A data steward must resolve identifiability, applicable retention exceptions and copies before deletion. A participant can stop even if they do not request data deletion.

Review free-text exports for accidentally entered identifiers; they are pseudonymous, not assuredly anonymous. Store CSV/XLSX exports in the approved access-controlled location, not public cloud folders. Host/vendor request logs may contain network metadata outside this application's tables. Minimize those logs and check retention with each service. Do not claim “no IP collection anywhere.”

Use a dedicated staging database for acceptance testing and capacity/security checks. Test dependencies and the actual browser editor before release; pin the verified lockfile and monitor advisories. A free hosting plan is a deployment setting, not a guarantee of uptime, responsiveness, no costs or institutional acceptability. Pauses/restarts, concurrency and upstream rate limits must be included in the study pilot.
