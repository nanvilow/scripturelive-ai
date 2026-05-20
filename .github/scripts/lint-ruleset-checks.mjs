#!/usr/bin/env node
//
// Task #107 enforcement guard.
//
// Verifies that every `required_status_checks[].context` declared in
// `.github/rulesets/main-branch-protection.json` corresponds to at least
// one job that actually reports under that name in
// `.github/workflows/*.yml`.
//
// Why this exists
// ---------------
// Task #105 promoted `Analyze (javascript-typescript)` (CodeQL) and
// `gitleaks` (secret scan) to required status checks via the branch
// ruleset. Those contexts are matched literally against the job names
// GitHub reports — which come from the workflow's `name:` field (with
// any `${{ matrix.* }}` interpolations resolved).
//
// If someone renames a workflow job (e.g. flips CodeQL's matrix language
// to add Python, renames `gitleaks` → `secret-scan`, drops the matrix
// entirely) WITHOUT also updating the ruleset JSON, every subsequent PR
// silently blocks forever waiting for a status that will never report.
// The failure mode looks like "GitHub is broken" rather than "we renamed
// a job and forgot to update the ruleset."
//
// This script catches that drift in the same PR that introduces it.
//
// What it parses
// --------------
// - `.github/rulesets/main-branch-protection.json` → list of required
//   `context` strings.
// - Every `.github/workflows/*.{yml,yaml}` file → for each job:
//     * the job's `name:` (or its ID if `name:` is absent — same
//       fallback GitHub uses when computing the check run name)
//     * any `strategy.matrix.<key>: [list]` or `strategy.matrix.<key>:\n
//       - item` declarations, used to expand `${{ matrix.<key> }}`
//       placeholders in the job name.
//
// The cartesian product of matrix values is expanded so e.g.
//   name: Analyze (${{ matrix.language }})
//   matrix: { language: [javascript-typescript, python] }
// produces two candidate job names:
//   "Analyze (javascript-typescript)"
//   "Analyze (python)"
//
// If a required context matches none of the produced names, the script
// exits 1 with a message naming the missing context AND pointing at the
// ruleset file so the fix path is obvious.
//
// Why a hand-rolled YAML subset parser?
// -------------------------------------
// This script runs inside the `gitleaks` job in `.github/workflows/
// secret-scan.yml` BEFORE any package install. Pulling in `js-yaml`
// would mean adding an `npm install` / `pnpm install` step purely for
// the linter, which slows every PR by 30-90s. The structure we need
// to extract (top-level `jobs:` → job ID → `name` + `strategy.matrix`)
// is narrow enough that indentation-based scanning is reliable for the
// well-formed workflow files we control in this repo. If a workflow
// ever uses something exotic (anchors, flow-style mappings spanning
// multiple lines, etc.) the linter will simply fail to discover that
// job's name — which manifests as a clear "missing context" failure
// rather than a silent pass, so the failure mode stays safe.
//
// Exit codes
// ----------
//   0 — every required context maps to at least one discovered job name
//   1 — at least one required context is unmatched (drift detected)
//   2 — the ruleset file or workflows directory is missing (treated as
//        a hard error so a typo doesn't silently pass the check)

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.env.GITHUB_WORKSPACE || process.cwd();
const RULESET_PATH = path.join(REPO_ROOT, '.github/rulesets/main-branch-protection.json');
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github/workflows');

function hardFail(msg) {
  console.error(`[ruleset-lint] ${msg}`);
  process.exit(2);
}

if (!fs.existsSync(RULESET_PATH)) hardFail(`Ruleset file not found: ${RULESET_PATH}`);
if (!fs.existsSync(WORKFLOWS_DIR)) hardFail(`Workflows directory not found: ${WORKFLOWS_DIR}`);

// ── Collect required contexts from the ruleset ─────────────────────
const ruleset = JSON.parse(fs.readFileSync(RULESET_PATH, 'utf8'));
const required = [];
for (const rule of ruleset.rules || []) {
  if (rule.type === 'required_status_checks') {
    for (const ctx of rule.parameters?.required_status_checks || []) {
      if (ctx && typeof ctx.context === 'string') required.push(ctx.context);
    }
  }
}

