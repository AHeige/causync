import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'causync-package-'))

try {
  execFileSync('npm', ['run', 'build'], { cwd: packageRoot, stdio: 'inherit' })
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', temporaryRoot], { cwd: packageRoot, encoding: 'utf8' }))
  const tarball = path.join(temporaryRoot, packed[0].filename)
  const fixture = path.join(temporaryRoot, 'fixture')
  fs.mkdirSync(fixture)
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'causync-install-fixture', private: true, type: 'module' }))
  fs.writeFileSync(path.join(fixture, 'verify.mjs'), `
    import { createCausyncContract, createMutationJournal, createStorageRecoveryStore } from 'causync'
    import { generateContractModule } from 'causync/generator'
    import { deferred } from 'causync/testing'
    import { createCausyncSWRAdapter } from 'causync/swr'
    import { createCausyncQueryAdapter } from 'causync/tanstack-query'
    if (typeof deferred !== 'function') throw new Error('Testing export is unavailable')
    if (typeof createCausyncContract !== 'function') throw new Error('Strict contract factory is unavailable')
    if (typeof createStorageRecoveryStore !== 'function') throw new Error('Recovery store export is unavailable')
    if (typeof generateContractModule !== 'function') throw new Error('Generator export is unavailable')
    if (typeof createCausyncSWRAdapter !== 'function') throw new Error('SWR adapter export is unavailable')
    if (typeof createCausyncQueryAdapter !== 'function') throw new Error('TanStack Query adapter export is unavailable')
    const journal = createMutationJournal({ id: () => 'fixture-1' })
    const contract = {
      id: 'fixture.value.set.v1',
      intent: 'Set fixture value',
      strategy: { mode: 'optimistic' },
      repeatedInput: 'single-flight',
      retry: 'unsafe',
      resource: input => 'fixture:' + input.id,
      fingerprint: input => input.value,
      send: async (input, { mutationId }) => ({ mutationId, value: input.value }),
      accepted: (receipt, operation) => receipt.mutationId === operation.id,
      reconcile: async () => {},
      classify: () => 'unknown',
    }
    const submitted = journal.submit(contract, { id: 'one', value: 'ready' })
    if (journal.overlays('fixture:one')[0]?.input.value !== 'ready') throw new Error('Optimistic overlay was not published synchronously')
    await submitted.settled
    if (journal.getSnapshot()[0]?.phase !== 'confirmed') throw new Error('Packed core did not confirm the operation')
    console.log('Packed Causync fixture PASS')
  `)
  execFileSync('npm', ['install', tarball, '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: fixture, stdio: 'inherit' })
  execFileSync(process.execPath, ['verify.mjs'], { cwd: fixture, stdio: 'inherit' })
  const manifestPath = path.join(fixture, 'manifest.json')
  const outputPath = path.join(fixture, 'generated-contracts.ts')
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    library: 'causync',
    contracts: [{
      action: 'fixture.value.set',
      contractId: 'fixture.value.set.v1',
      intent: 'Set fixture value',
      strategy: { mode: 'optimistic' },
      repeatedInput: 'single-flight',
      retry: 'unsafe',
      resource: 'fixture:{id}',
      evidence: {
        acceptance: 'Correlated receipt',
        confirmation: 'Stored fixture value',
        coverage: 'Authoritative fixture read',
      },
      examples: { input: { id: 'one', value: 'ready' }, receipt: { mutationId: 'fixture-1' } },
    }],
  }))
  execFileSync(process.execPath, [
    path.join(fixture, 'node_modules', 'causync', 'bin', 'causync.mjs'),
    'generate', '--manifest', manifestPath, '--out', outputPath,
  ], { cwd: fixture, stdio: 'inherit' })
  const generated = fs.readFileSync(outputPath, 'utf8')
  if (!generated.includes("export type CausyncAction")) throw new Error('CLI did not generate action types')
  execFileSync(process.execPath, [
    path.join(fixture, 'node_modules', 'causync', 'bin', 'causync.mjs'),
    'check', '--manifest', manifestPath, '--generated', outputPath,
  ], { cwd: fixture, stdio: 'inherit' })
  execFileSync(process.execPath, [
    path.join(fixture, 'node_modules', 'causync', 'bin', 'causync.mjs'),
    'conformance', '--adapter', path.join(fixture, 'node_modules', 'causync', 'examples', 'transactional-conformance-adapter.mjs'),
  ], { cwd: fixture, stdio: 'inherit' })
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true })
}
