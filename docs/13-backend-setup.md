# Backend setup and handoff

October 13, 2026. The user selected an adults-only first pilot (18+). Code is built and tested locally. October 14: migration 007 is now applied to the existing fictional-data Supabase staging project; the web/candidate code has not been deployed to Vercel by this task.

## Built in this slice

- Migration `202610130007_adult_pilot_eligibility.sql`: private immutable declaration history and authenticated own-candidate RPCs. Both age 18+ and Ontario work authorization must be declared. The server fixes the policy to `adult-pilot-v1`, derives the 18+ band, and uses a 90-day renewal interval. Unchecked declarations remove the derived eligibility gate; expired records block new applications. Profile review/publication remains independently required. Existing applications are not automatically withdrawn.
- `GET /api/v1/candidate/eligibility` and `POST /api/v1/candidate/eligibility`: verified sessions, strict request/response schemas, no caller-supplied identity, dates or age bands. Employers cannot read these records. The authenticated Expo profile screen provides the declaration form.
- `npm run review`: local operator console at `http://127.0.0.1:3200`. Business verification and profile proposals reuse the existing scoped SQL review functions and audit trail. Candidate approval still publishes the exact proposal. The console does not grant reviewer privileges, approve eligibility or complete interviews.

The declaration records self-attestation, not identity/document verification. Its 90-day renewal is an initial implementation choice, not a claim about a legal requirement. Existing synthetic fixtures remain test data; do not carry synthetic eligibility into a real-user pilot.

## Connect the existing services

October 14 update: the user selected LiveKit project [p_257tohbuho0](https://cloud.livekit.io/projects/p_257tohbuho0/overview). No custom email domain exists yet; use the user's Gmail address as a test recipient. The user's unsaved `apps/web/.env.local` edits were saved in VS Code. LiveKit credentials passed an authenticated read-only room-service request at `wss://job-scroller-uz1rucm2.livekit.cloud`. Existing staging Supabase settings were copied into the ignored local web environment and the Auth endpoint/publishable key verified. The candidate browser app now has matching public settings; local CORS allows both localhost:8081 and 127.0.0.1:8081. These checks do not verify a two-person microphone call. Hosted environment variables are unchanged.

Migration 007 was applied transactionally after verifying migrations 004–006 were present. The authenticated-only RPC privileges, private history table access and RLS were checked, PostgREST's schema was reloaded, and anonymous RPC access correctly returned permission denial. The running local candidate API also correctly requires sign-in. The existing individual reviewer connection was saved to ignored `.env.review`; `npm run review` loads it automatically. Both review queues loaded successfully through that scoped login at `http://127.0.0.1:3200`, without approving or modifying any review records. No new reviewer login or privileges were created.

For domain-free initial authentication testing, Supabase's built-in mailer can send to addresses on the project's team, subject to its development limits. Confirm the test address is a project team member. This does not connect application notification delivery or enable email to arbitrary pilot users; those still require a sender/provider setup. See the [current SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

| Service | Existing location / setup link | Information or action needed |
|---|---|---|
| Supabase | [Existing project](https://supabase.com/dashboard/project/ifakmwzewuhhqjusdbdc) | Local settings connected and migration 007 installed on staging. Deploy the matching API and candidate builds before testing the new flow on hosted apps. |
| Auth email | [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) | Choose a mail provider, verify a sender domain, and configure SMTP in Supabase. Provide the sender address and domain/DNS dashboard link. Confirmation and recovery email delivery still need a real staging test. |
| Hosting | [Existing employer staging](https://swipe-hire-web.vercel.app), [candidate staging](https://swipe-hire-candidate.vercel.app) | Deploy matching web/candidate code and configure server environment variables. Set the Auth site URL and exact confirmation redirects. Migration 007 is installed; Vercel code/environment updates remain. |
| Operator review | Local console, `npm run review` | Existing individual reviewer login saved to `.env.review` locally; no new grants. The console uses verified TLS and scoped review functions. Keep its credential on the operator machine. |
| Audio interviews | [Selected project p_257tohbuho0](https://cloud.livekit.io/projects/p_257tohbuho0/overview), [documentation](https://docs.livekit.io/intro/cloud/) | Local credentials verified with a read-only provider request. Hosted server environment, two-party audio/device verification and attendance-evidence work remain. |

Share project/dashboard links, intended domains, sender address, and operator identity. Add secrets through local ignored environment files or the provider's environment settings; do not paste passwords, database URLs containing passwords, or API secrets into chat.

## Local setup

1. Configure `apps/web/.env.local` from the root `.env.example` with the development Supabase project. Use the exact local app origin (`http://127.0.0.1:3000` if using the current preview).
2. Apply ordered migrations in the development database. After 007, run `notify pgrst, 'reload schema';`. The public API exposes `app`; `private`, `ops`, and `review` stay unexposed.
3. Configure the candidate app from `apps/mobile/.env.example`; exported public settings require rebuilding with `--clear`. Browser candidate previews need their exact origin in `ALLOWED_CLIENT_ORIGINS`.
4. Start the employer API with `npm run dev`, and the candidate app with `npm run dev:mobile`.
5. For review, the dedicated operator configuration is now saved in ignored root `.env.review`. Launch `npm run review`. This file contains `SWIPE_REVIEW_DATABASE_URL` and optionally `SWIPE_REVIEW_PORT`. The console binds only to `127.0.0.1` and refuses other hosts/origins. Without credentials it displays an unavailable queue, never fabricated records.

## Remaining work

Reliable email/push outbox workers; real audio attendance evidence; protected resume intake and delivery; final identity-sharing consent; live saved jobs/chat; operator/team administration; and real-device testing. None of these are represented as connected merely because their database foundation exists.

## Validation commands

```sh
npm run check
npm run test:db
node --test scripts/review-console.test.mjs
npm run test:connected
```

Database and connected checks create isolated local PostgreSQL databases and temporary roles. Hosted Supabase, SMTP, LiveKit, and native physical devices require separate verification after configuration.
