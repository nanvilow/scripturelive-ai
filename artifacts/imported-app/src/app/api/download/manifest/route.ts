import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

type ManifestFile = {
  label: string
  filename: string
  size: number | null
  sha256: string | null
  available: boolean
}

type Manifest = {
  version: string
  releaseNotes?: string
  publishedAt: string | null
  files: Record<string, ManifestFile>
  externalReleaseUrl: string | null
}

// In-memory cache for SHA-256 hashes computed on the fly. Keyed by
// `${absolutePath}:${size}:${mtimeMs}` so the cache is invalidated
// automatically when the underlying file is replaced.
const sha256Cache = new Map<string, string>()

function sha256OfFileSync(file: string, size: number, mtimeMs: number): string {
  const key = `${file}:${size}:${mtimeMs}`
  const cached = sha256Cache.get(key)
  if (cached) return cached
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    let bytesRead = 0
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(fd)
  }
  const digest = hash.digest('hex')
  sha256Cache.set(key, digest)
  return digest
}

export async function GET() {
  const manifestPath = path.join(process.cwd(), 'public', 'downloads', 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest

  // Hydrate availability + size + sha256 from disk if not using external host.
  if (!manifest.externalReleaseUrl) {
    for (const [key, entry] of Object.entries(manifest.files)) {
      const file = path.join(process.cwd(), 'public', 'downloads', entry.filename)
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        // Always recompute SHA-256 from the on-disk file in local-host
        // mode. The manifest's stored sha256 is ignored here because file
        // contents can change without the byte size changing (e.g.
        // overwriting an installer with a tampered same-size build).
        // The cache is keyed by path+size+mtimeMs, so unchanged files are
        // hashed at most once per process lifetime.
        let sha256: string | null = null
        try {
          sha256 = sha256OfFileSync(file, stat.size, stat.mtimeMs)
        } catch {
          sha256 = null
        }
        manifest.files[key] = { ...entry, available: true, size: stat.size, sha256 }
      } else {
        // File is gone — drop any cached size/sha256 from the manifest so
        // the UI never shows stale metadata next to a "build pending" card.
        manifest.files[key] = { ...entry, available: false, size: null, sha256: null }
      }
    }
  } else {
    // External host (e.g. GitHub Releases): trust the manifest as authored.
    // The post-build script (`pnpm run downloads:manifest`) is responsible
    // for filling in size + sha256.
    for (const key of Object.keys(manifest.files)) {
      manifest.files[key] = { ...manifest.files[key], available: true }
    }
  }

  return NextResponse.json(manifest, { headers: { 'Cache-Control': 'no-store' } })
}
