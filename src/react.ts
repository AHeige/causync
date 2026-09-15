'use client'

import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import type { MutationJournal } from './journal'
import type { ScopedJournalRegistry } from './scopes'
import type { Operation, Phase } from './types'

export type CausyncPresentationState =
  | 'syncing'
  | 'settled'
  | 'failed'
  | 'conflict'
  | 'needs-attention'

/** Maps protocol truth to a UX state without putting UX language in the protocol. */
export function toCausyncPresentationState(phase: Phase): CausyncPresentationState {
  if (phase === 'pending' || phase === 'accepted') return 'syncing'
  if (phase === 'confirmed' || phase === 'superseded') return 'settled'
  if (phase === 'uncertain') return 'needs-attention'
  return phase
}

const empty: readonly never[] = []
const JournalContext = createContext<unknown>(null)

export function useMutationJournal<I, R>(
  journal: MutationJournal<I, R>,
): readonly Operation<I, R>[] {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, () => empty)
}

type ProviderProps<I, R> = Readonly<{
  children: ReactNode
}> & (
  | Readonly<{ journal: MutationJournal<I, R>; registry?: never; scope?: never }>
  | Readonly<{ journal?: never; registry: ScopedJournalRegistry<I, R>; scope: string }>
)

/** Keeps one journal available to descendants without transferring its ownership to React. */
export function CausyncProvider<I, R>(props: ProviderProps<I, R>) {
  const journal = useMemo(
    () => props.journal ?? props.registry.get(props.scope),
    [props.journal, props.registry, props.scope],
  )
  return createElement(JournalContext.Provider, { value: journal }, props.children)
}

export function useCausyncJournal<I, R>(): MutationJournal<I, R> {
  const journal = useContext(JournalContext)
  if (!journal) throw new Error('useCausyncJournal must be used inside CausyncProvider')
  return journal as MutationJournal<I, R>
}

export function useCausyncOperations<I, R>(filter: {
  resource?: string
  phases?: readonly Phase[]
} = {}): readonly Operation<I, R>[] {
  const journal = useCausyncJournal<I, R>()
  const operations = useMutationJournal(journal)
  return operations.filter(operation =>
    (!filter.resource || operation.resource === filter.resource) &&
    (!filter.phases || filter.phases.includes(operation.phase)),
  )
}

/** Unstyled development inspector. Hosts decide where and when it is rendered. */
export function CausyncDevtools<I, R>({
  journal,
  title = 'Causync journal',
}: Readonly<{
  journal: MutationJournal<I, R>
  title?: string
}>) {
  const operations = useMutationJournal(journal)
  let serialized: string
  try {
    serialized = JSON.stringify(operations, null, 2)
  } catch {
    serialized = '[Journal contains a value that cannot be serialized for inspection]'
  }
  return createElement(
    'details',
    { 'data-causync-devtools': true },
    createElement('summary', null, `${title} (${operations.length})`),
    createElement('pre', null, serialized),
  )
}
