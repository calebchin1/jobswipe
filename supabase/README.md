# Database foundation

This directory implements the executable security, onboarding, posting, query, scheduling, operational review and call-entitlement slices. Connected web/mobile paths use the guarded API; the separately labelled demos retain synthetic local state. PostgreSQL and connected integration verification use **synthetic data only**. This is not a complete backend, production deployment approval, or legal-compliance certification.

## Run the actual PostgreSQL tests

```sh
./supabase/tests/run.sh
```

Requires PostgreSQL 16+ (`psql`, `createdb`, `dropdb`), Bash, and Python 3. Defaults to `PGHOST=/tmp` and `PGPORT=5432`; standard libpq environment variables override the connection. The connected development administrator must be able to create databases and temporary nonsuperuser roles. Never point this runner at a production cluster.

Each run creates a unique `swipe_hire_test_*` database plus two unique `NOLOGIN NOSUPERUSER` roles, rewrites only role identifiers in temporary migration copies, and cleans up the database and roles on exit. No existing database or role is altered. `fixtures.sql` refuses databases without the test prefix. Fixtures contain fictional people, reserved `.invalid` emails, and non-existent document references.

The tests execute real role changes and independent PostgreSQL sessions, covering:

- Own-account RLS and deny-by-default tables, schemas, helpers, and mutation paths.
- Anonymous, missing-session, unrelated candidate, unrelated employer, unverified business, and removed-seat attacks.
- Minimum eligibility filtering and opaque job-scoped card references.
- Idempotent apply/interest, concurrent mutual match, exactly one logical match event.
- Verified attendance/completion and valid, immutable question scores.
- Exact document owner, selected recipient organization, and previewed identity revision consent; an intervening identity edit cannot silently expand authorization.
- Allowlisted identity snapshot projection that never exposes eligibility, private storage paths, or a global candidate ID.
- Company/candidate suspension, seat removal, and terminal withdrawal.
- Grant/outbox rollback together, unique grant and delivery intent.
- A real withdrawal transaction holding the application lock while a competing grant waits, then fails without creating a grant or disclosure event.

The SQL test bootstrap mocks only Supabase's `auth.uid()` using its JWT claim setting. It does **not** test JWT verification, HTTP routing, Supabase Storage, or PostgREST schema configuration. Tests do not prove that UI/provider/privacy integrations are complete.

## Schemas and privileges

- `app`: accounts, organization membership, immutable profile/job versions, applications, interviews, submitted scorecards, authorization and grant records.
- `private`: eligibility bands, identity, job-scoped candidate references, approved document references, frozen reveal snapshots. Never add this schema to Supabase exposed schemas.
- `ops`: append-only audit and minimal-reference transactional outbox. Never expose through PostgREST.

All tables have RLS enabled. `authenticated` gets only `SELECT` on its own account row and `EXECUTE` on the listed workflow RPCs; it receives no direct business-table mutation privileges and no access to private schemas. RPCs derive the actor from `auth.uid()`, reject inactive accounts, use schema-qualified references and an empty search path. Internal helpers and all default function execution are revoked from `PUBLIC`.

Supabase deployment provides the canonical `authenticated` / `anon` roles and `auth.uid()`. Only expose the reviewed `app` RPC schema if using PostgREST; do not expose `private` or `ops`. Preserve the JWT subject through the server-to-database request. Never pass a candidate ID as a substitute for authentication or execute user requests under the migration owner. Default `service_role` privileges are intentionally not granted here; privileged ingestion/admin/worker flows still need dedicated least-privilege adapters.

## Initial RPC contract

