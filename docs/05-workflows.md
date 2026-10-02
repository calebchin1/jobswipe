# State transitions and background workflows

## General transaction pattern

1. Authenticate actor and validate input.
2. Open transaction; lock affected aggregate/reservation rows in stable order.
3. Recheck current permissions, prerequisites and expected version inside the transaction.
4. Write state, immutable audit entry and outbox event together.
5. Commit and return the resulting projection.
6. Dispatcher leases pending outbox rows and hands events to the workflow runner.
7. Consumer deduplicates by event/business key, rechecks revocable authorization, executes the side effect, and records the result.

Delivery is at least once; exactly-once external effects cannot be promised. Use provider idempotency where available, otherwise keep an attempt ledger and reconcile ambiguous outcomes before retrying. A worker crash after dispatch but before acknowledgement must not send a second resume blindly.

## Interest and matching

```text
Candidate right -> create application (applied snapshot retained)
Employer right  -> store job-specific employer interest
Both interested + currently eligible + open job -> one match
Candidate left  -> pass (no application)
Employer left   -> pass (no match)
Save           -> independent bookmark
Withdraw       -> terminal application withdrawal and access revocation
```

Job closed, suspended company, blocked user, inactive candidate or changed legal eligibility prevents new match creation. Recheck on mutation even if a stale card remains on-screen. Existing application history remains governed by its access policy.

Proposed undo rule: undo only the latest swipe in that deck session before it has produced a mutual match or subsequent action. An interested swipe that created an unmatched application may be undone as a recorded withdrawal; repeated application requires explicit reapply policy. A pass can return to unseen. Undo never erases audit records or refunds daily right-swipe quotas. UI explains when withdrawal replaces undo.

Daily candidate quota starts at the proposed 25 interested actions, configurable by policy. Use a published reset timezone (proposed America/Toronto launch time); count server-side across devices and sessions. Employer per-job quota remains a product parameter, not a hardcoded invented number. Rate limits are separate from product quotas.

Employer invitations lift a job in a candidate deck only if the job meets hard filters and the candidate has not explicitly passed/blocked it under the current policy. An invitation is not a match and never unlocks chat or identity.

## Deck ordering

1. Determine legally reviewed eligibility server-side.
2. Filter job type, candidate-selected pay floor, schedule compatibility, location/travel constraints, open dates and visibility.
3. Compute normalized skill overlap (0.50), availability overlap (0.20), commute (0.15), freshness (0.15) from safe structured data.
4. Prefer applicants on employer decks and employer interest on candidate decks within eligible results.
5. Proposed: one in ten positions samples eligible candidates/jobs from a broader quality band, using a seeded rotation for stable pagination.
6. Apply documented response-history adjustment only after enough observations; new employers do not begin penalized.
7. Return human-readable reasons without legal-age cutoffs or hidden attributes.

Missing skills/availability/commute data have explicit neutral/unknown behaviour; do not divide by zero or treat unknown as guaranteed incompatibility. Candidate hard preferences are never relaxed silently. Normalize compensation across periods only using documented hours assumptions. Commute estimates include travel mode and timestamp; no invented precision.

Ranking version, weight configuration and reason generation are tested together. Fit score is a ranking heuristic, not a probability of success. Hidden variables may affect eligibility but are not passed into the ranking function.

## Profile and resume publication

```text
profile draft -> submitted -> review -> candidate preview -> published version
                                 \-> needs changes / rejected

upload initiated -> quarantined -> file scan -> extraction
  -> structured draft -> redaction/manual review -> clean PDF generation
  -> candidate preview -> approval of exact version -> available blind artifact
```

