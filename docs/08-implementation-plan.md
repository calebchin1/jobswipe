# Implementation sequence and acceptance tickets

The sequence protects the full product direction while making each increment testable. Tickets are plans, not completed work. All checkboxes start open. No agent delegation is implied; a solo builder or a future explicitly assigned coding agent can take one ticket at a time.

## Delivery strategy

Build one complete synthetic-data path before polishing every screen:

```text
verified organization -> published job -> approved blind candidate
  -> candidate applies -> employer interested -> match
  -> booked audio interview -> verified completion -> locked scorecard
  -> candidate sharing authorization -> reveal -> employer delivery
  -> withdrawal / outcome update / audit
```

Manual beta review is a supported implementation mode, not an untracked person editing production tables. Reviewers use a minimal restricted interface with immutable decisions.

## Critical-path order

| Milestone | Tickets | Exit condition |
|---|---|---|
| M0: contracts and technical risks | P01–P04 | Permission model agreed; native call and private-download spikes work with synthetic data |
| M1: secure foundation | P05–P08 | Local apps, auth, migration pipeline, fixtures and isolation tests |
| M2: hiring supply and profiles | P09–P13 | Verified employer publishes; candidate approves a blind profile |
| M3: mutual interest | P14–P17 | Deck/apply/match/withdraw works on both clients |
| M4: first interview | P18–P22 | Scheduling, safe communication, device calls and scorecard completion |
| M5: disclosure and records | P23–P27 | Authorized reveal, delivery, truthful notices and privacy workflows |
| M6: closed-beta readiness | P28–P30 | Security/device/operations gates pass; production-policy dependencies resolved |
| Expansion | E01–E08 | Prior beta data and prerequisite decisions justify feature |

Some operations/admin work is introduced alongside the feature it supports. Do not defer every safety and privacy tool until M6.

## Tickets

### P01 — Record implementation decisions

- Outputs: ADRs for request/database access, reveal scope, authentication, worker provider, disclosure documents and lifecycle state model.
- Depends on: this plan.
- Acceptance: required vs proposed vs unresolved decisions are distinguishable; production-gated decisions have named dependencies; original Expo and attachment requirements are not silently removed.
- Validation: walkthrough of one application, one withdrawal and one unrelated employer attack against the documented rules.

### P02 — Prove native audio integration

- Outputs: disposable Expo development build and Next.js test call surface using synthetic participants.
- Depends on: P01 technical baseline only.
- Acceptance: actual iOS/Android device can join an audio call; modified client camera/screen-share publication fails; reconnect and denied microphone have recoverable UX; token/metadata carry no identity.
- Validation: device checklist and provider grant tests. Record SDK/runtime versions and constraints before integrating into main features.

### P03 — Prove protected file delivery and processing runtime

- Outputs: prototype authenticated PDF stream, quarantine flow and sample PDF/DOCX extraction/conversion results.
- Depends on: P01.
- Acceptance: unrelated user denied; future downloads fail after revocation; streaming does not expose a durable signed URL; parser failure/resource limits understood; worker deployment constraints recorded.
- Validation: malformed/oversized files, metadata inspection, slow/partial download and revoked membership. No real resumes.

### P04 — Freeze initial public contracts and state vocabulary

- Outputs: shared enums and Zod schema plan, error catalogue, state transition table, capability map by role.
- Depends on: P01.
- Acceptance: candidate and employer DTOs differ intentionally; application exists before match; save is not interest; identity/eligibility never share an employer DTO.
- Validation: concrete example payloads for applied, matched, interviewed, authorized, revealed and withdrawn states.

### P05 — Scaffold workspace and CI

- Outputs: pnpm/Turborepo workspace, Expo and Next.js shells, contracts/domain/server packages, local env example, CI.
- Depends on: P02–P04 findings.
- Acceptance: documented local startup works from fresh clone; no secrets in client bundle; workspace lint/typecheck/test run; development builds use distinct staging identity.
- Validation: fresh-install smoke test and server-import restriction check.

### P06 — Create account/organization/private-data schema

- Outputs: first migrations, grants, own-account queries, organization membership, private identity/eligibility boundaries.
- Depends on: P05.
- Acceptance: roles cannot be self-escalated; employer cannot read any candidate private row; no default exposed-table access; test fixtures cover unrelated tenants.
- Validation: direct database/Data API/RPC access matrix, not UI-only checks.

### P07 — Implement sessions and onboarding shell

