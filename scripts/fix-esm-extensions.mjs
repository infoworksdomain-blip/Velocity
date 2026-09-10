#!/usr/bin/env node
// Postbuild fixer for a real production bug found deploying apps/worker to
// Railway: this repo's tsconfig.base.json sets `moduleResolution: "Bundler"`
// deliberately, since every consumer up to this point (Next.js for apps/web,
// Vite/vitest for every package's own tests) resolves extensionless relative
// imports itself. tsc under "Bundler" resolution emits those imports
// unchanged (e.g. `export * from "./domain"`), which is exactly what a
// bundler wants — but apps/worker's production runtime is plain
// `node dist/index.js`, no bundler in front of it, and Node's native ESM
// loader requires an explicit file extension on every relative specifier.
// Rewriting every source `import`/`export` across every workspace package to
// carry manual `.js` extensions (the "NodeNext" convention) would be a large,
// invasive, blast-radius-heavy change this late for packages that don't need
// it (apps/web, packages/ui never run outside a bundler). This script instead
// mechanically rewrites already-compiled `dist/*.js` output for just the
// packages apps/worker actually loads at runtime, appending `.js` (or
// `/index.js` for a directory import) to any relative specifier missing one.
// Run as a postbuild step: `tsc -p tsconfig.json && node ../../scripts/fix-esm-extensions.mjs dist`.

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const distDir = process.argv[2];
if (!distDir) {
  console.error("usage: fix-esm-extensions.mjs <dist-dir>");
  process.exit(1);
}

const SPECIFIER_RE = /((?:from|import)\s*\(?\s*["'])(\.\.?\/[^"']+)(["'])/g;

function resolveSpecifier(fileDir, specifier) {
  const abs = resolve(fileDir, specifier);
  if (existsSync(abs + ".js")) return specifier + ".js";
  if (existsSync(join(abs, "index.js"))) return specifier + "/index.js";
  // Already has an extension, or points at something unexpected — leave as-is.
  return specifier;
}

function fixFile(filePath) {
  const src = readFileSync(filePath, "utf8");
  const fileDir = dirname(filePath);
  let changed = false;
  const out = src.replace(SPECIFIER_RE, (match, prefix, specifier, suffix) => {
    if (/\.[a-zA-Z0-9]+$/.test(specifier)) return match; // already has an extension
    const fixed = resolveSpecifier(fileDir, specifier);
    if (fixed !== specifier) changed = true;
    return prefix + fixed + suffix;
  });
  if (changed) writeFileSync(filePath, out);
  return changed;
}

function walk(dir) {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) count += walk(full);
    else if (entry.endsWith(".js")) count += fixFile(full) ? 1 : 0;
  }
  return count;
}

const fixed = walk(distDir);
console.log(`[fix-esm-extensions] rewrote ${fixed} file(s) under ${distDir}`);
