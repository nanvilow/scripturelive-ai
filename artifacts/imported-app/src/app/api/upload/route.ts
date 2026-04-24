import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink, mkdir, stat, readdir } from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

// Allow streaming uploads up to ~3 GB so operators can post long
// service videos. We avoid `request.formData()` because it buffers
// the entire body into memory; instead we stream the raw body to
// disk and read the original filename + mime from headers.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

// Where uploaded media is persisted to disk.
//
// Operator complaint "DATA NOT SAVING" — in the packaged Electron build
// `process.cwd()` resolves to the Next standalone folder INSIDE
// `process.resourcesPath` (i.e. C:\Program Files\…\resources\app\…),
// which is (a) read-only for non-admin users and (b) wiped on every
// auto-update. The uploaded file therefore either failed to write or
// disappeared on the next release, leaving the operator's mediaLibrary
// pointing at /api/upload?file=<uuid> URLs that all 404.
//
// The Electron main process now creates `<userData>/uploads` (writable
// + update-stable + per-user) and hands the absolute path through via
// SCRIPTURELIVE_UPLOADS_DIR. We honour that env when present and fall
// back to `cwd/uploads` for `next dev` (Replit / local dev only).
const UPLOADS_DIR = process.env.SCRIPTURELIVE_UPLOADS_DIR || join(process.cwd(), 'uploads')
const MAX_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB

function isValidFilename(filename: string): boolean {
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    !filename.includes('..') &&
    !filename.includes('/') &&
    !filename.includes('\\')
  )
}

function getContentType(filename: string): string {
  const ext = extname(filename).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    default:
      return 'application/octet-stream'
  }
}

function extFromMime(mime: string, fallback: string): string {
  const m = mime.toLowerCase()
  if (m === 'image/png') return 'png'
  if (m === 'image/jpeg') return 'jpg'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/gif') return 'gif'
  if (m === 'image/svg+xml') return 'svg'
  if (m === 'video/mp4') return 'mp4'
  if (m === 'video/webm') return 'webm'
  if (m === 'video/quicktime') return 'mov'
  if (m === 'video/x-matroska') return 'mkv'
  if (m === 'video/x-msvideo') return 'avi'
  return fallback
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Item #16 — list mode. The Media panel calls this on mount to
    // figure out which uploads still exist on disk, so it can prune
    // any stale entries from the persisted library before showing
    // them to the operator (avoids broken thumbnails after the user
    // wipes their uploads/ folder out-of-band).
    if (searchParams.get('list') === '1') {
      try {
        await mkdir(UPLOADS_DIR, { recursive: true })
        const names = await readdir(UPLOADS_DIR)
        return NextResponse.json({ files: names })
      } catch {
        return NextResponse.json({ files: [] })
      }
    }

    const filename = searchParams.get('file')

    if (!filename || !isValidFilename(filename)) {
      return NextResponse.json({ error: 'Invalid or missing file parameter' }, { status: 400 })
    }

    const filepath = join(UPLOADS_DIR, filename)

    let info
    try {
      info = await stat(filepath)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const contentType = getContentType(filename)

    // For large files (>20 MB) stream the body so we don't pull GBs
    // into memory just to serve the response.
    if (info.size > 20 * 1024 * 1024) {
      const nodeStream = createReadStream(filepath)
      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          nodeStream.on('data', (chunk) =>
            controller.enqueue(
              chunk instanceof Buffer ? new Uint8Array(chunk) : (chunk as Uint8Array),
            ),
          )
          nodeStream.on('end', () => controller.close())
          nodeStream.on('error', (err) => controller.error(err))
        },
        cancel() {
          nodeStream.destroy()
        },
      })
      return new NextResponse(webStream, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': info.size.toString(),
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const buffer = await readFile(filepath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Serve error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctype = (request.headers.get('content-type') || '').toLowerCase()
    const headerName = request.headers.get('x-filename') || ''
    const declaredSize = Number(request.headers.get('x-file-size') || '0')

    if (!request.body) {
      return NextResponse.json({ error: 'Empty body' }, { status: 400 })
    }

    if (ctype.startsWith('multipart/form-data')) {
      return NextResponse.json(
        {
          error:
            'Use a raw body upload (Content-Type set to the file mime, X-Filename header) for large files.',
        },
        { status: 415 }
      )
    }

    const isImage = ctype.startsWith('image/')
    const isVideo = ctype.startsWith('video/')
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: 'Please upload an image or video file (set Content-Type to its mime).' },
        { status: 400 }
      )
    }

    if (declaredSize && declaredSize > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 3 GB.' },
        { status: 413 }
      )
    }

    await mkdir(UPLOADS_DIR, { recursive: true })

    const safeBase = headerName
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(-80)
    const ext = (
      safeBase.includes('.') ? safeBase.split('.').pop() : extFromMime(ctype, isVideo ? 'mp4' : 'png')
    ) as string
    const filename = `${randomUUID()}.${ext.toLowerCase()}`
    const filepath = join(UPLOADS_DIR, filename)

    // Stream the request body straight to disk in chunks. Bail out
    // immediately if the running total exceeds MAX_BYTES so a malicious
    // client can't fill the disk.
    const reader = request.body.getReader()
    const out = createWriteStream(filepath)
    let written = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        written += value.byteLength
        if (written > MAX_BYTES) {
          out.destroy()
          try { await unlink(filepath) } catch {}
          return NextResponse.json(
            { error: 'File too large. Maximum size is 3 GB.' },
            { status: 413 }
          )
        }
        if (!out.write(value)) {
          await new Promise<void>((resolve) => out.once('drain', () => resolve()))
        }
      }
      await new Promise<void>((resolve, reject) => {
        out.end(() => resolve())
        out.on('error', reject)
      })
    } catch (err) {
      try { await unlink(filepath) } catch {}
      throw err
    }

    return NextResponse.json({
      success: true,
      url: `/api/upload?file=${filename}`,
      filename,
      size: written,
      kind: isVideo ? 'video' : 'image',
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')

    if (!filename || !isValidFilename(filename)) {
      return NextResponse.json({ error: 'Filename required' }, { status: 400 })
    }

    const filepath = join(UPLOADS_DIR, filename)
    await unlink(filepath)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    )
  }
}
