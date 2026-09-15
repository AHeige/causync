import type { Contract, Operation } from './types'

export const CAUSYNC_RECOVERY_VERSION = 1 as const

type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]

export type RecoveryOperation<I> = {
  version: typeof CAUSYNC_RECOVERY_VERSION
  contractId: string
  id: string
  resource: string
  fingerprint: string
  input: I
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValue(item, seen))
    : Reflect.ownKeys(value).every(key =>
        typeof key === 'string' &&
        key !== '__proto__' &&
        isJsonValue((value as Record<string, unknown>)[key], seen),
      )
  seen.delete(value)
  return valid
}

export function serializeRecoveryOperation<I, R>(
  contract: Contract<I, R>,
  operation: Pick<Operation<I, R>, 'id' | 'resource' | 'input'>,
) {
  if (!isJsonValue(operation.input)) {
    throw new Error('Causync recovery input must be finite JSON data without cycles or custom prototypes')
  }
  return JSON.stringify({
    version: CAUSYNC_RECOVERY_VERSION,
    contractId: contract.id,
    id: operation.id,
    resource: operation.resource,
    fingerprint: contract.fingerprint(operation.input),
    input: operation.input,
  } satisfies RecoveryOperation<I>)
}

export function parseRecoveryOperation<I, R>(
  serialized: string,
  contract: Contract<I, R>,
  parseInput: (value: JsonValue) => I,
): Pick<Operation<I, R>, 'id' | 'input'> {
  const value: unknown = JSON.parse(serialized)
  if (!isJsonValue(value) || !isJsonRecord(value)) {
    throw new Error('Invalid Causync recovery envelope')
  }
  if (
    value.version !== CAUSYNC_RECOVERY_VERSION ||
    value.contractId !== contract.id ||
    typeof value.id !== 'string' ||
    typeof value.resource !== 'string' ||
    typeof value.fingerprint !== 'string' ||
    !('input' in value)
  ) {
    throw new Error('Unsupported or mismatched Causync recovery envelope')
  }
  const input = parseInput(value.input)
  if (
    contract.resource(input) !== value.resource ||
    contract.fingerprint(input) !== value.fingerprint
  ) {
    throw new Error('Causync recovery identity does not match its captured input')
  }
  return { id: value.id, input }
}
