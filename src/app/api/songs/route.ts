import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')
  const category = searchParams.get('category')
  const id = searchParams.get('id')

  if (id) {
    const song = await db.song.findUnique({ where: { id } })
    return NextResponse.json(song)
  }

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { artist: { contains: search } },
      { tags: { contains: search } },
      { lyrics: { contains: search } },
    ]
  }

  const songs = await db.song.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ songs })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, artist, lyrics, structured, category, tags, keySignature, tempo } = body

    if (!title || !lyrics) {
      return NextResponse.json({ error: 'Title and lyrics required' }, { status: 400 })
    }

    const song = await db.song.create({
      data: {
        title,
        artist: artist || null,
        lyrics,
        structured: structured ? JSON.stringify(structured) : null,
        category: category || 'worship',
        tags: tags || null,
        keySignature: keySignature || null,
        tempo: tempo || null,
      },
    })

    return NextResponse.json({ success: true, song })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create song'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'Song ID required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (updateData.structured) {
      updateData.structured = JSON.stringify(updateData.structured)
    }

    const song = await db.song.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, song })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update song'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Song ID required' }, { status: 400 })
  }

  await db.song.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
