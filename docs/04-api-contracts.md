# API and shared contracts

All paths below are planned under `/api/v1` unless explicitly provider-facing. These are implementation contracts, not working endpoints. Each route requires a Zod request schema, response schema, authorization rule, rate class, error cases and integration test before it is considered complete.

## Common protocol

- JSON requests/responses except signed upload initiation and protected file streaming.
- Verify bearer authentication for mobile and server session cookies for web. Cookie-authenticated mutations require same-origin/CSRF protection; CORS is not an authorization mechanism.
- Actors come from verified sessions. Never accept `actor_id`, verification flags, reveal timestamps or scorecard submission timestamps as authoritative request input.
- Mutation requests carry `Idempotency-Key` where repeated execution has effects. Same actor/route/key with different content returns `409 IDEMPOTENCY_CONFLICT`.
- Mutable aggregates use `expectedVersion`; stale writes return `409 VERSION_CONFLICT`. Database transactions enforce it.
- Cursor pagination, default 20, maximum 50 as proposed starting limits; opaque cursor tied to filters and sort version. No unbounded list endpoints.
- Errors: `{ error: { code, message, fieldErrors?, requestId, retryAfterSeconds? } }`. Never return stack traces, SQL, signed file URLs or secret eligibility details.
- Standard statuses: 400 malformed, 401 no valid session, 403 known forbidden action, 404 unavailable resource where existence is sensitive, 409 state conflict, 422 validation failure, 429 quota, 503 temporary dependency failure.
- All identity, messages, scorecards, candidate decks and private downloads return `Cache-Control: private, no-store`. Public job pages may cache only safe published projections.
- API timestamps are ISO 8601 UTC; durations and currency units are explicit in property names.
- API output is allowlisted with schemas; never serialize `SELECT *` results directly.

## Shared DTO sketches

```ts
type ActorContext = {
  userId: UserId;
  accountStatus: 'active' | 'suspended' | 'deleting';
  // Constructed server-side; not accepted from clients.
};

type BlindCandidateCard = {
  cardRef: CandidateCardRef; // scoped to job, never auth user ID
  handle: string;
  headline: string;
  education: { level: EducationLevel; field: string; status: StudyStatus };
  impactBullets: string[]; // at most three, max 140 chars each
  skills: SkillTag[]; // max eight
  experienceBand: string;
  availabilitySummary: string;
  commute: { band: string; mode: TravelMode; estimated: boolean } | null;
  studentVerified: boolean;
  applied: boolean;
  explanation: { code: FitReason; text: string }[];
  profileVersion: string;
};

type Compensation = {
  currency: 'CAD';
  period: 'hour' | 'year' | 'week' | 'month';
  minimumMinor: number;
  maximumMinor: number;
  expectedHoursPerWeek?: { min: number; max: number };
  commissionDescription?: string;
  additionalComponents?: string[];
};

type CandidateApplication = {
  applicationId: ApplicationId;
  job: JobSummary;
  state: ApplicationDisplayState;
  events: CandidateSafeTimelineEvent[];
  nextAction: CandidateNextAction | null;
  revealStatus: 'hidden' | 'authorization_requested' | 'authorized' | 'shared' | 'revoked';
  version: number;
};

type RevealedIdentity = {
  revealId: RevealId;
  displayName: string;
  email: string;
  phone?: string;
  schoolName?: string; // only under the selected reviewed disclosure policy
  resumeDownloadPath: string; // authenticated API path, not signed object URL
  sharedAt: string;
};
```

Field limits: headline 60; bullets up to 3 × 140; skills up to 8. Draft profiles may be incomplete; publishing requires the selected minimum completion rule. Exactly three impact bullets must not become a barrier to a first-time worker: whether one or three are required is a product decision. No DOB, raw postal code, school email, school name, graduation year, original filename or globally correlatable candidate ID in a blind card.

`StudyStatus`, skill taxonomy, job types, availability ranges and reason codes are versioned enumerations. School-free text still requires review. `RevealedIdentity` is a separate DTO; do not toggle hidden fields on one all-purpose profile response.

## Accounts, candidate profile and privacy

| Method / path | Input / output | Authorization and special behaviour |
|---|---|---|
| GET `/me` | Safe account, roles, setup progress | Own active session |
| POST `/me/roles` | Requested candidate/employer enrollment | Server creates allowed role only; cannot request admin |
| GET/PATCH `/candidate/profile` | Own draft, expectedVersion | Candidate owner; editing never republishes automatically |
| POST `/candidate/profile/submit` | Draft version → review ticket | Validate constraints; manual or automated safe pipeline |
| GET `/candidate/profile/published` | Own approved card preview | Candidate owner |
| PATCH `/candidate/discovery` | Visibility, availableFrom, preferences | Valid settings; does not withdraw existing applications |
| PUT `/candidate/eligibility` | Legally approved evidence schema | Owner only; never echoes sensitive evidence in generic DTO |
| PUT `/candidate/locations` | Term/home location, travel mode | Owner; return summary without coordinates by default |
| POST `/candidate/student-verification` | School email verification request | Rate-limited; no school domain exposed to employers |
| POST `/candidate/student-verification/confirm` | One-use token | Bind token to signed-in owner |
| PUT `/me/devices/:deviceRef` | Push token/platform | Device token owner; revoke on logout/reassignment |
| PATCH `/me/notification-preferences` | Purpose/channel settings | Essential notices distinguished from optional campaigns |
| POST `/me/privacy/export` | Scope → request reference | Reauthentication; async result through authenticated download |
| POST `/me/privacy/delete` | Confirmation → deletion request | Reauthentication; hide profile immediately, queue retention-aware deletion |
| GET `/me/privacy/requests/:id` | Safe progress and exceptions | Owner only |

