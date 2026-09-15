import {
  MutationFailure,
  MutationSuperseded,
  type Contract,
  type Operation,
  type Phase,
  type TransitionMetadata,
} from './types'
import { validateContractInput, validateContractReceipt } from './schema'

type Entry<I, R> = {
  operation: Operation<I, R>
  contract: Contract<I, R>
  fingerprint: string
  resolve: (receipt: R) => void
  reject: (error: unknown) => void
  promise: Promise<R>
}

const active = (phase: Phase) =>
  phase === 'pending' || phase === 'accepted' || phase === 'uncertain'

const releasesQueue = (phase: Phase) =>
  phase === 'confirmed' || phase === 'failed' || phase === 'superseded'

export function createMutationJournal<I, R>(options: {
  id?: () => string
  onTransition?: (metadata: TransitionMetadata) => void
} = {}) {
  const entries: Entry<I, R>[] = []
  const running = new Set<string>()
  const listeners = new Set<() => void>()
  let snapshot: readonly Operation<I, R>[] = []

  const publish = () => {
    snapshot = entries.map(entry => entry.operation)
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // A subscriber cannot interrupt a write.
      }
    }
  }

  const transition = (entry: Entry<I, R>, patch: Partial<Operation<I, R>>) => {
    entry.operation = { ...entry.operation, ...patch }
    publish()
    try {
      options.onTransition?.({
        id: entry.operation.id,
        resource: entry.operation.resource,
        contract: entry.contract.id,
        phase: entry.operation.phase,
        attempt: entry.operation.attempt,
      })
    } catch {
      // Observability cannot change command execution semantics.
    }
  }

  const execute = async (entry: Entry<I, R>) => {
    const resource = entry.operation.resource
    running.add(resource)
    try {
      const unvalidatedReceipt = entry.operation.receipt !== undefined
        ? entry.operation.receipt
        : await entry.contract.send(
            entry.operation.input,
            { mutationId: entry.operation.id, attempt: entry.operation.attempt },
          )
      const receipt = entry.contract.schemas
        ? await validateContractReceipt(entry.contract.schemas.receipt, unvalidatedReceipt)
        : unvalidatedReceipt
      if (!entry.contract.accepted(receipt, entry.operation)) {
        throw new MutationFailure('The server response could not be verified.', 'unknown')
      }
      transition(entry, { phase: 'accepted', receipt })
      await entry.contract.reconcile(receipt, entry.operation)
      transition(entry, { phase: 'confirmed', error: undefined })
      entry.resolve(receipt)
    } catch (error) {
      // Once accepted, a failed read does not prove the write failed.
      const kind = entry.operation.receipt !== undefined ? 'unknown' : entry.contract.classify(error)
      const phase = kind === 'unknown'
        ? 'uncertain'
        : kind === 'conflict'
          ? 'conflict'
          : 'failed'
      transition(entry, {
        phase,
        error: error instanceof Error ? error.message : 'Could not save the change.',
      })
      entry.reject(error)
    } finally {
      running.delete(resource)
      pump(resource)
    }
  }

  const pump = (resource: string) => {
    if (running.has(resource)) return
    const unresolved = entries.find(entry =>
      entry.operation.resource === resource &&
      !releasesQueue(entry.operation.phase),
    )
    if (
      unresolved?.operation.phase === 'pending' ||
      unresolved?.operation.phase === 'accepted'
    ) void execute(unresolved)
  }

  const submit = (
    contract: Contract<I, R>,
    input: I,
    submissionOptions: { id?: string } = {},
  ) => {
    // Detach input so a caller cannot mutate a payload behind an idempotency key.
    const validated = contract.schemas
      ? validateContractInput(contract.schemas.input, input)
      : input
    const captured = structuredClone(validated)
    const resource = contract.resource(captured)
    const fingerprint = contract.fingerprint(captured)
    if (submissionOptions.id && entries.some(entry => entry.operation.id === submissionOptions.id)) {
      throw new Error('Mutation identity already exists in this journal')
    }

    if (contract.repeatedInput === 'single-flight') {
      const last = [...entries].reverse().find(entry => entry.operation.resource === resource)
      if (
        last &&
        last.contract.id === contract.id &&
        last.fingerprint === fingerprint &&
        active(last.operation.phase)
      ) {
        return { id: last.operation.id, settled: last.promise }
      }
    }

    const superseded: Entry<I, R>[] = []
    if (contract.repeatedInput === 'latest-unsent') {
      const runningEntry = running.has(resource)
        ? entries.find(entry => entry.operation.resource === resource && !releasesQueue(entry.operation.phase))
        : undefined
      for (const entry of entries) {
        if (
          entry !== runningEntry &&
          entry.contract.id === contract.id &&
          entry.operation.resource === resource &&
          entry.operation.phase === 'pending'
        ) {
          entry.operation = {
            ...entry.operation,
            phase: 'superseded',
            error: 'A newer unsent intent replaced this operation.',
          }
          entry.reject(new MutationSuperseded())
          superseded.push(entry)
        }
      }
    }

    let resolve!: (receipt: R) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<R>((yes, no) => {
      resolve = yes
      reject = no
    })
    void promise.catch(() => {})

    const entry: Entry<I, R> = {
      operation: {
        id: submissionOptions.id ?? options.id?.() ?? crypto.randomUUID(),
        resource,
        input: captured,
        phase: 'pending',
        attempt: 1,
      },
      contract,
      fingerprint,
      resolve,
      reject,
      promise,
    }
    entries.push(entry)
    publish()
    for (const replaced of superseded) {
      try {
        options.onTransition?.({
          id: replaced.operation.id,
          resource: replaced.operation.resource,
          contract: replaced.contract.id,
          phase: replaced.operation.phase,
          attempt: replaced.operation.attempt,
        })
      } catch {
        // Observability cannot change submission semantics.
      }
    }
    pump(resource)
    return { id: entry.operation.id, settled: promise }
  }

  return {
    submit,

    /** Reload recovery never replays a write. The host validates and scopes stored data. */
    restore(contract: Contract<I, R>, operation: Pick<Operation<I, R>, 'id' | 'input'>) {
      if (entries.some(entry => entry.operation.id === operation.id)) return
      const captured = structuredClone(operation.input)
      const error = new MutationFailure(
        'The previous session ended before this change was verified. Review the saved result.',
        'unknown',
      )
      const promise = Promise.reject<R>(error)
      void promise.catch(() => {})
      entries.push({
        operation: {
          id: operation.id,
          input: captured,
          resource: contract.resource(captured),
          phase: 'uncertain',
          error: error.message,
          attempt: 1,
        },
        contract,
        fingerprint: contract.fingerprint(captured),
        promise,
        resolve: () => {},
        reject: () => {},
      })
      publish()
    },

    /** Resume confirmation from a receipt recovered through an authoritative status lookup. */
    restoreAccepted(
      contract: Contract<I, R>,
      operation: Pick<Operation<I, R>, 'id' | 'input'> & { receipt: R },
    ) {
      if (entries.some(entry => entry.operation.id === operation.id)) return
      const captured = structuredClone(operation.input)
      let resolve!: (receipt: R) => void
      let reject!: (error: unknown) => void
      const promise = new Promise<R>((yes, no) => { resolve = yes; reject = no })
      void promise.catch(() => {})
      const entry: Entry<I, R> = {
        operation: {
          id: operation.id,
          input: captured,
          resource: contract.resource(captured),
          receipt: structuredClone(operation.receipt),
          phase: 'accepted',
          attempt: 1,
        },
        contract,
        fingerprint: contract.fingerprint(captured),
        promise,
        resolve,
        reject,
      }
      entries.push(entry)
      publish()
      pump(entry.operation.resource)
    },

    /** Attach an authoritative receipt to an operation that was restored as uncertain. */
    async resumeAccepted(id: string, receipt: R): Promise<R> {
      const entry = entries.find(candidate => candidate.operation.id === id)
      if (!entry) throw new Error('Unknown mutation')
      if (running.has(entry.operation.resource)) throw new Error('Mutation is already running')
      if (entry.operation.phase !== 'uncertain') {
        throw new Error('Only unresolved operations can resume from a receipt')
      }
      entry.promise = new Promise<R>((resolve, reject) => {
        entry.resolve = resolve
        entry.reject = reject
      })
      void entry.promise.catch(() => {})
      transition(entry, {
        phase: 'pending',
        receipt: structuredClone(receipt),
        error: undefined,
      })
      void execute(entry)
      return entry.promise
    },

    getSnapshot: () => snapshot,

    /** The host must perform an uncached, authoritative read. Capture before I/O. */
    async read<T>(reader: () => Promise<T>) {
      const confirmedIds = entries
        .filter(entry => entry.operation.phase === 'confirmed')
        .map(entry => entry.operation.id)
      return { value: await reader(), confirmedIds }
    },

    /**
     * Capture candidates before I/O, then let the host prove coverage against
     * the returned authoritative value operation by operation.
     */
    async readCovered<T>(
      reader: () => Promise<T>,
      covers: (value: T, operation: Operation<I, R>) => boolean,
    ) {
      const candidates = entries
        .filter(entry => entry.operation.phase === 'confirmed')
        .map(entry => entry.operation)
      const value = await reader()
      return {
        value,
        confirmedIds: candidates
          .filter(operation => covers(value, operation))
          .map(operation => operation.id),
      }
    },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    /** Keep confirmed overlays until an authoritative read covers them. */
    overlays(resource?: string, confirmedIds: readonly string[] = []) {
      return entries
        .filter(entry =>
          entry.contract.strategy.mode === 'optimistic' &&
          (!resource || entry.operation.resource === resource) &&
          entry.operation.phase !== 'failed' &&
          entry.operation.phase !== 'conflict' &&
          entry.operation.phase !== 'superseded' &&
          !(entry.operation.phase === 'confirmed' && confirmedIds.includes(entry.operation.id)),
        )
        .map(entry => entry.operation)
    },

    async retry(id: string): Promise<R> {
      const entry = entries.find(candidate => candidate.operation.id === id)
      if (!entry) throw new Error('Unknown mutation')
      if (running.has(entry.operation.resource)) throw new Error('Mutation is already running')
      if (entry.operation.phase !== 'uncertain') {
        throw new Error('Only unresolved operations can be recovered')
      }
      if (!entry.operation.receipt && entry.contract.retry !== 'idempotent') {
        throw new Error('This server does not support safe write retry. Check the saved result first.')
      }
      entry.promise = new Promise<R>((resolve, reject) => {
        entry.resolve = resolve
        entry.reject = reject
      })
      void entry.promise.catch(() => {})
      transition(entry, {
        phase: 'pending',
        error: undefined,
        attempt: entry.operation.attempt + 1,
      })
      void execute(entry)
      return entry.promise
    },

    /** Call only after authoritative review. Does not undo a committed action. */
    dismiss(id: string, dismissOptions: { queued: 'discard' | 'continue' }) {
      const index = entries.findIndex(entry => entry.operation.id === id)
      if (index < 0) return
      const entry = entries[index]
      if (
        running.has(entry.operation.resource) ||
        entry.operation.phase === 'pending' ||
        entry.operation.phase === 'accepted'
      ) {
        throw new Error('Cannot dismiss an in-flight operation')
      }
      entries.splice(index, 1)
      if (dismissOptions.queued === 'discard') {
        for (let candidate = entries.length - 1; candidate >= index; candidate--) {
          const queued = entries[candidate]
          if (
            queued.operation.resource !== entry.operation.resource ||
            queued.operation.phase !== 'pending'
          ) continue
          queued.reject(new MutationFailure('Queued draft discarded after review.', 'rejected'))
          entries.splice(candidate, 1)
        }
      }
      publish()
      pump(entry.operation.resource)
    },

    /** Confirmed records can retire once every consuming view incorporates them. */
    retire(id: string) {
      const index = entries.findIndex(entry =>
        entry.operation.id === id && entry.operation.phase === 'confirmed',
      )
      if (index >= 0) {
        entries.splice(index, 1)
        publish()
      }
    },

    /**
     * Bound terminal history without guessing coverage. Confirmed operations are
     * eligible only when the host supplies their ids as authoritatively covered.
     */
    compact(compactOptions: {
      coveredIds?: readonly string[]
      retainTerminal?: number
    } = {}) {
      const covered = new Set(compactOptions.coveredIds ?? [])
      const retainTerminal = compactOptions.retainTerminal ?? 0
      if (!Number.isInteger(retainTerminal) || retainTerminal < 0) {
        throw new Error('retainTerminal must be a non-negative integer')
      }
      const candidates = entries.filter(entry =>
        entry.operation.phase === 'failed' ||
        entry.operation.phase === 'superseded' ||
        (entry.operation.phase === 'confirmed' && covered.has(entry.operation.id)),
      )
      const removable = new Set(
        candidates.slice(0, Math.max(0, candidates.length - retainTerminal)),
      )
      if (removable.size === 0) return 0
      for (let index = entries.length - 1; index >= 0; index--) {
        if (removable.has(entries[index])) entries.splice(index, 1)
      }
      publish()
      return removable.size
    },
  }
}

export type MutationJournal<I, R> = ReturnType<typeof createMutationJournal<I, R>>
