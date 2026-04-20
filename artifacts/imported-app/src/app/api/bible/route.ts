import { NextRequest, NextResponse } from 'next/server'
import {
  fetchBibleVerseFromAPI,
  fetchBibleChapterFromAPI,
  searchBibleByTextFromAPI,
  parseVerseReference,
  detectVersesInText,
  TRANSLATION_MAP,
} from '@/lib/bible-api'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const translation = searchParams.get('translation') || 'KJV'
  const detect = searchParams.get('detect')
  const search = searchParams.get('search')
  const book = searchParams.get('book')
  const chapter = searchParams.get('chapter')

  // Detect verses in text
  if (detect) {
    const references = detectVersesInText(detect)
    return NextResponse.json({ references })
  }

  // Voice/text passage search: ?search=in+the+beginning+god+created
  if (search) {
    const hits = await searchBibleByTextFromAPI(search, translation, 5)
    return NextResponse.json({ hits })
  }

  // Whole chapter mode: ?book=John&chapter=3
  if (book && chapter) {
    const chapNum = parseInt(chapter, 10)
    if (!chapNum || chapNum < 1) {
      return NextResponse.json({ error: 'Invalid chapter' }, { status: 400 })
    }
    // Offline cache hit?  /api/bible/translations populates this so
    // chapters fetched once (or downloaded in bulk) work without internet.
    try {
      const cachedChapter = await db.bibleChapterCache.findUnique({
        where: { translation_book_chapter: { translation, book, chapter: chapNum } },
      })
      if (cachedChapter) {
        const verses = JSON.parse(cachedChapter.verses) as Array<{ verse: number; text: string }>
        return NextResponse.json({
          book, chapter: chapNum, translation,
          verses,
          cached: true,
        })
      }
    } catch {
      // Cache lookup failed — fall through to live fetch.
    }
    const result = await fetchBibleChapterFromAPI(book, chapNum, translation)
    if (!result) {
      return NextResponse.json({ error: 'Could not fetch chapter' }, { status: 404 })
    }
    // Persist the chapter for offline reuse next time.
    try {
      const verses = (result as { verses?: Array<{ verse: number; text: string }> }).verses
      if (verses && verses.length) {
        await db.bibleChapterCache.upsert({
          where: { translation_book_chapter: { translation, book, chapter: chapNum } },
          update: { verses: JSON.stringify(verses) },
          create: { translation, book, chapter: chapNum, verses: JSON.stringify(verses) },
        })
      }
    } catch { /* non-critical */ }
    return NextResponse.json(result)
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
