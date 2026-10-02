# Product scope and decision register

## Outcome and non-negotiable invariants

Enable a candidate and employer to move from mutual interest to a structured first interview before the platform releases identifying information.

1. Employers receive approved blind data before reveal, never raw profile drafts or original resume files.
2. Date of birth and precise location never enter any employer response, including after reveal.
3. A first-round room permits microphone publishing only. Recording is disabled.
4. Reveal requires an eligible completed interview, a locked scorecard, valid candidate sharing authorization, and an active application.
5. Candidate withdrawal prevents future authorized dashboard access and further sharing. Already delivered attachments and downloaded files cannot be recalled.
6. Employer team membership, business verification, and application access are checked on the server and at database boundaries.
7. Ranking does not read identity, school name, birth date, or raw resume text. Legal eligibility filtering is a separate operation.
8. Client assertions never establish verification, interview completion, scorecard submission time, or reveal entitlement.
9. Every privileged state change is attributable and retry-safe.
10. The product promises platform-controlled identity concealment, not that voice or candidate speech can never reveal identity.

## Decision register

| ID | Topic | Planning baseline | Status / consequence |
|---|---|---|---|
| D01 | Clients | Expo + Expo Router candidate app; Next.js employer dashboard | Required; a responsive candidate-web beta was suggested but not accepted |
| D02 | Backend | Supabase Auth/Postgres/Storage/Realtime; Next.js API | Required |
| D03 | Shared code | TypeScript, pnpm, Turborepo, Zod contracts | Required |
| D04 | Scope | Waterloo first, GTA supported in the model | Original regional scope retained; staged rollout proposed |
| D05 | Ages | Product supports minors; production collection method unresolved | No silent switch to an 18+ product; adult-only pilot is an option awaiting decision |
| D06 | Interview | LiveKit audio round one, no recording; optional round-two video later | Required |
| D07 | Reveal consent | Per-application authorization covering recipient and document version | Proposed explicit confirmation after interview; legal review before launch |
| D08 | School disclosure | Original plan reveals school after interview | Unresolved legal/product question; implement separately controllable field projection |
| D09 | Resume delivery | Email with PDF attachment plus authenticated dashboard link | Original requirement retained; secure-link-only beta proposed, not assumed accepted |
| D10 | Resume processing | Structured regeneration, candidate approval | Required; manual review permitted for beta |
| D11 | Background execution | Inngest orchestration with transactional database outbox | Proposed selection over Trigger.dev; verify runtime fit in a small spike |
| D12 | Accounts | Email-based authentication first; phone login later | Proposed beta simplification; contact phone still supported |
| D13 | Employer discovery | Job-specific applicant and discovery decks | Required full scope; applicant-only beta is optional scope reduction |
| D14 | Monetization | Free core product; no employer ads; candidate ads after beta | Required; billing is not part of beta |
| D15 | Ranking | Initial documented weights, deterministic and explainable | Required starting hypothesis; weights versioned, never portrayed as validated |
| D16 | Application reset | Withdrawal terminal for that application; no automatic reapplication | Proposed; future explicit reapply creates a new generation |
| D17 | Reveal recipient | Active authorized employer team members for that application | Proposed; candidate names the organization in consent, sees recipients at send time |
| D18 | Resume originals | Accept PDF/DOCX, generate PDF delivery for DOCX | Required conversion resolution; original DOCX cannot be emailed as an unchanged PDF |
| D19 | Accessibility | Screen-reader/button parity; accommodation path for first interview | Required operationally; approved accommodation protocol unresolved |
| D20 | Date | March 1, 2027 target | Readiness gate takes precedence over automatic public opening |

A flag may select a legally reviewed policy, but must never create a bypass around reveal, age privacy, or authorization.

## Requirement traceability

