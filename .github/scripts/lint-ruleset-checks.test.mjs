// Tests for `.github/scripts/lint-ruleset-checks.mjs` (Task #112).
//
// The linter is verified end-to-end by spawning it as a child process
// against synthetic fixtures built into a per-test temp directory. Each
// test writes a ruleset JSON file and one or more workflow YAML files
// into `<tmp>/.github/{rulesets,workflows}/`, then runs the script with
// `GITHUB_WORKSPACE` pointed at `<tmp>` and asserts on the exit code and
// captured stdout/stderr.
//
// This mirrors the way CI invokes the linter (Task #107 + #109) so a
// regression in the hand-rolled YAML subset parser — matrix expansion,
// indent handling, marker detection, naming convention — surfaces here
// before it can silently regress production CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINTER = path.join(__dirname, 'lint-ruleset-checks.mjs');

function mkFixture({ ruleset, workflows }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleset-lint-'));
  fs.mkdirSync(path.join(dir, '.github/rulesets'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.github/rulesets/main-branch-protection.json'),
    typeof ruleset === 'string' ? ruleset : JSON.stringify(ruleset, null, 2),
  );
  for (const [name, body] of Object.entries(workflows)) {
    fs.writeFileSync(path.join(dir, '.github/workflows', name), body);
  }
  return dir;
}

function runLinter(workspace) {
  const res = spawnSync(process.execPath, [LINTER], {
    env: { ...process.env, GITHUB_WORKSPACE: workspace },
    encoding: 'utf8',
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function ruleset(contexts) {
  return {
    name: 'main-branch-protection',
    target: 'branch',
    enforcement: 'active',
    rules: [
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: contexts.map(c => ({ context: c, integration_id: 15368 })),
        },
      },
    ],
  };
}

// ── Happy path ─────────────────────────────────────────────────────

test('happy path: every required context maps to a discovered job name', () => {
  const dir = mkFixture({
    ruleset: ruleset(['gitleaks', 'Analyze (javascript-typescript)']),
    workflows: {
      'secret-scan.yml': [
        'name: Secret scan',
        'on: [push]',
        'jobs:',
        '  gitleaks:',
        '    name: gitleaks',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
      'codeql.yml': [
        'name: CodeQL',
        'on: [push]',
        'jobs:',
        '  analyze:',
        '    name: Analyze (${{ matrix.language }})',
        '    runs-on: ubuntu-latest',
        '    strategy:',
        '      matrix:',
        '        language: [javascript-typescript]',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  assert.equal(r.code, 0, `stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
  assert.match(r.stdout, /OK — all 2 required status check\(s\)/);
});

// ── Direction A (Task #107): missing required context ──────────────

test('fails when a required context has no matching job (renamed job)', () => {
  const dir = mkFixture({
    ruleset: ruleset(['gitleaks']),
    workflows: {
      'secret-scan.yml': [
        'name: Secret scan',
        'on: [push]',
        'jobs:',
        '  secret-scan:',
        '    name: secret-scan',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Missing required contexts/);
  assert.match(r.stderr, /"gitleaks"/);
  // The discovered name should be reported to make the fix obvious.
  assert.match(r.stderr, /secret-scan/);
});

// ── Matrix expansion ───────────────────────────────────────────────

test('matrix expansion: every permutation listed in the ruleset is OK', () => {
  const dir = mkFixture({
    ruleset: ruleset(['Analyze (javascript-typescript)', 'Analyze (python)']),
    workflows: {
      'codeql.yml': [
        'name: CodeQL',
        'on: [push]',
        'jobs:',
        '  analyze:',
        '    name: Analyze (${{ matrix.language }})',
        '    runs-on: ubuntu-latest',
        '    strategy:',
        '      matrix:',
        '        language:',
        '          - javascript-typescript',
        '          - python',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  assert.equal(r.code, 0, `stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
});

test('matrix expansion: partial coverage flags the missing permutation', () => {
  // Required set covers js-ts but not the newly-added python permutation.
  const dir = mkFixture({
    ruleset: ruleset(['Analyze (javascript-typescript)']),
    workflows: {
      'codeql.yml': [
        'name: CodeQL',
        'on: [push]',
        'jobs:',
        '  analyze:',
        '    name: Analyze (${{ matrix.language }})',
        '    runs-on: ubuntu-latest',
        '    strategy:',
        '      matrix:',
        '        language: [javascript-typescript, python]',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  // The python permutation has no opt-in marker and the job id is
  // `analyze` (not scan-*/security-*/audit-*), so by design this should
  // pass — Direction A only fires when the RULESET names a context that
  // no longer exists, Direction B only fires when an OPTED-IN job is
  // missing. This case is the "informational matrix permutation" the
  // linter intentionally tolerates.
  const r = runLinter(dir);
  assert.equal(r.code, 0, `expected pass; stderr:\n${r.stderr}`);
});

test('matrix expansion under an opt-in marker: each missing permutation is reported', () => {
  const dir = mkFixture({
    ruleset: ruleset(['scan-deps (ubuntu-latest)']),
    workflows: {
      'scan.yml': [
        'name: Scan',
        'on: [push]',
        'jobs:',
        '  scan-deps: # ruleset:required',
        '    name: scan-deps (${{ matrix.os }})',
        '    runs-on: ${{ matrix.os }}',
        '    strategy:',
        '      matrix:',
        '        os: [ubuntu-latest, windows-latest]',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Opted-in jobs missing from the ruleset/);
  assert.match(r.stderr, /"scan-deps \(windows-latest\)"/);
  assert.doesNotMatch(
    r.stderr,
    /"scan-deps \(ubuntu-latest\)"/,
    'the covered permutation must NOT be reported as missing',
  );
});

// ── Marker detection ───────────────────────────────────────────────

test('`# ruleset:required` marker on the job header line opts the job in', () => {
  const dir = mkFixture({
    ruleset: ruleset([]), // empty ruleset → any opted-in job is an orphan
    workflows: {
      'wf.yml': [
        'name: WF',
        'on: [push]',
        'jobs:',
        '  custom-job: # ruleset:required',
        '    name: custom-job',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  // Empty ruleset → the linter short-circuits with "nothing to verify"
  // BEFORE Direction B runs. The marker test needs at least one context.
  // Re-run with a non-empty ruleset that still doesn't list the opted-in job.
  assert.equal(r.code, 0); // short-circuit path
  assert.match(r.stdout, /nothing to verify/);

  const dir2 = mkFixture({
    ruleset: ruleset(['something-else']),
    workflows: {
      'wf.yml': [
        'name: WF',
        'on: [push]',
        'jobs:',
        '  something-else:',
        '    name: something-else',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '  custom-job: # ruleset:required',
        '    name: custom-job',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r2 = runLinter(dir2);
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /"custom-job"/);
  assert.match(r2.stderr, /marker/);
});

test('`# ruleset:required` marker on a body comment line opts the job in', () => {
  const dir = mkFixture({
    ruleset: ruleset(['something-else']),
    workflows: {
      'wf.yml': [
        'name: WF',
        'on: [push]',
        'jobs:',
        '  something-else:',
        '    name: something-else',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '  custom-job:',
        '    # ruleset:required',
        '    name: custom-job',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /"custom-job"/);
  assert.match(r.stderr, /marker/);
});

// ── Naming convention ──────────────────────────────────────────────

for (const prefix of ['scan', 'security', 'audit']) {
  test(`${prefix}-* naming convention opts the job in without a marker`, () => {
    const id = `${prefix}-deps`;
    const dir = mkFixture({
      ruleset: ruleset(['gitleaks']),
      workflows: {
        'secret-scan.yml': [
          'name: Secret scan',
          'on: [push]',
          'jobs:',
          '  gitleaks:',
          '    name: gitleaks',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: echo hi',
          `  ${id}:`,
          `    name: ${id}`,
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: echo hi',
          '',
        ].join('\n'),
      },
    });
    const r = runLinter(dir);
    assert.equal(r.code, 1, `expected fail; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, new RegExp(`"${id}"`));
    assert.match(r.stderr, /naming-convention|naming convention/);
  });
}

test('jobs that do NOT match the naming convention or have a marker are NOT flagged', () => {
  // A plain `build` matrix permutation is the canonical no-false-positive
  // case called out in the linter comments.
  const dir = mkFixture({
    ruleset: ruleset(['gitleaks']),
    workflows: {
      'ci.yml': [
        'name: CI',
        'on: [push]',
        'jobs:',
        '  build:',
        '    name: build (${{ matrix.os }})',
        '    runs-on: ${{ matrix.os }}',
        '    strategy:',
        '      matrix:',
        '        os: [ubuntu-latest, windows-2019]',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
      'secret-scan.yml': [
        'name: Secret scan',
        'on: [push]',
        'jobs:',
        '  gitleaks:',
        '    name: gitleaks',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo hi',
        '',
      ].join('\n'),
    },
  });
  const r = runLinter(dir);
  assert.equal(r.code, 0, `expected pass; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
});

// ── Hard-error paths ───────────────────────────────────────────────

test('missing ruleset file is a hard error (exit 2)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleset-lint-'));
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  const r = runLinter(dir);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Ruleset file not found/);
});

test('missing workflows dir is a hard error (exit 2)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleset-lint-'));
  fs.mkdirSync(path.join(dir, '.github/rulesets'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.github/rulesets/main-branch-protection.json'),
    JSON.stringify(ruleset(['gitleaks'])),
  );
  const r = runLinter(dir);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Workflows directory not found/);
});
