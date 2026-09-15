import { describe, expect, it } from 'vitest'

import {
  createCausyncContract,
  createContractManifest,
  describeContract,
  parseContractManifest,
  type Contract,
} from '../src/index'
import { generateContractModule } from '../src/generator'

type Input = { id: string; value: string }
type Receipt = { mutationId: string; value: string }

const contract: Contract<Input, Receipt> = createCausyncContract({
  id: 'item.value.set.v1',
  intent: 'Set item value',
  strategy: { mode: 'optimistic' },
  repeatedInput: 'latest-unsent',
  retry: 'idempotent',
  resource: input => `item:${input.id}`,
  fingerprint: input => input.value,
  async send(input, { mutationId }) { return { mutationId, value: input.value } },
  accepted: (receipt, operation) => receipt.mutationId === operation.id,
  reconcile: async () => {},
  classify: () => 'unknown',
})

function entry() {
  return describeContract(contract, {
    action: 'item.value.set',
    resource: 'item:{id}',
    evidence: {
      acceptance: 'Receipt matches mutation id',
      confirmation: 'Stored value matches desired value',
      coverage: 'Authoritative item read includes the stored revision',
    },
    examples: {
      input: { id: '42', value: 'Ready' },
      receipt: { mutationId: 'example-1', value: 'Ready' },
    },
  })
}

describe('Causync contract manifests', () => {
  it('creates and parses a versioned machine-readable manifest', () => {
    const manifest = createContractManifest([entry()])
    expect(parseContractManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest)
    expect(manifest.contracts[0]).toMatchObject({
      action: 'item.value.set',
      contractId: 'item.value.set.v1',
      repeatedInput: 'latest-unsent',
      retry: 'idempotent',
    })
  })

  it('rejects duplicate actions and malformed evidence declarations', () => {
    expect(() => createContractManifest([entry(), entry()])).toThrow('Duplicate manifest action')
    expect(() => parseContractManifest({ schemaVersion: 1, library: 'causync', contracts: [{}] })).toThrow('entry 0')
    expect(() => parseContractManifest({
      ...createContractManifest([entry()]),
      contracts: [{ ...entry(), evidence: { ...entry().evidence, coverage: '' } }],
    })).toThrow('empty coverage evidence')
    expect(() => parseContractManifest({
      ...createContractManifest([entry()]),
      contracts: [{ ...entry(), schemaVendors: { input: '', receipt: 'zod' } }],
    })).toThrow('schema vendors')
  })

  it('generates deterministic action, envelope and fixture types', () => {
    const generated = generateContractModule(createContractManifest([entry()]))
    expect(generated).toContain('export type CausyncAction = typeof causyncActions[number]')
    expect(generated).toContain('export type CausyncCommandEnvelope')
    expect(generated).toContain('export const causyncFixtures')
    expect(generated).toContain('item.value.set.v1')
    expect(generateContractModule(createContractManifest([entry()]))).toBe(generated)
  })
})