Supabase handles signup, login, recovery, email verification and session refresh using its supported clients. Wrap application onboarding around these flows; do not implement a competing password store. Account enumeration and abuse protections apply to authentication and verification flows.

## Organizations and jobs

| Method / path | Contract | Guard |
|---|---|---|
| POST `/employers` | Company setup → employer ID | Signed-in employer enrollment; creates owner membership |
| GET/PATCH `/employers/:id` | Public projection or authorized settings | Membership and role for private fields |
| POST `/employers/:id/verification` | Evidence → pending case | Owner; no self-approval |
| GET `/employers/:id/members` | Current seats | Member with appropriate role |
| POST `/employers/:id/invitations` | Email, recruiter/viewer role | Owner; expiry and acceptance protections |
| POST `/employer-invitations/:token/accept` | Accepted membership | Authenticated ownership of invited email |
| PATCH/DELETE `/employers/:id/members/:memberId` | Role/remove | Owner; cannot remove last active owner |
| POST `/employers/:id/ownership-transfer` | New current member, confirmation | Reauthenticate; atomic last-owner protection |
| POST `/employers/:id/jobs` | Draft job → ID/version | Owner/recruiter; unverified may draft |
| GET/PATCH `/jobs/:jobId/draft` | Editable version | Authorized company member |
| POST `/jobs/:jobId/publish` | Draft version → published version | Verified company; validated policy and archived snapshot |
| POST `/jobs/:jobId/pause` | expectedVersion | Owner/recruiter; remove from decks |
| POST `/jobs/:jobId/close` | reason, decisionKnown, expectedVersion | Close job without inventing outcomes for every applicant |
| GET `/jobs/:jobId` | Public open job detail | No recruiter personal contact or private slot information |
| GET `/employers/:id/jobs` | Cursor-filtered management list | Member |
| GET `/jobs/:jobId/versions` | Historical versions | Member; candidate can retrieve applied snapshot separately |

Publish validation includes compensation units, minimum/maximum ordering, reviewed wage policy, vacancy statement, job-specific AI disclosure, prohibited Canadian-experience requirements, workplace eligibility rule and structured questions. Employer age preferences are not accepted as arbitrary hard filters.

## Discovery, interest and applications

| Method / path | Contract | Guard / semantics |
|---|---|---|
| POST `/deck-sessions` | Surface/job → session ID | Owner; employer surface requires verified relevant job |
| GET `/candidate/deck` | Filters/cursor → jobs + reason codes | Candidate eligible and onboarding-ready |
| GET `/jobs/:jobId/candidate-deck` | Mode applicant/discovery, cursor → cards | Verified owner/recruiter; viewer read if explicitly allowed |
| PUT `/jobs/:jobId/candidate-interest` | intent, session ID, expectedVersion | Candidate actor inferred; interested creates application |
| PUT `/jobs/:jobId/employer-interest/:cardRef` | intent, session ID, expectedVersion | Resolve job-scoped card; active recruiter; eligibility rechecked |
| PUT/DELETE `/candidate/saved-jobs/:jobId` | Save/remove | Own saves; no application effect |
| POST `/deck-sessions/:id/undo` | Event ID | Owner; only latest eligible swipe, no match rollback |
| GET `/candidate/applications` | Cursor → own applications | Candidate |
| GET `/jobs/:jobId/applications` | Filters → safe board/list | Relevant employer team |
| GET `/applications/:id` | Actor-specific DTO | Candidate owner or relevant current member |
| POST `/applications/:id/withdraw` | expectedVersion → terminal withdrawal | Candidate; grant revocation and pending-send cancellation |
| POST `/applications/:id/decision` | continue/offer/not_moving_forward, expectedVersion | Employer recruiter; reveal prerequisites apply to offer workflow |
| GET `/applications/:id/applied-job` | Immutable applied snapshot | Either authorized side |

Employer pre-interest can exist without an application. Candidate interest creates an application; mutual interest assigns `matched_at`. The employer sees a withdrawn record only as the minimum retained workflow status, not continuing private profile access.

## Chat, documents and interviews

