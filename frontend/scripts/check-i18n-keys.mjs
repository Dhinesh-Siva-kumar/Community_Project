#!/usr/bin/env node
/**
 * Verifies every catalog key referenced in the source actually exists.
 *
 * Nothing type-checks translation keys: a typo compiles fine and only shows up
 * as raw `admin.jobs.titel` text on screen. This walks the source for
 * `'some.key' | translate`, `translate.instant('some.key')` and
 * `toast.error('some.key')` and fails if any of them is missing from en.json.
 *
 * Usage: node scripts/check-i18n-keys.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/app', import.meta.url));
const CATALOG = fileURLToPath(new URL('../public/assets/i18n/en.json', import.meta.url));

/** Catalog keys are dotted lower-camel segments; SCREAMING_SNAKE tails are error codes. */
const KEY = String.raw`[a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+`;

const PATTERNS = [
  new RegExp(`'(${KEY})'\\s*\\|\\s*translate`, 'g'),          // 'a.b' | translate
  new RegExp(`\\binstant\\(\\s*'(${KEY})'`, 'g'),             // translate.instant('a.b')
  new RegExp(`\\bt\\(\\s*'(${KEY})'`, 'g'),                   // this.t('a.b')
  new RegExp(`\\b(?:success|error|warning|info)\\(\\s*'(${KEY})'`, 'g'),
  new RegExp(`\\b(?:label|singular|desc|sublabel):\\s*'(${KEY})'`, 'g'),
];

// Keys assembled at runtime from a variable segment — the prefix is checked instead.
const DYNAMIC_PREFIXES = ['errors.code.', 'notification.'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.html'].includes(extname(full))) out.push(full);
  }
  return out;
}

function flatten(node, prefix = '', out = new Set()) {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out.add(prefix);
  }
  return out;
}

const catalog = flatten(JSON.parse(readFileSync(CATALOG, 'utf8')));
const missing = new Map();
let referenced = 0;

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  for (const pattern of PATTERNS) {
    for (const m of src.matchAll(pattern)) {
      const key = m[1];
      referenced++;
      if (catalog.has(key)) continue;
      if (DYNAMIC_PREFIXES.some((p) => key.startsWith(p))) continue;
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(file.slice(SRC.length + 1).replaceAll('\\', '/'));
    }
  }
}

if (missing.size) {
  console.error(`\n✖ ${missing.size} key(s) referenced but missing from en.json:\n`);
  for (const [key, files] of [...missing].sort()) {
    console.error(`  ${key}`);
    for (const f of files) console.error(`      ${f}`);
  }
  process.exit(1);
}

console.log(`✔ all ${referenced} key references resolve (${catalog.size} keys in catalog)`);
