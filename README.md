# Causync

**A causal mutation runtime for distributed applications.**

Causync combines *causal* and *sync*: every visible change remains connected to the user intent that caused it and the evidence that eventually confirms it. It is a causal mutation runtime for frontend applications. It models user intent, provisional state, server acceptance, projection evidence and recovery explicitly. React is an optional adapter; the core imports no framework, cache, database or Sefira code.

The current release line is `0.1.0-alpha`. It is intentionally published under the npm `next` tag while the API is exercised in independent applications. It includes independent package verification, finite-JSON recovery, coverage-aware compaction, host conformance, Standard Schema contracts, machine-readable generation, framework adapters and durable recovery primitives. Causync does not include Sefira or any other host application.

## Public entrypoints

| Import | Environment | Supported surface |
| --- | --- | --- |
| `causync` | Modern ESM browsers and Node.js 20+ | Framework-neutral journal, contracts, recovery, persistence and browser coordination |
| `causync/react` | React 18 or 19 | Provider, hooks, presentation-state mapping and unstyled devtools |
| `causync/testing` | Test and conformance environments | Deterministic harnesses and conformance runners |
| `causync/generator` | Modern ESM runtimes | Dependency-free manifest-to-TypeScript generation |
| `causync/swr` | Modern ESM browsers and Node.js 20+ | Structural SWR read/coverage adapter; no SWR dependency |
| `causync/tanstack-query` | Modern ESM browsers and Node.js 20+ | Structural TanStack Query read/coverage adapter; no TanStack dependency |

Only these package entrypoints are public. Imports from `causync/dist/...` are unsupported and blocked by the package export map. Causync is ESM-only. The `causync` core has no runtime dependencies; React is an optional peer dependency and is required only when importing `causync/react`. The `causync` CLI is Node-only. No entrypoint assumes Next.js, Sefira, event sourcing, SWR or TanStack Query.

## Interaction contract

Every action chooses a strategy:

- **optimistic**: immediately project a deterministic desired value; show pending on its control.
- **acknowledged**: acknowledge the click immediately, then display only evidenced results (for example, generated output).
- **confirmation-first**: the host obtains the user's required confirmation before submitting; show pending during execution.

The core does not show dialogs or manufacture successful outcomes. Loading remains useful for initial reads, genuinely unknown content and external work. An already loaded workspace remains mounted during small mutations.

## Core API

```ts
import { createMutationJournal, createMutationRegistry, type Contract } from 'causync'

type Input = { action: 'item.title.set'; itemId: string; desiredTitle: string }
type Receipt = { mutationId: string; itemId: string; eventId: string }

// The application supplies authorization, transport, receipt validation and
// projection lookup. Their promises must represent real evidence.
declare const contract: Contract<Input, Receipt>
const journal = createMutationJournal<Input, Receipt>()
const registry = createMutationRegistry<Input, Receipt>(input => input.action)
  .register('item.title.set', contract)
const operation = registry.submit(journal, {
  action: 'item.title.set', itemId: '42', desiredTitle: 'A clear title'
})

// The snapshot and overlay are already visible here, before any response.
const optimisticOperations = journal.overlays('item:42') // contract.resource defines the key
const receipt = await operation.settled

// Capture coverage before I/O. The host promises an uncached, authoritative read.
declare function readItems(): Promise<unknown>
const read = await journal.readCovered(readItems, (value, operation) => {
  // Decide from authoritative host data whether this operation is incorporated.
  return true
})
const remainingOverlays = journal.overlays(undefined, read.confirmedIds)
```

`Contract` declares intent, strategy, resource identity, submission fingerprint, duplicate policy, retry safety, transport, acceptance validation, reconciliation and error classification. `createCausyncContract` also validates the declaration and freezes it. `createMutationRegistry` gives every host one typed action entry point and rejects unknown or duplicate registrations. A generic HTTP 200 is insufficient acceptance evidence. In an event-sourced host, the receipt must identify the persisted event and its projected result.

Contracts may provide `schemas.input` and `schemas.receipt` using any Standard Schema v1 implementation, including Zod 4. Input validation is synchronous and happens before operation identity or an optimistic overlay exists. Receipt validation may be asynchronous and happens before acceptance. Invalid network evidence becomes an unknown outcome rather than false confirmation.

## Manifest and generation

`describeContract` turns a real contract plus its resource and evidence descriptions into a versioned manifest entry. `createContractManifest` rejects duplicate actions and contract ids. Examples must use the same finite-JSON boundary as recovery. Generate a checked TypeScript catalog with:

```bash
causync generate --manifest causync.manifest.json --out generated/causync-contracts.ts
```

The output contains literal action and contract-id unions, command/receipt envelope types and declared fixtures. The generator validates the manifest before writing and emits deterministic source suitable for CI drift checks. It does not generate domain authorization or pretend a JSON example proves server behavior.