- Outputs: candidate and employer email authentication, recovery, cookie/bearer adapters, setup state and signout.
- Depends on: P06.
- Acceptance: server validates identity; open redirects prevented; account suspension enforced; query caches clear between users; session expiry recovers safely.
- Validation: cross-user device/browser sessions, expired links, revoked session and invitation ownership tests.

### P08 — Build transaction/outbox/audit infrastructure

- Outputs: idempotency records, outbox dispatcher, delivery attempt ledger, audit append API, fake providers.
- Depends on: P06.
- Acceptance: rollback does not leave an event; worker retry does not duplicate logical effect; raw payloads/secrets excluded from logs; stuck jobs visible.
- Validation: crash injection before/after commit/dispatch and concurrent idempotency-key replay.

### P09 — Employer verification, settings and seats

- Outputs: company onboarding, evidence review, team invitation/removal, role capabilities, staff review page.
- Depends on: P07–P08.
- Acceptance: unverified company can draft but cannot browse/publish; removed member loses access; last owner protected; manual verification option supports businesses without domains.
- Validation: company impersonation fixtures, cross-company invitations and revocation tests.

### P10 — Job draft, policy validation and versioned publication

- Outputs: form, job snapshots, public detail, pause/close/expiry and compliance archive creation.
- Depends on: P09.
- Acceptance: compensation units explicit; required vacancy/AI fields present; prohibited requirements rejected/reviewed; public revisions immutable; historical applied version retrievable.
- Validation: hourly/annual pay cases, job-size settings snapshot, archived linked content and stale version publish.

### P11 — Candidate profile, visibility and reviewed eligibility

- Outputs: draft onboarding, restricted private inputs, structured availability/location, safe profile preview, review queue and approved versions.
- Depends on: P07–P08; production eligibility policy decision before real data.
- Acceptance: no photo field; identity fields separated; raw text cannot bypass approval; hidden candidates excluded from discovery; home/term location supported.
- Validation: identity-rich free text, no-work-experience profile, private field serialization and edited-version isolation.

### P12 — Resume intake and manual blind-document review

- Outputs: private upload/quarantine, scanning, structured manual review UI, clean generated blind PDF and candidate approval.
- Depends on: P03, P08, P11.
- Acceptance: optional resume never blocks initial browsing; worker handles errors visibly; exact approved version required; metadata clean; candidate can request correction.
- Validation: PDF/DOCX fixture corpus, file limits, malware test mechanism in isolated environment, output rendering/text extraction and unauthorized downloads.

### P13 — Candidate preferences and ranking engine

- Outputs: pure eligibility input/output boundary, normalized ranking, reason codes, seeded exploration, commute adapter interface.
- Depends on: P10–P11.
- Acceptance: no identity in ranking inputs; documented unknown-value behaviour; preferences never silently relaxed; explanation reflects score components; commute marked estimated.
- Validation: deterministic fixtures, missing attributes, overnight availability, illegal/incompatible jobs excluded and pagination stability.

### P14 — Candidate job deck and actions

- Outputs: mobile deck, details, apply/pass/save buttons and gestures, filter sheet, quota/session/undo UX.
- Depends on: P10, P13.
- Acceptance: accessible controls equal gestures; save independent of apply; stale/closed jobs fail safely; quota atomic across devices; applied snapshot persisted.
- Validation: concurrent actions, offline retry, session reset abuse and one-undo policy.

### P15 — Employer deck and mutual matching

- Outputs: job-scoped candidate references, employer interest, applied badge, invitation prioritization and atomic match creation.
- Depends on: P09, P11, P14.
- Acceptance: only eligible discoverable cards; no candidate global ID leaks; one match despite concurrent swipes; employer invitation alone opens no chat; blocked/passed jobs respect policy.
- Validation: concurrency test, unrelated card reference reuse and repeated interest transitions.

### P16 — Application timeline, simple pipeline and withdrawal

- Outputs: candidate application list, employer list/board projection, withdrawal and meaningful empty states.
- Depends on: P15.
- Acceptance: client cannot set arbitrary stages; withdrawal terminal, discovery/communications/grants update consistently; anonymous withdrawn record reveals no new data.
- Validation: withdrawal at each lifecycle point, authorization after withdrawal and stale board actions.

### P17 — Notification foundation and match delivery

- Outputs: email templates, push registration, user preferences, deep links and delivery reporting.
- Depends on: P08, P15.
- Acceptance: messages have no identifying candidate content before reveal; only intended user receives push; retries deduplicate; device reassignment clears old ownership.
- Validation: bounced email, invalid push token, wrong-account deep link and provider timeout.

### P18 — Masked chat, reports and blocking

