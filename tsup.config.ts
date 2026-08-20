import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/**/*.ts"],
  format: ["esm"],
  bundle: false,
  dts: false,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  onSuccess: "node scripts/fix-esm-imports.mjs"
})
