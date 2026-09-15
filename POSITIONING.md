# Positioning and ecosystem boundary

Causync is a causal mutation runtime for frontend applications. Its purpose is to make an existing architecture causally safe across user intent, ordering, transport, acknowledgement, reconciliation and authoritative coverage.

It does not claim that sophisticated optimistic state or sync is new. Collection and sync systems can own more of the data path and provide excellent guarantees when an application adopts their architecture. Causync serves a different adoption boundary: teams keep REST, GraphQL, transactional SQL, CQRS or event sourcing and implement explicit evidence contracts around their mutations.

The core differentiators are backend independence, per-resource causal lanes, protocol-level uncertainty, operation-level read coverage, recovery without implicit replay, and machine-enforced contracts for human- and AI-written code.

## Prerelease and post-1.0 roadmap

1. Publish a transport-neutral Causync Protocol specification with normative lifecycle and evidence vocabulary.
2. Add `causync init --ai` installers for common coding agents while keeping the canonical rules vendor-neutral.
3. Expand static analysis from repository pattern guards to TypeScript-aware checks for mutation identity, resource lanes, unsafe retry and premature overlay retirement.
4. Certify more real REST, GraphQL, transactional and event-sourced adapters with public conformance evidence.
5. Split subpath exports into independently versioned packages only when adoption requires separate dependency or release cycles.
