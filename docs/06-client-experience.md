# Client screens and interaction contracts

The apps render server-approved DTOs. Hiding a field on a screen is never its security boundary. All screens include loading, empty, offline, error, permission-denied and stale-state behaviour where relevant.

## Candidate app routes

| Route group / screen | Content and actions | Required edge cases |
|---|---|---|
| `(auth)/welcome` | Short proposition, sign in/signup | Policy links available without signup |
| `(auth)/verify` | Email verification/recovery | Expired links, rate limits, account switching |
| `(onboarding)/eligibility` | Reviewed private eligibility questions, work attestation | Ineligible/uncertain outcome gives clear next step without storing excessive data |
| `(onboarding)/profile` | Headline, education level/field, bullets, skills | Draft autosave, character limits, examples for no work experience |
| `(onboarding)/availability` | Weekly hours, start date, job types | Overnight shifts, exam periods, timezone |
| `(onboarding)/location` | Term/home region, travel mode, commute preference | No GPS requirement; explain employer sees approximate commute only |
| `(onboarding)/resume` | Optional upload or skip | Continue onboarding while processing; no implied publication |
| `(onboarding)/preview` | Exact blind profile and visibility consent | Review pending state; candidate can correct before publishing |
| `(tabs)/discover` | Job deck, filters, apply/pass/save, undo | Exhausted eligible deck, quota, closed job, keyboard/screen-reader alternatives |
| `jobs/[jobId]` | Full posting, compensation, requirements, AI/vacancy statements | Applied historical snapshot if current job has changed |
| `(tabs)/saved` | Saved jobs and availability changes | Closed/expired postings clearly marked |
| `(tabs)/applications` | Status list, next actions | No-match states and employer silence are represented honestly |
| `applications/[id]` | Timeline, chat, booking, withdraw | Explain withdrawal and already shared copies |
| `applications/[id]/chat` | Handle-based messages, send, report/block | Mask preview, revision needed, duplicate send, offline draft |
| `applications/[id]/book` | Employer slots in candidate timezone | Slot collision, no available slots, rescheduling |
| `interviews/[id]/lobby` | Audio check, device choice, conduct note, accommodation help | Permission denied, employer late, network failure |
| `interviews/[id]/call` | Audio controls, timer, reconnect/end | No camera control or identity metadata |
| `interviews/[id]/complete` | Confirm happened or flag problem | No pressure to confirm an absent interview |
| `applications/[id]/reveal` | Exact data/document, organization, recipients and delivery consequences | Changed document, revoked request, candidate declines |
| `(tabs)/profile` | Draft/published versions, visibility, availability | Hidden profile does not automatically withdraw active applications |
| `settings/resumes` | Source versions, blind preview, approval | New uploads do not silently replace shared files |
| `settings/privacy` | Sharing history, export/delete, policies | Explain legally retained categories and irreversible copies |
| `settings/notifications` | Channel/purpose preferences | Transactional obligations distinguished from marketing |

Navigation depth should not force onboarding completion for reading policies or requesting support. Push deep links verify the current session and permission before showing content; a stale notification can lead to a safe unavailable state.

## Candidate onboarding design

Aim for three minutes to a usable draft and first eligible job. Resume parsing, manual review and school-email verification must not block browsing. Applying or appearing to employers requires the reviewed minimum profile state; explain pending review instead of silently publishing raw fields.

Auto-scrubbing all free text plus human beta review is real operational work. A three-minute promise cannot imply instantaneous approval if reviewers are offline. Track signup-to-browse and signup-to-approved-application separately.

Do not collect a photo. Store contact information separately from blind fields. Use controlled education/status fields so a school name cannot accidentally be copied into education labels. Explain that stories, club names and rare experiences can identify a person even without their name.

## Employer web routes

