#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { generateContractModule } from '../dist/generator.js'
import { assertHostConformance, runDelayedConfirmationConformance, runHostConformance } from '../dist/testing.js'

const [, , command, ...args] = process.argv
function argument(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function generate() {
  const manifestPath = argument('--manifest')
  const outputPath = argument('--out')
  if (!manifestPath || !outputPath) throw new Error('Usage: causync generate --manifest <manifest.json> --out <contracts.ts>')
  const destination = path.resolve(outputPath)
  const generated = generateContractModule(JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, generated)
  console.log(`Generated ${destination}`)
}

function check() {
  const manifestPath = argument('--manifest')
  const outputPath = argument('--generated')
  if (!manifestPath || !outputPath) throw new Error('Usage: causync check --manifest <manifest.json> --generated <contracts.ts>')
  const expected = generateContractModule(JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')))
  const actual = fs.readFileSync(path.resolve(outputPath), 'utf8')
  if (actual !== expected) throw new Error(`Generated Causync catalog is stale: ${outputPath}`)
  console.log(`Causync catalog matches ${manifestPath}`)
}

async function conformance() {
  const adapterPath = argument('--adapter')
  if (!adapterPath) throw new Error('Usage: causync conformance --adapter <adapter.mjs>')
  const module = await import(pathToFileURL(path.resolve(adapterPath)).href)
  if (!module.causyncConformance) throw new Error('Adapter must export causyncConformance')
  const reports = [await runHostConformance(module.causyncConformance)]
  if (module.causyncDelayedConfirmation) {
    reports.push(await runDelayedConfirmationConformance(module.causyncDelayedConfirmation))
  }
  for (const report of reports) {
    for (const item of report.cases) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.error ? `: ${item.error}` : ''}`)
    assertHostConformance(report)
  }
}

try {
  if (command === 'generate') generate()
  else if (command === 'check') check()
  else if (command === 'conformance') await conformance()
  else throw new Error('Usage: causync <generate|check|conformance> [...options]')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
