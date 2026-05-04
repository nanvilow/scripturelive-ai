import { NextRequest, NextResponse } from 'next/server'
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
  files: Record<string, ManifestFile>
  externalReleaseUrl: string | null
}

function loadManifest(): Manifest {
  const file = path.join(process.cwd(), 'public', 'downloads', 'manifest.json')
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest
}

function downloadsDir(): string {
  return path.join(process.cwd(), 'public', 'downloads')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const manifest = loadManifest()
  const entry = manifest.files[platform]
  if (!entry) {
    return NextResponse.json({ error: 'Unknown platform' }, { status: 404 })
  }

  if (manifest.externalReleaseUrl) {
    const url = `${manifest.externalReleaseUrl.replace(/\/$/, '')}/${encodeURIComponent(entry.filename)}`
    return NextResponse.redirect(url, 302)
  }

  const filePath = path.join(downloadsDir(), entry.filename)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({
      error: 'Installer not yet built',
      hint: 'Run pnpm --filter @workspace/imported-app run package:win or package:mac on the matching OS, then drop the resulting file into artifacts/imported-app/public/downloads/.',
      expected: entry.filename,
    }, { status: 404 })
  }

  const stat = fs.statSync(filePath)
  const stream = fs.createReadStream(filePath) as unknown as ReadableStream
  return new NextResponse(stream, {
    headers: {
      'Content-Type': platform.startsWith('mac') ? 'application/x-apple-diskimage' : 'application/x-msdownload',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${entry.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
