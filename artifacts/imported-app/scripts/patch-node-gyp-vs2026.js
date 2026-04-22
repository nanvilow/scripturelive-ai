#!/usr/bin/env node
/*
 * patch-node-gyp-vs2026.js
 *
 * @electron/node-gyp v10.x has a hard-coded VS version map:
 *   { '15': 2017, '16': 2019, '17': 2022 }
 * Visual Studio Build Tools 2026 reports as version "18", which is not
 * in that map, so versionYear comes back undefined and node-gyp bails
 * with "could not find a version of Visual Studio 2017 or newer to use",
 * EVEN when GYP_MSVS_VERSION=2022 is set and the VS Command Prompt is
 * already loaded via vcvars64.bat.
 *
 * This script walks node_modules/, finds every find-visualstudio.js
 * shipped by node-gyp / @electron/node-gyp, and adds an "18" -> 2022
 * mapping so VS 2026 builds with the VS2022 toolset format (which is
 * what its own MSBuild emits anyway).
 *
 * Idempotent: safe to run repeatedly. Prints what it patched.
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
  if (src.includes(SENTINEL)) return { file, status: 'already-patched' };

  let changed = false;

  // Pattern A: object literal map { '15': 2017, '16': 2019, '17': 2022 }
  // Match the '17' entry (with various quote/whitespace) and append '18'.
  const objRe = /(['"])17\1\s*:\s*(['"]?)2022\2\s*,?/;
  if (objRe.test(src)) {
    src = src.replace(objRe, (m, q1, q2) => `${q1}17${q1}: ${q2}2022${q2}, ${q1}18${q1}: ${q2}2022${q2}, ${SENTINEL}`);
    changed = true;
  }

  // Pattern B: array of [regex, year] tuples [ /^17\./, 2022 ]
  const arrRe = /\[\s*\/\^17\\\.\s*\/\s*,\s*2022\s*\]/;
  if (arrRe.test(src)) {
    src = src.replace(arrRe, m => `${m}, [/^18\\./, 2022] ${SENTINEL}`);
    changed = true;
  }

  // Pattern C: switch / case statements
  const caseRe = /case\s+(['"])17\1\s*:[^\n]*\n/;
  if (caseRe.test(src)) {
    src = src.replace(caseRe, m => `${m}      case '18': versionYear = 2022; break; ${SENTINEL}\n`);
    changed = true;
  }

  // Pattern D: defensive fallback - intercept getVersionYear / similar.
  // If none of the above matched, inject a guard at the TOP of the file
  // that monkey-patches the resulting object before the rest of the
  // module runs. This is a last-resort safety net.
  if (!changed) {
    // Find the "unsupported version:" log line - the major variable
    // is always logged just before. Insert a normalizer.
    const guardRe = /(\bif\s*\(\s*!\s*versionYear\s*\)\s*\{)/;
    if (guardRe.test(src)) {
      src = src.replace(guardRe, `if (!versionYear && (major === '18' || major === 18)) versionYear = 2022; ${SENTINEL}\n  $1`);
      changed = true;
    }
  }

  if (!changed) {
    return { file, status: 'no-pattern-matched',
             snippet: src.split('\n').slice(0, 40).join('\n') };
  }

  fs.writeFileSync(file, src);
  return { file, status: 'patched' };
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
    console.log(`  PATCHED  ${rel}`);
  } else if (r.status === 'already-patched') {
    already++;
    console.log(`  skip     ${rel} (already patched)`);
  } else {
    failed++;
    console.log(`  WARN     ${rel} (${r.status})`);
    if (r.snippet) {
      console.log(`  --- first 40 lines for diagnosis ---`);
      console.log(r.snippet);
      console.log(`  --- end snippet ---`);
    }
  }
}

console.log(`[patch-node-gyp-vs2026] done. patched=${patched} already=${already} failed=${failed}`);

// Exit 0 even if some files didn't match - the build can still succeed
// if at least the @electron/node-gyp instance was patched.
process.exit(0);
