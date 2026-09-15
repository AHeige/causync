import { isJsonValue, type JsonValue } from './recovery'
import type { Contract, OfflinePolicy, RepeatedInput, RetryPolicy, Strategy } from './types'

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const CAUSYNC_MANIFEST_VERSION = 1 as const

export type ContractEvidenceDescription = Readonly<{
  acceptance: string
  confirmation: string
  coverage: string
}>

export type ContractManifestEntry = Readonly<{
  action: string
  contractId: string
  intent: string
  strategy: Strategy
  repeatedInput: RepeatedInput
  retry: RetryPolicy
  offline?: OfflinePolicy
  resource: string
  evidence: ContractEvidenceDescription
  schemaVendors?: Readonly<{ input: string; receipt: string }>
  examples?: Readonly<{ input: JsonValue; receipt: JsonValue }>
}>

export type ContractManifest = Readonly<{
  schemaVersion: typeof CAUSYNC_MANIFEST_VERSION
  library: 'causync'
  contracts: readonly ContractManifestEntry[]
}>

export type ContractManifestMetadata = Readonly<{
  action: string
  resource: string
  evidence: ContractEvidenceDescription
  examples?: Readonly<{ input: JsonValue; receipt: JsonValue }>
}>

function required(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required`)
  return value
}

export function describeContract<I, R>(
  contract: Contract<I, R>,
  metadata: ContractManifestMetadata,
): ContractManifestEntry {
  required(metadata.action, 'Manifest action')
  required(metadata.resource, 'Manifest resource')
  required(metadata.evidence.acceptance, 'Acceptance evidence')
  required(metadata.evidence.confirmation, 'Confirmation evidence')
  required(metadata.evidence.coverage, 'Coverage evidence')
  if (
    metadata.examples &&
    (!isJsonValue(metadata.examples.input) || !isJsonValue(metadata.examples.receipt))
  ) {
    throw new Error('Manifest examples must be finite JSON values')
  }
  return Object.freeze({
    action: metadata.action,
    contractId: contract.id,
    intent: contract.intent,
    strategy: contract.strategy,
    repeatedInput: contract.repeatedInput,
    retry: contract.retry,
    ...(contract.offline ? { offline: contract.offline } : {}),
    resource: metadata.resource,
    evidence: metadata.evidence,
    ...(contract.schemas ? {
      schemaVendors: {
        input: contract.schemas.input['~standard'].vendor,
        receipt: contract.schemas.receipt['~standard'].vendor,
      },
    } : {}),
    ...(metadata.examples ? { examples: metadata.examples } : {}),
  })
}

export function createContractManifest(
  contracts: readonly ContractManifestEntry[],
): ContractManifest {
  const actions = new Set<string>()
  const contractIds = new Set<string>()
  for (const contract of contracts) {
    if (actions.has(contract.action)) throw new Error(`Duplicate manifest action: ${contract.action}`)
    if (contractIds.has(contract.contractId)) throw new Error(`Duplicate manifest contract: ${contract.contractId}`)
    actions.add(contract.action)
    contractIds.add(contract.contractId)
  }
  return Object.freeze({
    schemaVersion: CAUSYNC_MANIFEST_VERSION,
    library: 'causync',
    contracts: Object.freeze([...contracts]),
  })
}

export function parseContractManifest(value: unknown): ContractManifest {
  if (!isJsonValue(value) || !isJsonRecord(value)) {
    throw new Error('Invalid Causync contract manifest')
  }
  if (value.schemaVersion !== CAUSYNC_MANIFEST_VERSION || value.library !== 'causync' || !Array.isArray(value.contracts)) {
    throw new Error('Unsupported Causync contract manifest')
  }
  const contracts = value.contracts.map((candidate, index): ContractManifestEntry => {
    if (!isJsonRecord(candidate)) {
      throw new Error(`Invalid contract manifest entry ${index}`)
    }
    const strategy = candidate.strategy
    const evidence = candidate.evidence
    if (
      typeof candidate.action !== 'string' ||
      typeof candidate.contractId !== 'string' ||
      typeof candidate.intent !== 'string' ||
      typeof candidate.resource !== 'string' ||
      !['single-flight', 'latest-unsent', 'queue-all'].includes(String(candidate.repeatedInput)) ||
      !['unsafe', 'idempotent'].includes(String(candidate.retry)) ||
      !isJsonRecord(strategy) ||
      !['optimistic', 'acknowledged', 'confirmation-first'].includes(String(strategy.mode)) ||
      !isJsonRecord(evidence) ||
      typeof evidence.acceptance !== 'string' ||
      typeof evidence.confirmation !== 'string' ||
      typeof evidence.coverage !== 'string'
    ) throw new Error(`Invalid contract manifest entry ${index}`)
    if (strategy.mode !== 'optimistic' && typeof strategy.reason !== 'string') {
      throw new Error(`Manifest entry ${index} requires a strategy reason`)
    }
    for (const [label, text] of [
      ['action', candidate.action], ['contractId', candidate.contractId],
      ['intent', candidate.intent], ['resource', candidate.resource],
      ['acceptance evidence', evidence.acceptance],
      ['confirmation evidence', evidence.confirmation],
      ['coverage evidence', evidence.coverage],
    ] as const) if (!text.trim()) throw new Error(`Manifest entry ${index} has empty ${label}`)
    if ('schemaVendors' in candidate) {
      const vendors = candidate.schemaVendors
      if (!isJsonRecord(vendors) || typeof vendors.input !== 'string' || typeof vendors.receipt !== 'string' || !vendors.input.trim() || !vendors.receipt.trim()) {
        throw new Error(`Invalid schema vendors in manifest entry ${index}`)
      }
    }
    if ('examples' in candidate) {
      const examples = candidate.examples
      if (!isJsonRecord(examples) || !('input' in examples) || !('receipt' in examples)) {
        throw new Error(`Invalid examples in manifest entry ${index}`)
      }
    }
    if ('offline' in candidate) {
      const offline = candidate.offline
      if (!isJsonRecord(offline) || !['never', 'when-online'].includes(String(offline.mode))) {
        throw new Error(`Invalid offline policy in manifest entry ${index}`)
      }
      if (
        offline.mode === 'when-online' &&
        (offline.reauthorize !== true || !Number.isInteger(offline.expiresAfterMs) || Number(offline.expiresAfterMs) <= 0)
      ) throw new Error(`Invalid offline replay policy in manifest entry ${index}`)
    }
    return candidate as unknown as ContractManifestEntry
  })
  return createContractManifest(contracts)
}
