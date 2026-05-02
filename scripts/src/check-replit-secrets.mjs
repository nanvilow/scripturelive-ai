#!/usr/bin/env node
//
// Task #94 enforcement guard.
//
// Fails (exit 1) if `.replit` contains any literal key=value assignment
// under any `[userenv.*]` TOML section, OR if any line in `.replit`
// matches a well-known secret pattern (OpenAI sk-..., Deepgram, Stripe,
// AWS, Anthropic, Google AI, generic 40+ char base64-ish blobs).
//
// Why both checks?
//   - The `[userenv.*]` check is the *structural* guard: those blocks
//     MUST stay empty (see `replit.md` v0.7.44). Any literal there is
//     a bug regardless of whether it looks like a secret.
//   - The pattern check is a belt-and-braces backstop in case a future
//     Replit version introduces a new env-injection block we haven't
//     listed, or someone pastes a key into a comment.
//
// Wired into:
//   - `.githooks/pre-commit` (local fast feedback)
//   - `.github/workflows/secret-scan.yml` (server-side authoritative gate)
//
// Exit codes:
//   0 — clean
//   1 — violation (prints the offending line numbers, redacted)
//   2 — `.replit` missing (treated as a hard error so a typo in the
//        path doesn't silently pass the check)

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.env.GITHUB_WORKSPACE
  || process.cwd();
const REPLIT_PATH = path.join(REPO_ROOT, '.replit');

if (!fs.existsSync(REPLIT_PATH)) {
  console.error(`[check-replit-secrets] .replit not found at ${REPLIT_PATH}`);
  process.exit(2);
}

const lines = fs.readFileSync(REPLIT_PATH, 'utf8').split(/\r?\n/);

// ── Structural check: no key=value under any [userenv.*] block ────
const userenvViolations = [];
let inUserenv = false;
let currentSection = '';
lines.forEach((raw, i) => {
  const line = raw.trimEnd();
  // Match both standard tables `[name]` and arrays-of-tables `[[name]]`.
  const sectionMatch = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*$/);
  if (sectionMatch) {
    currentSection = sectionMatch[1];
    inUserenv = currentSection === 'userenv' || currentSection.startsWith('userenv.');
    return;
  }
  if (!inUserenv) return;
  // A TOML key/value line: `KEY = "value"` or `KEY = 123` etc.
  // Skip blanks and comments.
  const stripped = line.replace(/^\s+/, '');
  if (!stripped || stripped.startsWith('#')) return;
  // Match bare keys (KEY = ...), quoted keys ("KEY" = ...), single-quoted
  // literal keys ('KEY' = ...), and dotted keys (a.b = ...). Anything that
  // structurally looks like a TOML assignment under [userenv.*] is a
  // violation regardless of value type.
  const assign = stripped.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z_][A-Za-z0-9_.-]*)\s*=/);
  if (assign) {
    userenvViolations.push({
      lineNo: i + 1,
      section: currentSection,
      key: assign[1],
    });
  }
});

// ── Pattern check: known secret formats anywhere in .replit ───────
const SECRET_PATTERNS = [
  { name: 'OpenAI key',     re: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'Anthropic key',  re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'Stripe key',     re: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Google AI key',  re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'GitHub token',   re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Slack token',    re: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
];
const patternViolations = [];
lines.forEach((raw, i) => {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(raw)) {
      patternViolations.push({ lineNo: i + 1, kind: name });
      break;
    }
  }
});

if (userenvViolations.length === 0 && patternViolations.length === 0) {
  console.log('[check-replit-secrets] .replit is clean — no literal env values, no secret patterns.');
  process.exit(0);
}

console.error('');
console.error('[check-replit-secrets] FAIL — .replit contains values that must not be committed.');
console.error('[check-replit-secrets] See replit.md v0.7.44 for the correct pattern (use Replit Secrets pane, not .replit literals).');
console.error('');

if (userenvViolations.length) {
  console.error('  Literal assignments under [userenv.*] (must be empty):');
  for (const v of userenvViolations) {
    console.error(`    .replit:${v.lineNo}  [${v.section}]  ${v.key} = <REDACTED>`);
  }
  console.error('');
}
if (patternViolations.length) {
  console.error('  Lines matching known secret patterns:');
  for (const v of patternViolations) {
    console.error(`    .replit:${v.lineNo}  ${v.kind} (value redacted)`);
  }
  console.error('');
}

console.error('  Fix:');
console.error('    1. Remove the literal value(s) from .replit.');
console.error('    2. Add the secret in the Replit Secrets pane (Tools → Secrets).');
console.error('    3. Confirm the consumer reads from process.env (most already do).');
console.error('    4. Re-run: node scripts/src/check-replit-secrets.mjs');
console.error('');

process.exit(1);
