#!/usr/bin/env node
/**
 * Asserts every translation catalog exposes exactly the same set of keys.
 *
 * Nothing type-checks catalog keys, so a key added to en.json but forgotten in
 * ta.json silently renders English (or the raw key) at runtime. With ~2,000
 * keys per language that drift is invisible in review — this makes it a build
 * failure instead.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const I18N_DIR = fileURLToPath(new URL('../public/assets/i18n', import.meta.url));
const REFERENCE_LANG = 'en';

/**
 * Fields that carry presentation, not language — Bootstrap icon classes,
 * palette names, numeric values. They are duplicated into every catalog
 * because they sit inside arrays of objects (the landing page's card decks),
 * so they must stay byte-identical across languages: a translator editing
 * ta.json must not be able to change an icon or break a colour.
 */
// `value` is deliberately absent: it is an opaque code in some arrays
// (aboutStats, contactSubjectOptions) but display text in others
// (footerMetrics), so it cannot be classified by name alone.
const PRESENTATIONAL_FIELDS = new Set([
  'icon',
  'color',
  'num',
  'initial',
  'featured',
  'rating',
  'suffix',
]);

/** Flattens `{ a: { b: 'x' } }` to `['a.b']`, indexing into arrays. */
function flatten(node, prefix = '', out = []) {
  if (Array.isArray(node)) {
    node.forEach((value, i) => flatten(value, `${prefix}[${i}]`, out));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.push(prefix);
  }
  return out;
}

/** Collects `dotted.path -> value` for presentational leaves only. */
function presentationalValues(node, prefix = '', out = new Map()) {
  if (Array.isArray(node)) {
    node.forEach((value, i) => presentationalValues(value, `${prefix}[${i}]`, out));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (PRESENTATIONAL_FIELDS.has(key) && (value === null || typeof value !== 'object')) {
        out.set(path, value);
      } else {
        presentationalValues(value, path, out);
      }
    }
  }
  return out;
}

const files = readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error(`No catalogs found in ${I18N_DIR}`);
  process.exit(1);
}

const catalogs = new Map();
const presentational = new Map();
for (const file of files) {
  const lang = basename(file, '.json');
  try {
    const parsed = JSON.parse(readFileSync(join(I18N_DIR, file), 'utf8'));
    catalogs.set(lang, new Set(flatten(parsed)));
    presentational.set(lang, presentationalValues(parsed));
  } catch (err) {
    console.error(`✖ ${file} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

const reference = catalogs.get(REFERENCE_LANG);
if (!reference) {
  console.error(`✖ Missing reference catalog ${REFERENCE_LANG}.json`);
  process.exit(1);
}

let failed = false;
for (const [lang, keys] of catalogs) {
  if (lang === REFERENCE_LANG) continue;

  const missing = [...reference].filter((k) => !keys.has(k)).sort();
  const extra = [...keys].filter((k) => !reference.has(k)).sort();

  if (missing.length || extra.length) {
    failed = true;
    console.error(`\n✖ ${lang}.json does not match ${REFERENCE_LANG}.json`);
    if (missing.length) {
      console.error(`  Missing ${missing.length} key(s):`);
      for (const k of missing) console.error(`    - ${k}`);
    }
    if (extra.length) {
      console.error(`  ${extra.length} key(s) not in ${REFERENCE_LANG}.json:`);
      for (const k of extra) console.error(`    + ${k}`);
    }
  }

  const refValues = presentational.get(REFERENCE_LANG);
  const drifted = [...refValues].filter(
    ([path, value]) => presentational.get(lang).get(path) !== value,
  );
  if (drifted.length) {
    failed = true;
    console.error(`\n✖ ${lang}.json changes presentational values (icons/colours are not text):`);
    for (const [path, value] of drifted) {
      console.error(`    ${path}: expected ${JSON.stringify(value)}, got ${JSON.stringify(presentational.get(lang).get(path))}`);
    }
  }
}

if (failed) process.exit(1);

console.log(
  `✔ ${catalogs.size} catalogs in sync (${reference.size} keys): ${[...catalogs.keys()].join(', ')}`,
);
