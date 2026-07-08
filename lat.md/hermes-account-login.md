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

## Tests

Unit tests cover the two pieces that can break silently.

[[src/main/account-store.test.ts]] round-trips the encrypted token, asserts the
public shape never leaks it, and checks logout and the "secure storage
unavailable" guard. [[src/main/hermes-account.test.ts]] exercises
[[src/main/hermes-account.ts#interpretTokenResponse]] across every RFC branch and
the `HERMES_API_URL` default/override.