| ID | Capability | First delivery | Primary modules | Proof of completion |
|---|---|---|---|---|
| R01 | Signup, recovery, sessions | Beta | auth, accounts | Cross-client login and revoked-session tests |
| R02 | Blind profile, optional school verification, visibility | Beta | profiles, verification | Draft edits cannot leak into published cards |
| R03 | Private eligibility and location | Beta, legal gate | eligibility, identity | No restricted fields in employer DTOs |
| R04 | Employer organization, verification, seats | Beta | organizations, trust | Unverified and removed members cannot browse |
| R05 | Job form, versioning, rules, expiry | Beta | jobs, policy | Invalid publishing rejected; historical versions retained |
| R06 | Job and candidate decks, pass/apply/save/undo | Beta | discovery, interest | Gesture and accessible controls produce same result |
| R07 | Mutual interest, invitations, withdrawal | Beta | applications | Concurrent right-swipes create one match |
| R08 | Masked anonymous chat, report/block | Beta | messaging, moderation | Only approved display text reaches recipients |
| R09 | Upload, blind resume generation, approval | Beta manual; automate later | documents | Employer cannot fetch unapproved or original file |
| R10 | Slots, booking, cancellation, reminders, ICS | Beta | scheduling, notifications | Booking conflicts and DST handled |
| R11 | Blind audio, attendance, structured questions | Beta | interviews | Camera and screen-share publishing denied server-side |
| R12 | Locked scorecards, reveal, summary and delivery | Beta | evaluation, disclosure | Reveal denied for missing prerequisites |
| R13 | Pipeline, decisions and outcome notices | Beta | applications, compliance | Deadlines reconciled; no invented employer decision |
| R14 | Private storage, audit, consent, export/delete | Beta | privacy, audit | Access revoked and retention exceptions explained |
| R15 | Trust operations and support | Beta | admin, moderation | Fraud report resolved through logged workflow |
| R16 | Push/email, diagnostics, product metrics | Beta | notifications, telemetry | Failures retry; no identity in third-party telemetry |
| R17 | Seasonal availability and reactivation | Beta basic; later campaigns | profiles, discovery | Hidden candidates cannot appear in discovery |
| R18 | Round-two video | Expansion | interviews | Requires previous reveal and specific consent |
| R19 | Candidate contextual sponsored cards | Expansion | advertising | No ads in chat/interview/reveal; minors policy gate |
| R20 | ATS, CSV, blind email exports | Expansion | exports | Explicit scope and disclosure audit per export |
| R21 | Campus partnerships / employer paid tiers | Future decision | entitlements | No candidate paid ranking |
| R22 | Asynchronous interviews | Future design | interviews | Separate consent, retention, accessibility design first |

## Behaviour to settle before implementation reaches it

- Are school names held until an offer, or shared at the first reveal? This affects resume generation as well as JSON fields.
- Does a candidate authorize automatic future reveal in advance, or confirm it after the interview? Blueprint defaults to the latter.
- Are attachments mandatory in beta? Their irreversibility must be accepted in the sharing screen.
- Which age evidence is collected, and what is the reviewed policy for minors? Age bands require an update mechanism; they do not age automatically.
- Who receives the reveal email: assigned interviewer, recruiting owner, or selected current seats? Proposed: explicitly selected active members, shown to candidate.
- Is “one undo per session” worth a server session model? Proposed session: deck session ID, ending after 30 minutes of inactivity; allowance never resets quota.
- What constitutes an adequate completed interview, including accommodations and disputes? Duration is evidence, not proof of quality.
- What does a candidate's work-authorization answer mean for restricted jobs? A yes/no response must not be represented as a complete legal entitlement assessment.
- Can employers inspect any eligible active profile before an application? If yes, candidates need explicit discoverability controls.

## Launch measurement

Track completed blind interviews per week, unique participating employers, application-to-match rate, match-to-completed-interview rate, interview-to-reveal rate, reveal-to-recorded-offer rate, and fulfilled notification obligations.

Define cohorts and observation windows. Time-to-first-match includes users who never matched as censored/unmatched, not silently omitted. Match-to-interview is measured after a stated window, not against yesterday's matches. Exposure events distinguish not shown from rejected. Offer outcomes are employer/candidate reports, not independently verified hires.

Launch gate also examines eligible jobs per active candidate, interested candidates per vacancy, unresolved safety reports, blocked deliveries, and interview reliability. The original numeric targets are hypotheses. A 200-person closed beta and a 300-active-candidate public gate require an explicit staged expansion, not contradictory acceptance criteria.
