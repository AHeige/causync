# Offline and multi-tab policy

Offline replay is disabled unless a contract declares `offline: { mode: 'when-online', expiresAfterMs, reauthorize: true }`. `createOfflineDraft` captures finite JSON, stable identity and expiry without sending. `replayOfflineDraft` refuses expired drafts and calls the host's current authorization check before submission.

Browser persistence is opt-in because local storage can expose payloads to script running in the same origin. Use an opaque encrypted payload or a server-side draft when mutation input is sensitive. Scope keys by tenant and user, clear them on sign-out, and never move recovery data between scopes.

`createBrowserCoordinator` broadcasts mutation IDs so sibling tabs can refresh authoritative status without copying payloads. Wrap host sends with `runExclusive(resource, send)` when the browser supplies a lock manager. Broadcast delivery alone is not mutual exclusion and does not prove server idempotency; the database contract remains mandatory.