- Outputs: safe messaging pipeline, private realtime invalidations, sender mask/revision UI, report queue and moderation controls.
- Depends on: P08, P16–P17.
- Acceptance: raw message never reaches peer; scanner outage blocks unsafe send; block takes effect server-side; moderator access scoped and logged.
- Validation: Unicode/obfuscated contacts, names and URLs, duplicate send, removed seat and unauthorized subscriptions.

### P19 — Interview availability and transactional booking

- Outputs: recurring windows/exceptions, materialized slots, reservation constraints, candidate booking/reschedule/cancel UI.
- Depends on: P16.
- Acceptance: no interviewer/candidate double booking across jobs; explicit timezone; reschedule invalidates old booking version; no private external calendar data shown.
- Validation: simultaneous reservation, overlapping slots, buffers and DST gap/overlap fixtures.

### P20 — Calendar invites and reminders

- Outputs: privacy-safe ICS, confirmation/reminder jobs and stale-version cancellation.
- Depends on: P17, P19.
- Acceptance: no name/email leakage in employer calendar metadata; stable UID/versioned updates; late booking does not emit old reminders; reconciler catches missed schedules.
- Validation: parse generated ICS, reschedule around reminder time, cancellation and duplicate delivery.

### P21 — Production-shaped first audio interview

- Outputs: lobbies/call screens, server token grants, verified callbacks, attendance reconciliation, completion/dispute workflow.
- Depends on: P02, P18–P20.
- Acceptance: microphone-only enforced independently of UI; withdrawn member cannot join; active sessions removed when necessary; confirmed completion has real evidence; accommodations protocol exists.
- Validation: actual devices, token replay/wrong room, forged/reordered callbacks, absent participant and network interruption.

### P22 — Structured scorecards

- Outputs: frozen question snapshot, employer drafts, submission lock, supplemental correction record.
- Depends on: P21.
- Acceptance: incomplete/disputed interview cannot unlock normal submission/reveal; all question IDs and 1–5 values valid; final record immutable; candidate cannot read private notes.
- Validation: wrong job questions, competing recruiter edits and mutation attempts after submission.

### P23 — Candidate authorization and reveal transaction

- Outputs: sharing preview, exact document/identity/recipient consent, grant routine, withdrawal/revocation handling.
- Depends on: P12, P16, P22; disclosure policy before real sharing.
- Acceptance: every prerequisite enforced in one transaction; permanent eligibility privacy preserved; grant scope cannot expand silently; candidate notice created atomically with grant intent.
- Validation: authorization matrix, changed document/recipient, same-ID other application, concurrent reveal/withdraw and duplicate command.

### P24 — Reveal downloads, PDF summary and email

- Outputs: protected stream, candidate PDF fallback, employer summary, planned attachment/link delivery adapter and sharing notice.
- Depends on: P03, P17, P23; attachment policy decision for live delivery.
- Acceptance: files/fields match exact approved scope; candidate never receives employer private notes; team removal/revocation blocks new downloads; ambiguous send reconciled before retry.
- Validation: source/reveal file confusion, neutral filenames before reveal, no-DOCX-as-PDF mismatch, revoked send and actual staging mailbox inspection.

### P25 — Decisions, external interviews and outcome deadlines

- Outputs: explicit employer outcomes, external-interview logging, durable deadline ledger, day-30 reminders and truthful notice workflow.
- Depends on: P17, P21, P23.
- Acceptance: old overdue obligation survives a later interview; no auto-rejection; no unconfirmed “no decision” claim; delivery failures escalated; statements archived.
- Validation: interviews fewer/more than 45 days apart, missing employer response, bounce, withdrawal policy and duplicate due jobs.

### P26 — Export, deletion, retention and sharing history

- Outputs: request screens/workers, per-category purge/isolation, retention holds, controlled export download, candidate disclosure history.
- Depends on: P08, P12, P23–P25; reviewed retention schedule.
- Acceptance: account hidden promptly; no unsafe cascade; retained archives inaccessible to ordinary employer browsing; export link bound to reauthenticated owner.
- Validation: delete with outstanding obligations, expired export, backup tombstone design and revoked grant restoration fixture.

### P27 — Trust operations and fraud-policy publishing

- Outputs: visible fraud controls/policy, case assignment, employer suspension, delivery/deadline dashboards and audit tools.
- Depends on: P09, P18, P25–P26.
- Acceptance: support can operate beta without direct broad database edits; suspended organization loses candidate access; reporter identity restricted; policy versions retained.
- Validation: scam-company drill, least-privilege staff matrix, failed job replay and deadline incident drill.