- Upload cap proposed: 10 MiB, PDF or DOCX only; verify actual signature and reject encrypted/password-protected files initially.
- Scan before extraction; isolate parsers with resource/time/network limits. Handle malformed PDFs, oversized page counts, archives and DOCX zip bombs.
- Treat document text as untrusted data, including instructions embedded in a resume. A model may extract fields but cannot invoke tools or authorize publication.
- For beta, human reviewers can build structured blind data from a scanned source; candidate approval is still required.
- Remove names, contacts, precise addresses, school names, profile links and reviewed identity-signalling organizations from blind outputs. Human review checks contextual leaks and preserves substantive accomplishments.
- Re-typeset with fixed metadata, safe fonts and no original text layers, annotations, hyperlinks or embedded attachments. Verify extracted output text as well as rendered pages.
- Profile-generated reveal PDFs support candidates without resumes. DOCX sources convert to candidate-previewed PDF; never call conversion “unchanged original PDF.”
- A candidate edits a new draft without changing a currently published safe version. New source/document versions do not inherit prior approval or disclosure consent.
- If school or age information must remain withheld after reveal, the reveal artifact must also remove it. An unmodified full resume cannot satisfy a conflicting permanent non-disclosure promise; resolve and describe the selected policy before enabling attachments.
- Employer blind resume access begins after match, as in the original plan. Approved profile cards can be available earlier through eligibility/visibility controls.

## Anonymous messaging

Before reveal: validate size, normalize Unicode, detect email/phone/links and high-confidence identity patterns, then either mask and confirm with sender or request revision. Names cannot be detected perfectly. Do not present a classifier as an anonymity guarantee.

Persist and broadcast only approved display text. If the safety processor is unavailable, return a retry/needs-revision state rather than sending the original. Keep raw text only if a defined moderation purpose requires it, under restricted short retention.

No attachments or arbitrary links in pre-reveal chat initially. Any future attachment support requires document-style scanning and identity controls. Block/report is available at every conversation. After withdrawal, sending and new interview tokens stop; candidate's own history may remain read-only according to retention policy.

Realtime messages are private invalidation events with minimal IDs, not identity-bearing database row broadcasts. Refetch through the API. Channel membership and removal must be tested; no raw private-table replication to clients.

## Scheduling and calls

```text
matched -> slot booked -> scheduled -> in progress -> awaiting confirmation
                                             \-> completed
                                             \-> disputed / interrupted
scheduled -> cancelled / rescheduled / no-show
completed -> scorecard submitted -> eligible for reveal request
```

Booking resolves a server-owned slot, locks interviewer and candidate calendars, reserves buffered ranges, writes the interview and reminders, and emits a booking event. Two simultaneous bookings must not both succeed. Store UTC instants and original IANA timezone; test ambiguous/missing local times during DST.

Reschedule increments `booking_version`; workers skip reminders for obsolete versions. ICS uses a stable UID and incremented sequence. Invites are sent separately to each side, with no real candidate name/email in attendee lists, organizer fields, event description, attachment filenames or employer-facing scheduling metadata.

Reminders at 24 hours and 1 hour are scheduled only if still in the future. Last-minute booking sends a confirmation without replaying expired reminders. A periodic reconciliation catches missed scheduling jobs.

Proposed join window: ten minutes before through thirty minutes after planned end, configurable after testing. Tokens are short-lived and scoped to room/participant; validate actual provider expiry/reconnection behaviour. Token expiry alone is not sufficient to end an existing connection: withdrawal/suspension actively removes participants and closes access through the provider.

LiveKit events establish presence and overlapping attendance, not interview quality. Completion requires reconciled attendance plus the agreed confirmation policy. Proposed beta: both sides confirm completion; disagreement enters manual review and blocks reveal. An alternative accommodation must have an auditable approved completion process. No automatic reveal on a room-ended event.

Round one never allows camera/screen-share sources. Do not put identity in room metadata or SDK display names. Disable recording/egress creation and do not integrate transcript processing. Bluetooth, denied microphone permission, calls interrupted by phone calls, weak networks and app backgrounding need device tests.

## Scorecard, authorization and reveal

