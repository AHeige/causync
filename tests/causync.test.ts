import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createCausyncContract,
  createMutationJournal,
  createMutationRegistry,
  isJsonValue,
  MutationFailure,
  parseRecoveryOperation,
  serializeRecoveryOperation,
  type Contract,
  type JsonValue,
} from '../src/index'
import {
  assertHostConformance,
  deferred,
  runDelayedConfirmationConformance,
  runHostConformance,
} from '../src/testing'

type Input = { resource: string; value: string }
function harness() {
  let sequence = 0
  const journal = createMutationJournal<Input, string>({ id: () => `${++sequence}` })
  const writes: Array<{ input: Input; id: string; result: ReturnType<typeof deferred<string>> }> = []
  const contract: Contract<Input, string> = {
    id: 'test', intent: 'Set a value', strategy: { mode: 'optimistic' }, repeatedInput: 'single-flight', retry: 'unsafe',
    resource: input => input.resource, fingerprint: input => input.value,
    send(input, context) { const result = deferred<string>(); writes.push({ input, id: context.mutationId, result }); return result.promise },
    accepted: () => true, reconcile: async () => {}, classify: e => e instanceof MutationFailure ? e.kind : 'unknown',
  }
  const submit = (value: string, resource = 'one') => journal.submit(contract, { value, resource })
  return { journal, writes, contract, submit }
}

