# Connected development

September 29, 2026. The synthetic walkthrough at `/` remains separate from `/workspace`, which uses authenticated APIs and persisted database state. The candidate app also distinguishes its demo tabs from signed-in account/live screens. Live failures never load demo data as a substitute.

## Supabase project setup

Use an isolated development project with fictional accounts. Apply the ordered migrations in `supabase/migrations`, using the migration owner. Supabase supplies `auth.uid()` and the `authenticated`/`anon` roles. Expose only the `app` schema to PostgREST; never expose `private` or `ops`. Do not grant user clients direct access to private tables or use a service-role key for requests.

Copy the root `.env.example` into `apps/web/.env.local`, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the exact `APP_ORIGIN`. Set the Auth site URL and allow the exact `${APP_ORIGIN}/auth/confirm` redirect. Web signup uses email/password and a PKCE confirmation exchange. Enable email confirmation and appropriate provider rate limits/CAPTCHA before inviting public users. Email confirmation delivery depends on the project's Auth email configuration.

Web sessions use HttpOnly, SameSite=Lax cookies, Secure over HTTPS. Mutation endpoints require the exact application Origin. After cookie refresh, each protected request verifies the access token through Auth and forwards the caller's JWT to the allowlisted RPC. No browser-readable token storage is used by the employer app. A loopback development origin is accepted; a public deployment requires an explicit HTTPS `APP_ORIGIN`.

The candidate app uses the public settings in `apps/mobile/.env.example`. Native sessions use chunked Expo SecureStore; browser previews keep tokens in memory. Add the preview's exact origin to the web server's `ALLOWED_CLIENT_ORIGINS` for Bearer API calls. This CORS list does not enable cross-origin cookies. Restart/export Expo with `--clear` when changing public build-time settings.

## Account and publication boundaries

An authenticated account can provision candidate or employer product roles. Neither role grants operational privileges. Creating a business produces an unverified organization; entering a website does not verify ownership. Pending organizations can prepare drafts but cannot publish or browse candidate cards.

Candidates save private profile drafts. Draft text is not automatically approved or exposed to recruiters. A profile's discoverability can be toggled independently from editing its draft. Existing approved profiles remain distinct from pending edits. Hiding a profile prevents proactive discovery, but an explicit application permits that job's recruiters to review its approved anonymous card. Withdrawal is terminal and removes the candidate's headline/card from the employer application list.

New candidate accounts cannot apply until profile review and eligibility are complete. This slice does not collect date of birth or attest work entitlement in production. No user endpoint can approve a profile, verify a company, alter eligibility, complete an interview, or grant itself identity access. Operational review interfaces are still being built; fixture approvals are test setup only.

## Posting rules implemented

Job writes validate pay, schedule, structured questions, vacancy/AI disclosures, and supported workplace categories. Publication freezes a new immutable version, preserving earlier application snapshots. Editing a draft does not change the public posting until publish succeeds.

The product requires pay information and limits annual-equivalent range width for every employer as a platform policy. Ontario's statutory scope and exemptions are narrower; this form is not a compliance certification. The supported workplace categories use the minimum-age mapping in [Ontario's minimum-age guidance](https://www.ontario.ca/page/minimum-age-work). Additional job duties, school-hour restrictions and other legal eligibility conditions still need complete handling before real candidates are onboarded. Review the [Ontario posting requirements](https://www.ontario.ca/document/your-guide-employment-standards-act-0/requirements-related-publicly-advertised-job) before launch.

## Provider limitations

A configured Supabase project is needed for hosted authentication and PostgREST. Local protocol tests can exercise route behavior and real PostgreSQL authorization without claiming hosted provider validation. The live screens currently support profile drafts, jobs, apply, employer interest, matches, applications and withdrawal. Calls, resume files, reveal emails, notifications and public deployment are separate integrations; the synthetic interview/reveal walkthrough does not make them live.

## Hosted staging

October 1, 2026. Fictional accounts only; not a public launch.

| Piece | Location |
|---|---|
| Employer app (Next.js) | https://swipe-hire-web.vercel.app — Vercel project `swipe-hire-web`, root `apps/web` |
| Candidate app (Expo web export) | https://swipe-hire-candidate.vercel.app — Vercel project `swipe-hire-candidate`, root `apps/mobile`, SPA fallback in `apps/mobile/vercel.json` |
| Database/Auth | Supabase free project `ifakmwzewuhhqjusdbdc` (ca-central-1), provisioned through the Vercel Marketplace and connected to `swipe-hire-web` |

Setup performed: all five migrations applied in order as `postgres`; PostgREST exposes `public, graphql_public, app` via `alter role authenticator set pgrst.db_schemas` (`private`, `ops`, `review` stay unexposed — verified). After applying a migration, run `notify pgrst, 'reload schema';` or new RPCs return `PGRST202`.

Hosted Auth rejects reserved domains and the default mailer does not deliver confirmations, so self-service signup cannot complete on staging until custom SMTP and the Auth site URL/redirect (`https://swipe-hire-web.vercel.app/auth/confirm`) are configured in the Supabase dashboard. Instead, `scripts/staging.mjs` (operator machine only, `@example.com` only, refuses a mismatched project) creates pre-confirmed users with the Admin API, then provisions roles through `app.ensure_account` using the user's own session. It also writes synthetic `synthetic-v1` eligibility, which has no collection path yet, and creates individual reviewer logins for `scripts/review.mjs`. Both scripts verify database TLS against Supabase's CA (`sslmode=verify-full`).

Operator settings live in the gitignored `.staging/.env.staging` (`set -a; source .staging/.env.staging; set +a`). Deploys run from the repository root: `vercel deploy --prod` for the employer app; for the candidate app set `VERCEL_PROJECT_ID` to `swipe-hire-candidate`'s ID. Expo public settings are build-time; redeploy after changing them.

Verified on staging over real HTTP: employer cookie sign-in → organization → reviewer verification → job publish; candidate Bearer session from the candidate origin → profile draft → reviewer proposal → candidate approval → apply → employer interest → **Matched**. Cross-origin cookie mutations return `ORIGIN_DENIED`; CORS allows only the candidate origin. Browser UI sign-in on staging has not been exercised by automation.

Known staging caveats: the Marketplace integration also injects secret/service-role and Postgres variables into the `swipe-hire-web` runtime; the app never reads them, but removing them from that project would narrow exposure. Password recovery depends on the same unconfigured mailer.
