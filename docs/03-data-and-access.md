# Database and access design

This is a logical schema, not executable SQL. All timestamps are UTC `timestamptz`; recurring availability stores an IANA timezone. Monetary amounts are integer minor units plus currency and pay period. UUIDs are identifiers, not authorization credentials.

## Schema boundaries

- `auth`: Supabase-managed authentication data; never exposed as employer profile data.
- `app`: business records protected by RLS and explicit grants; expose only reviewed API surfaces.
- `private`: identity, raw drafts/files, eligibility and sensitive review material; not exposed through the public Data API.
- `ops`: outbox, delivery internals, audit and retention operations; worker/admin only.

The exact Supabase exposed-schema configuration is set during implementation. Client apps use the API; direct Data API requests must still fail safely if someone tries them.

## Identity, profiles and organizations

| Table | Important fields | Constraints / access |
|---|---|---|
| app.accounts | id = auth user ID, status, created_at | Own safe account fields; status updates privileged |
| app.account_roles | user_id, role | Unique user/role; membership managed through vetted flow |
| private.candidate_identity | candidate_id, legal_name, contact_email, phone, school_name, revision | Candidate own; disclosure routine returns allowlisted projection only |
| private.candidate_eligibility | candidate_id, encrypted evidence or reviewed band, work_attestation, policy_version, evaluated_at, refresh_due_at | Never readable by employers, even after reveal |
| private.candidate_locations | candidate_id, location_kind, postal_code, derived coordinates, travel_mode, valid_from/to | Home/term locations separately; used only by eligibility/commute adapter |
| private.candidate_profile_drafts | candidate_id, structured fields, review_status, revision | Candidate and authorized reviewers only |
| app.candidate_profiles | candidate_id, discoverability, available_from, published_version_id | Internal reference; safe reads via card projection |
| app.candidate_profile_versions | id, candidate_id, approved blind headline/education/bullets/skills, availability, job_types, reviewer, approved_at | Immutable approved content; no school or graduation date |
| app.candidate_verifications | candidate_id, verification_kind, status, expires_at | Safe badge only in card; raw evidence private |
| private.verification_evidence | subject, kind, object_ref, reviewer, status | Scoped trust operators; not full-admin access by default |
| app.employers | id, public_name, website, size_band, verified_at, suspended_at, default_ai_disclosure | Public safe projection; settings restricted |
| app.employer_members | employer_id, user_id, role, status | Unique active membership; owner/recruiter/viewer |
| private.employer_invitations | employer_id, normalized_email, token_hash, expires_at, accepted_at, invited_role | Token single-use; invited email ownership required |

No email column in a broadly readable users table. Do not expose global candidate IDs in employer cards: issue a job-scoped card reference and display handle through a server mapping. Employers must not correlate people across companies using internal IDs or a global handle.

## Jobs and discovery

| Table | Important fields | Constraints / access |
|---|---|---|
| app.jobs | id, employer_id, state, current_version_id, opens_at, closes_at, filled_at | Draft/open/paused/closed; publication through guarded transaction |
| app.job_versions | id, job_id, title, duties, location, compensation, hours, required_skills, optional_skills, vacancy, AI disclosure, questions, workplace rule key, rule_version | Immutable published snapshot; bounded arrays and validated compensation |
| app.job_availability | job_version_id, local weekly windows, timezone, start/end dates, hours range | Explicit overnight representation; no loosely formatted strings |
| private.candidate_card_refs | id, job_id, candidate_id, handle | Unique job/candidate; opaque external reference |
| app.job_saves | candidate_id, job_id, created_at | Unique pair; save is independent of apply/pass |
| app.interests | job_id, candidate_id, side, intent, revision, actor_member_id, changed_at | Unique pair/side; employer team shares one decision |
| ops.interest_events | interest_id, before/after, actor, idempotency_key | Append-only audit and undo source |
| app.deck_sessions | id, account_id, surface, job_id?, last_active_at, undo_used | Server expiry; no quota reset by opening sessions |
| ops.swipe_counters | subject, scope, quota_day, count | Atomic quota reservation; explicit timezone policy |
| ops.deck_exposures | subject_ref, item_ref, ranking_version, shown_at, reason_codes | Minimal pseudonymous telemetry; retention bounded |

