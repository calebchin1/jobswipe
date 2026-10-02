# Roadmap

October 2, 2026. The short version of [the implementation plan](08-implementation-plan.md): what exists, the next few steps per side, and what waits. Every "Next" item ships and is usable on its own; do them top to bottom. Ticket IDs (P09, …) link back to the full acceptance criteria in doc 08. [Build status](10-build-status.md) remains the record of what is verified.

## Where it stands

A verified employer and an approved candidate can find each other by swiping on a phone, match, and book an interview, on [hosted staging](11-connected-development.md#hosted-staging) with fictional accounts. Three things stop a real person from using it: sign-up emails don't send, candidates have no way to declare eligibility, and approvals happen in a command-line tool.

## Both sides: unblock real sign-ups

| # | Step | Ships when | Notes |
|---|---|---|---|
| 0 | **Auth email on staging.** Custom SMTP, site URL and `/auth/confirm` redirect in the Supabase dashboard. | A new address can sign up and reset a password on staging. | Dashboard-only, no code. Blocks every real sign-up and password reset. |
| 1 | **Reviewer web page** replacing `scripts/review.mjs`: pending employers → verify; pending profiles → propose. Same `review.*` functions, operator login only. | An operator approves a company and a profile without a terminal. | P09, P11. Not exposed to employers or candidates. |

## Employer (web, phone-friendly)

**Done:** sign-up/sign-in/password reset · company creation (pending until verified) · validated job drafts and versioned publishing · swipe deck of anonymous candidates (right = interested, left = pass, undo) · applications pipeline with mutual matches · dated interview slots · scorecard and reveal database foundations · phone layout floors.

| # | Next | Ships when | Ticket |
|---|---|---|---|
| E1 | **"Interested, waiting" list.** Candidates you swiped right on who haven't applied yet. They leave the deck after a right swipe and currently appear nowhere until they apply. | You can see and count your pending interest per job. | P15 |
| E2 | **Match notification email.** Delivers the existing `application.matched` outbox intent. | A mutual match produces one email to the employer, retried safely. | P17 (needs step 0) |
| E3 | **Team seats.** Invite a recruiter to a verified company. | A second person can work the same deck. | P09 |

**Later:** scorecards in the UI once real interviews exist (P22) · reveal and document delivery (P23–P24) · outcome notices (P25) · masked chat (P18).

## Candidate (Expo app)

**Done:** account and secure sessions · blind profile draft, reviewer proposal, exact approval · discoverability toggle · swipe job deck (right = apply, left = pass, undo) · applications with withdrawal · interview booking and cancellation · audio lobby and room boundary (not yet device-tested).

| # | Next | Ships when | Ticket |
|---|---|---|---|
| C1 | **Eligibility step.** No way exists to provide it today, so no real candidate can apply. Smallest version: an adult-only pilot attestation (18+, legally able to work in Ontario). | A new candidate can become apply-ready without SQL. | P11 (needs decision D05) |
| C2 | **Real-phone build.** Development build on one iPhone and one Android; check swipe feel, sessions and microphone permission. | Both devices sign in, swipe, apply and withdraw. | P29, P02 |
| C3 | **Match notification.** Push or email when an employer matches you. | A candidate learns of a match without opening the app. | P17 (needs step 0) |

**Later:** saved jobs (the live deck has no Save yet) · resume upload and blind review (P12) · preferences and ranking (P13) · first audio interview end to end (P21, needs a LiveKit account) · privacy export/deletion (P26).

## Decisions only you can make

| Blocks | Decision |
|---|---|
| C1 | D05: adult-only pilot first, or support 14–17 from day one (needs age-collection design). |
| P21 | Create a LiveKit project (free tier) for real audio interviews. |
| P23 | Final identity-sharing consent text; `synthetic-v1` is a placeholder. |
| P24 | D08: whether school name is revealed after the interview. |

## Swipe behaviour (implemented)

- **Employer:** one anonymous card at a time. Right = interested (a match if they already applied), left = pass, ↶ undoes the last pass. Interest can't be undone because it may already be a match. Arrow keys work on a focused card, and the buttons do the same as swiping.
- **Candidate:** one job at a time. Right = apply. It's refused with an explanation while eligibility/profile checks are pending. Left = pass, "Undo last pass" restores it.
- **Passes** are stored per candidate or per job team (`202610020006_swipe_passes.sql`). They are never shown to the other side and are not rejections.
