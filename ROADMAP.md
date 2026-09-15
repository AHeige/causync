# Causync roadmap to 1.0

Causync 1.0 is a stable causal mutation protocol for TypeScript applications. A fast interface is necessary but insufficient: every visible result must remain connected to user intent, ordered against the correct resource and retained until contract-defined evidence covers it.

The roadmap distinguishes core guarantees from host guarantees. Causync owns operation identity, causal ordering, lifecycle, overlays, retry policy and observable state. A host owns authorization, transport, durable idempotency, authoritative result evidence, persistence privacy and external-effect recovery.

## 0.2 — Demonstrable correctness ✅

- Public fault lab for rapid intent, projection lag and a response lost after commit.
- Visible base, overlay, operation and evidence timelines.
- Deterministic fault controls and tests.
- Explicit documentation of core guarantees and required host evidence.

## 0.3 — Package boundary ✅

- Test installation from a packed tarball in an independent TypeScript fixture.
- Publish clean ESM declarations and explicit core, React and testing exports.
- Define supported input serialization and reject unsupported recovery payloads.
- Add bounded journal retention and persistence capability reporting.
- Select and review the open-source license before removing `private: true`.

Delivered in 0.3: clean ESM output, an independent packed-install fixture, versioned finite-JSON recovery envelopes, explicit coverage-aware compaction and Apache-2.0 licensing. Publication remains intentionally private until host conformance is shipped.

## 0.4 — Host conformance ✅

- Ship a reusable conformance runner for transport and evidence adapters.
- Cover rapid activation, A → B → A, independent resources, rejection, conflict, unknown outcome, delayed projection, duplicate evidence, reload and safe retry.
- Require host assertions for atomic idempotency, expected-version enforcement and authoritative read coverage.

Delivered in 0.4: a framework-neutral runner covers immediate publication, repeated input, A → B → A ordering, independent resources, selective rejection, conflict/unknown pauses, retry identity policy and read fences. A projection profile separately proves accepted → confirmed → covered behavior. The Sefira Task adapter passes the exported base suite; durable persistence and server idempotency remain host integration responsibilities.

## 0.5 — Strict contracts ✅

- Support Standard Schema adapters for runtime input and receipt validation.
- Version contract manifests and recovery envelopes.
- Generate typed client entry points, server envelopes and fixtures.
- Add `latest-unsent` for contracts where intermediate unsent desired values have no business meaning.

Delivered in 0.5: an immutable contract factory, dependency-free Standard Schema v1 input/receipt validation, `latest-unsent` with an explicit superseded outcome, versioned machine-readable manifests and deterministic generation of action unions, transport envelopes and fixtures.

## 0.6 — Framework adapters ✅

- Stabilize the React provider and hooks with user/tenant scoping.
- Add separate SWR and TanStack Query adapters without transferring mutation authority to the cache.
- Add Next.js Route Handler and Server Action examples with server-only boundaries.
- Provide journal and evidence devtools.

Delivered in 0.6: scope-owned journals, a React provider and filtered operation hooks, an unstyled journal inspector, and dependency-free bridges that require SWR and TanStack Query reads to prove operation-level coverage before optimistic overlays retire. Next.js examples keep server authorization, idempotency and evidence behind server-only boundaries.

## 0.7 — Durable recovery ✅

- Reference PostgreSQL idempotency store with payload hash and retention policy.
- Mutation status lookup and receipt recovery.
- Multi-tab coordination and scope-isolated persistence.
- Opt-in offline queues with expiry, reauthorization and per-contract replay policy.

Delivered in 0.7: an async recovery-store contract, a scope-isolated Web Storage adapter, authoritative mutation-status recovery without implicit write replay, browser notification and lock coordination, and per-contract offline drafts that require expiry checks plus current authorization. The PostgreSQL reference binds actor scope, mutation identity, contract and payload hash in the domain transaction and states its retention and external-effect limits.

## 0.8 — AI-first development ✅

- Official `llms.txt` and agent rules.
- Machine-readable action registry and contract generator.
- Agentic conformance loop that runs the fault suite against generated adapters.
- CI enforcement that rejects unregistered UI writes.

Delivered in 0.8: package-local `llms.txt` and agent rules, versioned contract manifests with deterministic catalogs, a CLI conformance command for host fault harnesses, a generated-file drift check, and a repository guard that rejects increases in direct UI write patterns outside registered surfaces.

## 1.0 — Stable causal mutation protocol ✅

Release 1.0 only when all public APIs and recovery formats are stable, the packed package installs independently, the conformance suite verifies supported hosts, security and privacy boundaries are documented, and both event-sourced and conventional transactional reference hosts pass the same fault scenarios.

Exactly-once execution is not a blanket 1.0 promise. Causync supplies stable identity and retry semantics; each authoritative system and external effect must prove its own atomic deduplication and recovery behavior.

Delivered in 1.0: stable ESM and declaration exports, recovery and manifest format v1, independent tarball installation, security and compatibility contracts, a transactional reference harness and Sefira's event-sourced Task host running the shared fault scenarios. The package is release-ready under Apache-2.0; npm publication is a separate maintainer action.

## Post-1.0 adoption and evidence plan

This sequence is the canonical plan after 1.0. Changes to its order or guarantees require a linked Sefira task and an explicit decision recorded in delivery evidence.

1. **Deterministic delivery automation.** Every merge to `dev` must resolve to one canonical deployment of the current `dev` SHA with build and smoke evidence. Bot merges use a trusted Quality Gate handoff plus scheduled reconciliation; human pushes retain the direct push trigger. Delivery owner: `UP-843`.
2. **Surface-by-surface adoption.** Migrate My Todo, Tasks and Processes first, then comments, conversations, milestones and decisions. Every write declares one registered contract, projection, error classification, receipt and reconciliation rule. The repository gate may shrink legacy exceptions but may not permit new direct UI writes. The first My Todo completion slice is owned by `UP-845`.
3. **Authoritative backend evidence.** Standardize mutation receipts around stable mutation and resource identity, accepted event/version evidence and projected coverage. A timeout remains uncertain until an authoritative status read resolves it.
4. **Production observability.** Measure time to local projection, accepted-to-covered latency, retries, deduplication, conflicts, uncertainty, read-fence rejections and work that needs attention without recording private mutation payloads.
5. **Public fault lab.** Let visitors control latency, projection lag, out-of-order responses, repeated intent and lost acknowledgements while seeing journal, overlay and evidence transitions live.
6. **Open-source release.** Publish the protocol, `causync init --ai`, the npm package, a standalone reference application, certified host adapters and reproducible conformance results after production adoption has supplied evidence for the claims.

The exit criterion is not migration count. Each step closes only when its behavior has a repeatable receipt: CI/deployment history, host conformance, production telemetry or an independently installable release artifact.
