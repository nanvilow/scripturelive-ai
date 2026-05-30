#!/usr/bin/env node
// Ship a desktop release to GitHub.
//
// This script lets you cut a new ScriptureLive AI Windows installer
// release from ANY machine — Replit, your laptop, a CI runner, a
// teammate's box — with no dependency on Replit. All it needs is:
//
//   1. A clone of this repo (artifacts/imported-app/)
//   2. Node 24+
//   3. A GitHub Personal Access Token with `repo` + `workflow` scopes,
//      exported as `GH_PAT`
//
// Once those exist, run:
//
//   cd artifacts/imported-app
//   node scripts/ship-release.mjs 0.7.256
//
// What it does (atomic):
//   1. Walks every source file under artifacts/imported-app/ (skipping
//      node_modules, build output, gitignored baked credentials, etc.)
//   2. Compares git-blob SHAs against remote `main`
//   3. Posts ONE git tree + ONE commit + ONE branch ref update
//      (atomic at the ref-update step — no race, no partial state)
//   4. Triggers the `release-desktop.yml` GitHub Actions workflow,
//      which builds + signs + uploads the Windows installer to a
//      GitHub Release. Auto-update picks it up from there.
//
// **CRITICAL** ship-script guard-rails baked in (see replit.md):
//   - `inputs.tag` MUST be set on the workflow_dispatch payload, with
//     the leading `v` (`tag: v0.7.256`). Without it, the upload step
//     fails with a broken glob path. See replit.md "Sandbox quirks".
//   - `EXCLUDE_FILES` covers BOTH baked-credential paths
//     (`src/lib/baked-credentials.ts` AND `src/lib/keys.baked.ts`).
//     Walker does NOT honour .gitignore — these MUST be in the set or
//     the secret-scan workflow goes red AND the key gets auto-revoked.
//   - `EXCLUDE_DIRS` covers every build-output dir, so stale
//     `dist-electron/` content never ships.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const TOKEN = process.env.GH_PAT
if (!TOKEN) {
  console.error('GH_PAT env var missing — export a GitHub PAT with repo + workflow scopes.')
  process.exit(1)
}

const VERSION = process.argv[2]
if (!VERSION || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(VERSION)) {
  console.error('Usage: node scripts/ship-release.mjs <version>')
  console.error('  e.g.  node scripts/ship-release.mjs 0.7.256')
  process.exit(1)
}

const OWNER = process.env.GH_OWNER || 'nanvilow'
const REPO = process.env.GH_REPO || 'scripturelive-ai'
const BRANCH = `release/v${VERSION}`
const TAG_INPUT = `v${VERSION}`

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(HERE, '..')
const REPO_ROOT = join(APP_ROOT, '..', '..')
const REMOTE_PREFIX = 'artifacts/imported-app'

const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', 'dist', 'release', 'db',
  'dist-electron', 'dist-electron-ui', 'exports',
  'upload', 'uploads', 'download',
  '.turbo', '.cache', '.replit-artifact',
  'src/generated/prisma-client',
])

const EXCLUDE_FILES = new Set([
  'tsconfig.tsbuildinfo',
  'next-env.d.ts',
  'src/lib/baked-credentials.ts',
  'src/lib/keys.baked.ts',
])

async function gh(method, path, body) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 500)}`)
  }
  return r.status === 204 ? null : r.json()
}

function walk(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(name)) continue
    const full = join(dir, name)
    const rel = relative(root, full)
    if (EXCLUDE_DIRS.has(rel)) continue
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full, root, out)
    else { if (EXCLUDE_FILES.has(rel)) continue; out.push(rel) }
  }
  return out
}

function gitBlobSha(buf) {
  const h = createHash('sha1')
  h.update(`blob ${buf.length}\0`)
  h.update(buf)
  return h.digest('hex')
}

(async () => {
  console.log(`Shipping v${VERSION} → ${OWNER}/${REPO} (${BRANCH})`)

  console.log('[1/8] Listing local files…')
  const local = walk(APP_ROOT, APP_ROOT).sort()
  console.log(`  ${local.length} local files`)

  console.log('[2/8] Fetching remote main tree…')
  const mainRef = await gh('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/main`)
  const mainSha = mainRef.object.sha
  const tree = await gh('GET', `/repos/${OWNER}/${REPO}/git/trees/${mainSha}?recursive=1`)
  if (tree.truncated) throw new Error('remote tree truncated — repo too large for single fetch')
  const remoteMap = new Map()
  for (const e of tree.tree) if (e.type === 'blob') remoteMap.set(e.path, e.sha)

  console.log('[3/8] Computing drift…')
  // Also include repo-root replit.md if present (top-level docs may have drifted too).
  const extras = []
  const rootReplitMd = join(REPO_ROOT, 'replit.md')
  if (existsSync(rootReplitMd)) extras.push({ remote: 'replit.md', local: rootReplitMd })

  const drifted = []
  for (const rel of local) {
    const remotePath = `${REMOTE_PREFIX}/${rel.split('\\').join('/')}`
    const buf = readFileSync(join(APP_ROOT, rel))
    if (remoteMap.get(remotePath) !== gitBlobSha(buf)) drifted.push({ remotePath, buf })
  }
  for (const { remote, local } of extras) {
    const buf = readFileSync(local)
    if (remoteMap.get(remote) !== gitBlobSha(buf)) drifted.push({ remotePath: remote, buf })
  }

  console.log(`  ${drifted.length} drifted file(s)`)
  drifted.slice(0, 15).forEach((f) => console.log(`   • ${f.remotePath}`))
  if (drifted.length === 0) { console.log('No drift — nothing to ship.'); process.exit(0) }

  console.log('[4/8] Creating blobs…')
  const blobShas = []
  for (let i = 0; i < drifted.length; i++) {
    const b = await gh('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: drifted[i].buf.toString('base64'), encoding: 'base64',
    })
    blobShas.push(b.sha)
    if ((i + 1) % 10 === 0 || i === drifted.length - 1) console.log(`  ${i + 1}/${drifted.length}`)
  }

  console.log('[5/8] Creating tree…')
  const newTree = await gh('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: mainSha,
    tree: drifted.map((f, i) => ({ path: f.remotePath, mode: '100644', type: 'blob', sha: blobShas[i] })),
  })

  console.log('[6/8] Creating commit…')
  const commit = await gh('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: `chore(release): v${VERSION}`,
    tree: newTree.sha,
    parents: [mainSha],
  })
  console.log(`  commit ${commit.sha.slice(0, 7)}`)

  console.log('[7/8] Creating branch ref…')
  try {
    await gh('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha })
    console.log('  created')
  } catch {
    await gh('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true })
    console.log('  updated')
  }

  console.log('[8/8] Dispatching release-desktop.yml workflow…')
  // BOTH `ref` AND `inputs.tag` are mandatory — see replit.md guard-rail.
  await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/release-desktop.yml/dispatches`, {
    ref: BRANCH,
    inputs: { tag: TAG_INPUT },
  })
  console.log(`✓ Dispatched on ${BRANCH} (inputs.tag=${TAG_INPUT})`)
  console.log(`  Watch progress at https://github.com/${OWNER}/${REPO}/actions/workflows/release-desktop.yml`)
})().catch((e) => { console.error(e.message || e); process.exit(1) })
