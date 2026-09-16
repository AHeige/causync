# Compatibility

- Runtime: modern ESM environments with `structuredClone` and `crypto.randomUUID`; Node.js 20 or later.
- Language: TypeScript declarations are emitted with strict checking. The JavaScript runtime has no TypeScript dependency.
- UI: the core is framework-independent. `@causync/core/react` supports React 18 and 19. Next.js is optional.
- Caches: SWR and TanStack Query adapters are structural and have no runtime package dependency. Hosts supply fetch and coverage functions.
- Validation: contracts accept the Standard Schema v1 interface, so a compatible validator can be used without a Causync runtime dependency.
- Backend: event-sourced, CQRS and conventional transactional systems are supported when their adapters provide the declared acceptance, confirmation, coverage and idempotency evidence.
- Browsers: persistence and multi-tab modules accept structural storage, channel and lock interfaces. Offline and recovery storage are opt-in.
- Monorepos: source modules use bundler-compatible relative imports; release output is finalized with explicit `.js` specifiers for Node ESM. Package verification exercises the built tarball, while Sefira compiles the source through Next.js.

The manifest and recovery envelope use schema version 1. Additive fields may appear in minor releases. Removing or changing existing public fields, lifecycle meanings or exports requires a new major version. Unknown future schema versions fail closed.
