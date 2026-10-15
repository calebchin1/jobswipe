# Implementation status

September 29, 2026. This is a connected development build, not a production-complete marketplace. Work uses fictional accounts and isolated databases. A free-tier hosted staging environment exists (see [connected development](11-connected-development.md#hosted-staging)); no public launch, real hiring messages or paid service account has been created.

## Implemented

October 14, 2026 additions: private adults-only pilot declarations, expiry/removal gates, the authenticated candidate form, and a local operator review console reusing scoped database permissions. Migration 007 is installed on existing staging. Local provider credentials and both scoped review queues are verified. Matching Vercel code deployments, hosted LiveKit environment settings and two-party microphone verification remain outstanding. See [setup and handoff](13-backend-setup.md).

- Pinned TypeScript monorepo: Next.js employer app, Expo candidate app, shared contracts/domain/server packages, automated checks and CI configuration.
- Separate synthetic walkthroughs for exploring swipes, a simulated interview, scorecard locking and candidate-controlled reveal without credentials.
- Web signup/sign-in/confirmation/sign-out using Supabase Auth, HttpOnly cookies, same-origin mutation checks and verified caller-token RPC forwarding.
- Candidate signup/sign-in, account provisioning, native chunked SecureStore sessions, memory-only browser sessions and server-backed account state.
- Employer organizations start unverified. Owners can prepare validated drafts; only verified companies publish immutable job versions and browse anonymous candidate cards.
- Private candidate profile drafts await review. Approved profiles remain separate from pending edits. Visibility changes independently; hidden candidates can explicitly apply without enabling general recruiter discovery.
- Swipe decks on phones for both sides (touch, mouse and arrow keys, with button equivalents). Passes and undo persist server-side per candidate or job team and are never shown to the other party.
- Persistent apply, employer interest, mutual matching, actor-specific application lists, idempotent retries and terminal withdrawal. Connected screens never substitute demo data after an error.
- Interview slots with timezone-qualified instants, 15–60 minute duration, booking/cancellation, immutable applied-version question identities, a five-minute scheduling buffer and prevention of double booking. No client can mark attendance or completion.
- Authenticated anonymous calendar-file generation with UTC dates, escaped content and safe UTF-8 line folding. Downloads do not auto-update.
- SQL privacy boundaries: separate identity/eligibility, deny-by-default privileges, job-scoped candidate references, immutable scorecards, precise identity/document/recipient authorization, revocation, audit and transactional outbox intents.

## Connected API surface

All workflow requests use either verified candidate Bearer sessions or same-origin employer cookies. Mutations validate input; response schemas strip unexpected fields. `SUPABASE_PUBLISHABLE_KEY` is required; secret/service-role substitution is rejected.

| Area | Routes under `/api/v1` |
|---|---|
| Authentication | `auth/sign-up`, `auth/sign-in`, `auth/sign-out`; confirmation at `/auth/confirm` |
| Accounts | `me`, `account/bootstrap`, `employers` |
| Employer jobs | `employers/:id/jobs`, `jobs/:id/publish`, `jobs/:id/candidates`, `jobs/:id/candidates/:cardId/pass` (+ `/undo`), `jobs/:id/interest`, `jobs/:id/applications` |
| Candidate | `candidate/profile`, `candidate/visibility`, `candidate/jobs`, `candidate/applications`, `jobs/:id/apply`, `jobs/:id/pass` (+ `/undo`), `applications/:id/withdraw` |
| Scheduling | `jobs/:id/interview-slots`, `interview-slots/:id/cancel`, `applications/:id/interview-slots`, `applications/:id/interviews`, `candidate/interviews`, `jobs/:id/interviews`, `interviews/:id/cancel` |
| Calendar | `applications/:id/interviews/:interviewId/calendar` |
| Guarded disclosure foundation | `interviews/:id/scorecard`, `applications/:id/reveal-authorization`, `reveals`, `reveals/:id` |

Disclosure endpoints are database foundations, not a complete user-ready reveal feature. Fixture document references contain no bytes. Genuine completion evidence cannot be supplied by a user through these routes.

## Verification

Shared/server/native-storage tests, TypeScript checks, web production builds, PostgreSQL authorization/concurrency tests, and desktop/narrow-browser UI tests run locally. Expo browser/iOS/Android JavaScript exports have succeeded. Native microphone and device behavior remain untested.

The connected test runner creates a unique local PostgreSQL database and roles, starts a loopback Supabase-protocol test adapter and production Next.js server, and exercises real HTTP routes and SQL authorization. Confirmed coverage includes candidate application → employer browser sign-in → mutual match → reload → withdrawal, inaccessible unrelated employers, HttpOnly sessions and unapproved signup gates. It also exports the Expo browser app with temporary local settings for cross-client tests. This adapter is test code, never the production auth implementation; hosted Supabase Auth and PostgREST still require separate staging verification.

Useful commands:

```sh
corepack pnpm check
corepack pnpm test:db
corepack pnpm test:e2e
corepack pnpm test:web-live
corepack pnpm test:mobile
corepack pnpm test:connected
```

Do not run two web production builds concurrently: they share `.next`. Exported candidate settings are build-time values; use `--clear` when switching environments. The connected runner owns and cleans up only its own local test services/database. GitHub Actions is authored, not yet run remotely.

## Work remaining before real users

1. Trusted business verification/profile review interfaces, private eligibility collection and refresh, and team administration. New accounts remain gated until legitimate approval and eligibility exist.
2. Actual LiveKit audio calls, microphone permissions, participant authentication, provider attendance evidence and confirmations. Scheduled events are not evidence that an interview happened.
3. Resume upload/quarantine/scanning/redaction/approval, protected download streaming and reviewed identity-sharing consent. The placeholder `synthetic-v1` consent is not for real candidates.
4. Worker delivery/retries, email and push, reminders, exact interview outcome notices and reconciliation. Outbox entries mean intended work, not sent messages.
5. Anonymous chat, full availability/commute/preference matching, daily quotas, saved jobs, reports and moderation. Swipe gestures are untested on physical devices.
6. Privacy export/deletion, operational retention, recovery drills, accessibility accommodations, provider staging verification and native device/store releases.

Product/legal questions remain in [scope](01-product-scope.md). No safety or compliance conclusion follows from passing software tests. Setup is in [connected development](11-connected-development.md).

### October 15 candidate card revision

Discovery starts with the selected role and candidate deck; the promotional intro is removed. Cards show an achievement-led headline, school + degree, hours/week, up to three skills and three experiences. The expanded profile fills the card, hides the scrollbar while preserving scrolling, and returns through browser back, a right swipe, Escape/left arrow, or a bottom left-arrow button. Mobile summaries shorten long text; the expanded profile keeps full experience text.

Migration `202610150008_candidate_card_education.sql` adds optional school and weekly availability to reviewed profile snapshots. These fields require a new reviewed proposal and candidate approval; old snapshots remain unchanged. School remains excluded from ranking.

Migration 008 was installed transactionally on the configured Supabase staging project on October 15. The hosted web/mobile builds have not been redeployed; localhost includes the new UI.

### October 15 backend completion audit

The backend is not complete for real-user launch. A fresh code audit, automated runs and read-only staging checks confirmed:

- `npm run check`: all TypeScript checks and 92 unit tests passed. `npm run test:db`: authorization, concurrency, review, eligibility, scheduling, audio entitlements and candidate-approved education assertions passed. `npm run test:connected`: all six browser workflows plus connected review/API assertions passed against an isolated local database and test auth adapter.
- Supabase staging has adult-pilot eligibility and school/hours fields. Anonymous candidate browsing and authenticated direct reads of private identity/attestation tables remain denied.
- Local `/api/v1/candidate/eligibility` returns the expected anonymous 401; the hosted employer API returns 404 for the same endpoint. The new API build is not deployed there.
- Supabase Auth accepts email signup and requires confirmation. This settings check does not prove SMTP configuration or delivery; no email was sent during the audit.
- LiveKit credentials passed an authenticated room-service request. No two-party audio/device test was performed. Provider attendance/completion ingestion and participant confirmations are missing, so real interviews cannot yet unlock the complete scorecard/reveal flow.
- Staging contains four pending outbox intents and zero marked dispatched. No application delivery worker, leasing/retry mechanism, notification provider integration or reliable deferred room-closure consumer exists in this repository.
- Staging has zero Storage buckets. Resume upload, quarantine/scanning, regeneration, protected file downloads and delivery are unfinished; document IDs in fixtures do not imply stored files.
- Team invitations, masked chat, moderation/report workflows, privacy export/deletion and operational recovery remain unfinished. The local operator review console and private adult self-attestation are already built; older remaining-work lists must not be read as saying those features are absent.

Next order: deploy matching API/candidate builds, verify authentication email delivery, implement durable background delivery, complete real audio attendance and interview confirmation, then finish approved resume/reveal delivery. No deployment, email, call or account mutation was performed by this audit.