### P28 — End-to-end privacy/security verification

- Outputs: test suite covering the security matrix, sanitized artifacts, race/failure reports and fixed findings.
- Depends on: P09–P27.
- Acceptance: all critical access and disclosure tests pass, no known identity leaks in PDF/email/ICS/Realtime/HTML/logging; replay/restore does not resend old disclosures.
- Validation: both sides of a complete hiring flow, adversarial unrelated users and provider failures.

### P29 — Device usability, accessibility and release builds

- Outputs: TestFlight/Android internal builds, accessible action paths, support materials and permission/store declarations for selected features.
- Depends on: P28.
- Acceptance: actual-device flows work; calls recover; no swipe-only action; privacy policy and support accessible; new native runtime verified before release.
- Validation: screen reader, enlarged text, reduced motion, network transitions and clean install/update.

### P30 — Operate limited beta and evaluate expansion

- Outputs: selected employer/candidate cohort, monitoring dashboards, onboarding/support process, documented gate review.
- Depends on: P29 and unresolved production-policy decisions.
- Acceptance: live supply is relevant to cohort, operator can handle review/support load, no critical unresolved security issue, true completion/delivery metrics collected.
- Validation: small staged cohort before 200-person beta; evaluate original launch targets with eligible-deck coverage and failure rates. Public launch is a separate release decision.

## Expansion tickets

| ID | Feature | Prerequisites | Acceptance focus |
|---|---|---|---|
| E01 | Automated resume redaction | P12 corpus and measured human-review process | Structured extraction, identity leak evaluation, candidate approval retained, manual fallback |
| E02 | Broader employer discovery | P15 and explicit candidate opt-in if initially applicant-only | Private visibility, invite quotas, exposure balance, employer response evidence |
| E03 | Round-two video | P23 and separate call policy | Different room grants, authorized participants, optional external scheduling |
| E04 | Seasonal campaigns and GTA expansion | Demonstrated local supply and opt-in notifications | Region/date-aware jobs, no irrelevant mass notifications |
| E05 | Contextual candidate ads | Post-beta decision, network/minors/privacy review | Sponsored type separate from jobs, blocked categories, no sensitive audience targeting |
| E06 | CSV and ATS exports | Explicit employer entitlement, candidate disclosure scope, vendor contracts | Export audit, idempotency, recipient mapping, revocation limits explained |
| E07 | Premium seats/jobs or campus accounts | Pricing validation and recruiting/licensing review | Entitlement checks; candidates never pay for ranking |
| E08 | Async interviews | Separate product validation and recording/privacy/accessibility design | Recording consent, retention, deletion and assessment rules specified before coding |

## Planning estimates

These are rough engineering ranges, not promises or industry benchmarks. They exclude employer recruitment, legal review, design research and most ongoing beta support.

| Workstream | Estimated focused hours |
|---|---:|
| Decisions, spikes, scaffold, auth, database boundaries | 45–70 |
| Employers, jobs, candidate profiles and manual document tooling | 55–85 |
| Decks, matching, pipeline, chat and notifications | 45–70 |
| Scheduling, device calls and scorecards | 45–75 |
| Disclosure, delivery, notices, privacy and trust operations | 55–85 |
| Integrated security, device testing and beta release fixes | 35–55 |
| Total planned beta engineering | **280–440** |

At 15–20 hours/week this is approximately 14–30 weeks of focused engineering before acquisition/support time. Reduce confidence further if the stack is new or the call/document spikes reveal problems. Re-estimate after P03 and after the first complete vertical slice. The original ~190-hour plan needs explicit scope cuts to be credible.

Potential cuts, requiring a deliberate product choice: applicant-only employer deck; manual structured resume creation; simple list pipeline; email-only auth; link-only reveal delivery; one location/region rollout; responsive web pilot instead of native first. Do not cut authorization, truthful notices, fraud reporting, candidate control or accessibility basics to preserve a date.

## Definition of done for each feature

- A user can complete the intended action and recover from expected failures.
- Request/response schemas and permissions are enforced server-side.
- Database migration, constraints and relevant negative authorization tests exist.
- Side effects are idempotent/reconcilable; no stale worker broadens permission.
- Sensitive data is absent from inappropriate outputs and logs.
- Loading, empty, error, blocked and stale states are implemented.
- Relevant tests pass; docs and operational handling reflect actual behaviour.

## First implementation batch

Start P01–P04, then P05–P08. The first coding milestone is local infrastructure and an executable permission model with synthetic fixtures. Do not begin by generating dozens of UI screens against an unreviewed all-purpose candidate table.