| RPC                                                                                                           | Caller                                                    | Result / guarantees                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.list_candidate_cards(p_job uuid)`                                                                        | Active recruiter/owner at verified unsuspended company    | Approved eligible discoverable cards, job-specific `card_id` and handle, safe structured fields, `applied` boolean; no global candidate ID                                                    |
| `app.apply_to_job(p_job uuid)`                                                                                | Active eligible candidate with published approved profile | Application UUID; retries return it; applied job/profile snapshots retained; withdrawal terminal                                                                                              |
| `app.express_employer_interest(p_job uuid, p_card uuid)`                                                      | Active recruiter/owner of that job                        | Application UUID if applied; otherwise SQL NULL means employer interest only                                                                                                                  |
| `app.withdraw_application(p_application uuid)`                                                                | Owning candidate                                          | Void; terminal withdrawal, grants/authorizations revoked, audit/outbox committed together                                                                                                     |
| `app.submit_scorecard(p_interview uuid, p_scores jsonb)`                                                      | Job recruiter/owner                                       | Submitted scorecard UUID; array of `{ "questionId": "q1", "score": 1 }`; every frozen question exactly once, integers 1–5, immutable after submission                                         |
| `app.authorize_reveal(p_application uuid, p_document uuid, p_recipients uuid[], p_identity_revision integer)` | Owning candidate                                          | Authorization UUID after completed interview/scorecard; requires the exact identity revision previewed by the candidate, binds approved document and canonical selected current recipient IDs |
| `app.grant_reveal(p_authorization uuid)`                                                                      | Selected active recruiter/owner                           | Reveal UUID; prerequisites rechecked under application lock; immutable identity snapshot, audit and two unique outbox intents                                                                 |
| `app.read_reveal(p_reveal uuid)`                                                                              | Selected active recruiter/owner                           | `legal_name`, `contact_email`, `phone`, opaque `document_id`; current access rechecked and view audited                                                                                       |

Stable domain failures use SQLSTATE `42501`; malformed scorecards use `22023`. The HTTP adapter must translate these to safe public error codes and must not forward arbitrary SQL diagnostics. UUIDs remain references, never credentials. `read_reveal` returns an opaque document ID; downloading actual bytes requires a separate authenticated stream endpoint that rechecks access.

Card/job and application references are scoped by server checks. A candidate cannot authorize disclosure of another candidate's document. A grant does not confer access on new organization seats: recipients are frozen by user ID and each read checks current membership. Removed members cannot read, even if originally selected. Viewer seats cannot invoke recruiter workflows.

Match writes lock job, then candidate, then existing application. Reveal, withdrawal and submitted scorecards lock the application. Job-level matching serialization is deliberately conservative for this small initial slice; partition locking can be optimized after profiling. Returning an identity response cannot recall bytes a recipient already received. Withdrawal only stops subsequent authorized reads and sharing, and workers must recheck permission immediately before external delivery.

## Deliberately unfinished

The current migrations implement core boundaries and persistent workflows. The following remain incomplete and must not be inferred from table or route names:

- Production email-confirmation/device/session verification, a full operational support UI, membership invitations and administrative role-management RPCs. Own-account provisioning, unverified organization onboarding and scoped business-verification CLI are implemented.
- Real document uploads/scanning/redaction/storage, download streaming or production eligibility collection. Candidate draft submission, scoped human review proposals and exact candidate-approved publication are implemented. Fixture document approval is trusted test setup, not a security scanner.
- Full hard filters (availability, pay preferences, commute, blocks), pass/save/undo, quotas, ranking, and pagination for large employer pipelines. Open jobs have bounded UUID-cursor pagination; candidate/employer application queries are implemented. Application eligibility checks approved active profile, open verified job, fresh synthetic age band and work attestation. Discoverability separately controls proactive employer browsing.
- Full compensation-component/retention/compliance validation. Posting/editing APIs and immutable publication are implemented with basic annualized pay, workplace and required-field checks; neither fixtures nor successful validation certify legal compliance.
- LiveKit attendance verification and actual participant confirmations. Dated scheduling and transactional cross-job calendar overlap protection are implemented in 003. Interview evidence is writable only by the privileged test/migration owner; no client completion shortcut exists. The future trusted workflow must lock the application before altering completion evidence.
- Employer scorecard drafts/notes, candidate sharing preview, school-name disclosure, standalone authorization revocation, artifact/version update APIs, or final policy consent text. `synthetic-v1` is explicitly not a real user consent policy.
- Email attachments, provider notification delivery/retries, outbox leasing, 45-day notices, privacy exports/deletion, fraud operations, retention or restoration. Outbox rows are delivery _intents_, never claims that something was sent. Calendar download generation at the API is separate from sending a calendar invite.

Historical profile/job/scorecard/audit/snapshot rows reject updates and deletes via triggers. Authorization scopes, grant bindings and approved document bytes are immutable; only one-way revocation is permitted. Identity edits must increment revision exactly once. Interview application/question bindings cannot change. A future retention workflow needs explicit narrowly scoped deletion design; do not disable these protections casually. Production migration rollout and recovery should use reviewed forward migrations.

## Second slice: onboarding, posting and persistent queries

`202609290002_onboarding_and_queries.sql` is additive. It provisions an authenticated user's own account, supports pending employer organizations and private candidate/job drafts, publishes immutable job versions, and supplies scoped query projections. It does not implement business verification or profile/eligibility approval; new accounts correctly remain pending review.

The new query functions return camelCase JSONB objects/arrays. They match `packages/contracts/src/live.ts`. Earlier card and reveal RPCs retain their documented SQL row shapes; the server adapter maps those separately.

| RPC                                                                         | Result and boundary                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ensure_account(p_role text)`                                               | Own account context; role may only be `candidate` or `employer`. Repeated calls never reactivate suspended/closed accounts or grant administrative rights.                                                                                                   |
| `get_account_context()`                                                     | `{accountId,status,roles,employers,candidate}`. A valid authenticated but unprovisioned user receives empty roles/organizations without creating database rows. Inactive accounts are denied.                                                                |
| `create_employer(p_name text,p_website text)`                               | UUID of a new **unverified** employer owned by the caller. Matching a website never grants access to an existing organization. Exact same-owner retries reuse the pending company.                                                                           |
| `list_employer_jobs(p_employer uuid)`                                       | Own active team's jobs, including private editable draft content and `hasUnpublishedChanges`. Does not require verification to finish onboarding.                                                                                                            |
| `save_job_draft(p_employer uuid,p_job uuid,p_draft jsonb)`                  | Job UUID. Pass SQL/JSON null for a new job; existing IDs must belong to that organization. Replaces the draft object; partial drafts are supported by SQL, while the current form validates full submissions.                                                |
| `publish_job(p_job uuid)`                                                   | Immutable version UUID; verified active recruiter/owner only. Identical publication retries reuse the current version. New versions do not rewrite existing applications.                                                                                    |
| `list_open_jobs(p_limit integer default 20,p_after uuid default null)`      | Safe verified/open published jobs for active candidates, ordered by UUID with limit 1–100. Each includes `canApply`; unreviewed accounts can browse but cannot apply. No raw draft, age evidence, filter reason, location evidence, or private candidate ID. |
| `list_my_applications()`                                                    | Candidate's own application history, using applied posting title and derived timeline stage.                                                                                                                                                                 |
| `list_job_applications(p_job uuid)`                                         | Verified job team only, including paused/closed job history. Uses application-specific card references, approved headline and applied posting snapshot. Withdrawn rows return `cardId:null`, `headline:null`, `handle:"Withdrawn"`.                          |
| `get_candidate_profile()`                                                   | Own `{draft,published,reviewStatus,discoverable}`. No user-ID input exists.                                                                                                                                                                                  |
| `save_candidate_profile(p_draft jsonb,p_discoverable boolean default null)` | Private review submission; preserves the last approved public version. Omitted/null visibility preserves the current setting. Never collects DOB or asserts eligibility.                                                                                     |
| `set_candidate_visibility(p_discoverable boolean)`                          | Changes proactive discovery preference without editing/resubmitting the profile.                                                                                                                                                                             |

