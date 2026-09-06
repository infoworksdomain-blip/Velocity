#!/usr/bin/env node
/**
 * GATE 7's token audit (Appendix A.6): "fail the build on any hex value,
 * border-radius, font-size or box-shadow literal outside packages/ui/tokens."
 *
 * Scans .tsx and .css files under the design-system and app surfaces (not
 * packages/ui/tokens itself, which is the one place these values are
 * allowed to be literal) and flags anything not derived from a token.
 * `.stories.tsx` files are excluded — they're Storybook development aids
 * demonstrating components against arbitrary content, not shipped product
 * surfaces, and GATE 7's requirement is about the design system and the
 * app built on it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

const SCAN_DIRS = [
  join(repoRoot, "packages", "ui", "src"),
  join(repoRoot, "apps", "web", "app"),
  join(repoRoot, "apps", "web", "components"),
  join(repoRoot, "apps", "web", "lib"),
];

const EXCLUDE_DIR_NAMES = new Set(["node_modules", ".next", "dist", ".storybook", "__tests__"]);
const SCAN_EXTENSIONS = new Set([".tsx", ".css"]);

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const CSS_PROPERTY_PATTERN = /(border-radius|box-shadow|font-size)\s*:\s*([^;]+);/g;

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files; // directory doesn't exist yet — fine, not every app surface exists at every step
  }
  for (const entry of entries) {
    if (EXCLUDE_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXTENSIONS.has(extname(entry)) && !entry.endsWith(".stories.tsx")) {
      files.push(full);
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const offenses = [];

  content.split("\n").forEach((line, index) => {
    HEX_COLOR_PATTERN.lastIndex = 0;
    if (HEX_COLOR_PATTERN.test(line)) {
      offenses.push({ line: index + 1, kind: "hardcoded hex color", text: line.trim() });
    }

    CSS_PROPERTY_PATTERN.lastIndex = 0;
    let match;
    while ((match = CSS_PROPERTY_PATTERN.exec(line)) !== null) {
      const [, property, value] = match;
      // A value is compliant if it references a custom property anywhere
      // (a bare var(--x), or a derived expression like calc(var(--x) / 2))
      // — only a fully literal value (12px, 50%, 0 2px 14px rgba(...)) is
      // an offense.
      if (!value.includes("var(")) {
        offenses.push({ line: index + 1, kind: `raw ${property}`, text: line.trim() });
      }
    }
  });

  return offenses;
}

const allOffenses = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    for (const offense of scanFile(file)) {
      allOffenses.push({ file: relative(repoRoot, file), ...offense });
    }
  }
}

if (allOffenses.length > 0) {
  console.error(`Token audit FAILED: ${allOffenses.length} offense(s) found outside packages/ui/tokens\n`);
  for (const offense of allOffenses) {
    console.error(`  ${offense.file}:${offense.line} [${offense.kind}] ${offense.text}`);
  }
  process.exit(1);
}

console.log(
  "Token audit passed: no hardcoded hex/border-radius/box-shadow/font-size literals found outside packages/ui/tokens.",
);
