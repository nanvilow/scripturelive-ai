import { NextRequest, NextResponse } from 'next/server'
import {
  fetchBibleVerseFromAPI,
  fetchBibleChapterFromAPI,
  searchBibleByTextFromAPI,
  parseVerseReference,
  detectVersesInText,
  isPoisonedVerseText,
  TRANSLATION_MAP,
} from '@/lib/bible-api'
import { lookupVerse, lookupRange, isTranslationBundled } from '@/lib/bibles/local-bible'
import type { BibleTranslation } from '@/lib/store'
import { db } from '@/lib/db'

// Try the bundled NIV/KJV/ESV JSON BEFORE the network. With ~93k clean
// verses bundled (v0.7.58 cleanup), the network is almost never needed
// for the three core translations — which means scripture detection
// during a live service can't fail with a network error for them.
function lookupBundledVerse(
  reference: string,
  translation: string,
): {
  reference: string
  text: string
  translation: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
} | null {
  const t = translation.toLowerCase() as BibleTranslation
  if (!isTranslationBundled(t)) return null
  const parsed = parseVerseReference(reference)
  if (!parsed) return null
  const start = parsed.verseStart
  const end = parsed.verseEnd ?? parsed.verseStart
  if (end === start) {
    const text = lookupVerse(parsed.book, parsed.chapter, start, t)
    if (!text) return null
    return {
      reference,
      text,
      translation,
      book: parsed.book,
      chapter: parsed.chapter,
      verseStart: start,
      verseEnd: parsed.verseEnd,
    }
  }
  const range = lookupRange(parsed.book, parsed.chapter, start, end, t)
  if (!range) return null
  // Match the network-fetched shape: join verse texts with `\n`, no
  // verse-number prefixes (lookupRange prefixes "<n> " by default).
  const text = range.lines.map((l) => l.replace(/^\d+\s+/, '')).join('\n')
  return {
    reference,
    text,
    translation,
    book: parsed.book,
    chapter: parsed.chapter,
    verseStart: start,
    verseEnd: parsed.verseEnd,
  }
}

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
  void bibleApiTranslation

  // 1. Bundled-Bible fast path. If the translation is bundled
  //    (NIV/KJV/ESV) and the address resolves locally, we never touch
  //    the network or the cache. This is the path that prevents the
  //    embarrassing "unable to fetch from API" projector incident from
  //    ever recurring for the three core translations.
  const bundled = lookupBundledVerse(reference, translation)
  if (bundled) {
    // Best-effort: scrub any legacy poison row for this key from the
    // SQLite cache, since the bundled fast path bypasses the cache
    // read below. Without this, an operator's pre-v0.7.59 poison row
    // would sit in the DB forever (harmless while the bundled path
    // wins, but bad hygiene).
    db.bibleVerseCache
      .findUnique({ where: { reference_translation: { reference, translation } } })
      .then((row) => {
        if (row && isPoisonedVerseText(row.text)) {
          return db.bibleVerseCache.delete({
            where: { reference_translation: { reference, translation } },
          })
        }
      })
      .catch(() => { /* non-critical */ })
    return NextResponse.json({ ...bundled, cached: true, source: 'bundled' })
  }

  // 2. SQLite verse cache. Scrub any poisoned text written by old
  //    builds (≤ v0.7.58 stored "Verse text for X (Y) — unable to
  //    fetch from API." as the verse). Treat poisoned cache rows as a
  //    miss AND delete them so they never leak again.
  try {
    const cached = await db.bibleVerseCache.findUnique({
      where: { reference_translation: { reference, translation } },
    })

    if (cached) {
      if (isPoisonedVerseText(cached.text)) {
        try {
          await db.bibleVerseCache.delete({
            where: { reference_translation: { reference, translation } },
          })
        } catch { /* non-critical */ }
      } else {
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
    }
  } catch {
    // DB might not be ready yet, continue without cache
  }

  // 3. Fetch from external Bible API.
  const verse = await fetchBibleVerseFromAPI(reference, translation)

  if (!verse || isPoisonedVerseText(verse.text)) {
    // 404 → client fetchBibleVerse returns null → speech-provider
    // skips the slide push → nothing reaches the projector.
    return NextResponse.json({ error: 'Could not fetch verse' }, { status: 404 })
  }

  // 4. Cache the result. Refuse to cache poison; verse.text is checked
  //    above so this is belt-and-braces.
  try {
    if (!isPoisonedVerseText(verse.text)) {
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
    }
  } catch (error) {
    // Cache write failure is non-critical
    console.error('Cache write failed:', error)
  }

  return NextResponse.json({ ...verse, cached: false })
}