Profile drafts contain exactly `headline`, `educationLevel`, `field`, `studyStatus`, `bullets`, and `skills`. Identity-bearing raw text is permitted only in the private pending draft; it cannot appear in employer cards until the still-unimplemented review/approval workflow approves a separate version. Do not treat a pending profile as identity-scrubbed.

Job draft keys are `title`, `description`, `payMinMinor`, `payMaxMinor`, `payPeriod`, `currency`, `location`, `hoursPerWeek`, `schedule`, `skills`, `mustHaves`, `niceToHaves`, `questions`, `isVacancy`, `usesAiScreening`, `workplaceType`, optional `minimumAge`, and `jobType`. Publication requires all non-optional fields, validates types/ranges/questions, and rejects direct Canadian-experience requirements. Pay is in integer CAD cents; the voluntary annual-equivalent spread limit uses stated weekly hours × 52 for hourly wages. This is a platform form rule, not a certification of Ontario compliance.

`workplaceType` is one of `office`, `retail`, `restaurant_service`, `restaurant_kitchen`, `warehouse`, `construction`. The server derives the preliminary workplace threshold (14/15/16); an inconsistent client-supplied minimum age is rejected. This narrow synthetic policy requires legal review before real eligibility processing. It is not a complete model of duties, school-hour restrictions, hazardous work or minors' consent.