| Method / path | Contract | Guard / failure mode |
|---|---|---|
| GET `/applications/:id/messages` | Cursor → safe messages | Matched, not blocked/withdrawn; policy for read-only history explicit |
| POST `/applications/:id/messages` | body, clientMessageId → accepted/masked/needs_revision | Active match; scan before persistence/broadcast |
| POST `/applications/:id/block` | Reason category | Participant; suppress further communication immediately |
| POST `/reports` | Target reference, category, narrative | Signed-in reporter; can report a public posting before matching |
| POST `/candidate/resumes/uploads` | MIME, size → one-use upload reference | Owner; file limits; quarantine destination only |
| POST `/candidate/resumes/:id/complete` | Uploaded source reference | Owner; server verifies stored bytes/type/size |
| GET `/candidate/resumes/:id` | Processing state, safe preview metadata | Owner |
| PATCH `/candidate/resumes/:id/structured-draft` | Corrected structured fields | Owner; creates new review version |
| POST `/candidate/resume-versions/:id/approve` | Exact preview version | Owner; scanned/generated/reviewed version only |
| DELETE `/candidate/resumes/:id` | Delete or retention result | Owner; dependent reveal artifacts handled by policy |
| GET `/applications/:id/resume/blind` | Stream approved blind PDF | Candidate or matched employer; current approval |
| PUT `/employers/:id/interview-windows` | Recurring rules + exceptions | Own/interviewer management permission |
| GET `/applications/:id/interview-slots` | Available bookable slot IDs | Matched parties; no unrelated calendar data |
| POST `/applications/:id/interviews` | slotId, expectedVersion | Candidate booking; atomic availability reservation |
| POST `/interviews/:id/reschedule` | newSlotId, expectedVersion | Participant; cancel old reminders, update ICS sequence |
| POST `/interviews/:id/cancel` | reason, expectedVersion | Participant; no reveal or completed-interview inference |
| POST `/interviews/:id/join-token` | Device/session reference | Participant, time window, active booking, no suspension |
| POST `/interviews/:id/completion-confirmation` | completed/disputed | Participant confirmation; cannot alone set attendance evidence |
| GET `/interviews/:id/questions` | Frozen question set | Participant-appropriate version; employer notes excluded |
| PUT `/interviews/:id/scorecard` | Draft answers/notes, expectedVersion | Assigned evaluator or authorized recruiter |
| POST `/interviews/:id/scorecard/submit` | Draft revision | Valid completed interview; locks exact question scores |

Join tokens contain opaque role handles. First-round grants allow microphone source only; no camera, screen share, room administration, recording, or unnecessary arbitrary data publishing. Authorization is independent of any UI camera switch.

## Disclosure, delivery and operational APIs

| Method / path | Contract | Guard |
|---|---|---|
| POST `/applications/:id/reveal-request` | Document requirement + recipient selection | Employer; completed eligible interview and submitted scorecard |
| GET `/applications/:id/reveal-preview` | Candidate's shareable fields, document preview, organization, recipients, attachment warning | Candidate only |
| POST `/applications/:id/reveal-authorization` | Preview version, recipients/scope, policy version, delivery mode | Candidate confirms exact scope; reject changed preview |
| DELETE `/applications/:id/reveal-authorization/:authId` | Revoke | Candidate; dependent grant and pending delivery blocked |
| POST `/applications/:id/reveal` | authorizationId, expectedVersion | Guarded transaction; called by authorized workflow, never grants arbitrary fields |
| GET `/applications/:id/identity` | RevealedIdentity | Current member + active grant + no withdrawal/suspension |
| GET `/applications/:id/resume/revealed` | Protected PDF stream | Same live access checks; record access |
| GET `/applications/:id/reveal-summary` | Profile + employer's scorecard + availability | Authorized employer only; do not send private scorecard to candidate |
| POST `/applications/:id/outcome-update` | Explicit factual hiring-status statement | Employer; timestamp/source retained |
| POST `/admin/verifications/:id/decision` | Verified/rejected/needs_info | Scoped trust operator, reason and audit |
| POST `/admin/document-reviews/:id/decision` | Approve/revise/reject | Assigned document reviewer |
| POST `/admin/reports/:id/actions` | Moderation action | Scoped moderator; audit and affected-user notification policy |
| GET `/admin/operations` | Queues, failed jobs, overdue notices | Operations staff; metadata only |
| POST `/admin/deliveries/:id/retry` | Reason | Operator; same logical delivery idempotency |

Provider routes outside v1: `/api/webhooks/livekit`, `/api/webhooks/resend`, workflow provider handler. Verify signatures against raw bytes, reject replay/duplicates, persist receipts, and process asynchronously. Do not trust provider payload IDs without mapping them to a known internal object.

## Event contract

```ts
type DomainEvent<T> = {
  eventId: string;
  eventType: string;
  schemaVersion: 1;
  occurredAt: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: T; // IDs and safe enums only
};
```

Initial events: `profile.review_requested`, `resume.upload_completed`, `resume.review_ready`, `application.applied`, `application.matched`, `application.withdrawn`, `interview.booked`, `interview.rescheduled`, `interview.cancelled`, `interview.completed`, `scorecard.submitted`, `reveal.authorized`, `reveal.granted`, `reveal.revoked`, `notice.due`, `delivery.failed`, `privacy.deletion_requested`.

Full resumes, names, contact details, raw messages and scorecard notes never enter a workflow event. Consumers fetch the minimum current data with a scoped server operation immediately before use.