describe('Causync contract', () => {
  it('publishes immediately and single-flights five identical rapid submissions', async () => {
    const h = harness()
    const submitted = Array.from({ length: 5 }, () => h.submit('A'))
    expect(new Set(submitted.map(s => s.id)).size).toBe(1)
    expect(h.journal.overlays()[0].input.value).toBe('A')
    expect(h.writes).toHaveLength(1)
    h.writes[0].result.resolve('A')
    await Promise.all(submitted.map(s => s.settled))
    expect(h.journal.getSnapshot()[0].phase).toBe('confirmed')
    expect(h.submit('A').id).not.toBe(submitted[0].id)
  })

  it('preserves A → B → A intent order while a different resource runs independently', async () => {
    const h = harness()
    const a = h.submit('A'); const b = h.submit('B'); const a2 = h.submit('A'); const other = h.submit('C', 'two')
    expect(new Set([a.id, b.id, a2.id]).size).toBe(3)
    expect(h.writes.map(w => w.input.value)).toEqual(['A', 'C'])
    h.writes[0].result.resolve('A'); h.writes[1].result.resolve('C')
    await Promise.all([a.settled, other.settled])
    expect(h.writes[2].input.value).toBe('B')
    h.writes[2].result.resolve('B'); await b.settled
    h.writes[3].result.resolve('A'); await a2.settled
    expect(h.journal.getSnapshot().every(s => s.phase === 'confirmed')).toBe(true)
  })

  it('removes only the rejected overlay and proceeds with the next intent', async () => {
    const h = harness(); const a = h.submit('A'); const b = h.submit('B')
    h.writes[0].result.reject(new MutationFailure('Denied', 'rejected'))
    await expect(a.settled).rejects.toThrow('Denied')
    expect(h.journal.overlays().map(s => s.input.value)).toEqual(['B'])
    h.writes[1].result.resolve('B'); await b.settled
  })

  it.each(['conflict', 'unknown'] as const)('pauses dependent writes on %s without discarding the draft', async kind => {
    const h = harness(); const a = h.submit('A'); const b = h.submit('B')
    h.writes[0].result.reject(new MutationFailure('Review', kind)); await expect(a.settled).rejects.toThrow()
    expect(h.writes).toHaveLength(1)
    expect(h.journal.getSnapshot()[0].input.value).toBe('A')
    if (kind === 'unknown') await expect(h.journal.retry(a.id)).rejects.toThrow('safe write retry')
    h.journal.dismiss(a.id, { queued: 'continue' })
    expect(h.writes).toHaveLength(2)
    h.writes[1].result.resolve('B'); await b.settled
  })

  it('holds acceptance separately from projection and recovers reads without replaying writes', async () => {
    const h = harness(); const projection = deferred<void>()
    h.contract.reconcile = vi.fn(() => projection.promise)
    const a = h.submit('A'); h.writes[0].result.resolve('receipt')
    await vi.waitFor(() => expect(h.journal.getSnapshot()[0].phase).toBe('accepted'))
    expect(h.journal.overlays()).toHaveLength(1)
    projection.reject(new Error('Read offline')); await expect(a.settled).rejects.toThrow()
    expect(h.journal.getSnapshot()[0].phase).toBe('uncertain')
    h.contract.reconcile = async () => {}
    await h.journal.retry(a.id)
    expect(h.writes).toHaveLength(1)
  })

  it('retries only with an explicit host guarantee and preserves id and captured payload', async () => {
    const h = harness(); h.contract.retry = 'idempotent'
    const input = { resource: 'one', value: 'A' }
    const a = h.journal.submit(h.contract, input); input.value = 'Changed after submit'
    h.writes[0].result.reject(new Error('Response lost')); await expect(a.settled).rejects.toThrow()
    const retry = h.journal.retry(a.id)
    expect(h.writes[1].id).toBe(a.id)
    expect(h.writes[1].input.value).toBe('A')
    h.writes[1].result.resolve('A'); await retry
  })

  it('fences reads at request start, so late old reads cannot claim coverage', async () => {
    const h = harness(); const slowRead = deferred<string>(); const stale = h.journal.read(() => slowRead.promise)
    const a = h.submit('A'); h.writes[0].result.resolve('A'); await a.settled
    slowRead.resolve('old')
    expect((await stale).confirmedIds).toEqual([])
    expect((await h.journal.read(async () => 'new')).confirmedIds).toEqual([a.id])
  })

  it.each(['acknowledged', 'confirmation-first'] as const)('offers immediate pending without a fabricated outcome for %s', mode => {
    const h = harness(); h.contract.strategy = { mode, reason: 'External effect' }; h.submit('A')
    expect(h.journal.getSnapshot()[0].phase).toBe('pending')
    expect(h.journal.overlays()).toEqual([])
  })

  it('a broken subscriber cannot prevent execution', async () => {
    const h = harness(); h.journal.subscribe(() => { throw new Error('Observer') })
    const a = h.submit('A'); expect(h.writes).toHaveLength(1)
    h.writes[0].result.resolve('A'); await a.settled
  })

  it('restores an interrupted identity for review without replaying the write', async () => {
    const h = harness()
    h.journal.restore(h.contract, { id: 'interrupted', input: { resource: 'one', value: 'Draft' } })
    expect(h.writes).toHaveLength(0)
    expect(h.journal.getSnapshot()[0]).toMatchObject({ id: 'interrupted', phase: 'uncertain' })
    const queued = h.submit('Next')
    expect(h.writes).toHaveLength(0)
    h.journal.dismiss('interrupted', { queued: 'discard' })
    await expect(queued.settled).rejects.toThrow('discarded')
    expect(h.writes).toHaveLength(0)
    expect(h.journal.getSnapshot()).toEqual([])
  })

  it('routes every entry point through one registered contract and rejects ad hoc actions', async () => {
    type RegisteredInput = Input & { action: string }
    const journal = createMutationJournal<RegisteredInput, string>({ id: () => 'registered' })
    const sends: string[] = []
    const registry = createMutationRegistry<RegisteredInput, string>(input => input.action)
    registry.register('value.set', {
      id: 'value.set.v1', intent: 'Set registered value', strategy: { mode: 'optimistic' },
      repeatedInput: 'single-flight', retry: 'unsafe', resource: input => input.resource,
      fingerprint: input => input.value,
      async send(input) { sends.push(input.value); return input.value },
      accepted: () => true, reconcile: async () => {}, classify: () => 'unknown',
    })

    await registry.submit(journal, { action: 'value.set', resource: 'one', value: 'A' }).settled
    expect(sends).toEqual(['A'])
    expect(() => registry.submit(journal, { action: 'unregistered', resource: 'one', value: 'B' })).toThrow('Unregistered mutation action')
    expect(registry.keys()).toEqual(['value.set'])
  })

  it('holds confirmed overlays until a read incorporates them', async () => {
    const h = harness(); const a = h.submit('A')
    h.writes[0].result.resolve('A'); await a.settled
    expect(h.journal.overlays()).toHaveLength(1)
    const read = await h.journal.read(async () => 'A')
    expect(h.journal.overlays(undefined, read.confirmedIds)).toHaveLength(0)
  })

  it('round-trips a versioned recovery envelope and rejects changed identity', () => {
    const h = harness()
    const operation = {
      id: 'stable-id',
      resource: 'one',
      input: { resource: 'one', value: 'Draft' },
    }
    const serialized = serializeRecoveryOperation(h.contract, operation)
    const parseInput = (value: JsonValue): Input => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        typeof (value as Record<string, unknown>).resource !== 'string' ||
        typeof (value as Record<string, unknown>).value !== 'string'
      ) throw new Error('Invalid input')
      const record = value as Record<string, string>
      return { resource: record.resource, value: record.value }
    }

    expect(parseRecoveryOperation(serialized, h.contract, parseInput)).toEqual({
      id: 'stable-id',
      input: operation.input,
    })
    expect(() => parseRecoveryOperation(
      serialized.replace('Draft', 'Changed'),
      h.contract,
      parseInput,
    )).toThrow('identity does not match')
  })

  it('limits recovery input to finite JSON without cycles or custom prototypes', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(isJsonValue({ value: ['A', 1, true, null] })).toBe(true)
    expect(isJsonValue({ value: Number.NaN })).toBe(false)
    expect(isJsonValue({ value: new Date() })).toBe(false)
    expect(isJsonValue(cycle)).toBe(false)
  })

  it('compacts only failed or authoritatively covered terminal history', async () => {
    const h = harness()
    const first = h.submit('A')
    h.writes[0].result.resolve('A')
    await first.settled
    const second = h.submit('B')
    h.writes[1].result.resolve('B')
    await second.settled

    expect(h.journal.compact({ coveredIds: [first.id], retainTerminal: 0 })).toBe(1)
    expect(h.journal.getSnapshot().map(operation => operation.id)).toEqual([second.id])
    expect(h.journal.compact({ coveredIds: [], retainTerminal: 0 })).toBe(0)
    expect(h.journal.getSnapshot()).toHaveLength(1)
  })

  it('exports a reusable host conformance runner', async () => {
    const report = await runHostConformance({
      samples: {
        duplicate: { resource: 'one', value: 'A' },
        sequence: [
          { resource: 'one', value: 'A' },
          { resource: 'one', value: 'B' },
          { resource: 'one', value: 'A' },
        ],
        otherResource: { resource: 'two', value: 'C' },
      },
      create() {
        const h = harness()
        return {
          journal: h.journal,
          contract: h.contract,
          writes: () => h.writes.map(write => ({ mutationId: write.id, input: write.input })),
          resolve(index: number) {
            const write = h.writes[index]
            if (!write) throw new Error(`Missing controlled write ${index}`)
            write.result.resolve(write.input.value)
          },
          reject(index: number, kind: 'rejected' | 'conflict' | 'unknown') {
            const write = h.writes[index]
            if (!write) throw new Error(`Missing controlled write ${index}`)
            write.result.reject(new MutationFailure(`Controlled ${kind}`, kind))
          },
        }
      },
    })

    expect(report.cases.map(result => result.name)).toEqual([
      'immediate repeated input',
      'A → B → A and independent resources',
      'selective rejection',
      'unknown outcome pause',
      'conflict pause',
      'retry identity policy',
      'authoritative read fence',
    ])
    expect(() => assertHostConformance(report)).not.toThrow()
    expect(report.passed).toBe(true)
  })

  it('validates runtime input and receipts through Standard Schema', async () => {
    const journal = createMutationJournal<{ resource: string; value: string }, { mutationId: string }>()
    const contract = createCausyncContract({
      id: 'strict.value.set.v1',
      intent: 'Set a strict value',
      strategy: { mode: 'optimistic' },
      repeatedInput: 'single-flight',
      retry: 'unsafe',
      schemas: {
        input: z.object({ resource: z.string().min(1), value: z.string().min(1) }),
        receipt: z.object({ mutationId: z.string().min(1) }),
      },
      resource: input => input.resource,
      fingerprint: input => input.value,
      async send() { return { mutationId: '' } },
      accepted: (receipt, operation) => receipt.mutationId === operation.id,
      reconcile: async () => {},
      classify: () => 'unknown',
    })

    expect(() => journal.submit(contract, { resource: '', value: '' })).toThrow('input validation failed')
    expect(journal.getSnapshot()).toHaveLength(0)
    const submitted = journal.submit(contract, { resource: 'one', value: 'A' })
    await expect(submitted.settled).rejects.toThrow('receipt validation failed')
    expect(journal.getSnapshot()[0].phase).toBe('uncertain')
  })

  it('requires a reason for non-optimistic contract strategies', () => {
    expect(() => createCausyncContract({
      ...harness().contract,
      strategy: { mode: 'acknowledged', reason: '' },
    })).toThrow('requires an explicit reason')
  })

  it('keeps the in-flight write and replaces only superseded unsent desired state', async () => {
    const h = harness()
    h.contract.repeatedInput = 'latest-unsent'
    const first = h.submit('A')
    const replaced = h.submit('B')
    const latest = h.submit('C')

    expect(h.writes.map(write => write.input.value)).toEqual(['A'])
    expect(h.journal.overlays().map(operation => operation.input.value)).toEqual(['A', 'C'])
    await expect(replaced.settled).rejects.toThrow('superseded')
    expect(h.journal.getSnapshot().map(operation => operation.phase)).toEqual([
      'pending',
      'superseded',
      'pending',
    ])

    h.writes[0].result.resolve('A')
    await first.settled
    expect(h.writes.map(write => write.input.value)).toEqual(['A', 'C'])
    h.writes[1].result.resolve('C')
    await latest.settled
    expect(h.journal.getSnapshot().at(-1)?.phase).toBe('confirmed')
  })

  it('exports projection conformance for accepted, confirmed and covered evidence', async () => {
    const report = await runDelayedConfirmationConformance({
      input: { resource: 'one', value: 'A' },
      create() {
        const transport = deferred<string>()
        const projection = deferred<void>()
        const writes: Array<{ mutationId: string; input: Input }> = []
        const journal = createMutationJournal<Input, string>({ id: () => 'projected-1' })
        const contract: Contract<Input, string> = {
          id: 'projected.value.set.v1',
          intent: 'Set projected value',
          strategy: { mode: 'optimistic' },
          repeatedInput: 'single-flight',
          retry: 'idempotent',
          resource: input => input.resource,
          fingerprint: input => input.value,
          send(input, context) { writes.push({ mutationId: context.mutationId, input }); return transport.promise },
          accepted: (receipt, operation) => receipt === operation.id,
          reconcile: () => projection.promise,
          classify: () => 'unknown',
        }
        return {
          journal,
          contract,
          writes: () => writes,
          accept: () => transport.resolve('projected-1'),
          confirm: () => projection.resolve(),
        }
      },
    })
    expect(() => assertHostConformance(report)).not.toThrow()
  })
})
