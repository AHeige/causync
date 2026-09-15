import type { StandardSchemaV1 } from './schema'

export type Phase =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'superseded'
  | 'failed'
  | 'conflict'
  | 'uncertain'

export type FailureKind = 'rejected' | 'conflict' | 'unknown'

export class MutationFailure extends Error {
  constructor(
    message: string,
    public readonly kind: FailureKind,
  ) {
    super(message)
    this.name = 'MutationFailure'
  }
}

export class MutationSuperseded extends Error {
  constructor() {
    super('A newer unsent intent superseded this operation.')
    this.name = 'MutationSuperseded'
  }
}

export type Strategy =
  | { mode: 'optimistic' }
  | { mode: 'acknowledged' | 'confirmation-first'; reason: string }

export type RepeatedInput = 'single-flight' | 'latest-unsent' | 'queue-all'
export type RetryPolicy = 'unsafe' | 'idempotent'
export type OfflinePolicy =
  | { mode: 'never' }
  | { mode: 'when-online'; expiresAfterMs: number; reauthorize: true }

export type Operation<I, R> = Readonly<{
  id: string
  resource: string
  input: I
  phase: Phase
  receipt?: R
  error?: string
  attempt: number
}>

export type Contract<I, R> = {
  id: string
  intent: string
  strategy: Strategy
  repeatedInput: RepeatedInput
  retry: RetryPolicy
  offline?: OfflinePolicy
  schemas?: Readonly<{
    input: StandardSchemaV1<I>
    receipt: StandardSchemaV1<R>
  }>
  resource(input: I): string
  /** Identifies one submission, not all future equal user intentions. */
  fingerprint(input: I): string
  send(input: I, context: { mutationId: string; attempt: number }): Promise<R>
  /** Must verify the actual host's acceptance/evidence envelope. */
  accepted(receipt: R, operation: Operation<I, R>): boolean
  /** Resolves only after the promised outcome is evidenced. Never substitute a timer. */
  reconcile(receipt: R, operation: Operation<I, R>): Promise<void>
  classify(error: unknown): FailureKind
}

export type TransitionMetadata = {
  id: string
  resource: string
  contract: string
  phase: Phase
  attempt: number
}

export const CAUSYNC_CORE_CAPABILITIES = Object.freeze({
  persistence: 'host-managed',
  automaticWriteReplay: false,
  durableIdempotency: 'host-required',
  authoritativeCoverage: 'host-required',
} as const)
