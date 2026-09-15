import type { MutationJournal } from './journal'
import type { Operation } from './types'

export type QueryFetcher<TOptions, TData> = (options: TOptions) => Promise<TData>

/** Structural adapter: no runtime dependency on a specific TanStack Query version. */
export function createCausyncQueryAdapter<I, R>(journal: MutationJournal<I, R>) {
  return Object.freeze({
    async fetch<TOptions, TData>(
      options: TOptions,
      fetchQuery: QueryFetcher<TOptions, TData>,
      covers: (value: TData, operation: Operation<I, R>) => boolean,
    ) {
      return journal.readCovered(
        () => fetchQuery(options),
        covers,
      )
    },
    project<T>(
      base: T,
      confirmedIds: readonly string[],
      reducer: (value: T, operation: Operation<I, R>) => T,
    ) {
      return journal.overlays(undefined, confirmedIds).reduce(reducer, base)
    },
  })
}
