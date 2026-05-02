import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseSongFile } from '@/lib/song-importers'

export const runtime = 'nodejs'

/**
 * POST /api/songs/import
 *
 * Body: multipart/form-data with one or more `files` entries.
 * Each file is parsed (ChordPro / OpenLP XML / CCLI / sectioned text)
 * and inserted as a Song row.
 *
 * Returns: { imported: number; songs: Song[]; errors: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const songs: unknown[] = []
    const errors: string[] = []

    for (const file of files) {
      try {
        const text = await file.text()
        const parsed = parseSongFile(file.name, text)
        const created = await db.song.create({
          data: {
            title: parsed.title,
            artist: parsed.artist || null,
            lyrics: parsed.lyrics,
            structured: parsed.structured ? JSON.stringify(parsed.structured) : null,
            category: parsed.category || 'worship',
            tags: parsed.tags || null,
            keySignature: parsed.keySignature || null,
            tempo: parsed.tempo || null,
          },
        })
        songs.push(created)
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : 'parse failed'}`)
      }
    }

    return NextResponse.json({ imported: songs.length, songs, errors })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    )
  }
}
