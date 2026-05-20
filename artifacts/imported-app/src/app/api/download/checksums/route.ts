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
  const downloadsDir = path.join(process.cwd(), 'public', 'downloads')
  const manifestPath = path.join(downloadsDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest

  const lines: string[] = []
  const missing: string[] = []

  for (const entry of Object.values(manifest.files)) {
    if (manifest.externalReleaseUrl) {
      // External-host mode: trust manifest-authored hashes (the post-build
      // script `pnpm run downloads:manifest` populates them).
      if (entry.sha256) {
        lines.push(`${entry.sha256}  ${entry.filename}`)
      } else {
        missing.push(entry.filename)
      }
      continue
    }
    const file = path.join(downloadsDir, entry.filename)
    if (!fs.existsSync(file)) {
      missing.push(entry.filename)
      continue
    }
    try {
      const stat = fs.statSync(file)
      const sha256 = sha256OfFileSync(file, stat.size, stat.mtimeMs)
      lines.push(`${sha256}  ${entry.filename}`)
    } catch {
      missing.push(entry.filename)
    }
  }

  const header = [
    `# SHA256SUMS.txt — ScriptureLive AI v${manifest.version}`,
    `# Generated ${new Date().toISOString()}`,
    `# Verify with: sha256sum -c SHA256SUMS.txt   (Linux/macOS)`,
    `#         or: shasum -a 256 -c SHA256SUMS.txt`,
  ]
  if (missing.length) {
    header.push(`# Note: no file on disk for: ${missing.join(', ')}`)
  }

  const body = [...header, '', ...lines, ''].join('\n')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="SHA256SUMS.txt"',
      'Cache-Control': 'no-store',
    },
  })
}
