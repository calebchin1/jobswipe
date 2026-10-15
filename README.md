# Swipe-to-Hire

TypeScript monorepo for a blind, swipe-based hiring marketplace for students and entry-level workers in Waterloo and the GTA.

Status: connected development build. Next.js employer and Expo candidate apps now support sign-in, private profile drafts, job publishing, persisted applications and mutual matches through shared PostgreSQL workflows. Interview scheduling is being integrated. A separate fictional walkthrough remains available without credentials. A fictional-data staging deployment exists; see [hosted staging](docs/11-connected-development.md#hosted-staging). There is no public launch.

“first.” is a temporary demo label, not a finalized product name.

## Run locally

Requires Node 22.13+ (developed with Node 24), Corepack or pnpm, and an internet connection for dependency installation.

```sh
corepack pnpm install
corepack pnpm dev
```

Open [the employer workspace](http://localhost:3000). Try interest → Interviews → book → simulate completed interview → rate all questions → lock scorecard → simulate candidate authorization → reveal. The simulated consent control exists only for the fictional walkthrough; the database permits only the candidate to authorize sharing.

```sh
corepack pnpm dev:mobile
```

Use Expo's terminal controls for an available simulator/device, or press `w` for a browser preview. See [candidate setup](apps/mobile/README.md). Apply/save/pass/undo and withdrawal are local to that client session. Reloading either demo resets its state. Do not enter real candidate information.

The workspace directory contains a colon. Scripts therefore use explicit Node executable paths instead of relying on `node_modules/.bin` entries in `PATH`; the package-manager warning is expected and does not require renaming your directory.

## Verify

```sh
corepack pnpm check
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm test:mobile
corepack pnpm test:db
corepack pnpm test:connected
```

Install the test browser once with `node node_modules/@playwright/test/cli.js install chromium`. Browser tests build and launch the employer app on port 3100, then exercise desktop and narrow mobile viewports. Database tests require a local development PostgreSQL administrator; see [isolated database test setup](supabase/README.md). They create and remove only uniquely named test databases and roles.

## Code map

| Location | Implemented responsibility |
|---|---|
| `apps/web` | Cookie authentication, connected employer jobs/deck/applications, interview scheduling, protected APIs and a separate synthetic walkthrough |
| `apps/mobile` | Native secure sessions, connected profiles/jobs/applications/booking and separate candidate demo tabs |
| `packages/contracts` | Shared Zod schemas and DTOs |
| `packages/domain` | Safe ranking inputs, synthetic fixtures, guarded lifecycle reducer |
| `packages/server` | Verified bearer-token forwarding, allowlisted RPC calls and output projections, safe errors |
| `supabase` | SQL permissions, immutable snapshots, guarded workflow functions, audit/outbox intents and real PostgreSQL tests |

Authenticated routes require server-only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` settings from `.env.example`, a configured Auth project, and the reviewed `app` RPC schema. Missing credentials fail closed. Never use a service-role key for these user requests. Web authentication uses HttpOnly cookies; native candidate authentication uses SecureStore. See [connected setup](docs/11-connected-development.md) and [build status and remaining integration](docs/10-build-status.md) before connecting real data.

The September 28, 2026 product plan is the source of product intent. The subsequent review supplies recommendations, not automatically accepted changes. This blueprint retains Expo for candidates, Next.js for employers, mutual swipes, an audio first interview, and identity reveal after that interview. Unsettled choices are explicitly marked.

## Read the plan

1. [Scope, decisions, and requirements](docs/01-product-scope.md)
2. [Repository and system architecture](docs/02-architecture.md)
3. [Database and authorization design](docs/03-data-and-access.md)
4. [API and shared contracts](docs/04-api-contracts.md)
5. [State transitions and background jobs](docs/05-workflows.md)
6. [Screens and client behaviour](docs/06-client-experience.md)
7. [Security, privacy, and operations](docs/07-security-and-operations.md)
8. [Implementation tickets and release gates](docs/08-implementation-plan.md)
9. [Technical and regulatory references](docs/09-references.md)

**Start with the [roadmap](docs/12-roadmap.md)**: current state and the next shippable steps for each side.

The October 13 backend slice adds private adults-only pilot onboarding and a local review console (`npm run review`). See [backend setup, required accounts and deployment handoff](docs/13-backend-setup.md).

Next integrations: trusted profile/business review, private eligibility, verified audio interviews, protected documents and reliable notifications. Production identity sharing still requires reviewed privacy policies, real interview evidence and protected document delivery.

## Planning conventions

- **Required**: specified in the original product plan, or necessary to enforce its promises.
- **Proposed**: engineering default that can be changed without assuming user approval.
- **Unresolved**: product or legal decision needed before the dependent feature goes live.
- **Beta**: first operational release, with manual operations where explicitly described.
- **Expansion**: planned extension after the core hiring flow is reliable.

Runtime/tool versions are pinned through package manifests and `pnpm-lock.yaml`. The planning documents describe the full intended system; [build status](docs/10-build-status.md) records what actually exists today.
