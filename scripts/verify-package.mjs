import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'causync-package-'))
const publicEntrypoints = ['index', 'react', 'testing', 'generator', 'swr', 'tanstack-query']

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  execFileSync('npm', ['run', 'build'], { cwd: packageRoot, stdio: 'inherit' })
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', temporaryRoot], { cwd: packageRoot, encoding: 'utf8' }))
  const pack = packed[0]
  const tarball = path.join(temporaryRoot, pack.filename)
  const packageFiles = new Set(pack.files.map(file => file.path))
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  invariant(pack.name === 'causync', `Packed unexpected package: ${pack.name}`)
  invariant(pack.version === packageMetadata.version, `Packed unexpected version: ${pack.version}`)
  for (const entrypoint of publicEntrypoints) {
    invariant(packageFiles.has(`dist/${entrypoint}.js`), `Packed ${entrypoint} JavaScript is missing`)
    invariant(packageFiles.has(`dist/${entrypoint}.d.ts`), `Packed ${entrypoint} declaration is missing`)
  }
  for (const required of ['bin/causync.mjs', 'README.md', 'CHANGELOG.md', 'COMPATIBILITY.md', 'SECURITY.md', 'LICENSE']) {
    invariant(packageFiles.has(required), `Packed required file is missing: ${required}`)
  }
  for (const file of packageFiles) {
    invariant(!file.startsWith('examples/sefira-demo/'), `Sefira demo leaked into package: ${file}`)
    invariant(!file.startsWith('src/'), `TypeScript source leaked into package: ${file}`)
    invariant(!file.startsWith('tests/'), `Tests leaked into package: ${file}`)
    invariant(!file.startsWith('scripts/'), `Repository scripts leaked into package: ${file}`)
  }
  const fixture = path.join(temporaryRoot, 'fixture')
  fs.mkdirSync(fixture)
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'causync-install-fixture', private: true, type: 'module' }))
  fs.writeFileSync(path.join(fixture, 'verify.mjs'), `
    import fs from 'node:fs'
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
    const installed = JSON.parse(fs.readFileSync(new URL('./node_modules/causync/package.json', import.meta.url), 'utf8'))
    if (installed.version !== '${packageMetadata.version}') throw new Error('Installed package version is incorrect')
    if (installed.dependencies) throw new Error('Core package unexpectedly has runtime dependencies')
    if (fs.existsSync(new URL('./node_modules/react', import.meta.url))) throw new Error('Optional React peer was installed with the core package')
    for (const forbidden of ['next', 'sefira', '@tanstack/react-query', 'swr']) {
      if (fs.existsSync(new URL('./node_modules/' + forbidden, import.meta.url))) throw new Error('Unexpected host dependency installed: ' + forbidden)
    }
    let internalImportBlocked = false
    try {
      await import('causync/dist/index.js')
    } catch (error) {
      internalImportBlocked = error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    }
    if (!internalImportBlocked) throw new Error('Internal dist import was not blocked by package exports')
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
  execFileSync('npm', [
    'install', 'react@19.3.0', '@types/react@19.3.0',
    '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund',
  ], { cwd: fixture, stdio: 'inherit' })
  fs.writeFileSync(path.join(fixture, 'verify-react.mjs'), `
    import { CausyncProvider, toCausyncPresentationState } from 'causync/react'
    if (typeof CausyncProvider !== 'function') throw new Error('React provider export is unavailable')
    if (toCausyncPresentationState('uncertain') !== 'needs-attention') throw new Error('React adapter behavior is unavailable')
    console.log('Packed Causync React fixture PASS')
  `)
  fs.writeFileSync(path.join(fixture, 'verify-types.ts'), `
    import { createMutationJournal, type Contract } from 'causync'
    import { CausyncProvider } from 'causync/react'
    import { generateContractModule } from 'causync/generator'
    import { deferred, type ConformanceReport } from 'causync/testing'
    import { createCausyncSWRAdapter } from 'causync/swr'
    import { createCausyncQueryAdapter } from 'causync/tanstack-query'
    const journal = createMutationJournal<unknown, unknown>()
    const exportsAreTyped: readonly unknown[] = [
      journal, CausyncProvider, generateContractModule, deferred,
      createCausyncSWRAdapter, createCausyncQueryAdapter,
    ]
    type PublicTypes = Contract<unknown, unknown> | ConformanceReport
    void exportsAreTyped
    void (undefined as PublicTypes | undefined)
  `)
  execFileSync(process.execPath, ['verify-react.mjs'], { cwd: fixture, stdio: 'inherit' })
  execFileSync(process.execPath, [
    path.join(packageRoot, 'node_modules', 'typescript', 'lib', 'tsc.js'),
    '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--skipLibCheck', 'verify-types.ts',
  ], { cwd: fixture, stdio: 'inherit' })
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
