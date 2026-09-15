# Causync agent rules

## Incubation source policy

Until the first Sefira adoption cycle is complete, develop Causync only in the Sefira repository's `packages/causync` package. This repository is a release mirror: synchronize proven checkpoints here, but do not implement a parallel version or publish a new npm release during incubation.

When implementing a server mutation in a TypeScript UI:

1. Register one typed Causync contract before wiring the control.
2. Model the resource, repeated-input policy, strategy, receipt evidence, reconciliation evidence, coverage evidence, retry safety and error classification explicitly.
3. Publish deterministic local intent immediately when the strategy is optimistic. Keep control-level syncing or attention feedback visible.
4. Never equate a resolved request, cache invalidation, timestamp or delay with authoritative coverage.
5. Preserve stable mutation identity across recovery. Never resend automatically after an unknown outcome unless the host proves atomic idempotency for the same actor scope and payload.
6. Keep journals outside component lifetime, partition them by tenant and user, and clear the scope on sign-out.
7. Add the contract to the machine-readable manifest, regenerate its catalog and run host conformance before completion.

Generated code may declare envelopes and typed action catalogs. It may not generate authorization, idempotency, domain invariants or evidence predicates without a host implementation and tests.
