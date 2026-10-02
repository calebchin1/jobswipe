# Repository and system architecture

## Logical topology

```text
Expo candidate app -----------+
                             +--> Next.js API --> domain services --> Postgres
Next.js employer/admin UI ----+         |              |                  |
                                       |              +--> private files |
                                       |                                 +--> outbox
                                       +--> token issuance --> LiveKit          |
                                                                              v
Supabase Auth --> user sessions                dispatcher --> Inngest workers
                                                               |
                                  Resend / Expo Push / resume processors / timers

Realtime: private, authorized invalidation events -> clients refetch API DTOs
```

Keep one deployable API and one logical database. Do not create microservices for each feature. Document extraction may need a separate worker runtime because of binary dependencies, memory, file size, and execution duration; spike this before choosing its deployment target.

## Proposed repository

```text
apps/
  mobile/
    app/                         Expo Router route groups
    src/features/                auth, onboarding, deck, applications, chat, calls
    src/components/              native components and accessibility wrappers
    src/lib/                     secure session storage, API client, notifications
    src/theme/                   tokens mapped to React Native
    assets/
    app.config.ts                native config and environment selection
    eas.json                     development, preview, production build profiles
  web/
    app/(public)/                landing, public jobs, policies, auth
    app/(employer)/              company, jobs, deck, pipeline, interviews
    app/(admin)/                 verification, reports, review queues
    app/api/v1/                  thin route handlers
    app/api/webhooks/            verified provider callbacks
    src/components/              web UI and accessible primitives
    src/lib/                     cookie session adapter and server composition root
packages/
  contracts/src/                 Zod request/response schemas, opaque IDs, events
  domain/src/                    pure rules, ranking, transitions, policy evaluation
  server/src/
    auth/                        actor context, authorization, CSRF
    modules/                     use cases grouped by business capability
    repositories/                SQL/RPC boundary and approved projections
    providers/                   mail, calls, files, jobs, geo adapters
    audit/                       protected append operations
  jobs/src/                      event consumers, scheduled reconciliation
  documents/src/                 extraction adapters, structures, PDF templates
  emails/src/                    React Email templates and safe subjects
  design-tokens/src/             colours, spacing, typography primitives
  test-fixtures/src/             synthetic users, clocks, fake providers
  config/                       shared lint/TS/test configuration
supabase/
  migrations/                   ordered, reviewable SQL and grants
  tests/                        authorization and transition tests
  seed.sql                      local synthetic data only
tests/
  integration/                  provider adapter and transaction tests
  e2e/web/                      employer/admin browser flows
  e2e/mobile/                   candidate device flows
docs/                           this plan, later ADRs and runbooks
.github/workflows/              CI and controlled deployment checks
```

Do not create placeholder packages before they have code. `contracts`, `domain`, and `server` are the first shared packages. Split documents/emails/jobs when their implementations begin.

## Dependency direction

- `contracts` contains serializable public structures; never database rows or credentials.
- `domain` imports contracts and pure utilities, never framework/server SDKs.
- `server` implements use cases and imports domain plus adapters; mark server-only boundaries and enforce import restrictions.
- `jobs` invokes the same server use cases as request handlers, using an explicit worker actor.
- `mobile` imports contracts, API client helpers, domain presentation helpers, tokens. Never imports server, generated full database types, email templates or original documents.
- Web client components follow the same restriction. Web server components may call services with verified actor context; they do not bypass authorization.
- UI widgets remain platform-specific; share semantic tokens and validation, not a universal component framework.

## Module responsibilities