Job projections contain `{id,employerId,company,status,versionId,details,hasUnpublishedChanges}`; open-job rows also include `canApply`. `details` has the normalized draft keys. Legacy fixtures or incomplete drafts use empty strings, empty arrays and zeroes for genuinely missing details instead of invented job facts. These are editor placeholders, not ready-to-publish values. Public projections always use the published version and set `hasUnpublishedChanges:false`.

Visibility and eligibility are independent. A hidden but approved/eligible candidate may apply deliberately; that application allows the employer to see the approved card. Hiding prevents proactive discovery and new interest through stale card references when no application exists. Existing withdrawal rules remain terminal. Unknown eligibility never becomes `canApply:true`.

## Local HTTP integration gateway (test only)

```sh
node scripts/test-backend.mjs --test-only --port 54329
# Or verify and immediately clean up:
node scripts/test-backend.mjs --test-only --port 0 --self-test
```

The script binds only `127.0.0.1`, refuses remote PostgreSQL hosts, creates a unique database and nonsuperuser roles, applies migration 001 with fixtures followed by all newer migrations, and prints its temporary URL, publishable key and fictional credentials. Set the printed `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` when starting the local Next.js server. Use a `.invalid` email for every new test signup. Stop with SIGINT/SIGTERM to close connections and remove the isolated database and roles.

Fixture users include `candidate@example.invalid`, `employer@example.invalid`, `other-employer@example.invalid`, `pending-employer@example.invalid`, and `removed-employer@example.invalid`. Their intentionally public test password is `Synthetic-only-password1!`. There are no real accounts, email sends or uploaded resumes.

Test orchestration can import:

```js
import { startTestBackend } from './scripts/test-backend.mjs';
const backend = await startTestBackend({ port: 0 });
try {
  // Spawn Next with {...process.env, ...backend.environment}, then browser tests.
  await backend.selfTest();
} finally {
  await backend.close();
}
```

`startTestBackend` returns `{url,publishableKey,database,fixtures,environment,close,selfTest}` and optionally accepts `accessTokenLifetimeSeconds` (15–3600). Importing does not start a server. `close()` is idempotent.

This adapter simulates the minimum Supabase Auth HTTP protocol needed for password/signup/refresh/user/logout flows. Sessions and signing keys live only in memory. Every RPC uses prepared PostgreSQL parameters under the actual nonsuperuser authenticated role with a transaction-local subject. Unknown functions, non-app schemas, direct table endpoints and nonlocal browser origins are rejected. It is **not** a substitute for testing real Supabase JWT verification, confirmations, OAuth, Storage, Realtime, refresh concurrency, production key management or provider outages. Neither application imports or activates this gateway in production.

## Third slice: dated blind-interview scheduling

`202609290003_interview_scheduling.sql` adds dated recruiter availability and real application bookings. Slots are 15–60 minutes, in the future, with an explicit validated IANA timezone and UTC instants. There is a five-minute turnaround period after every slot/interview. Recurring availability and rescheduling in place remain deferred. Call entitlement is added by migration 005; actual provider/device verification is still separate from these database tests.

