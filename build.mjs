#!/usr/bin/env node
/**
 * Reads tokens/tokens.json and emits CSS custom properties, SCSS variables,
 * a JS module and a Tailwind theme fragment.
 *
 * No dependencies. Node 18+.
 *
 * Design decision: this is ~150 lines instead of a token pipeline dependency.
 * A build step nobody can read is a build step nobody maintains, and the
 * feature set below is the whole feature set a small team ever uses.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(root, 'tokens/tokens.json');
const OUT = resolve(root, 'dist');

/** Flatten nested token objects into [path, value, comment] triples. */
function flatten(node, path = []) {
  const out = [];
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || key === 'name' || key === 'version') continue;
    if (val && typeof val === 'object' && 'value' in val) {
      out.push({ path: [...path, key], value: String(val.value), comment: val.comment || '' });
    } else if (val && typeof val === 'object') {
      out.push(...flatten(val, [...path, key]));
    }
  }
  return out;
}

const kebab = (parts) => parts.join('-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const camel = (parts) =>
  parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');

/** WCAG relative luminance, used for the contrast report. */
function luminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const srgb = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const tokens = flatten(raw);
const banner = `/* Generated from tokens/tokens.json — do not edit by hand. */\n`;

mkdirSync(OUT, { recursive: true });

// --- CSS custom properties -------------------------------------------------
{
  const groups = new Map();
  for (const t of tokens) {
    const g = t.path[0];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  const body = [...groups]
    .map(([group, list]) => {
      const lines = list.map((t) => {
        const c = t.comment ? ` /* ${t.comment} */` : '';
        return `  --${kebab(t.path)}: ${t.value};${c}`;
      });
      return `  /* ${group} */\n${lines.join('\n')}`;
    })
    .join('\n\n');
  writeFileSync(resolve(OUT, 'tokens.css'), `${banner}:root {\n${body}\n}\n`);
}

// --- SCSS ------------------------------------------------------------------
writeFileSync(
  resolve(OUT, '_tokens.scss'),
  banner + tokens.map((t) => `$${kebab(t.path)}: ${t.value};`).join('\n') + '\n'
);

// --- JS module -------------------------------------------------------------
{
  const obj = {};
  for (const t of tokens) obj[camel(t.path)] = t.value;
  writeFileSync(
    resolve(OUT, 'tokens.js'),
    banner + `export const tokens = ${JSON.stringify(obj, null, 2)};\n\nexport default tokens;\n`
  );
}

// --- Tailwind theme fragment ----------------------------------------------
{
  const pick = (prefix) =>
    Object.fromEntries(
      tokens
        .filter((t) => t.path[0] === prefix)
        .map((t) => [t.path.slice(1).join('-'), t.value])
    );
  const theme = {
    colors: pick('color'),
    spacing: pick('space'),
    borderRadius: pick('radius'),
    boxShadow: pick('shadow'),
    screens: pick('breakpoint')
  };
  writeFileSync(
    resolve(OUT, 'tailwind.tokens.js'),
    banner + `module.exports = ${JSON.stringify(theme, null, 2)};\n`
  );
}

// --- Contrast report -------------------------------------------------------
// Fails the build on a pairing that cannot carry body text. Catching this at
// build time is much cheaper than catching it in an accessibility audit.
{
  const PAIRS = [
    ['color-neutral-900', 'color-neutral-0', 4.5, 'body text on cards'],
    ['color-neutral-900', 'color-neutral-100', 4.5, 'body text on page'],
    ['color-neutral-700', 'color-neutral-0', 4.5, 'secondary text'],
    ['color-neutral-0', 'color-brand-700', 4.5, 'button label'],
    ['color-neutral-0', 'color-brand-900', 4.5, 'text on dark surface'],
    ['color-neutral-900', 'color-accent-100', 4.5, 'text on notice']
  ];
  const byName = Object.fromEntries(tokens.map((t) => [kebab(t.path), t.value]));

  const rows = [];
  let failures = 0;
  for (const [fg, bg, min, label] of PAIRS) {
    const ratio = contrast(byName[fg], byName[bg]);
    if (ratio === null) continue;
    const pass = ratio >= min;
    if (!pass) failures++;
    rows.push(`${pass ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2)}:1  ${label}  (${fg} on ${bg})`);
  }

  writeFileSync(resolve(OUT, 'contrast-report.txt'), rows.join('\n') + '\n');
  console.log(rows.join('\n'));

  if (failures > 0) {
    console.error(`\n${failures} contrast pairing(s) below the required ratio.`);
    process.exit(1);
  }
}

// The demo page consumes the same generated file the app would, so the
// published preview can never drift from the tokens.
copyFileSync(resolve(OUT, 'tokens.css'), resolve(root, 'docs/tokens.css'));

console.log(`\nWrote ${tokens.length} tokens to dist/ and refreshed docs/tokens.css`);
