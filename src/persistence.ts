import type { MutationJournal } from './journal'
import {
  parseRecoveryOperation,
  serializeRecoveryOperation,
  type JsonValue,
} from './recovery'
import type { Contract, Operation } from './types'

export type RecoveryStore = Readonly<{
  load(scope: string): Promise<readonly string[]>
  save(scope: string, mutationId: string, envelope: string): Promise<void>
  remove(scope: string, mutationId: string): Promise<void>
}>

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type StoredEnvelope = Readonly<{ mutationId: string; envelope: string }>

/** A small scope-isolated store. Hosts choose whether browser storage is appropriate. */
export function createStorageRecoveryStore(
  storage: StorageLike,
  prefix = 'causync:v1',
): RecoveryStore {
  const key = (scope: string) => `${prefix}:${encodeURIComponent(scope)}`
  const read = (scope: string): StoredEnvelope[] => {
    const raw = storage.getItem(key(scope))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.some(item =>
      typeof item !== 'object' || item === null ||
      typeof item.mutationId !== 'string' || typeof item.envelope !== 'string'
    )) throw new Error('Invalid Causync recovery store')
    return parsed as StoredEnvelope[]
  }
  return Object.freeze({
    async load(scope) { return read(scope).map(item => item.envelope) },
    async save(scope, mutationId, envelope) {
      const values = read(scope).filter(item => item.mutationId !== mutationId)
      values.push({ mutationId, envelope })
      storage.setItem(key(scope), JSON.stringify(values))
    },
    async remove(scope, mutationId) {
      const values = read(scope).filter(item => item.mutationId !== mutationId)
      if (values.length === 0) storage.removeItem(key(scope))
      else storage.setItem(key(scope), JSON.stringify(values))
    },
  })
}

export async function saveRecoveryOperation<I, R>(options: {
  store: RecoveryStore
  scope: string
  contract: Contract<I, R>
  operation: Pick<Operation<I, R>, 'id' | 'resource' | 'input'>
}) {
  await options.store.save(
    options.scope,
    options.operation.id,
    serializeRecoveryOperation(options.contract, options.operation),
  )
}

export type MutationStatus<R> =
  | Readonly<{ state: 'accepted' | 'confirmed'; receipt: R }>
  | Readonly<{ state: 'rejected' | 'not-found' | 'unknown' }>

export type OfflineDraft = Readonly<{
  version: 1
  createdAt: number
  expiresAt: number
  operation: string
}>

/** Capture an opt-in offline command without sending it. */
export function createOfflineDraft<I, R>(options: {
  contract: Contract<I, R>
  operation: Pick<Operation<I, R>, 'id' | 'resource' | 'input'>
  now?: number
}): OfflineDraft {
  const policy = options.contract.offline
  if (!policy || policy.mode !== 'when-online') {
    throw new Error('This contract does not permit offline replay')
  }
  const createdAt = options.now ?? Date.now()
  return Object.freeze({
    version: 1,
    createdAt,
    expiresAt: createdAt + policy.expiresAfterMs,
    operation: serializeRecoveryOperation(options.contract, options.operation),
  })
}

/** Replay only after expiry and current authorization have both been checked. */
export async function replayOfflineDraft<I, R>(options: {
  draft: OfflineDraft
  contract: Contract<I, R>
  journal: MutationJournal<I, R>
  parseInput(value: JsonValue): I
  reauthorize(input: I): Promise<boolean>
  now?: number
}) {
  if (options.draft.version !== 1) throw new Error('Unsupported Causync offline draft')
  if ((options.now ?? Date.now()) >= options.draft.expiresAt) {
    throw new Error('Causync offline draft expired')
  }
  const operation = parseRecoveryOperation(
    options.draft.operation,
    options.contract,
    options.parseInput,
  )
  if (!await options.reauthorize(operation.input)) {
    throw new Error('Causync offline replay was not authorized')
  }
  return options.journal.submit(options.contract, operation.input, { id: operation.id })
}

/**
 * Restore saved identities only after the host resolves their contract and asks
 * an authoritative endpoint what happened. This function never resends a write.
 */
export async function recoverPersistedOperations<I, R>(options: {
  store: RecoveryStore
  scope: string
  journal: MutationJournal<I, R>
  resolveContract(contractId: string): Contract<I, R> | undefined
  parseInput(contract: Contract<I, R>, value: JsonValue): I
  lookupStatus(operation: { id: string; contract: Contract<I, R> }): Promise<MutationStatus<R>>
}) {
  const report: Array<{ id?: string; state: MutationStatus<R>['state'] | 'invalid' }> = []
  for (const serialized of await options.store.load(options.scope)) {
    try {
      const raw: unknown = JSON.parse(serialized)
      const contractId = typeof raw === 'object' && raw !== null && 'contractId' in raw
        ? String(raw.contractId)
        : ''
      const contract = options.resolveContract(contractId)
      if (!contract) throw new Error('Unknown recovery contract')
      const operation = parseRecoveryOperation(serialized, contract, value =>
        options.parseInput(contract, value),
      )
      const status = await options.lookupStatus({ id: operation.id, contract })
      if (status.state === 'accepted' || status.state === 'confirmed') {
        options.journal.restoreAccepted(contract, { ...operation, receipt: status.receipt })
      } else if (status.state === 'unknown' || status.state === 'not-found') {
        options.journal.restore(contract, operation)
      } else {
        await options.store.remove(options.scope, operation.id)
      }
      report.push({ id: operation.id, state: status.state })
    } catch {
      report.push({ state: 'invalid' })
    }
  }
  return report
}