| RPC                                                                                                | Authorization / result                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_interview_slot(p_job uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_time_zone text)` | Verified job recruiter/owner creates their own slot; exact active-slot retry returns it.                                                                                                                                                      |
| `list_employer_interview_slots(p_job uuid)`                                                        | Verified team lists the job's slots, including cancelled/booked history; `ownedByMe` identifies whose available slots the caller can cancel.                                                                                                  |
| `cancel_interview_slot(p_slot uuid)`                                                               | Creator only; an available slot becomes terminally cancelled. Booked slots must be cancelled through the interview operation.                                                                                                                 |
| `list_application_interview_slots(p_application uuid)`                                             | Owning matched, nonwithdrawn candidate sees future available slots whose recruiter remains authorized; candidate calendar conflicts are excluded.                                                                                             |
| `book_interview(p_application uuid,p_slot uuid)`                                                   | Owning matched candidate; job, recruiter, availability, calendars and application checked transactionally. Returns the interview.                                                                                                             |
| `list_application_interviews(p_application uuid)`                                                  | Owning candidate or verified job team; returns only safe appointment metadata.                                                                                                                                                                |
| `list_candidate_interviews()`                                                                      | Candidate's own appointments across applications.                                                                                                                                                                                             |
| `list_job_interviews(p_job uuid)`                                                                  | Verified team sees appointments for that job, including paused/closed postings.                                                                                                                                                               |
| `cancel_interview(p_interview uuid,p_reason text default null)`                                    | Owning candidate or verified recruiter/owner of the job can cancel a scheduled interview. Optional ≤500-character reason stays private; it is never returned to the other party, copied into an outbox event or included in an audit payload. |

Slot JSON is `{id,jobId,startsAt,endsAt,timeZone,status}` with `available`, `booked` or `cancelled` status. Employer slot responses additionally contain `ownedByMe`; candidate responses do not disclose the recruiter's account ID. Interview JSON is `{id,applicationId,jobId,jobTitle,company,slotId,startsAt,endsAt,timeZone,status,round:1}`. Legacy fixture appointments without a slot use a documented synthetic 30-minute duration and UTC. Status also supports `completed`, `disputed` and `no_show`, but no client RPC can set those states.

Booking locks the application, then the candidate and recruiter account rows in sorted UUID order, then the slot. Every calendar writer follows the same account-lock protocol. Transactional range checks cover a candidate or recruiter across different jobs and applications; partial unique indexes independently enforce one scheduled interview per application and per slot. This uses built-in PostgreSQL range types and locks, with no extension dependency. Future calendar writers must follow this protocol; direct privileged insertion is not a supported booking path.

Question IDs are frozen as `<applied-version-UUID>:q<1-based-index>` and refer to the immutable version captured at application time. Interview scope, slot times and question IDs cannot be changed by updating existing records. Actual questions/scorecard session retrieval will need a separately reviewed projection before live audio/evaluation integration.

Retries while a booking is scheduled return the same interview without another outbox event. A cancelled application/slot pair cannot be booked again through a delayed retry; choose a different slot. Candidate cancellation releases a future slot if its recruiter is still authorized; employer cancellation retires the slot. Withdrawal cancels scheduled appointments, releases eligible slots and revokes identity access in the same transaction. Completion, attendance and scorecards remain separate prerequisites: booking never fabricates evidence for reveal.

The PostgreSQL suite includes direct authorization/validation cases, cross-job and five-minute-buffer conflicts, frozen posting questions, cancellation privacy, terminal retries and withdrawal cleanup. Independent connections race two candidates for one slot, then race the same candidate across two simultaneous slots with different recruiters. Exactly one booking and notification intent survive each race.

## Fourth slice: operational review and exact candidate approval

`202609290004_operational_review.sql` creates an unexposed `review` schema and a dedicated `swipe_reviewer` **NOLOGIN** group. It refuses a pre-existing group with unsafe login/superuser/create-role/create-database/bypass-RLS attributes. The migration does not create an operator login, assign application accounts to the group or grant it to `authenticated`, `anon` or a service role.

Review routines accept only an individual non-superuser database session that is a member of this group. The migration owner and broad service/admin credentials are rejected at runtime even if they own the function. Decisions record PostgreSQL `session_user`, the exact subject/revision and a private evidence note; a caller cannot supply an actor UUID. The group has no direct reads or writes on application, identity, eligibility or review tables. Its only rights are the five scoped review routines below.

A database administrator must explicitly provision each operator outside the application, for example:

```sql
CREATE ROLE swipe_operator_alex LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT swipe_reviewer TO swipe_operator_alex;
-- Set a unique password through your secret manager or psql's \password prompt.
-- Do not put credentials in this repository or reuse a service/migration login.
```

No production role, password or credential was provisioned while implementing this code. The test runner creates only unique temporary roles and removes them with its isolated database.

Set `SWIPE_REVIEW_DATABASE_URL` to that operator's database connection and use:

```sh
node scripts/review.mjs pending-employers
node scripts/review.mjs pending-profiles
node scripts/review.mjs show-profile <candidate-uuid>
node scripts/review.mjs verify-employer <employer-uuid> --website <reviewed-url> --note-file evidence.txt
node scripts/review.mjs propose-profile <candidate-uuid> --revision 2 --content-file reviewed-profile.json --note-file evidence.txt
```

Remote connections require `sslmode=verify-full`. The CLI validates command shape, uses prepared values, rejects broad database credentials, assumes only the review group and emits sanitized errors without connection strings or raw SQL diagnostics. Queue/profile output is private operational material; do not pipe it into public logs or telemetry.

| Dedicated review RPC                                                                          | Purpose                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `review.list_pending_employers(p_limit default 20)`                                           | Names/sites of pending unsuspended businesses; no candidate material.                                                                            |
| `review.verify_employer(p_employer,p_expected_website,p_evidence_note)`                       | Manual verification decision pinned to the website reviewed; never an automatic domain-match decision or suspension override.                    |
| `review.list_pending_profiles(p_limit default 20)`                                            | Active candidates' current raw drafts still needing human review; no identity table, resume source, age or work evidence access.                 |
| `review.get_candidate_draft(p_candidate)`                                                     | Exact current draft and revision for targeted review.                                                                                            |
| `review.propose_candidate_profile(p_candidate,p_expected_revision,p_content,p_evidence_note)` | Creates an immutable validated blind-profile proposal. Stale drafts fail; a correction supersedes older proposals. It never publishes a profile. |

`get_candidate_profile()` now adds `proposal:{id,draftRevision,content}|null` and supports `reviewStatus:"awaiting_approval"`. A candidate previews the exact reviewed proposal and calls `app.approve_profile_proposal(p_proposal uuid)`. The routine checks owner, current draft revision and latest proposal under lock, then atomically writes an immutable approved profile version, explicit candidate approval, audit and outbox intent. Retried approvals cannot create duplicate versions. A later raw draft edit invalidates pending old proposals while preserving the currently published version. Old proposals and decisions cannot be rewritten.

Profile review grants **no legal eligibility**. It does not set or edit birth date, age bands, work attestation, verification badges or eligibility policy. A new candidate can have an approved profile and still correctly be unable to apply until the separately reviewed eligibility process exists. Human review is a trust operation, not a guarantee that all identifying hints have been removed.

The SQL suite proves that candidates/employers cannot assume the reviewer role or call review functions; broad admin sessions cannot execute the operational workflow; scoped operators cannot directly read identity/eligibility or mutate tables; stale/superseded/other-owner proposals cannot be approved; publication waits for the candidate; existing published content survives edits; and retries leave one approval/verification decision.

The imported test gateway additionally exposes `backend.review(name,args)` solely to test orchestration. It executes the same scoped review functions under a temporary nonsuperuser operator identity. There is no HTTP route for that helper, and neither production application imports the gateway.
