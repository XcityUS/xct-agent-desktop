# Hermes One account login

Signs the desktop app into a Hermes One account (on `hermes-one-backend`),
distinct from the per-provider model OAuth in [[provider-setup]].

It uses the OAuth 2.0 Device Authorization Grant (RFC 8628): the app shows a
code, opens the browser to approve it, and polls for a token — so it can then act
on the user's behalf.

The backend serves the grant (see the backend's `lat.md/device-login.md`); this
document covers the desktop half — the client, secure storage, IPC, and UI.

## Device login client

[[src/main/hermes-account.ts#startDeviceLogin]] runs the whole flow for a profile.

It POSTs `/api/device/code` (sending the machine hostname as `device_name`, which
the approval page shows), hands the code to the caller (`onCode`) so the browser
can open and the modal can show it, then polls `/api/device/token` until the grant
resolves. [[src/main/hermes-account.ts#cancelDeviceLogin]] stops an abandoned flow
(single-flight, mirroring [[src/main/hermes-auth.ts#runHermesAuthLogin]]).

The backend base URL is configurable via `HERMES_API_URL`, defaulting to the
local Nitro dev server (`http://localhost:3002`) — see
[[src/main/hermes-account.ts#getApiUrl]].

Each poll response is turned into the next action by the pure
[[src/main/hermes-account.ts#interpretTokenResponse]]: `pending` keeps polling,
`slow_down` backs off, `access_denied`/`expired_token` are terminal, and a token
ends the loop. Keeping it pure makes the RFC branch logic unit-testable without a
live server.

## Account store

[[src/main/account-store.ts#saveAccount]] persists the redeemed session to
`account.json` under the profile home, encrypting the bearer token at rest with
the OS keychain via Electron `safeStorage` — the same approach as
[[wallet-token-balances#Wallet Store]].

The token never leaves the main process: [[src/main/account-store.ts#getAccount]]
returns only the public profile (`apiUrl` + user), while
[[src/main/account-store.ts#getAccessToken]] decrypts the token for authenticated
backend calls, and [[src/main/account-store.ts#clearAccount]] signs out.

## IPC and UI

The main process exposes `hermes-account-login` (+ `-cancel`, `-get`, `-logout`)
in [[src/main/ipc/register.ts#registerIpcHandlers]].

The login handler opens the browser to the approval page and streams
progress/code events to the renderer. The preload bridge surfaces these as
`accountLogin`, `getAccount`, etc. on `window.hermesAPI` ([[src/preload/index.ts]]),
typed with the shared shapes in [[src/shared/account.ts]].

In the renderer, [[src/renderer/src/components/HermesAccountModal.tsx]] shows the
`user_code` to confirm and reports the result, and
[[src/renderer/src/screens/Providers/Providers.tsx]] hosts the "Hermes One
account" card that opens it and shows the signed-in identity with a Sign out
action.

## Auto-provisioned inference key and credits

Signing in should yield model access without hand-copying keys: the desktop auto-issues a Hermes One Inference gateway key from the account and shows the account's AI-credit balance on the Providers card.

[[src/main/hermesone-provision.ts]] is the convenience layer. `ensureHermesOneApiKey` checks the profile's `.env` for `HERMESONE_API_KEY`; when missing, it POSTs the backend's `/api/credits/keys` (bearer device-login token, key named `Hermes Desktop (<hostname>)` so the console list shows its origin) and persists the one-time raw `hs-live-…` key via `setEnvValue`. Setting that env var **is** what "adds the provider": the Hermes One card ([[provider-setup]]) and the active-model picker both key off it, so no store writes are needed. `fetchHermesOneCredits` GETs `/api/credits/balance` for the USD-denominated balance.

It runs from two places, both idempotent: the `hermes-account-login` IPC handler right after a successful device login, and the Providers screen whenever it loads with a signed-in account (covering users who signed in before this feature). Both are **local-mode only** — the key lands in the local profile `.env`, which remote/SSH chat doesn't read, and provisioning there would strand an orphan backend key per visit. The account card renders a credits chip (`$X.XX credits`, Coins icon) next to Connected/Sync-on, backed by the `hermesone-credits` IPC; a `created` result makes the screen re-read env so the Hermes One card appears immediately.

### Issues a key only when missing

An existing `HERMESONE_API_KEY` is always kept — the backend shows a raw key exactly once, so re-issuing would orphan the old one. No backend call happens at all in that case.

### Provisions and persists a fresh key

With a signed-in account and no local key, one authenticated POST issues the key and it is written to the target profile's `.env` under `HERMESONE_API_KEY`.

### Single-flight provisioning

Concurrent ensure calls (post-login hook + Providers screen mount) coalesce into a single backend key issue, preventing orphan keys.

### Credits for the account card

The balance endpoint is called with the bearer token and returns the numeric USD credit balance; signed-out or malformed responses yield `null` so the chip simply hides.

## Tests

Unit tests cover the two pieces that can break silently.

[[src/main/account-store.test.ts]] round-trips the encrypted token, asserts the
public shape never leaks it, and checks logout and the "secure storage
unavailable" guard. [[src/main/hermes-account.test.ts]] exercises
[[src/main/hermes-account.ts#interpretTokenResponse]] across every RFC branch and
the `HERMES_API_URL` default/override.
