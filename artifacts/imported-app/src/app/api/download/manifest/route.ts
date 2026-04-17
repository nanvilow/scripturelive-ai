import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'

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

export async function GET() {
  const manifestPath = path.join(process.cwd(), 'public', 'downloads', 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest

  // Hydrate availability + size from disk if not using external host
  if (!manifest.externalReleaseUrl) {
    for (const [key, entry] of Object.entries(manifest.files)) {
      const file = path.join(process.cwd(), 'public', 'downloads', entry.filename)
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        manifest.files[key] = { ...entry, available: true, size: stat.size }
      } else {
        manifest.files[key] = { ...entry, available: false }
      }
    }
  } else {
    for (const key of Object.keys(manifest.files)) {
      manifest.files[key] = { ...manifest.files[key], available: true }
    }
  }

  return NextResponse.json(manifest, { headers: { 'Cache-Control': 'no-store' } })
}
