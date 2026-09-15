import type { MutationJournal } from './journal'
import type { Operation } from './types'

export type SWRRevalidator<T> = (key: string) => Promise<T>

/**
 * Bridges SWR reads to Causync coverage. `revalidate` must return uncached host
 * data; `covers` remains the host's evidence decision.
 */
export function createCausyncSWRAdapter<I, R>(journal: MutationJournal<I, R>) {
  return Object.freeze({
    async revalidate<T>(
      key: string,
      revalidate: SWRRevalidator<T>,
      covers: (value: T, operation: Operation<I, R>) => boolean,
    ) {
      return journal.readCovered(
        () => revalidate(key),
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
