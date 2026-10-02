# Employer workspace

A Next.js App Router employer application and separate synthetic demo, with the provisional **first.** wordmark. The brand is a working design, not a finalized product decision.

## Run

From the repository root, install the workspace and run `pnpm dev` (see the root README for the canonical startup command). The package scripts also support `dev`, `build`, `start`, and `typecheck`. They invoke package binaries through Node because this workspace path contains a colon.

## Authenticated workspace

- `/sign-up`: employer account creation with runtime validation and email-confirmation state.
- `/sign-in`: email/password sign-in through the same-origin authentication BFF, with visible confirmation-link failures.
- `/forgot-password` and `/reset-password`: non-enumerating reset requests, PKCE confirmation, verified recovery session, and password update.
- `/workspace`: authenticated account and organization context, company onboarding, verification status, scoped jobs, draft creation/editing, publication, anonymous candidate review, employer interest, and persisted application stages.
- `/`: independent synthetic walkthrough. Its data and simulated interview/reveal actions never feed the authenticated workspace.

Configure the server's Supabase environment as described in the repository README. The browser sends credentials only to same-origin API routes and relies on HttpOnly session cookies. It never stores tokens in browser storage, accepts caller-supplied account identities, or imports server packages.

A pending company can save drafts. Verified owners/recruiters can publish and review candidates. Viewers cannot send interest or mutate jobs. Company switching and authentication failures discard candidate/application data. These UI gates complement server/database authorization; they are not security boundaries.

The job form uses `LiveJobDraftSchema`, sends integer CAD minor units, validates annual-equivalent pay spreads, gathers vacancy/AI disclosures and structured questions, and derives age eligibility from workplace type rather than accepting employer age preferences. Saved drafts remain separate from published versions. Paused/closed roles retain application history; discovery requires an open job.

Live candidate cards contain only the approved DTO fields. Missing commute, availability, or identity information is not invented. The live workspace does not simulate interview completion or reveal identity. Calls, messaging and disclosure remain separate future integrations.

## Password recovery

Recovery requests use the official Supabase server SDK and the same HttpOnly cookie adapter as sign-in. The confirmation callback accepts only the explicit `/reset-password` recovery destination or the existing `/workspace` default; it never follows arbitrary return URLs. The one-use code is exchanged on the server and removed by redirect. Recovery readiness and password update both verify the user with Auth, and a successful update clears the local recovery session before returning to sign-in.

Configure the Supabase redirect allowlist for the application confirmation URL, including its `/reset-password` next parameter. Supabase's configured email delivery and rate limits apply. The current forms do not render a CAPTCHA challenge; integrating a configured challenge/token flow is required before enabling CAPTCHA enforcement for these forms. Automated tests mock recovery delivery and do not send emails.

Unit checks for the recovery boundary:

```sh
node node_modules/vitest/vitest.mjs run --config apps/web/vitest.config.mts
```

## Interview scheduling

The **Interviews** tab in each verified recruiter's job workspace supports real dated availability:

- Add an available 15–60 minute slot for an open job; local wall time is converted to UTC and the browser's IANA timezone is displayed and retained.
- Reject past dates, invalid calendar times, and ambiguous/nonexistent daylight-saving times rather than silently changing the requested time.
- List available slots, distinguish your availability from teammates', and remove only your own unbooked slots.
- Review upcoming anonymous bookings and explicitly cancel a scheduled interview, with an optional reason. Application history remains active.
- Inspect past/cancelled records without treating elapsed time as proof an interview occurred.

Slot overlap and participant authorization remain server/database responsibilities. Booked interviews include a protected calendar-file download. These ICS exports are static and do not update automatically after cancellation or rescheduling. External calendar syncing, invitations and notification delivery are not connected. The assigned interviewer can join a configured LiveKit audio room from 10 minutes before the interview until 15 minutes after its end. Joining starts muted; only explicit unmuting asks for microphone permission. Remote subscriptions accept microphone audio only, with an explicit playback recovery control when browsers block autoplay. Leaving the tab stops local tracks and disconnects. Access is rechecked every 30 seconds and failure closes the connection; these browser checks supplement server authorization and cancellation, rather than replacing them. Tokens remain in memory. The authenticated scheduler does not offer completion, attendance, scorecard or identity-reveal controls.

## Synthetic walkthrough

1. Review an anonymous candidate, inspect profile details, and select **I’m interested**. The first two fictional profiles already applied, so mutual interest creates a match. The third only records employer interest.
2. Open **Your pipeline**, then select the match.
3. Book the fixed synthetic interview slot and simulate completion by both participants. No microphone, calendar provider, or call is connected.
4. Rate all three questions and submit the scorecard. Scores become immutable through the shared domain reducer.
5. Simulate candidate authorization, then reveal the fictional identity. Production must authenticate the candidate separately; the demo exposes both roles for walkthrough purposes.
6. Simulate candidate withdrawal to revoke future identity access and remove the match. **Reset demo** restores the initial fixture.

Candidate actions support labelled buttons and card-focused arrow keys. Arrow keys never act while focus is inside a child control. One undo of a pass or unmatched employer interest is available per session. Creating a mutual match clears undo and cannot be rolled back; navigating to workflow screens discards the undo snapshot so it cannot roll back subsequent scorecard or reveal events.

## Current scope

- Responsive employer shell, anonymous card deck, applied-only filter and profile details.
- Match pipeline, simulated interview, locked scorecard, guarded reveal, and withdrawal.
- A single fictional Northside Coffee hiring role. The **Edit demo job** form edits its local display with shared schema validation; it does not create persisted postings or change a published snapshot. Persistent job creation is available separately at `/workspace`. Other companies' fixture jobs are intentionally not exposed in this employer workspace.
- Hourly CAD pay validation, annual-equivalent range validation, prohibited Canadian-experience requirement feedback, vacancy and AI disclosure fields.
- Clear synthetic-demo notice, empty states, live action feedback, reset, reduced-motion styles, and keyboard focus outlines.

The interface uses `@swipe/domain` for lifecycle transitions and `@swipe/contracts` for job validation. It does not establish an authentication or authorization boundary. All local state resets on refresh. No real candidate information, resumes, secrets, provider calls, or emails belong in this demo.

## Validation

Run isolated authenticated-client browser checks with:

```sh
node node_modules/@playwright/test/cli.js test --config apps/web/playwright.config.ts
```

These tests use mocked API responses to isolate UI behavior on desktop and mobile. They cover sign-in transport, email confirmation, pending verification gates, persisted response handling, paused application history, expired sessions, posting validation, availability creation/removal, booked cancellation, and daylight-saving edge cases. They do not substitute for the repository's actual database/API integration tests.

The initial UI passed TypeScript checking and a Next.js 16.3.6 production build. Repository-level tests exercise shared transitions; browser end-to-end coverage is maintained at the repository level. Database permission verification is separate from this synthetic client.
