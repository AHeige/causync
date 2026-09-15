import { describe, expect, it, vi } from 'vitest'

import { createBrowserCoordinator } from '../src/browser'
import { createMutationJournal } from '../src/journal'
import {
  createOfflineDraft,
  createStorageRecoveryStore,
  recoverPersistedOperations,
  replayOfflineDraft,
  saveRecoveryOperation,
} from '../src/persistence'
import type { JsonValue } from '../src/recovery'
import type { Contract } from '../src/types'

type Input = { resource: string; value: string }
type Receipt = { mutationId: string }

const parseInput = (value: JsonValue): Input => {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      typeof (value as Record<string, unknown>).resource !== 'string' ||
      typeof (value as Record<string, unknown>).value !== 'string') throw new Error('Invalid input')
  const record = value as Record<string, string>
  return { resource: record.resource, value: record.value }
}

function contract(send = vi.fn(async (_input: Input, context: { mutationId: string }) =>
  ({ mutationId: context.mutationId }))) : Contract<Input, Receipt> {
  return {
    id: 'value.set.v1', intent: 'Set value', strategy: { mode: 'optimistic' },
    repeatedInput: 'queue-all', retry: 'idempotent',
    offline: { mode: 'when-online', expiresAfterMs: 1_000, reauthorize: true },
    resource: input => input.resource, fingerprint: input => input.value,
    send, accepted: (receipt, operation) => receipt.mutationId === operation.id,
    reconcile: async () => {}, classify: () => 'unknown',
  }
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('Causync durable recovery', () => {
  it('isolates persisted identities by scope and resumes reconciliation without replay', async () => {
    const store = createStorageRecoveryStore(memoryStorage())
    const source = contract()
    await saveRecoveryOperation({
      store, scope: 'tenant-a:user', contract: source,
      operation: { id: 'm-1', resource: 'task:1', input: { resource: 'task:1', value: 'Today' } },
    })
    expect(await store.load('tenant-b:user')).toEqual([])
    const send = vi.fn()
    const recoveredContract = contract(send)
    const journal = createMutationJournal<Input, Receipt>()
    const report = await recoverPersistedOperations({
      store, scope: 'tenant-a:user', journal,
      resolveContract: id => id === recoveredContract.id ? recoveredContract : undefined,
      parseInput: (_contract, value) => parseInput(value),
      lookupStatus: async () => ({ state: 'accepted', receipt: { mutationId: 'm-1' } }),
    })
    await vi.waitFor(() => expect(journal.getSnapshot()[0]?.phase).toBe('confirmed'))
    expect(report).toEqual([{ id: 'm-1', state: 'accepted' }])
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps unknown and absent outcomes for attention', async () => {
    const store = createStorageRecoveryStore(memoryStorage())
    const valueContract = contract()
    for (const id of ['unknown', 'gone']) await saveRecoveryOperation({
      store, scope: 'scope', contract: valueContract,
      operation: { id, resource: `task:${id}`, input: { resource: `task:${id}`, value: id } },
    })
    const journal = createMutationJournal<Input, Receipt>()
    const report = await recoverPersistedOperations({
      store, scope: 'scope', journal, resolveContract: () => valueContract,
      parseInput: (_contract, value) => parseInput(value),
      lookupStatus: async ({ id }) => ({ state: id === 'unknown' ? 'unknown' : 'not-found' }),
    })
    expect(report.map(item => item.state)).toEqual(['unknown', 'not-found'])
    expect(journal.getSnapshot()).toHaveLength(2)
    expect(await store.load('scope')).toHaveLength(2)
  })

  it('requires opt-in, unexpired drafts and current authorization for offline replay', async () => {
    const send = vi.fn(async (_input: Input, context: { mutationId: string }) => ({ mutationId: context.mutationId }))
    const valueContract = contract(send)
    const operation = { id: 'offline-1', resource: 'task:1', input: { resource: 'task:1', value: 'Today' } }
    const draft = createOfflineDraft({ contract: valueContract, operation, now: 1_000 })
    const journal = createMutationJournal<Input, Receipt>()
    await expect(replayOfflineDraft({
      draft, contract: valueContract, journal, parseInput,
      reauthorize: async () => false, now: 1_500,
    })).rejects.toThrow('not authorized')
    const submitted = await replayOfflineDraft({
      draft, contract: valueContract, journal, parseInput,
      reauthorize: async () => true, now: 1_500,
    })
    expect(submitted.id).toBe('offline-1')
    await submitted.settled
    expect(send).toHaveBeenCalledTimes(1)
    await expect(replayOfflineDraft({
      draft, contract: valueContract, journal: createMutationJournal<Input, Receipt>(), parseInput,
      reauthorize: async () => true, now: 2_000,
    })).rejects.toThrow('expired')
  })

  it('broadcasts identifiers and requires a lock for exclusive multi-tab sends', async () => {
    let receiver: ((event: MessageEvent) => void) | undefined
    const channel = {
      postMessage: vi.fn(),
      addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) => { receiver = listener },
      removeEventListener: vi.fn(), close: vi.fn(),
    }
    const lockNames: string[] = []
    const coordinator = createBrowserCoordinator({
      scope: 'tenant:user', channel,
      locks: { async request<T>(name: string, action: () => Promise<T>) { lockNames.push(name); return action() } },
    })
    const observed = vi.fn()
    coordinator.subscribe(observed)
    coordinator.publish('m-1')
    expect(channel.postMessage).toHaveBeenCalledWith({ scope: 'tenant:user', mutationId: 'm-1' })
    receiver?.({ data: { scope: 'tenant:user', mutationId: 'm-2' } } as MessageEvent)
    expect(observed).toHaveBeenCalledWith('m-2')
    await expect(coordinator.runExclusive('task:1', async () => 'sent')).resolves.toBe('sent')
    expect(lockNames[0]).toBe('causync:tenant:user:task:1')
  })
})
