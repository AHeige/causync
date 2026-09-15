import type { Contract } from './types'
import type { MutationJournal } from './journal'

export function createMutationRegistry<I, R>(keyOf: (input: I) => string) {
  const contracts = new Map<string, Contract<I, R>>()
  const registry = {
    register(key: string, contract: Contract<I, R>) {
      if (contracts.has(key)) throw new Error(`Mutation contract already registered: ${key}`)
      contracts.set(key, contract)
      return registry
    },
    resolve(input: I) {
      const key = keyOf(input)
      const contract = contracts.get(key)
      if (!contract) throw new Error(`Unregistered mutation action: ${key}`)
      return contract
    },
    submit(journal: MutationJournal<I, R>, input: I) {
      return journal.submit(registry.resolve(input), input)
    },
    keys() {
      return [...contracts.keys()]
    },
  }
  return registry
}
