// tsup solo copia .ts/.js; los assets referenciados por import (JSON de modelos ML)
// deben copiarse a mano a dist para que Node ESM los resuelva igual que en src/.
import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.join(import.meta.dirname, '..', 'src')
const distDir = path.join(import.meta.dirname, '..', 'dist')

// Carpetas de src que contienen assets a replicar en dist, misma ruta relativa
const assetDirs = ['src/ml/model']

for (const rel of assetDirs) {
  const from = path.join(import.meta.dirname, '..', rel)
  const to = path.join(distDir, path.relative(srcDir, from))
  if (!fs.existsSync(from)) continue
  fs.mkdirSync(to, { recursive: true })
  for (const file of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, file), path.join(to, file))
  }
}