```text
completed interview
  -> employer locks scores against frozen questions
  -> employer requests reveal and selects permitted recipient scope
  -> candidate previews exact fields, PDF and attachment consequences
  -> candidate authorizes
  -> reveal transaction validates all prerequisites
  -> grant + snapshot + audit + outbox commit together
  -> delivery worker rechecks grant and consent
  -> employer email / candidate sharing notice
```

The grant routine validates the interview, submitted scorecard, candidate ownership, document approval, identity revision, current recipient scope, company status and absence of withdrawal/revocation. User-supplied document/scorecard IDs must belong to the same application. Fail closed on any mismatch.

Locked scores cannot be overwritten. Later evaluators or corrections create attributed supplemental records; they never replace the pre-reveal assessment. An employer can reject after interviewing without a reveal, while still completing the required scorecard and truthful status update.

A reveal worker uses a neutral subject until it is authorized to include the name. With attachments enabled, the original planned subject and PDF are permitted only within the candidate's agreed scope. Include the employer's own scorecard summary only in employer delivery; candidate notice states what was shared and with whom.

Do not promise atomic revocation across the database and an external email provider. Before provider acceptance, cancel pending work if withdrawn. Once a send is in flight or accepted, sharing may be irreversible; record that state accurately. For strict immediate cutoff, only authenticated links support blocking subsequent fetches. Saved/emailed copies remain outside technical control.

Repeated authorization must not fan out duplicate messages. Same authorization/document/recipient/channel uses a stable dedupe key. New recipient or artifact requires the applicable new authorization, not a silent retry with expanded content.

## Hiring updates and deadline accounting

Maintain deadlines as records tied to interview events, not a single reschedulable timer. The legal rule concerns whether a hiring decision has been made; it does not force a final decision by day 45.

- A qualifying completed interview creates a provisional deadline.
- A subsequent qualifying interview before the current deadline may update the applicable last-interview basis according to the reviewed policy. Retain the historical basis and supersession reason.
- A later interview after an earlier obligation fell due never erases that obligation.
- Cancelled/no-show appointments do not count as completed interviews; distinguish rescheduling from a new interview.
- Employers must log external later interviews and changes of hiring status. The system cannot observe their private recruiting tools automatically.
- At day 30, request an employer update. At an earlier-than-deadline dispatch buffer, send the currently confirmed status if available.
- If status is unknown, escalate to operations. Do not manufacture “no decision yet” or “rejected.” A platform non-response notice may explain silence, but is not counted as a verified employer compliance notice.
- Record contents, recipient, basis and delivery attempts. A queued or bounced email is not assumed successfully delivered.

Business-day/calendar-day calculation, withdrawal effects and external-interview classification receive legal review. Until then, fixtures exercise conservative retention of outstanding obligations.

## Worker inventory

| Worker | Trigger | Idempotency / stale-work guard |
|---|---|---|
| Outbox dispatcher | Frequent scheduled drain | Lease and event ID; replay supported |
| Profile review | Submitted draft | Draft revision; new edit invalidates pending result |
| Resume scan/extract/render | Completed upload | Source checksum + pipeline version |
| Match notification | Match event | Application/channel/recipient key |
| Interview confirmation/ICS | Booking/reschedule | Interview booking version |
| Reminder | Due timestamp | Active booking version and participant status |
| Attendance reconciler | Provider events + periodic repair | Provider event ID; late/out-of-order evidence |
| Reveal delivery | Grant event | Active exact grant + approved version + recipient scope |
| Outcome notices | Daily/frequent due scan | Deadline + statement version + recipient |
| Privacy export | User request | Request ID, fresh reauthentication for download |
| Deletion/retention | User request or daily sweep | Category policy + holds; no unsafe cascades |
| Job expiry | closes_at | Current job state/version |
| Seasonal availability | Available date | Opt-in preference and current discovery state |
| Delivery reconciliation | Provider callback / poll | Provider ID and logical delivery key |

Retries use bounded exponential backoff with jitter. Permanent validation/permission failures are not retried indefinitely. Exhausted jobs become visible to operations with safe reason codes, alert thresholds and a replay action that revalidates current permission.
