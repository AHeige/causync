import { createMutationJournal, MutationFailure } from 'causync'
import { deferred } from 'causync/testing'

function create() {
  let sequence = 0
  const writes = []
  const accepted = new Map()
  const journal = createMutationJournal({ id: () => `example-${++sequence}` })
  const contract = {
    id: 'example.value.set.v1', intent: 'Set example value',
    strategy: { mode: 'optimistic' }, repeatedInput: 'queue-all', retry: 'idempotent',
    resource: input => input.resource, fingerprint: input => input.value,
    send(input, context) {
      const result = deferred()
      const previous = accepted.get(context.mutationId)
      if (previous && previous.fingerprint !== JSON.stringify(input)) {
        result.reject(new MutationFailure('Mutation identity changed payload', 'conflict'))
      } else if (previous) {
        result.resolve(previous.receipt)
      }
      writes.push({ mutationId: context.mutationId, input, result })
      return result.promise
    },
    accepted: (receipt, operation) => receipt.mutationId === operation.id,
    reconcile: async () => {},
    classify: error => error instanceof MutationFailure ? error.kind : 'unknown',
  }
  return {
    journal, contract, writes: () => writes,
    resolve(index) {
      const write = writes[index]
      if (!write) throw new Error(`Missing controlled write ${index}`)
      const receipt = { mutationId: write.mutationId }
      accepted.set(write.mutationId, { fingerprint: JSON.stringify(write.input), receipt })
      write.result.resolve(receipt)
    },
    reject(index, kind) {
      const write = writes[index]
      if (!write) throw new Error(`Missing controlled write ${index}`)
      if (kind === 'unknown') {
        accepted.set(write.mutationId, {
          fingerprint: JSON.stringify(write.input),
          receipt: { mutationId: write.mutationId },
        })
      }
      write.result.reject(new MutationFailure(`Controlled ${kind}`, kind))
    },
  }
}

export const causyncConformance = {
  create,
  samples: {
    duplicate: { resource: 'one', value: 'A' },
    sequence: [
      { resource: 'one', value: 'A' },
      { resource: 'one', value: 'B' },
      { resource: 'one', value: 'A' },
    ],
    otherResource: { resource: 'two', value: 'C' },
  },
}
