import type { MutationJournal } from './journal'
import type { Contract, FailureKind } from './types'

/** Controlled transport: tests decide exactly when a response or projection arrives. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export type ConformanceWrite<I> = Readonly<{
  mutationId: string
  input: I
}>

export type HostConformanceHarness<I, R> = {
  journal: MutationJournal<I, R>
  contract: Contract<I, R>
  writes(): readonly ConformanceWrite<I>[]
  resolve(writeIndex: number): void
  reject(writeIndex: number, kind: FailureKind): void
}

export type HostConformanceSamples<I> = {
  /** Same resource and fingerprint as sequence[0]. */
  duplicate: I
  /** A → B → A on one resource. */
  sequence: readonly [I, I, I]
  /** A sample whose resource differs from sequence. */
  otherResource: I
}

export type HostConformanceDefinition<I, R> = {
  create(): HostConformanceHarness<I, R>
  samples: HostConformanceSamples<I>
}

export type ConformanceCaseResult = Readonly<{
  name: string
  passed: boolean
  error?: string
}>

export type ConformanceReport = Readonly<{
  passed: boolean
  cases: readonly ConformanceCaseResult[]
}>

export type DelayedConfirmationHarness<I, R> = Pick<
  HostConformanceHarness<I, R>,
  'journal' | 'contract' | 'writes'
> & {
  /** Resolve transport with valid acceptance evidence while reconciliation remains blocked. */
  accept(writeIndex: number): void
  /** Release the contract's reconciliation evidence. */
  confirm(writeIndex: number): void
}

export type DelayedConfirmationDefinition<I, R> = {
  create(): DelayedConfirmationHarness<I, R>
  input: I
}

const turn = () => new Promise(resolve => setTimeout(resolve, 0))

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function capture(name: string, run: () => Promise<void>): Promise<ConformanceCaseResult> {
  try {
    await run()
    return { name, passed: true }
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown conformance failure',
    }
  }
}

/**
 * Executes transport-independent lifecycle invariants against a real host
 * contract wired to a deterministic transport harness.
 */
