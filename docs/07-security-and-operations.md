# Security, privacy, quality and operations

## Threat model

Protect against an employer trying to enumerate or identify candidates, a removed seat retaining access, a candidate accessing another candidate's files, a malicious uploaded document, forged/replayed provider callbacks, accidental PII in logs, and workflow races that share information after withdrawal.

Also model ordinary mistakes: self-identification in chat, identity in calendar invites, a generated PDF retaining metadata, a public storage bucket, a server component passing full rows to a browser, and an incorrect notification recipient. The platform cannot prevent a person remembering a name, saving an authorized file, or inferring identity from distinctive experience.

## Security acceptance matrix

| Boundary | Required test |
|---|---|
| Private identity | Anonymous/candidate B/employer B cannot query candidate A identity through REST, RPC, web HTML or file APIs |
| Permanent eligibility privacy | DOB, postal code and evidence never appear in any employer projection before or after reveal |
| Approved profiles | Unreviewed new draft cannot alter live cards or previews sent to employer |
| Team membership | Removed member loses new API/download/token access immediately; active room removal tested |
| Job scope | Card reference from job A cannot be replayed against job B |
| Discovery consent | Hidden/blocked candidate cannot be returned through search, pagination, invitations or exploration |
| Matching | Concurrent right-swipes and retries create one match and one logical notification |
| Interview | Fake client completion and forged callback cannot unlock scorecard/reveal |
| Media | Modified client cannot publish camera or screen-share in round one |
| Scorecard | Wrong interview/question IDs rejected; submitted records immutable |
| Reveal | Wrong artifact, consent revision, recipient scope or withdrawn application rejected |
| Race handling | Withdrawal racing grant/send cannot silently report unsent data as recalled |
| Storage | Unapproved/source files cannot be accessed via guessed path, bucket listing, signed URL endpoint or alternate API |
| PDFs | Extracted text, metadata, links, annotations and rendered pages contain no forbidden blind identifiers |
| Chat | Obfuscated PII fixtures tested; scanner outage never sends raw original text |
| Realtime | Unrelated subscriber cannot subscribe or receive payloads; removal/revocation stops access |
| Calendar | Employer ICS contains no candidate email/name in hidden fields |
| Logs | Request bodies, auth tokens, files and sensitive response payloads absent from logs/analytics |
| Privilege escalation | Cannot self-verify employer, self-assign staff, alter eligibility rules or direct-write reveal rows |

Automated tests cannot establish zero identity inference or legal compliance. They demonstrate specific controls and produce evidence for review.

## Data handling policy to implement

| Data | Proposed treatment | Decision dependency |
|---|---|---|
| Eligibility evidence | Minimum reviewed representation; encrypted if DOB retained; key version recorded | Legal decision on collection and age updates |
| Raw resumes | Private quarantine/source storage; scoped access; delete under defined lifecycle | Retention duration and active disclosures |
| Blind/reveal artifacts | Immutable versions, checksums and scoped approvals | School/address/DOB inclusion rules |
| Raw message moderation text | Avoid storing unless necessary; short expiry | Moderation appeal needs |
| Scorecards | Employer-confidential; immutable submitted assessment | Employment-record retention and access requests |
| Application history | Retain minimum useful history; restrict after withdrawal/deletion | Reviewed retention schedule |
| Posting and form archives | Versioned retention from public removal | Ontario retention rules |
| Interview notices | Statement and delivery evidence with retention basis | Ontario retention rules |
| Recordings | Not collected in beta | Separate future consent/design |
| Analytics | Pseudonymous minimal events, bounded retention | Consent and vendor review |
| Backups | Encrypted, finite retention, access controlled | Document delayed deletion from backups |

Do not invent final legal retention durations for every category. Only the known posting/notice/policy obligations should have sourced defaults; remaining durations require a reviewed policy before production collection. Deletion makes the account inaccessible promptly, then purges or isolates each category subject to applicable holds.

If DOB encryption is selected, specify authenticated encryption, key version, rotation and authorized decryption service. Disk encryption alone is not field-level encryption. Matching reads derived eligibility without sharing evidence; age never feeds fit scoring. Never put encryption keys in the same database backup as ciphertext.

## Platform obligations and legal release dependencies

- Versioned fraud policy and conspicuous report controls on public and authenticated surfaces.
- Published compensation, vacancy and AI disclosures; preserve job revisions and relevant linked/form content.
- Truthful hiring-status notices with current employer input and failed-delivery escalation.
- Reviewed eligibility collection, minimum-age workplace rules and minors consent experience.
- Reviewed school-name disclosure and full-resume content: an uploaded resume may itself contain DOB, address or a photograph despite the app not collecting a photo field.
- Disclosure policy covering recipient team, future seats, attachments, downloads, consent changes and withdrawal.
- Accessible interview alternative and handling of accommodation information without broad recruiter disclosure.
- Privacy requests, breach response contacts, subprocessors, cross-border data flows and retention schedule.
- Monetization/recruiting licensing review before launching fees tied to recruiting activity.