if (required.length === 0) {
  console.log('[ruleset-lint] No required status checks declared in the ruleset; nothing to verify.');
  process.exit(0);
}

// ── Workflow parsing helpers ───────────────────────────────────────

function stripQuotes(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseWorkflowJobs(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  // Find the top-level `jobs:` key (column 0).
  let jobsLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^jobs:\s*(#.*)?$/.test(lines[i])) { jobsLineIdx = i; break; }
  }
  if (jobsLineIdx === -1) return [];

  // Take every following line until the next column-0 key.
  const jobsLines = [];
  for (let i = jobsLineIdx + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\S/.test(ln) && !/^\s*#/.test(ln)) break;
    jobsLines.push(ln);
  }

  // Job IDs sit at the first non-zero indent under `jobs:`.
  let jobIndent = -1;
  for (const ln of jobsLines) {
    const m = ln.match(/^( +)[A-Za-z_][\w-]*:\s*(#.*)?$/);
    if (m) { jobIndent = m[1].length; break; }
  }
  if (jobIndent === -1) return [];

  // Split into per-job blocks.
  const headerRe = new RegExp(`^ {${jobIndent}}([A-Za-z_][\\w-]*):\\s*(#.*)?$`);
  const jobBlocks = [];
  let current = null;
  for (const ln of jobsLines) {
    const m = ln.match(headerRe);
    if (m) {
      if (current) jobBlocks.push(current);
      current = { id: m[1], body: [] };
    } else if (current) {
      current.body.push(ln);
    }
  }
  if (current) jobBlocks.push(current);

  const results = [];
  for (const job of jobBlocks) {
    const info = parseJobBody(job.body, jobIndent);
    const names = expandJobName(info.name ?? job.id, info.matrix);
    results.push(...names);
  }
  return results;
}

function parseJobBody(bodyLines, jobIndent) {
  // Job-level keys live at the first indent strictly greater than the
  // job's own indent — typically jobIndent + 2 for the standard 2-space
  // step, but we accept any consistent inner indent.
  let childIndent = -1;
  for (const ln of bodyLines) {
    const m = ln.match(/^(\s+)\S/);
    if (m && m[1].length > jobIndent) { childIndent = m[1].length; break; }
  }

  let name;
  const matrix = {}; // key -> array of string values

  // Find the FIRST `name:` at exactly the job's direct-child indent.
  // (Step-level `name:` keys are nested deeper under `steps:` so they
  // sit at a strictly greater indent and are ignored.)
  if (childIndent !== -1) {
    const nameRe = new RegExp(`^ {${childIndent}}name:\\s*(.+?)\\s*$`);
    for (const ln of bodyLines) {
      const m = ln.match(nameRe);
      if (m) { name = stripQuotes(m[1]); break; }
    }
  }

  // Find `strategy:` (job child) → `matrix:` (strategy child) and
  // harvest list-valued matrix keys.
  let inStrategy = false;
  let strategyIndent = -1;
  let inMatrix = false;
  let matrixIndent = -1;
  let currentMatrixKey = null;
  let currentMatrixKeyIndent = -1;

  for (const ln of bodyLines) {
    if (/^\s*$/.test(ln) || /^\s*#/.test(ln)) continue;
    const indent = ln.match(/^(\s*)/)[1].length;

    if (inMatrix) {
      if (indent <= matrixIndent) {
        inMatrix = false;
        inStrategy = false;
        currentMatrixKey = null;
      } else {
        // Inline list: `  key: [a, b, c]`
        const inline = ln.match(/^(\s+)([A-Za-z_][\w-]*):\s*\[(.*)\]\s*(#.*)?$/);
        if (inline && inline[1].length === matrixIndent + 2) {
          const vals = inline[3].split(',')
            .map(s => stripQuotes(s.trim()))
            .filter(Boolean);
          matrix[inline[2]] = vals;
          currentMatrixKey = null;
          continue;
        }
        // Multi-line key header: `  key:`
        const header = ln.match(/^(\s+)([A-Za-z_][\w-]*):\s*(#.*)?$/);
        if (header && header[1].length === matrixIndent + 2) {
          currentMatrixKey = header[2];
          currentMatrixKeyIndent = header[1].length;
          if (!matrix[currentMatrixKey]) matrix[currentMatrixKey] = [];
          continue;
        }
        // List item under current key: `    - value`
        const item = ln.match(/^(\s+)-\s*(.+?)\s*$/);
        if (item && currentMatrixKey && item[1].length > currentMatrixKeyIndent) {
          matrix[currentMatrixKey].push(stripQuotes(item[2]));
          continue;
        }
        continue;
      }
    }

    if (inStrategy && !inMatrix) {
      if (indent <= strategyIndent) {
        inStrategy = false;
      } else {
        const matrixHeader = ln.match(/^(\s+)matrix:\s*(#.*)?$/);
        if (matrixHeader && matrixHeader[1].length === strategyIndent + 2) {
          inMatrix = true;
          matrixIndent = matrixHeader[1].length;
          continue;
        }
      }
    }

    const stratHeader = ln.match(/^(\s+)strategy:\s*(#.*)?$/);
    if (stratHeader && stratHeader[1].length === childIndent) {
      inStrategy = true;
      strategyIndent = stratHeader[1].length;
    }
  }

  return { name, matrix };
}

function expandJobName(template, matrix) {
  const re = /\$\{\{\s*matrix\.([A-Za-z_][\w-]*)\s*\}\}/g;
  const keys = [];
  let m;
  while ((m = re.exec(template)) !== null) {
    if (!keys.includes(m[1])) keys.push(m[1]);
  }
  if (keys.length === 0) return [template];

  // Unknown matrix keys produce an `<unknown:KEY>` sentinel so the job
  // name still shows up in the "discovered" diagnostic list, making the
  // mismatch easy to spot in the failure output.
  const valueLists = keys.map(k =>
    (matrix[k] && matrix[k].length) ? matrix[k] : [`<unknown:${k}>`]
  );

  let products = [[]];
  for (const vals of valueLists) {
    const next = [];
    for (const combo of products) {
      for (const v of vals) next.push([...combo, v]);
    }
    products = next;
  }

  const out = [];
  for (const combo of products) {
    let s = template;
    keys.forEach((k, i) => {
      const placeholder = new RegExp(`\\$\\{\\{\\s*matrix\\.${k}\\s*\\}\\}`, 'g');
      s = s.replace(placeholder, combo[i]);
    });
    out.push(s);
  }
  return out;
}

// ── Discover job names across every workflow file ──────────────────
const workflowFiles = fs.readdirSync(WORKFLOWS_DIR)
  .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map(f => path.join(WORKFLOWS_DIR, f))
  .sort();

const allJobNames = new Set();
for (const wf of workflowFiles) {
  for (const n of parseWorkflowJobs(wf)) allJobNames.add(n);
}

const missing = required.filter(ctx => !allJobNames.has(ctx));

if (missing.length === 0) {
  console.log(`[ruleset-lint] OK — all ${required.length} required status check(s) map to a workflow job:`);
  for (const ctx of required) console.log(`    ✓ ${ctx}`);
  process.exit(0);
}

console.error('');
console.error('[ruleset-lint] FAIL — required status check(s) in the branch ruleset');
console.error('               do not correspond to any job name in .github/workflows/.');
console.error('');
console.error('               Ruleset file: .github/rulesets/main-branch-protection.json');
console.error('');
console.error('  Missing required contexts:');
for (const ctx of missing) console.error(`    ✗ "${ctx}"`);
console.error('');
console.error('  Discovered workflow job names (after matrix expansion):');
for (const n of [...allJobNames].sort()) console.error(`      • ${n}`);
console.error('');
console.error('  Without a fix, every subsequent PR will silently block forever');
console.error('  waiting for a status check that no longer reports under that name.');
console.error('');
console.error('  Fix one of:');
console.error('    1. Restore the original `name:` field in the workflow YAML, OR');
console.error('    2. Update the "context" entry in');
console.error('       .github/rulesets/main-branch-protection.json to match the new');
console.error('       job name (and re-apply the ruleset on GitHub via the');
console.error('       Settings → Rules → Rulesets UI or `gh api` import).');
console.error('');

process.exit(1);
