#!/usr/bin/env node
/**
 * update-download-manifest.mjs
 *
 * Post-build helper: scans for the installer files referenced in
 * `public/downloads/manifest.json` and writes back each file's exact
 * byte size and SHA-256 checksum so the /download page can show
 * verifiable hashes alongside every download.
 *
 * Searches (in order, first hit wins per filename):
 *   1. artifacts/imported-app/public/downloads/<filename>
 *   2. artifacts/imported-app/release/<filename>
 *   3. <cwd>/dist/<filename>           (CI download-artifact target)
 *   4. extra dirs passed via --dir <path> (repeatable)
 *
 * Usage:
 *   node scripts/update-download-manifest.mjs
 *   node scripts/update-download-manifest.mjs --dir ./dist --dir /tmp/installers
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, '..')
const manifestPath = join(appRoot, 'public', 'downloads', 'manifest.json')

const extraDirs = []
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--dir' && process.argv[i + 1]) {
    extraDirs.push(resolve(process.argv[i + 1]))
    i++
  }
}

const searchDirs = [
  join(appRoot, 'public', 'downloads'),
  join(appRoot, 'release'),
  join(process.cwd(), 'dist'),
  ...extraDirs,
]

function sha256OfFile(file) {
  return new Promise((resolveP, rejectP) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveP(hash.digest('hex')))
    stream.on('error', rejectP)
  })
}

function findFile(filename) {
  for (const dir of searchDirs) {
    const candidate = join(dir, filename)
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function main() {
  if (!existsSync(manifestPath)) {
    console.error(`manifest not found at ${manifestPath}`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const updates = []
  const misses = []

  for (const [key, entry] of Object.entries(manifest.files ?? {})) {
    const found = findFile(entry.filename)
    if (!found) {
      misses.push(`${key}: ${entry.filename}`)
      continue
    }
    const size = statSync(found).size
    const sha256 = await sha256OfFile(found)
    manifest.files[key] = { ...entry, size, sha256 }
    updates.push(`${key}: ${entry.filename}  size=${size}  sha256=${sha256}`)
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  console.log('Updated manifest at', manifestPath)
  if (updates.length) {
    console.log('\nUpdated entries:')
    for (const line of updates) console.log('  ' + line)
  }
  if (misses.length) {
    console.log('\nNo file found for (size+sha256 left untouched):')
    for (const line of misses) console.log('  ' + line)
    console.log('\nSearched directories:')
    for (const d of searchDirs) console.log('  ' + d)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
