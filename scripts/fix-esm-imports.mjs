// tsup builds each file separately (bundle: false) so the folder-based
// command/event loaders keep the same directory layout as src/. esbuild
// doesn't rewrite relative import specifiers in that mode, but Node's ESM
// resolver requires an explicit extension, so this appends ".js" to any
// relative import/export specifier that's missing one.
import fs from 'node:fs'
import path from 'node:path'

const distDir = path.join(import.meta.dirname, '..', 'dist')

const specifierPattern = /((?:import|export)(?:[^'"]*?from)?\s*['"])(\.\.?\/[^'"]+)(['"])/g

function addExtension(specifier) {
  return /\.[a-zA-Z0-9]+$/.test(specifier) ? specifier : `${specifier}.js`
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!entry.name.endsWith('.js')) continue

    const content = fs.readFileSync(fullPath, 'utf8')
    const fixed = content.replace(specifierPattern, (match, prefix, specifier, suffix) => (
      `${prefix}${addExtension(specifier)}${suffix}`
    ))

    if (fixed !== content) fs.writeFileSync(fullPath, fixed)
  }
}

walk(distDir)
