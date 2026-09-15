import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
for (const file of fs.readdirSync(root)) {
  if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue
  const location = path.join(root, file)
  const source = fs.readFileSync(location, 'utf8')
  const finalized = source.replace(
    /(from\s+['"]|import\s*\(\s*['"])(\.\.?\/[^'"]+?)(['"]\s*\)?)/g,
    (match, prefix, specifier, suffix) =>
      /\.[a-z0-9]+$/i.test(specifier) ? match : `${prefix}${specifier}.js${suffix}`,
  )
  fs.writeFileSync(location, finalized)
}
