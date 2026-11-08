// tsup compila los archivos por separado (bundle: false).
// Este script adapta las importaciones para que funcionen con Node.js ESM:
// - Añade la extensión .js a las rutas relativas.
// - Convierte los alias @/ y #types/ en rutas relativas dentro de dist/.
// - Convierte las extensiones .ts a .js.
// - Añade el atributo necesario a las importaciones JSON.

import fs from 'node:fs'
import path from 'node:path'

const distDir = path.join(import.meta.dirname, '..', 'dist')

const specifierPattern = /((?:import|export)(?:[^'"]*?\bfrom)?\s*['"])([^'"]+)(['"])/g

function resolveSpecifier(specifier, currentFile) {
  let target

  if (specifier.startsWith('@/')) {
    target = path.join(distDir, specifier.slice(2))
  } else if (specifier.startsWith('#types/')) {
    target = path.join(distDir, 'types', specifier.slice('#types/'.length))
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    target = path.resolve(path.dirname(currentFile), specifier)
  } else {
    // Paquetes externos y módulos nativos de Node.js.
    return specifier
  }

  // Los archivos TypeScript compilados tienen extensión .js.
  target = target.replace(/\.ts$/, '.js')

  // Node.js ESM exige extensión en las rutas relativas.
  if (!path.extname(target)) {
    target += '.js'
  }

  let relativePath = path.relative(path.dirname(currentFile), target)
  relativePath = relativePath.split(path.sep).join('/')

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`
  }

  return relativePath
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

    const fixed = content.replace(
      specifierPattern,
      (match, prefix, specifier, suffix) => {
        const resolved = resolveSpecifier(specifier, fullPath)

        const attribute = resolved.endsWith('.json')
          ? ' with { type: "json" }'
          : ''

        return `${prefix}${resolved}${suffix}${attribute}`
      }
    )

    if (fixed !== content) {
      fs.writeFileSync(fullPath, fixed)
    }
  }
}

walk(distDir)