`intent` is interested/pass/none. Save is not a third interest direction. Swipes are input events; current interests are the authoritative matching state. Deleted UI cards cannot cause duplicate matches.

Store current employer size/disclosure settings separately from their effective snapshot at job publication. Editing settings does not rewrite historical postings. Job content updates create new versions and record which version the candidate applied to.

## Application lifecycle

| Table | Important fields | Constraints / access |
|---|---|---|
| app.applications | id, job_id, candidate_id, generation, applied_job_version_id, applied_profile_version_id, applied_at, matched_at, withdrawn_at, decision, decision_at, version | Unique active job/candidate generation; candidate apply creates application even without employer interest |
| app.application_events | application_id, event_type, actor_ref, occurred_at, safe_payload | Candidate-facing projection distinct from employer/private event detail |
| app.messages | id, application_id, sender_side, display_body, masked, sent_at, client_message_id | Only safe display body; unique sender/client ID |
| private.message_reviews | message_id?, raw_body, detection_reason, expires_at | Only when needed for moderation; bounded retention; never broadcast |
| app.blocks | blocker_id, blocked_subject, application_id?, created_at | Immediate communication/discovery effect; visibility scoped |
| app.interview_windows | employer_id, interviewer_id, timezone, weekly_rules, exceptions | Recruiter availability; sensitive calendar details never public |
| app.interview_slots | id, job_id, interviewer_id, starts_at, ends_at, status | Materialized availability; authoritative conflict checks on booking |
| app.interviews | id, application_id, round, slot_id, starts_at, ends_at, status, questions_version, booking_version, completion_method | State controlled by workflow, no direct client updates |
| private.interview_rooms | interview_id, opaque_room_name, provider_ref | Server only; room names contain no personal data |
| ops.interview_attendance | interview_id, participant_side, provider_event_id, joined_at, left_at | Deduplicate provider events; pseudonymous actor mapping kept private |
| app.scorecards | id, interview_id, evaluator_id, state, answers, recommendation, submitted_at, revision | Employer only; immutable when submitted |
| private.scorecard_notes | scorecard_id, notes | Employer-only confidential notes, never in candidate DTOs |
| app.reveal_authorizations | id, application_id, candidate_id, recipient_scope, identity_revision, document_version_id, policy_version, consented_at, revoked_at | Candidate creates/revokes own authorization; immutable scope |
| app.reveals | id, application_id, authorization_id, document_version_id, granted_at, revoked_at | Unique grant per authorization; only guarded routine creates |
| private.reveal_snapshots | reveal_id, permitted identity projection, permitted school fields, contact revision | Frozen allowlisted payload; excludes eligibility and precise location |
| app.outcome_notices | id, application_id, deadline_id, employer_status, statement_version, issued_at | Both sides safe reads; factual status only |
| ops.notice_deadlines | application_id, interview_id, due_at, basis_version, fulfilled_by, status | Historical obligations cannot be erased by later interviews |

Do not persist a single mutable `stage` as the whole process. Derive timeline/board labels from authoritative facts; maintain a projection for queries if necessary. Interview scheduling, withdrawal, outcome and disclosure are separate dimensions.

Booking must protect both interviewer and candidate against overlaps, including across jobs. Use transactional locks or reservation rows with exclusion constraints on time ranges; a unique slot ID alone is insufficient. Buffers count toward reserved ranges.

## Documents, compliance and operations

