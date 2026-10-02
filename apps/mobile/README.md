# Candidate app: demo and connected modes

Expo Router candidate client with four tabs: Discover, Saved, Applications, and Profile. Job details and application timelines are navigable routes. Apply, pass, save, one-pass undo, editable demo headline, visibility, and confirmed withdrawal work within the current session. All jobs, employers, and profiles in these demo tabs are fictional. “first.” is a working demo label, not a finalized brand.

From the repository root, install dependencies with `pnpm install`, then run `pnpm --filter @swipe/mobile dev`. Use Expo's terminal controls to open an installed iOS simulator or Android emulator. `pnpm --filter @swipe/mobile web` provides a browser preview. Run `pnpm --filter @swipe/mobile typecheck` for static validation.

The accessible labelled buttons implement the demo deck controls. Swipe gestures, uploads, chat, and identity sharing are not implemented. Development audio calls are separate from verified interview completion. Interview scheduling is available in connected mode. Schema-validated demo fixtures come from `@swipe/domain`; their mobile presentation adapter and local session state live in `src/demo.tsx`. The demo collects no private identity fields and sends no application. Connected authentication and API-backed candidate actions live in separate routes described below.

Native execution requires device/simulator testing before release. No production credentials, signing configuration, or deployment is included.

## Connected candidate mode

The Profile tab links to **Connect a real candidate account**. This opens a separate live area, preserving the fictional demo. Configure only public values before starting or exporting Expo:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
EXPO_PUBLIC_API_URL=https://your-api.example
```

Use `--clear` when starting or exporting after changing public environment values, so Metro does not reuse a bundle with previous connection settings. The API URL is the origin/base URL, without `/api/v1`. Local HTTP is accepted for localhost, 127.0.0.1, and Android-emulator host alias 10.0.2.2. Use HTTPS for physical-device connections to a remote development server. The API must allow the browser preview origin through its configured CORS policy. Never set a service-role key or other secret in Expo public variables.

Connected screens support email/password sign-in, candidate signup/bootstrap, pending-review profile editing, approved profile preview, open-job pagination, server-confirmed applications, and confirmed withdrawal. Matched candidates can list employer-offered interview slots, confirm a reservation, view their schedule, and cancel without withdrawing the application. Slot timestamps are UTC on the wire and displayed with the device time zone and zone abbreviation; server-side transactions decide availability and conflicts. Jobs remain browseable while profile/eligibility review is pending; only the server can approve applying. No name, birth date, resume, chat, interview completion, or identity sharing is collected or implemented in this live slice. Scheduling alone never changes completion or reveal eligibility. Status refetches on screen focus and manual refresh. Failures surface explicitly with no fictional fallback.

Native sessions use chunked encrypted SecureStore with serialized refresh/removal; browser preview sessions are memory-only and clear on reload. AppState controls token refresh and listeners clean up on unmount. Signing out or changing users clears live screen caches.

Storage tests: `node node_modules/vitest/vitest.mjs run --config apps/mobile/vitest.config.mts` from the repository root.

The connected browser tests use mocked provider/API responses, not a hosted account. Build a dedicated test export from `apps/mobile` with public test values:

```sh
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:3111 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-public-placeholder EXPO_PUBLIC_API_URL=http://127.0.0.1:3111 node node_modules/expo/bin/cli export --platform web --output-dir dist-live --clear
```

Then, from the repository root: `node node_modules/@playwright/test/cli.js test --config apps/mobile/playwright.live.config.ts`. Native secure storage and device login still require device validation against a configured Supabase deployment.

The repository's `tests/connected/mobile.spec.ts` adds a no-mock browser integration flow against the disposable auth gateway, actual Next.js API and test database. The root connected-test runner exports a separately configured `dist-connected` bundle, serves it with SPA deep-link fallback at `TEST_MOBILE_URL`, and supplies synthetic account credentials. That test verifies a bookstore application survives browser-session expiry and that withdrawal persists in the database. It must run through the root orchestrator rather than the mocked-service config above.

## Authentication limitations and recovery

With Supabase’s standard provider-hosted confirmation-link flow, complete the confirmation link in a browser, then return to the app and sign in with the password. This manual return does not require the app to consume the callback token. Custom email templates that route a token hash to your own verification endpoint require that endpoint to be implemented and are not supported automatically. Hosted email delivery and confirmation have not been exercised in the disposable test gateway. Native callback/deep-link handling, PKCE code exchange, OAuth, password-reset links and magic links are not implemented; `detectSessionInUrl` is intentionally off. Configure a valid provider Site URL/confirmation destination; the app does not automatically consume tokens from an incoming URL. See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords) and [native deep-link setup](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

A failed/offline sign-out is reported as unconfirmed and the account remains visibly signed in; it does not claim remote revocation or successful deletion of device state. Retry when connectivity is restored. Session restoration/storage failures show recovery instructions. Auth session boundaries invalidate pending requests and cached screens even when the same user signs out and signs back in; ordinary access-token refresh preserves that boundary.

See [LIVEKIT-NEXT.md](LIVEKIT-NEXT.md) for the smallest proposed native audio integration and official dependency/configuration references. The native SDK dependencies are installed; native media still requires a development build and real-device validation.

## Reviewed profile proposals

Trusted reviewers may prepare a blind-profile proposal from a specific saved draft revision. The candidate profile screen shows that immutable proposal, the candidate’s submitted draft, and any currently published version. **Approve this exact version** submits only the proposal ID; the server verifies ownership and current revision before publishing. This approval does not grant work/age eligibility.

Candidates cannot edit reviewer proposal bytes. They can instead edit and resubmit their own draft for another review. Unsaved edits disable proposal approval, and saving a new draft invalidates the old proposal while leaving the previous published version unchanged. A stale-approval rejection refreshes the proposal without automatically approving a replacement. `awaiting_approval` is distinct from both reviewer-pending and published states.


## Development audio calls

Assigned participants can open an interview’s audio lobby and explicitly **Join audio interview muted**. The app requests a short-lived server authorization only on that action. The SDK starts without publishing a microphone; **Enable microphone** is a separate action and may trigger OS/browser permission. Web playback has a user-action recovery button if the browser blocks it. Connection/reconnection and local mute state are shown, without claiming verified attendance.

LiveKit tokens remain in component memory only and SDK logging is silenced. Live server authorization is rechecked every 30 seconds; failed or uncertain authorization closes the local room. The client also disconnects at the scheduled end plus 15 minutes. Leave, navigation, session change and native backgrounding stop local tracks and disconnect. Temporary native inactive state during an OS permission prompt is allowed. Native round-one configuration removes the iOS camera usage description, blocks Android camera/media-projection permissions and disables screen-sharing service configuration. No camera/screen/data controls exist.

Native SDK loading and audio-session initialization happen only after Join. Expo Go does not support these native media modules: use an Expo development build. Native media, Bluetooth/routing and OS interruptions have not been verified on physical devices. Calls do not mark interviews complete or grant identity reveal. Provider attendance reconciliation and production readiness remain separate work.