| Route | Content and actions | Required edge cases |
|---|---|---|
| `/` | Public proposition and signup | No invented employers, testimonials or placement claims |
| `/jobs/[publicId]` | Public active posting | Fraud reporting and policy visibly linked |
| `/login`, `/auth/callback` | Employer authentication | Verified return URLs, recovery, expired invitation |
| `/onboarding/company` | Company details and size | Company size explanation; no automatic compliance certification |
| `/onboarding/verification` | Evidence submission and status | Manual alternative for small businesses without domains |
| `/dashboard` | Jobs, urgent actions, upcoming interviews | Unverified companies see setup, never candidate data |
| `/company/settings` | Website, disclosure defaults, size, verification | Published jobs keep historical snapshots |
| `/company/team` | Invite, role change, removal | Last-owner protection and current-member access revocation |
| `/jobs/new`, `/jobs/[id]/edit` | Guided job form | Draft save, inline rule feedback, preview before publish |
| `/jobs/[id]/candidates` | Applicant/discovery deck, reason codes | Applied badge, pass/interested actions, neutral empty states |
| `/jobs/[id]/pipeline` | Board/list, filter, next step | Dragging a card cannot bypass workflow prerequisites |
| `/applications/[id]` | Blind or revealed profile, timeline, approved files | Different response types; no hidden original details in HTML |
| `/applications/[id]/chat` | Anonymous communication | Identity reminders and scan failure |
| `/calendar` | Availability and bookings | Timezone display, external conflict warnings if no integration |
| `/interviews/[id]` | Lobby/call, frozen questions, timer and notes | Question prompts accessible; saved notes never sent to candidate |
| `/interviews/[id]/scorecard` | Question ratings and recommendation | Completion guard, lock warning, immutable final version |
| `/applications/[id]/reveal` | Request status and candidate-authorized identity | Candidate decline/pending; no pressure to bypass |
| `/applications/[id]/decision` | Hiring status, offer/not proceeding | Distinguish employer decision from platform inactivity |
| `/compliance` | Notice deadlines, archives, unresolved updates | No green compliance badge from merely queued emails |

Employer left/right arrows operate only when focus is on the deck, not in a text input or dialog. Both swipe and compact-list experiments can use the same endpoints. Recruiter notes are draft-saved with optimistic concurrency to avoid one seat silently overwriting another.

## Admin web routes

- `/admin/verifications`: pending evidence, reviewer assignment, approve/reject/request information.
- `/admin/profile-reviews`: drafts with flagged text, redaction proposal, safe preview, reviewer decision.
- `/admin/document-reviews`: quarantined/scanned artifacts and exact generated previews; raw access audited.
- `/admin/reports`: fraud, harassment, identity leaks, moderation actions and appeals.
- `/admin/operations`: failed delivery, missed deadlines, stuck outbox, interview reconciliation.
- `/admin/privacy`: export/deletion requests, retention exceptions and completion evidence.

Admin screens require staff membership and stronger authentication. Show only the case data needed for the staff role. Do not build an unrestricted candidate browser for convenience.

## State and caching

Use a query cache scoped by authenticated account and selected employer. Purge it on signout, organization switch where appropriate, membership removal, withdrawal, and reveal revocation. Mobile offline persistence excludes identity, resumes, chat and eligibility data by default.

Optimistic updates are suitable for saving a job or a local deck animation. Match, booking, scorecard submission, reveal and legal notices display confirmed server state. Never optimistically show a candidate's identity.

Use explicit pending sends for chat. Retrying reuses the same client message ID. Offline swipe intents are not replayed in bulk without rechecking freshness and showing resulting conflicts. An expired/closed job fails gracefully and does not spend quota unless the server commits the action.

## Accessibility and safety

- Every gesture has a labelled button equivalent. Respect reduced motion and dynamic text sizes.
- Swipe cards have semantic reading order and do not trap screen readers.
- Error messages identify the affected field and recovery path; do not rely on red/green alone.
- Audio interview accommodations must be designed before recruiting participants who need them. A phone call is not an accommodation for every hearing/speech disability.
- Provide mute, leave, report and reconnect controls in calls. Block/revoke actions must stop future room joins and actively remove participants when required.
- Keep sponsored content visually and semantically distinct from actual jobs; never count an ad interaction as an application.
- No dark patterns around reveal approval, identity sharing or deletion.

## Expansion screens

Round-two video uses a different route/room policy and requires an existing valid reveal. Ads insert a separate `SponsoredCard` type only into eligible candidate discovery sessions; never extend `JobCard` with hidden advertising behaviour. ATS/CSV export appears only in employer settings with explicit recipient/scope confirmation and a recorded export. Async interviews need their own recording/retention UX and are not a small variant of the live audio screen.
