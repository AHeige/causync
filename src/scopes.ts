import { createMutationJournal, type MutationJournal } from './journal'

export type ScopedJournalRegistry<I, R> = Readonly<{
  get(scope: string): MutationJournal<I, R>
  clear(scope: string): boolean
  clearAll(): void
  scopes(): readonly string[]
}>

/** Own journals by authenticated host scope rather than component lifetime. */
export function createScopedJournalRegistry<I, R>(
  create: (scope: string) => MutationJournal<I, R> = () => createMutationJournal<I, R>(),
): ScopedJournalRegistry<I, R> {
  const journals = new Map<string, MutationJournal<I, R>>()
  return Object.freeze({
    get(scope: string) {
      if (!scope.trim()) throw new Error('Causync journal scope is required')
      let journal = journals.get(scope)
      if (!journal) {
        journal = create(scope)
        journals.set(scope, journal)
      }
      return journal
    },
    clear(scope: string) { return journals.delete(scope) },
    clearAll() { journals.clear() },
    scopes() { return [...journals.keys()] },
  })
}
