# PostgreSQL idempotency reference

Causync preserves a mutation ID on safe retry. The server must make that ID meaningful atomically with the domain write.

Inside one database transaction:

1. Derive `actor_scope` from authenticated tenant and actor identity. Never accept it from the command body.
2. Canonically encode the validated command and calculate `payload_sha256` on the server.
3. Insert `(actor_scope, mutation_id, contract_id, payload_sha256, processing)` with `ON CONFLICT DO NOTHING`.
4. If the insert conflicts, lock and read the row. A different contract or hash is `409 Conflict`. An accepted row returns its stored receipt. A processing row returns an explicit in-progress status; it must not run the effect again.
5. Apply the domain event or transactional update and store the acceptance receipt in the same transaction.
6. Commit once. Never commit the domain write before recording the receipt.

External effects need their own idempotency key at the provider or an outbox row written in this same transaction. A database key cannot make an arbitrary email, payment or webhook exactly once.

The status endpoint authorizes by the same `actor_scope` and returns one of `accepted`, `confirmed`, `rejected`, `not-found` or `unknown`. Treat `not-found` separately from rejection: retention expiry or a routed request reaching the wrong authority may make absence inconclusive.

Retention must exceed the longest client recovery and retry window. Store only the receipt fields needed for recovery, encrypt sensitive fields where required, and partition or delete terminal records according to the host's data policy.