These dependencies block their production features, not local scaffolding or synthetic-data development. See [references](09-references.md#regulatory-and-product).

## Observability

Operational events: request failure rate/latency, queue lag, redaction failures, match transaction conflicts, booking conflicts, join/reconnect failures, overdue notice jobs, delivery bounces, blocked reveal attempts, unusual download volume.

Product events: onboarding started/completed, profile approved, eligible deck size bucket, job viewed, interest recorded, matched, interview booked/completed, reveal requested/authorized/granted, outcome reported. Use internal pseudonymous references, never names or free text. Distinguish measured outcome from self-reported outcome.

Disable session replay on onboarding, resumes, chat, calls, scorecards, identity and admin evidence views. Redact request/response bodies and headers before error reporting. Do not log signed links, webhook secrets or prompt payloads containing raw resumes.

Set operational alert thresholds from staging/load results. First beta targets proposed: all critical authorization tests pass; no known cross-tenant read; no missed deadline due to a stopped worker without alert; all unreconciled resume sends visible to an operator. Do not claim uptime guarantees before measurement.

## Test layers

1. Pure unit tests: ranking normalization, availability/timezone conversion, state transitions, redaction formatting, compensation policy, reason-code generation.
2. Database tests: grants/RLS, exact-field projections, restrictive RPCs, constraints, transactional races, outbox atomicity and retention behaviour.
3. Service integration: authenticated APIs with real local Postgres/storage emulation where feasible and provider fakes; idempotency and failure injection.
4. Provider contract tests: signed LiveKit/email callbacks, token grants, controlled test delivery, expiry/reconnection behaviour. Never production candidate data.
5. Browser tests: employer verification/job/deck/interview/scorecard/reveal and admin review paths.
6. Device tests: iOS and Android onboarding, swipe alternatives, push links, microphone permissions, weak network, Bluetooth and background/reconnect.
7. Manual privacy review: exported PDF/ICS/email content and metadata, candidate/employer screen recordings with synthetic data, actual consent wording.

Use property-based or table-driven tests where they reveal real boundary errors. Do not spend the solo build budget testing static labels while authorization and lifecycle races remain untested.

## Seed scenarios

- Candidate with no resume or work experience; candidate with DOCX and identity-rich clubs; candidate with stale approval.
- Adult and younger candidate synthetic eligibility cases; unsupported/uncertain work entitlement; separate term/home location.
- Verified employer, unverified employer, suspended employer, removed recruiter, viewer and competing organization.
- Job with hourly compensation, annual compensation, overnight shifts, no vacancy, closed status and revised posting.
- Candidate-only interest, employer-only interest, mutual match, blocked conversation, withdrawal before and after reveal.
- Interview completed, no-show, disputed, rescheduled through DST, repeated/external interview and overdue notice.
- Resume send succeeds, fails, returns ambiguous timeout, and is cancelled before send.

Local fixtures use fictional identities and safe reserved email domains. Production seed scripts must refuse to run destructive fixture insertion without an explicit environment guard.

## CI and deployment

Pull-request checks: lockfile consistency, lint, typecheck, domain tests, migrations on an empty database and upgrade fixture, RLS/security tests, relevant integration tests, dependency/secret scan. Web/mobile build checks run for affected packages. Integration builds use test credentials with no production access.

Deploy additive database changes before compatible API/client updates. Rehearse migration and restore in staging. Feature flags gate rollout, but grant logic is always enforced. Record release version on errors/events. Native runtime changes require a new mobile binary; OTA updates must remain compatible with the installed native runtime.

Do not run real broadcasts, bulk employer mail or production migrations from local development tasks. Release execution is a separate authorized activity after the implementation is concrete and tested.

## Required runbooks

- Identity leak: stop affected reads/sharing, preserve restricted evidence, identify recipients, rotate exposed credentials if relevant, notify through reviewed incident process.
- Failed reveal send: inspect provider status before retry, recheck authorization, communicate accurate delivery state.
- Missed outcome notice: alert operator, obtain factual employer update, send/reconcile and retain incident record.
- Scam employer: suspend discovery/messaging/calls, preserve case evidence, restrict all seats and pending deliveries.
- Queue/provider outage: pause unsafe flows, retain committed intents, reconcile after recovery.
- Lost credential: revoke/rotate, audit access, validate deployments and worker configuration.
- Data restoration: restore staging backup, reconcile outbox/delivery ledgers to avoid replaying disclosures, verify deletion/retention tombstones before returning service.

Runbooks are authored when their services are integrated, before beta. Backup restoration must not resurrect revoked grants or resubmit old resume emails.