export async function runHostConformance<I, R>(
  definition: HostConformanceDefinition<I, R>,
): Promise<ConformanceReport> {
  const cases = await Promise.all([
    capture('immediate repeated input', async () => {
      const host = definition.create()
      const submissions = Array.from({ length: 5 }, () =>
        host.journal.submit(host.contract, definition.samples.duplicate),
      )
      invariant(host.journal.getSnapshot().length > 0, 'Submission was not observable synchronously')
      if (host.contract.strategy.mode === 'optimistic') {
        invariant(host.journal.overlays().length > 0, 'Optimistic submission did not publish an overlay')
      }
      if (host.contract.repeatedInput === 'single-flight') {
        invariant(new Set(submissions.map(item => item.id)).size === 1, 'Identical input did not single-flight')
        invariant(host.writes().length === 1, 'Single-flight emitted more than one write')
        host.resolve(0)
      } else if (host.contract.repeatedInput === 'queue-all') {
        invariant(new Set(submissions.map(item => item.id)).size === 5, 'queue-all collapsed distinct activations')
        for (let index = 0; index < submissions.length; index++) {
          invariant(host.writes().length === index + 1, 'Same-resource queue released out of order')
          host.resolve(index)
          await submissions[index].settled
          await turn()
        }
      } else {
        invariant(new Set(submissions.map(item => item.id)).size === 5, 'latest-unsent lost intent identity')
        invariant(host.writes().length === 1, 'latest-unsent sent a replaceable queued value')
        host.resolve(0)
        await submissions[0].settled
        await turn()
        invariant(host.writes().length === 2, 'latest-unsent did not send the final desired value')
        host.resolve(1)
        await submissions.at(-1)?.settled
        const superseded = await Promise.allSettled(submissions.slice(1, -1).map(item => item.settled))
        invariant(superseded.every(item => item.status === 'rejected'), 'Replaced operations did not settle as superseded')
      }
      if (host.contract.repeatedInput !== 'latest-unsent') {
        await Promise.all(submissions.map(item => item.settled))
      }
    }),

    capture('A → B → A and independent resources', async () => {
      const host = definition.create()
      const [firstInput, middleInput, finalInput] = definition.samples.sequence
      const first = host.journal.submit(host.contract, firstInput)
      const middle = host.journal.submit(host.contract, middleInput)
      const final = host.journal.submit(host.contract, finalInput)
      const other = host.journal.submit(host.contract, definition.samples.otherResource)
      invariant(new Set([first.id, middle.id, final.id]).size === 3, 'A → B → A lost an intent identity')
      invariant(host.writes().length === 2, 'Independent resource did not start alongside the first resource')
      host.resolve(0)
      host.resolve(1)
      await Promise.all([first.settled, other.settled])
      await turn()
      if (host.contract.repeatedInput === 'latest-unsent') {
        await middle.settled.catch(() => {})
        invariant(host.writes().length === 3, 'latest-unsent did not send the final A')
        host.resolve(2)
        await final.settled
        return
      }
      invariant(host.writes().length === 3, 'B did not start after A confirmed')
      host.resolve(2)
      await middle.settled
      await turn()
      invariant(host.writes().length === 4, 'Final A did not remain queued behind B')
      host.resolve(3)
      await final.settled
    }),

    capture('selective rejection', async () => {
      const host = definition.create()
      const [firstInput, middleInput] = definition.samples.sequence
      const first = host.journal.submit(host.contract, firstInput)
      const middle = host.journal.submit(host.contract, middleInput)
      host.reject(0, 'rejected')
      await first.settled.catch(() => {})
      await turn()
      invariant(host.journal.getSnapshot()[0]?.phase === 'failed', 'Definitive rejection was not classified as failed')
      invariant(host.writes().length === 2, 'Rejected operation did not release the next intent')
      if (host.contract.strategy.mode === 'optimistic') {
        invariant(host.journal.overlays().some(item => item.id === middle.id), 'Rejection removed a surviving overlay')
      }
      host.resolve(1)
      await middle.settled
    }),

    capture('unknown outcome pause', async () => {
      const host = definition.create()
      const [firstInput, middleInput] = definition.samples.sequence
      const first = host.journal.submit(host.contract, firstInput)
      const middle = host.journal.submit(host.contract, middleInput)
      host.reject(0, 'unknown')
      await first.settled.catch(() => {})
      await turn()
      invariant(host.journal.getSnapshot()[0]?.phase === 'uncertain', 'Unknown outcome was not preserved')
      invariant(host.writes().length === 1, 'Dependent write crossed an unknown outcome')
      host.journal.dismiss(first.id, { queued: 'continue' })
      await turn()
      invariant(host.writes().length === 2, 'Explicit continue did not release the queued write')
      host.resolve(1)
      await middle.settled
    }),

    capture('conflict pause', async () => {
      const host = definition.create()
      const [firstInput, middleInput] = definition.samples.sequence
      const first = host.journal.submit(host.contract, firstInput)
      const middle = host.journal.submit(host.contract, middleInput)
      host.reject(0, 'conflict')
      await first.settled.catch(() => {})
      await turn()
      invariant(host.journal.getSnapshot()[0]?.phase === 'conflict', 'Conflict was not preserved for review')
      invariant(host.writes().length === 1, 'Dependent write crossed a version conflict')
      host.journal.dismiss(first.id, { queued: 'discard' })
      await middle.settled.catch(() => {})
      invariant(host.writes().length === 1, 'Discarded conflict queue reached transport')
    }),

    capture('retry identity policy', async () => {
      const host = definition.create()
      const operation = host.journal.submit(host.contract, definition.samples.sequence[0])
      host.reject(0, 'unknown')
      await operation.settled.catch(() => {})
      await turn()
      if (host.contract.retry === 'unsafe') {
        let rejected = false
        await host.journal.retry(operation.id).catch(() => { rejected = true })
        invariant(rejected, 'Unsafe contract allowed a write retry')
        invariant(host.writes().length === 1, 'Unsafe retry emitted another write')
        return
      }
      const retried = host.journal.retry(operation.id)
      await turn()
      invariant(host.writes().length === 2, 'Idempotent retry did not reach transport')
      invariant(host.writes()[1].mutationId === host.writes()[0].mutationId, 'Retry changed mutation identity')
      invariant(
        host.contract.fingerprint(host.writes()[1].input) === host.contract.fingerprint(host.writes()[0].input),
        'Retry changed the captured payload',
      )
      host.resolve(1)
      await retried
    }),

    capture('authoritative read fence', async () => {
      const host = definition.create()
      const slowRead = deferred<string>()
      const stale = host.journal.read(() => slowRead.promise)
      const operation = host.journal.submit(host.contract, definition.samples.sequence[0])
      host.resolve(0)
      await operation.settled
      slowRead.resolve('stale')
      invariant((await stale).confirmedIds.length === 0, 'Read that began early covered a later confirmation')
      const fresh = await host.journal.read(async () => 'fresh')
      invariant(fresh.confirmedIds.includes(operation.id), 'Fresh authoritative read did not capture confirmation')
    }),
  ])

  return { passed: cases.every(item => item.passed), cases }
}

export function assertHostConformance(report: ConformanceReport): void {
  const failures = report.cases.filter(result => !result.passed)
  if (failures.length === 0) return
  throw new Error(failures.map(result => `${result.name}: ${result.error}`).join('\n'))
}

/** Verifies the accepted → confirmed → covered boundary for projection-based hosts. */
export async function runDelayedConfirmationConformance<I, R>(
  definition: DelayedConfirmationDefinition<I, R>,
): Promise<ConformanceReport> {
  const result = await capture('delayed confirmation coverage', async () => {
    const host = definition.create()
    const operation = host.journal.submit(host.contract, definition.input)
    invariant(host.journal.overlays().some(item => item.id === operation.id), 'Initial overlay is missing')
    host.accept(0)
    await turn()
    invariant(host.journal.getSnapshot()[0]?.phase === 'accepted', 'Acceptance was confused with confirmation')
    const stale = await host.journal.read(async () => 'projection-before-confirmation')
    invariant(!stale.confirmedIds.includes(operation.id), 'Pre-confirmation read claimed coverage')
    invariant(host.journal.overlays(undefined, stale.confirmedIds).length === 1, 'Stale read removed the overlay')
    host.confirm(0)
    await operation.settled
    invariant(host.journal.overlays().length === 1, 'Confirmation removed an uncovered overlay')
    const covered = await host.journal.read(async () => 'projection-with-operation')
    invariant(covered.confirmedIds.includes(operation.id), 'Post-confirmation read did not capture coverage')
    invariant(host.journal.overlays(undefined, covered.confirmedIds).length === 0, 'Covered overlay remained visible')
  })
  return { passed: result.passed, cases: [result] }
}
