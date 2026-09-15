import type { Contract } from './types'

/** Defines and runtime-checks one immutable public mutation contract. */
export function createCausyncContract<I, R>(definition: Contract<I, R>): Readonly<Contract<I, R>> {
  if (!definition.id.trim()) throw new Error('Causync contract id is required')
  if (!definition.intent.trim()) throw new Error('Causync contract intent is required')
  if (
    definition.strategy.mode !== 'optimistic' &&
    !definition.strategy.reason.trim()
  ) {
    throw new Error(`${definition.strategy.mode} requires an explicit reason`)
  }
  if (
    definition.offline?.mode === 'when-online' &&
    (!Number.isInteger(definition.offline.expiresAfterMs) || definition.offline.expiresAfterMs <= 0)
  ) {
    throw new Error('Offline replay expiry must be a positive integer')
  }
  return Object.freeze({
    ...definition,
    strategy: Object.freeze({ ...definition.strategy }),
    ...(definition.schemas
      ? { schemas: Object.freeze({ ...definition.schemas }) }
      : {}),
    ...(definition.offline ? { offline: Object.freeze({ ...definition.offline }) } : {}),
  })
}
