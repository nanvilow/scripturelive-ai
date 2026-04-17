import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Presentation ID required' }, { status: 400 })
  }

  const presentation = await db.presentation.findUnique({
    where: { id },
    include: { song: true, sermon: true },
  })

  return NextResponse.json(presentation)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, slides, songId, sermonId, bibleRefs, theme } = body

    if (!title || !slides) {
      return NextResponse.json({ error: 'Title and slides are required' }, { status: 400 })
    }

    const presentation = await db.presentation.create({
      data: {
        title,
        slides: JSON.stringify(slides),
        songId: songId || null,
        sermonId: sermonId || null,
        bibleRefs: bibleRefs || null,
        theme: theme || 'default',
      },
    })

    return NextResponse.json({ success: true, id: presentation.id, presentation })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create presentation'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'Presentation ID required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (updateData.slides) {
      updateData.slides = JSON.stringify(updateData.slides)
    }

    const presentation = await db.presentation.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, presentation })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update presentation'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Presentation ID required' }, { status: 400 })
  }

  await db.presentation.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
