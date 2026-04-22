#!/usr/bin/env node
/*
 * patch-node-gyp-vs2026.js
 *
 * @electron/node-gyp v10.x has a hard-coded version map in
 * lib/find-visualstudio.js (function getVersionInfo) that only knows
 * versionMajor 15/16/17. VS Build Tools 2026 reports versionMajor 18
 * and is rejected as "unsupported version: 18", which makes
 * versionYear undefined and aborts the whole compile.
 *
 * This script finds every find-visualstudio.js shipped under
 * node_modules/ and inserts an additional `if (ret.versionMajor === 18)
 * { ret.versionYear = 2022; return ret }` clause before the unsupported-
 * version log line. VS 2026's MSBuild is backward-compatible with the
 * VS 2022 toolset, so 18 -> 2022 is the correct mapping.
 *
 * Idempotent: re-running is a no-op once patched.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd(), 'node_modules');
const SENTINEL = '/* SL-VS2026-PATCH */';

function findFiles(start) {
  const out = [];
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name === 'find-visualstudio.js') out.push(full);
    }
  }
  return out;
}

function patch(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(SENTINEL)) {
    return { file, status: 'already-patched' };
  }

  // Pattern: ES6 class style (@electron/node-gyp v10.x)
  //   if (ret.versionMajor === 17) {
  //     ret.versionYear = 2022
  //     return ret
  //   }
  //   this.log.silly('- unsupported version:', ret.versionMajor)
  const re1 = /(if\s*\(\s*ret\.versionMajor\s*===\s*17\s*\)\s*\{\s*\n\s*ret\.versionYear\s*=\s*2022\s*\n\s*return\s+ret\s*\n\s*\})/;
  if (re1.test(src)) {
    src = src.replace(re1, (m) =>
      `${m}\n    ${SENTINEL}\n    if (ret.versionMajor === 18) {\n      ret.versionYear = 2022\n      return ret\n    }`);
    fs.writeFileSync(file, src);
    return { file, status: 'patched', pattern: 'es6-class' };
  }

  // Pattern: prototype style (legacy node-gyp v9.x)
  //   } else if (parseFloat(parts[0]) === 17) {
  //     ret.versionYear = 2022
  //   }
  // OR object map style.
  const re2 = /(parseFloat\([^)]+\)\s*===\s*17\s*\)\s*\{\s*\n\s*ret\.versionYear\s*=\s*2022\s*\n\s*\})/;
  if (re2.test(src)) {
    src = src.replace(re2, (m) =>
      `${m} else if (parseFloat(parts[0]) === 18) {\n      ret.versionYear = 2022 ${SENTINEL}\n    }`);
    fs.writeFileSync(file, src);
    return { file, status: 'patched', pattern: 'prototype' };
  }

  // Pattern: object literal map { 15: 2017, 16: 2019, 17: 2022 }
  const re3 = /(['"]?17['"]?\s*:\s*['"]?2022['"]?)/;
  if (re3.test(src)) {
    src = src.replace(re3, `$1, 18: 2022 ${SENTINEL}`);
    fs.writeFileSync(file, src);
    return { file, status: 'patched', pattern: 'object-map' };
  }

  // Diagnostics: dump the area around versionMajor / versionYear / 2022
  const lines = src.split('\n');
  const interesting = [];
  for (let i = 0; i < lines.length; i++) {
    if (/versionMajor|versionYear|2022|2019|2017/.test(lines[i])) {
      interesting.push(`  L${i + 1}: ${lines[i]}`);
    }
  }
  return {
    file,
    status: 'no-pattern-matched',
    snippet: interesting.slice(0, 40).join('\n'),
  };
}

const files = findFiles(ROOT);
console.log(`[patch-node-gyp-vs2026] scanning ${ROOT}`);
console.log(`[patch-node-gyp-vs2026] found ${files.length} find-visualstudio.js file(s)`);

let patched = 0, already = 0, failed = 0;
for (const f of files) {
  const r = patch(f);
  const rel = path.relative(process.cwd(), f);
  if (r.status === 'patched') {
    patched++;
    console.log(`  PATCHED  (${r.pattern})  ${rel}`);
  } else if (r.status === 'already-patched') {
    already++;
    console.log(`  skip     ${rel} (already patched)`);
  } else {
    failed++;
    console.log(`  WARN     ${rel} (${r.status})`);
    if (r.snippet) {
      console.log(`  --- versionYear-related lines for diagnosis ---`);
      console.log(r.snippet);
      console.log(`  --- end snippet ---`);
    }
  }
}

console.log(`[patch-node-gyp-vs2026] done. patched=${patched} already=${already} failed=${failed}`);
process.exit(0);
