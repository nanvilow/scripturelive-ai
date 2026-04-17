import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink, mkdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

const UPLOADS_DIR = join(process.cwd(), 'uploads')

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
    default:
      return 'application/octet-stream'
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('file')

    if (!filename || !isValidFilename(filename)) {
      return NextResponse.json({ error: 'Invalid or missing file parameter' }, { status: 400 })
    }

    const filepath = join(UPLOADS_DIR, filename)

    // Check file exists
    try {
      await stat(filepath)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const buffer = await readFile(filepath)
    const contentType = getContentType(filename)

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
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload PNG, JPEG, or WebP images.' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Ensure uploads directory exists
    await mkdir(UPLOADS_DIR, { recursive: true })

    // Generate unique filename preserving extension
    const ext = file.name.split('.').pop() || 'png'
    const filename = `${randomUUID()}.${ext}`
    const filepath = join(UPLOADS_DIR, filename)

    await writeFile(filepath, buffer)

    return NextResponse.json({
      success: true,
      url: `/api/upload?file=${filename}`,
      filename,
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
