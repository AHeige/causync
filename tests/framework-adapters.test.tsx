import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CausyncDevtools, CausyncProvider, toCausyncPresentationState } from '../src/react'
import { createScopedJournalRegistry } from '../src/scopes'
import { createCausyncSWRAdapter } from '../src/swr'
import { createCausyncQueryAdapter } from '../src/tanstack-query'
import type { Contract } from '../src/types'
import { createMutationJournal } from '../src/journal'

type Input = { resource: string; value: string }
type Receipt = { mutationId: string; version: number }

function setup() {
  let id = 0
  let version = 0
  const registry = createScopedJournalRegistry<Input, Receipt>(() =>
    createJournal(() => `${++id}`),
  )
  const contract: Contract<Input, Receipt> = {
    id: 'value.set.v1', intent: 'Set value', strategy: { mode: 'optimistic' },
    repeatedInput: 'queue-all', retry: 'idempotent',
    resource: input => input.resource, fingerprint: input => input.value,
    async send(_input, context) { return { mutationId: context.mutationId, version: ++version } },
    accepted: (receipt, operation) => receipt.mutationId === operation.id,
    reconcile: async () => {}, classify: () => 'unknown',
  }
  return { registry, contract }
}

function createJournal(id: () => string) {
  return createMutationJournal<Input, Receipt>({ id })
}

describe('Causync framework adapters', () => {
  it('keeps protocol uncertainty separate from its attention UX', () => {
    expect(toCausyncPresentationState('uncertain')).toBe('needs-attention')
    expect(toCausyncPresentationState('accepted')).toBe('syncing')
  })
  it('owns journals by explicit scope and clears them at the auth boundary', () => {
    const { registry } = setup()
    expect(registry.get('tenant-a:user-1')).toBe(registry.get('tenant-a:user-1'))
    expect(registry.get('tenant-a:user-1')).not.toBe(registry.get('tenant-b:user-1'))
    expect(registry.scopes()).toEqual(['tenant-a:user-1', 'tenant-b:user-1'])
    expect(registry.clear('tenant-a:user-1')).toBe(true)
    expect(registry.get('tenant-a:user-1')).not.toBe(registry.get('tenant-b:user-1'))
  })

  it('retires overlays only when fetched data proves operation coverage', async () => {
    const { registry, contract } = setup()
    const journal = registry.get('tenant:user')
    const submission = journal.submit(contract, { resource: 'task:1', value: 'Today' })
    await submission.settled
    const swr = createCausyncSWRAdapter(journal)
    const stale = await swr.revalidate('tasks', async () => ({ version: 0 }),
      (value, operation) => value.version >= (operation.receipt?.version ?? Infinity))
    expect(swr.project<string[]>([], stale.confirmedIds, (values, operation) => [...values, operation.input.value])).toEqual(['Today'])
    const covered = await swr.revalidate('tasks', async () => ({ version: 1 }),
      (value, operation) => value.version >= (operation.receipt?.version ?? Infinity))
    expect(covered.confirmedIds).toEqual([submission.id])
    expect(swr.project<string[]>([], covered.confirmedIds, values => values)).toEqual([])
  })

  it('gives TanStack Query the same evidence boundary', async () => {
    const { registry, contract } = setup()
    const journal = registry.get('tenant:user')
    const submission = journal.submit(contract, { resource: 'task:1', value: 'Today' })
    await submission.settled
    const query = createCausyncQueryAdapter(journal)
    const result = await query.fetch(
      { queryKey: ['tasks'] },
      async () => ({ coveredMutations: [submission.id] }),
      (value, operation) => value.coveredMutations.includes(operation.id),
    )
    expect(result.confirmedIds).toEqual([submission.id])
  })

  it('renders an unstyled journal inspector through the provider', () => {
    const { registry } = setup()
    const journal = registry.get('tenant:user')
    const html = renderToString(
      <CausyncProvider journal={journal}>
        <CausyncDevtools journal={journal} />
      </CausyncProvider>,
    )
    expect(html).toContain('data-causync-devtools="true"')
    expect(html).toContain('Causync journal (0)')
  })
})