`causync check --manifest … --generated …` fails when a checked catalog drifts. `causync conformance --adapter …` imports a host fault harness exported as `causyncConformance` and runs the shared lifecycle suite; an optional `causyncDelayedConfirmation` export adds projection coverage. `llms.txt` and `AGENTS.md` tell coding agents which decisions remain host-owned.

The journal serializes writes per resource, while different resources can run independently. Consecutive identical in-flight submissions single-flight. A → B → A remains three intentions by default. Inputs are cloned at submission; hosts treat journal snapshots and captured inputs as read-only. `queue-all` preserves every activation. `latest-unsent` keeps the in-flight write and replaces only queued desired values that have not reached transport; replaced promises reject with `MutationSuperseded` and never become overlays or writes. Use it only when intermediate unsent values carry no business meaning.

Rejected operations withdraw only their own overlays. Conflicts and unknown outcomes pause dependent writes and preserve their drafts. `dismiss(id, { queued: 'discard' | 'continue' })` requires an explicit host decision after authoritative review. Reviewing a saved value must not accidentally replay queued writes.

`pending → accepted → confirmed` represents increasingly strong evidence. A failed reconciliation after acceptance becomes protocol state `uncertain`, because it does not prove that the write failed. The React adapter maps that state to the UX presentation `needs-attention`. Confirmed overlays remain until reads cover them or the host retires them after every consuming view has incorporated their outcome.

`retry` preserves identity and captured input. Without an acceptance receipt it requires the contract's explicit `idempotent` server guarantee. That flag is a host assertion, not a deduplication mechanism supplied by this library. With a validated receipt, recovery reruns reconciliation without resending the write.

`restore` recovers interrupted identity and input as `uncertain`; it never replays a write. Persistence format, privacy, scope, retention and storage failure handling belong to the host. `read` coverage is valid only if the read starts after confirmation and the host guarantees that its source includes those committed results.

`recoverPersistedOperations` resolves each stored contract and asks an authoritative mutation-status endpoint before restoring it. Accepted receipts resume reconciliation without sending the command again. Rejected records retire; unknown and absent records remain visible for review because absence may be inconclusive after retention or routing changes. `createStorageRecoveryStore` isolates records by host scope; browser storage remains an explicit privacy choice.

Offline replay is disabled by default. A contract must declare a finite expiry and mandatory reauthorization. The saved draft retains the original mutation ID, and replay refuses expired or unauthorized work. `createBrowserCoordinator` shares mutation identifiers between tabs and uses a host lock manager for exclusive sends; neither broadcast nor browser locking replaces server idempotency.

`serializeRecoveryOperation` and `parseRecoveryOperation` provide a versioned recovery envelope. Recovery inputs are finite JSON values without cycles, custom prototypes, `undefined`, `BigInt` or symbolic keys. Parsing requires a host input parser and verifies that contract, resource and fingerprint still match before the operation can be restored.

Journal history is unbounded unless the host explicitly calls `compact`. Compaction can remove failed operations, but a confirmed operation is eligible only when its id is supplied as authoritatively covered. Unresolved, conflicted and uncovered confirmed operations are never evicted to satisfy a size target.

## React

`CausyncProvider`, `useCausyncJournal`, `useCausyncOperations` and `useMutationJournal` from `causync/react` use `useSyncExternalStore`. `createScopedJournalRegistry` owns journals by an authenticated host scope such as `tenant:user`; clear that scope on sign-out. A component's unmount must not cancel or forget accepted work. `CausyncDevtools` is an unstyled development inspector.

`causync/swr` and `causync/tanstack-query` are structural adapters with no runtime dependency on either cache. Their read methods require an operation-level `covers` predicate and return the exact confirmed IDs evidenced by the fetched value. The cache remains a read transport; it never becomes mutation authority. See `examples/nextjs-boundaries.md`.

## Verification and release boundary

Build with `npm run build` and verify the complete standalone package with `npm run verify`. The core conformance tests are in `tests/causync.test.ts`; `testing` exports deterministic deferred promises for adapters and fault injection.

`runHostConformance` from `causync/testing` runs shared lifecycle invariants against a real host contract wired to controlled transport. Its samples provide A → B → A on one resource, a duplicate and an independent resource. The runner verifies immediate publication, repeated-input policy, resource order, parallel resources, selective rejection, conflict/unknown pauses, retry identity policy and read fences. `runDelayedConfirmationConformance` separately proves accepted, confirmed and covered boundaries for projection-based hosts. `assertHostConformance` turns either structured report into a failing test. Sefira's event-sourced Task adapter and the packaged transactional reference harness run the exported base suite; production persistence and server idempotency still require host integration tests.

Durable server deduplication, atomic expected-version enforcement across **all** writers, offline replay and multi-tab command coordination require host implementations and independent server tests. None is implied by a fast UI. See `SECURITY.md` and `COMPATIBILITY.md` before adopting recovery or retry.

The staged release criteria live in [ROADMAP.md](./ROADMAP.md). `1.0.0` and the npm `latest` tag remain reserved until external adoption, API feedback, recovery and persistence evidence, browser/SSR verification, a semver policy and prerelease migration guidance are complete.
