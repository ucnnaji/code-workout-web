# Protocol/source review — required before collecting real data

## What the supplied files support

The consent document's body says **USU IRB Protocol #16317**, although its filename begins `16137`. This implementation uses the document's body identifier and does not claim the upload is an approval letter.

The consent/recruitment materials describe three **in-person** sessions during Weeks 3, 6 and 10, covering loops, functions and arrays, approximately **65 minutes each**. Each has a five-minute pre-session survey, two twenty-minute questions using an assigned practice modality, a fifteen-minute crossover using the other two modalities, and a five-minute post-session survey. They describe problem solving with AI-generated feedback, debugging and code explanation.

The consent allows skipping questions and stopping participation, separate identifying records where possible, $20 per completed session independent of performance/modality, and an optional separately consented 20-minute interview for an additional $15. The app therefore does not force an answer to every question, make payment conditional on a test score, or insert an interview as a required stage.

Source files:

- `16137 Informed Consent-Main Study IRB Edits(2).docx`: full consent body retained in `content/consent.json`.
- `Eligibility Screening Tool - IRB_ #16317.docx`: two eligibility questions before consent.
- `Online Survey_ Programming Background and Self-Efficacy - IRB_ #16317 (1).docx`: background section, eight pre/post efficacy items, post-study activity-confidence question and optional explanation.
- `Recruitment_Material_IRB_16317.docx`: session schedule, practices, compensation and voluntary participation.
- `In-person Follow up Interview Questions - IRB_ #16317 (1).docx`: optional interview questions and modality/order/topic metadata, not a mandatory main-study survey.

## Differences that are not silently resolved

| Issue | Source / request distinction | Build behavior and required decision |
|---|---|---|
| Delivery mode | Source says in-person | This package defaults to in-person delivery to match the supplied consent. Switching to remote remains technically possible, but live release then requires reviewed remote/e-consent materials. |
| Platform | Consent mentions Qualtrics and university-approved systems | Native forms replace external forms technically; obtain approval for actual Render/Supabase/provider handling |
| Signature | Source has participant name, signature and date lines | Typed name + explicit agreement is implemented, but electronic consent authorization must be confirmed |
| Survey count | Consent and recruitment say five short questions; supplied survey contains **eight** efficacy items before and after | Preserve all eight source items, do not invent which five to remove; reconcile documents |
| Additional survey questions | AI exposure, preferences, enjoyment, usability and other requested items are not all in the supplied instrument | Stored as separately identified new items; not claimed validated/approved |
| Java | Supplied survey wording specifically refers to Python | Java substitutions are marked adaptations and require review |
| Pre/post performance tests | No approved test question bank was supplied | Included items are demonstrative, not validated or equated; replace them or disable test stages before release |
| Practice structure | Source uses two assigned questions plus crossover; old app uses three questions in each of three modalities | `three_each` preserves the old app; optional `assigned_crossover` is a proposed 2+1+1 configuration, not automatic protocol equivalence |
| Topic-specific banks | Inherited 120 active questions mix loops, functions and array/list concepts | Set reviewed `questionIdsBySession` mappings and enough distinct eligible items; session labels alone do not make the bank topic-specific |
| Duration | Source says 65 minutes; additional tests/questions may change duration | Default duration text explicitly notes uncertainty; pilot and approve actual time before release |
| Eligibility scope | Screening question says introductory programming; its inclusion table specifies CS 1400 | Preserve question wording; resolve the mismatch before enrollment |
| Contacts | Source contains a particular IRB phone number | Preserve supplied contact text during review; verify the current approved contact before publication |
| Interview | Optional, separate consent, additional $15 | Remains outside required completion and $20/session payment records |
| Retention | Source says link deleted when no longer needed and before protocol closes; de-identified data may be held three years after study | Requires an approved operational schedule, not a hard-coded deletion date inferred from upload time |

**Source-preserving does not mean approved.** Do not use real participants with the default review content. USU SOP 408 describes review of modifications and obtaining updated consent documentation before implementing applicable changes. The research team/IRB must determine the review pathway; this package does not classify an amendment as minor or major.

Official reference: https://research.usu.edu/irb/procedures/400-series/408-modifications-approved-protocols

## Release controls

New live accounts/sessions require both a reviewed configuration (`release.status="approved"`, approval reference, all review items, current content hash) and `LIVE_COLLECTION_ENABLED=true`. Default configuration stays draft. The server refuses a remote release with the original in-person consent version, or enabled illustrative tests with the unreviewed marker still present. Replacing a marker is not research validation: only the responsible team can substantively review content.

Configuration changes are stored in the database and applied to new sessions. Changing `config/study.json` and redeploying does not overwrite existing configuration. New content changes the server content hash, requiring a renewed release review for new live sessions. In-progress sessions retain their snapshots; pause live collection and consult the research plan before making amendments that affect them.

Required release review record: approved procedure and actual duration; reviewed consent/e-consent method; exact instruments and item counts; assessment validity/answer keys; language adaptations; assigned/crossover design and order; sufficiently sized topic mappings; eligibility wording; current contact text; hosting/provider access and retention; compensation and course-credit process; operational withdrawal/deletion plan; and successful staging acceptance tests.