| Module | Owns | Must not do |
|---|---|---|
| auth/accounts | Session verification, account state, role membership | Trust client-supplied roles |
| organizations/trust | Seats, verification, suspensions, invitations | Let domain control imply hiring authority automatically |
| profiles | Drafts, approved snapshots, discovery status | Publish raw free text |
| eligibility | Reviewed age/work rules, server-derived eligibility | Return birth date or detailed exclusion rationale to employers |
| jobs | Publication, rule validation, version snapshots | Mutate historical published content |
| discovery | Filtered decks, ranking, reasons, exposure | Read identity data in fit scoring |
| applications | Interest, match, withdraw, final outcome | Treat a mutable UI column as the source of truth |
| messaging | Persist only recipient-safe content, moderation | Broadcast raw pre-mask message |
| documents | Quarantine, process, review, generate and version | Send originals to employer before authorized disclosure |
| scheduling/interviews | Slots, booking, attendance, call grants | Trust “call finished” from client |
| evaluation | Draft scores, submission, immutable final snapshot | Let reveal depend on an editable scorecard |
| disclosure | Consent scope, grants, protected downloads | Grant table-wide access to private data |
| compliance | Deadlines, truthful notices, version retention | Infer employer hiring decisions from silence |
| notifications | Delivery attempts, preferences, receipts | Store resume or message content in analytics |
| privacy/audit | Export, deletion, retention, access trail | Promise recall of previously downloaded data |

## Persistence and authentication strategy

Use Supabase Auth for identity. Mobile uses bearer sessions persisted with secure native storage; web uses the supported server cookie flow. Verify sessions at each protected API entry; derive account/organization access from current database state. A person may have multiple role memberships; do not force a single immutable candidate/employer enum.

Ordinary user operations use the caller's database identity and restricted RPCs. Private schema tables have no direct API grants. Narrow database routines may read them after validating `auth.uid()` and current membership; security-definer routines use a fixed safe search path, schema-qualified names, restricted execute grants, and no caller-selected actor ID. Background jobs use a distinct server-only worker credential where possible. Never use one broad admin client for every request.

Database RLS remains defense in depth. Granting access to a row does not redact columns. Approved API DTOs and split storage enforce field-level boundaries. See [Supabase authorization reference](09-references.md#technical).

## Toolchain decisions

| Concern | Proposed selection | Implementation checkpoint |
|---|---|---|
| Workspace | pnpm + Turborepo + TypeScript strict mode | Pin compatible Node/package-manager versions |
| Web | Next.js App Router, Tailwind, shadcn/ui | Confirm server/client module boundaries |
| Mobile | Expo Router + React Native | Use development builds for native calling SDK; Expo Go is not the acceptance environment |
| Validation | Zod at boundaries | Generate OpenAPI from the selected compatible tooling |
| Client server state | TanStack Query | Separate keys by user and organization; purge on logout |
| Database changes | Supabase SQL migrations | SQL is authoritative; generate internal DB types |
| Jobs | Inngest behind an adapter | Validate retries, secrets, deployment/runtime limits |
| Calls | LiveKit client/server SDKs | Actual device microphone, backgrounding, reconnect, denied-camera spike |
| Tests | Vitest, database tests, Playwright, Maestro | Verify supported versions at scaffold time |
| Observability | Sentry + PostHog, privacy-safe events | Sensitive route replay disabled |

Choose extraction and malware-scanning tools only after PDF/DOCX fixtures establish fidelity and safe runtime limits. Do not promise a particular library can reliably parse every resume.

## Configuration inventory

Public configuration: API base URL, Supabase project URL and publishable key, release environment identifier, privacy-safe telemetry configuration. Anything bundled into Expo or a web client is public.

Server secrets: database/worker credentials, LiveKit API credentials, Resend key, workflow signing keys, webhook secrets, document-processing credentials, eligibility encryption key reference. Encryption keys must be managed separately from database backups. Actual names and provider-specific formats are set during integration.

Feature configuration: discovery enabled, automated redaction enabled, allowed launch regions, ads enabled, video round two enabled, attachment delivery mode, legally reviewed eligibility policy version. Safe defaults disable optional expansion. Core security checks cannot be toggled off.

## Deployment boundaries

Separate local, staging, and production Supabase/LiveKit/email environments. Vercel previews never receive production database credentials. Staging emails go only to allowlisted recipients. Production mobile builds point only to production APIs; preview builds use distinct app identifiers.

Version mobile-facing contracts under `/api/v1`. Support older installed clients during an announced compatibility window. Prefer additive DTO changes. A minimum-supported-app response may block obsolete sensitive flows when a migration cannot be backward compatible.