| Table | Important fields | Constraints / access |
|---|---|---|
| private.resume_sources | id, candidate_id, opaque storage key, MIME, size, checksum, scan_status, upload_state | Owner via controlled upload/download; approved workers only |
| private.resume_versions | id, source_id?, kind, storage_key, checksum, structured_revision, state, policy_version | Source/blind/reveal-PDF/profile-generated variants never confused |
| app.resume_approvals | candidate_id, version_id, approved_at, withdrawn_at | Approval tied to exact bytes/version |
| private.document_reviews | document_version_id, reviewer, findings, disposition | Tracks human review; no sensitive payload in job events |
| app.consent_records | user_id, purpose, policy_version, scope_ref, given_at, withdrawn_at | Immutable evidence; not one blanket boolean |
| app.reports | id, reporter_id, target_type/id, category, status, created_at | Reporter sees safe status; accused party never sees reporter identity automatically |
| private.report_details | report_id, narrative, evidence_refs, case_notes | Moderators with explicit access |
| app.policy_versions | kind, public_text_ref, effective_at, superseded_at | Public active fraud/privacy policies; immutable archives |
| ops.compliance_archives | job_version_id, posting_snapshot, form_snapshot, linked_content_refs, public_removed_at, retain_until | Includes revisions and retention basis |
| private.device_tokens | user_id, device_ref, provider_token, disabled_at | Never exposed to other users |
| app.notification_preferences | user_id, channel/purpose, enabled | Required transactional notices distinguished from optional campaigns |
| ops.outbox_events | id, aggregate_id, type, version, minimal_payload, available_at, lease_until, dispatched_at | Written in same transaction as state change |
| ops.delivery_attempts | event_id, channel, recipient_ref, dedupe_key, state, provider_id, next_attempt_at | One logical delivery, multiple attempts |
| ops.webhook_receipts | provider, event_id, verified_at, processed_at | Unique provider/event ID; raw payload redacted or short-lived |
| ops.idempotency_records | actor_id, route, key, request_hash, response_ref, expires_at | Same key/different body rejected |
| ops.audit_log | actor_ref, action, target_ref, decision, reason_code, at | Append-only; no resume/chat bodies |
| ops.privacy_requests | user_id, kind, status, requested_at, completed_at | Export/delete workflow and retention exceptions |
| ops.retention_holds | subject_ref, category, basis, until, reviewer | Restrict retained records instead of leaving visible |

This is more than fourteen tables because versions, consent, retries, booking conflicts and operational review require durable records. Add tables by implementation slice; do not build all operational surfaces upfront.

## Authorization matrix

| Resource | Candidate | Verified employer on relevant job | Unverified/unrelated employer | Reviewer/worker |
|---|---|---|---|---|
| Candidate raw draft | Own only | Never | Never | Assigned profile reviewer |
| Published blind card | Own | Eligible and discoverable, or authorized application context | Never | Relevant job support scope |
| Identity | Own | Frozen allowed fields after valid reveal only | Never | Least-privilege use case |
| DOB/eligibility evidence | Own approved access flow | Never | Never | Eligibility evaluator only |
| Original resume | Own | Only specifically authorized reveal artifact; never implicit raw-source access | Never | Scan/conversion/review workers |
| Blind resume | Own | Matched application and approved version | Never | Document worker |
| Messages | Own matched application | Same matched application | Never | Assigned moderation case |
| Scorecard | No employer private scores/notes by default | Authorized team for interview | Never | Audited support only |
| Reveal summary | Own sharing status | Authorized team, own scorecard included | Never | Delivery worker |
| Fraud reports | Own safe status | No reporter details | No | Assigned trust operator |

“Admin” is not a universal access role. Verification staff need evidence, resume reviewers need documents, support staff need lifecycle metadata. Emergency access is time-limited and audited.

## Required database invariants and indexes

- Foreign keys bind interviews, scorecards, authorizations and reveal grants to the same application and organization.
- Stable locks serialize match, withdraw, reveal, and final-decision transitions on an application; check current version inside transaction.
- Conditional uniqueness prevents duplicate applications, matches, submissions, grants, notice fulfillments and deliveries.
- Submitted scores are 1–5, have exactly the locked question IDs, and cannot be updated or deleted through normal roles.
- Historical job/profile/document versions are immutable. New edits create versions and never inherit old approvals.
- Index organization membership by user/status; jobs by employer/state; applications by job/state and candidate/update time; messages by application/time/ID; pending outbox and deadlines by status/due time.
- Foreign-key ownership columns used by RLS are indexed. Pagination ordering includes a unique tiebreaker.
- Retention and deletion are category-specific; cascading a user deletion must not accidentally erase required posting/notice archives.
- Migration rollback planning covers data changes, not only SQL down files. Prefer forward repairs for production data.

## Private file delivery

Separate quarantine, source, approved-blind, and approved-reveal buckets; all private. Files use opaque paths and neutral download filenames before reveal. Employers never receive bucket listings, source paths or source metadata.

For revocable employer links, use an authenticated API download that rechecks grant and membership on every request, audits access, and streams the approved object with private/no-store cache policy. Avoid returning durable signed object URLs: possession grants access until expiry, independent of later application withdrawal. Files already streamed or saved cannot be revoked. See [storage reference](09-references.md#technical).
