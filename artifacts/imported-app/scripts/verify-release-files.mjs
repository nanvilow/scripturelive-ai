#!/usr/bin/env node
// verify-release-files.mjs
//
// Pre-tag / pre-package guard. Confirms that every file the desktop release
// pipeline depends on is (a) present on disk in this checkout and (b) tracked
// by git, so an overly-broad .gitignore rule cannot silently drop a required
// file from the source tarball that GitHub Actions checks out at tag time.
//
// History — every release this would have caught if it had existed:
//   v0.7.47  build-resources/* dropped by a release/ -> build-resources/*
//            ignore rule (see _dep_trim_note in package.json).
//   v0.7.61  src/lib/bibles/local-bible.ts dropped by a `local-*` ignore
//            rule (no `!src/lib/bibles/local-bible.ts` allowlist).
//   v0.7.62  build-resources/notarize.js, icon.ico, icon.png,
//            entitlements.mac.plist dropped because the
//            `build-resources/*` ignore rule's allowlist was missing or
//            stale after a refactor.
//
// On failure we print:
//   * the missing/ignored path
//   * the exact .gitignore line that excluded it (`git check-ignore -v`)
//   * a one-line hint about the allowlist syntax to fix it
//
// Exit code 0 = all required files OK. Non-zero = at least one missing.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve paths relative to the artifact root (one level up from scripts/).
const ARTIFACT_ROOT = resolve(__dirname, '..');
// Repo root is two levels above the artifact (artifacts/imported-app -> .).
const REPO_ROOT = resolve(ARTIFACT_ROOT, '..', '..');

// Each entry is a path RELATIVE TO THE ARTIFACT ROOT, plus a human-readable
// reason it's required. Keep this list in sync with electron-builder.yml and
// any source files that the Next.js build imports unconditionally.
const REQUIRED = [
  {
    path: 'build-resources/notarize.js',
    why: 'electron-builder.yml `afterSign:` hook (no-op on Windows, runs Apple notarization on macOS).',
  },
  {
    path: 'build-resources/icon.ico',
    why: 'electron-builder.yml `win.icon` — the Windows installer/app icon.',
  },
  {
    path: 'build-resources/icon.png',
    why: 'electron-builder.yml `mac.icon` — the macOS app icon.',
  },
  {
    path: 'build-resources/entitlements.mac.plist',
    why: 'electron-builder.yml `mac.entitlements` / `entitlementsInherit` — required for Hardened Runtime + notarization.',
  },
  {
    path: 'src/lib/bibles/local-bible.ts',
    why: 'Imported by src/app/api/bible/route.ts and src/components/providers/speech-provider.tsx; the Next.js build fails without it.',
  },
];

// Run a git command from the repo root and return stdout (or '' on non-zero).
function git(args, { allowNonZero = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    if (allowNonZero) return (err.stdout ?? '').toString().trim();
    throw err;
  }
}

// `git ls-files --error-unmatch <path>` exits 0 iff the path is tracked.
function isTracked(repoRelPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', repoRelPath], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

// `git check-ignore -v <path>` prints `<source>:<line>:<pattern>\t<path>` and
// exits 0 if the path matches an ignore rule. We use it to identify the
// offending .gitignore line so the maintainer can add a `!` allowlist for it.
function whyIgnored(repoRelPath) {
  try {
    const out = execFileSync(
      'git',
      ['check-ignore', '-v', '--no-index', '--', repoRelPath],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

const failures = [];

for (const { path: relPath, why } of REQUIRED) {
  const absPath = resolve(ARTIFACT_ROOT, relPath);
  const repoRelPath = `artifacts/imported-app/${relPath}`;

  const onDisk = existsSync(absPath);
  const tracked = isTracked(repoRelPath);

  if (onDisk && tracked) {
    console.log(`OK    ${repoRelPath}`);
    continue;
  }

  const ignoreInfo = whyIgnored(repoRelPath);
  failures.push({ repoRelPath, why, onDisk, tracked, ignoreInfo });
}

if (failures.length === 0) {
  console.log(`\nAll ${REQUIRED.length} required release files are present and tracked.`);
  process.exit(0);
}

console.error('\n=== verify-release-files: FAILED ===\n');
for (const f of failures) {
  console.error(`Missing required release file: ${f.repoRelPath}`);
  console.error(`  why required: ${f.why}`);
  console.error(`  on disk:      ${f.onDisk ? 'yes' : 'NO'}`);
  console.error(`  git-tracked:  ${f.tracked ? 'yes' : 'NO'}`);
  if (f.ignoreInfo) {
    console.error(`  ignored by:   ${f.ignoreInfo}`);
    console.error(
      `  fix:          add an allowlist line "!${f.repoRelPath.replace(/^artifacts\/imported-app\//, '')}" to artifacts/imported-app/.gitignore (after the offending rule), then \`git add -f\` the file.`,
    );
  } else if (!f.onDisk) {
    console.error(`  fix:          restore the file from history (\`git log --all --oneline -- "${f.repoRelPath}"\`) or recreate it.`);
  } else {
    console.error(`  fix:          run \`git add -f -- "${f.repoRelPath}"\` and commit.`);
  }
  console.error('');
}
console.error(
  `${failures.length} of ${REQUIRED.length} required release files are missing or untracked. Refusing to tag a broken release.`,
);
process.exit(1);
