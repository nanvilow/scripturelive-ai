import { NextRequest, NextResponse } from 'next/server'
import { fetchBibleVerseFromAPI, parseVerseReference, detectVersesInText, TRANSLATION_MAP } from '@/lib/bible-api'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const translation = searchParams.get('translation') || 'KJV'
  const detect = searchParams.get('detect')

  // Detect verses in text
  if (detect) {
    const references = detectVersesInText(detect)
    return NextResponse.json({ references })
  }

  // Single verse lookup
  if (!reference) {
    return NextResponse.json({ error: 'Reference parameter is required' }, { status: 400 })
  }

  const parsed = parseVerseReference(reference)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid verse reference format' }, { status: 400 })
  }

  // Resolve translation abbreviation for the API
  const bibleApiTranslation = TRANSLATION_MAP[translation] || translation.toLowerCase()

  // Check cache first
  try {
    const cached = await db.bibleVerseCache.findUnique({
      where: { reference_translation: { reference, translation } },
    })

    if (cached) {
      return NextResponse.json({
        reference: cached.reference,
        text: cached.text,
        translation: cached.translation,
        book: cached.book,
        chapter: cached.chapter,
        verseStart: cached.verseStart,
        verseEnd: cached.verseEnd,
        cached: true,
      })
    }
  } catch {
    // DB might not be ready yet, continue without cache
  }

  // Fetch from external Bible API
  const verse = await fetchBibleVerseFromAPI(reference, translation)

  if (!verse) {
    return NextResponse.json({ error: 'Could not fetch verse' }, { status: 404 })
  }

  // Cache the result
  try {
    await db.bibleVerseCache.create({
      data: {
        reference: verse.reference,
        text: verse.text,
        translation: verse.translation,
        book: verse.book,
        chapter: verse.chapter,
        verseStart: verse.verseStart,
        verseEnd: verse.verseEnd,
      },
    })
  } catch (error) {
    // Cache write failure is non-critical
    console.error('Cache write failed:', error)
  }

  return NextResponse.json({ ...verse, cached: false })
}
