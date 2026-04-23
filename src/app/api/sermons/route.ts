import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const search = searchParams.get('search')

  if (id) {
    const note = await db.sermonNote.findUnique({ where: { id } })
    return NextResponse.json(note)
  }

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { content: { contains: search } },
    ]
  }

  const notes = await db.sermonNote.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ notes })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, outline, bibleRefs, date } = body

    if (!title) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 })
    }

    const note = await db.sermonNote.create({
      data: {
        title,
        content: content || '',
        outline: outline ? JSON.stringify(outline) : null,
        bibleRefs: bibleRefs || null,
        date: date ? new Date(date) : new Date(),
      },
    })

    return NextResponse.json({ success: true, note })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create note'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (updateData.outline) {
      updateData.outline = JSON.stringify(updateData.outline)
    }

    const note = await db.sermonNote.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, note })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update note'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
  }

  await db.sermonNote.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
