import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Bible translation download manager.
 *
 *   GET    /api/bible/translations            → list known + downloaded translations
 *   POST   /api/bible/translations            → start a download {translation,name?}
 *   DELETE /api/bible/translations?t=KJV      → purge a downloaded translation
 *
 * Downloads run in-process: we fetch each book/chapter from the public
 * bible-api.com mirror and cache it into BibleChapterCache. Progress is
 * persisted on the BibleTranslationDownload row so the UI can poll it.
 *
 * Default catalogue covers the most-requested translations. The user
 * can request anything bible-api.com supports by passing a custom code.
 */

const CATALOGUE = [
  { translation: 'KJV', name: 'King James Version', language: 'en' },
  { translation: 'WEB', name: 'World English Bible', language: 'en' },
  { translation: 'BBE', name: 'Bible in Basic English', language: 'en' },
  { translation: 'ASV', name: 'American Standard Version', language: 'en' },
  { translation: 'YLT', name: "Young's Literal Translation", language: 'en' },
  { translation: 'DARBY', name: 'Darby Bible', language: 'en' },
  { translation: 'OEB-CW', name: 'Open English Bible (Commonwealth)', language: 'en' },
]

const BOOKS = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
  'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
  'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians',
  '2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James',
  '1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation',
]

// Approximate chapter counts so progress increments smoothly without
// requiring an upfront round-trip per book.
const CHAPTER_COUNTS: Record<string, number> = {
  Genesis:50,Exodus:40,Leviticus:27,Numbers:36,Deuteronomy:34,Joshua:24,Judges:21,Ruth:4,
  '1 Samuel':31,'2 Samuel':24,'1 Kings':22,'2 Kings':25,'1 Chronicles':29,'2 Chronicles':36,
  Ezra:10,Nehemiah:13,Esther:10,Job:42,Psalms:150,Proverbs:31,Ecclesiastes:12,
  'Song of Solomon':8,Isaiah:66,Jeremiah:52,Lamentations:5,Ezekiel:48,Daniel:12,
  Hosea:14,Joel:3,Amos:9,Obadiah:1,Jonah:4,Micah:7,Nahum:3,Habakkuk:3,Zephaniah:3,
  Haggai:2,Zechariah:14,Malachi:4,Matthew:28,Mark:16,Luke:24,John:21,Acts:28,
  Romans:16,'1 Corinthians':16,'2 Corinthians':13,Galatians:6,Ephesians:6,
  Philippians:4,Colossians:4,'1 Thessalonians':5,'2 Thessalonians':3,'1 Timothy':6,
  '2 Timothy':4,Titus:3,Philemon:1,Hebrews:13,James:5,'1 Peter':5,'2 Peter':3,
  '1 John':5,'2 John':1,'3 John':1,Jude:1,Revelation:22,
}

const TOTAL_CHAPTERS = Object.values(CHAPTER_COUNTS).reduce((a, b) => a + b, 0)

const inFlight = new Map<string, Promise<void>>()

export async function GET() {
  const downloaded = await db.bibleTranslationDownload.findMany({
    orderBy: { translation: 'asc' },
  })
  const map = new Map(downloaded.map((d) => [d.translation, d]))
  const catalogue = CATALOGUE.map((c) => ({
    ...c,
    download: map.get(c.translation) || null,
  }))
  // Include downloaded translations not in our default catalogue.
  for (const d of downloaded) {
    if (!CATALOGUE.find((c) => c.translation === d.translation)) {
      catalogue.push({
        translation: d.translation,
        name: d.name,
        language: d.language,
        download: d,
      })
    }
  }
  return NextResponse.json({ catalogue })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const translation: string = (body?.translation || '').trim().toUpperCase()
    if (!translation) {
      return NextResponse.json({ error: 'translation required' }, { status: 400 })
    }
    const known = CATALOGUE.find((c) => c.translation === translation)
    const name: string = body?.name || known?.name || translation
    const language: string = body?.language || known?.language || 'en'

    const row = await db.bibleTranslationDownload.upsert({
      where: { translation },
      update: { status: 'downloading', progress: 0, errorMessage: null, name, language },
      create: { translation, name, language, status: 'downloading', progress: 0 },
    })

    if (!inFlight.has(translation)) {
      inFlight.set(
        translation,
        runDownload(translation).finally(() => inFlight.delete(translation)),
      )
    }

    return NextResponse.json({ ok: true, download: row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const t = (searchParams.get('t') || '').trim().toUpperCase()
  if (!t) return NextResponse.json({ error: 't required' }, { status: 400 })
  await db.bibleChapterCache.deleteMany({ where: { translation: t } })
  await db.bibleVerseCache.deleteMany({ where: { translation: t } })
  await db.bibleTranslationDownload.deleteMany({ where: { translation: t } })
  return NextResponse.json({ ok: true })
}

async function runDownload(translation: string): Promise<void> {
  let done = 0
  let bookCount = 0
  let verseCount = 0
  try {
    for (const book of BOOKS) {
      const chapters = CHAPTER_COUNTS[book] || 1
      let bookHadAny = false
      for (let chapter = 1; chapter <= chapters; chapter++) {
        try {
          const url = `https://bible-api.com/${encodeURIComponent(book)}+${chapter}?translation=${encodeURIComponent(translation.toLowerCase())}`
          const res = await fetch(url, { headers: { 'User-Agent': 'ScriptureLive/1.0' } })
          if (res.ok) {
            const data: { verses?: Array<{ verse: number; text: string }> } = await res.json()
            const verses = (data.verses || []).map((v) => ({ verse: v.verse, text: (v.text || '').trim() }))
            if (verses.length) {
              await db.bibleChapterCache.upsert({
                where: { translation_book_chapter: { translation, book, chapter } },
                update: { verses: JSON.stringify(verses) },
                create: { translation, book, chapter, verses: JSON.stringify(verses) },
              })
              verseCount += verses.length
              bookHadAny = true
            }
          }
        } catch {
          // Skip — try next chapter. Network blips are common; we
          // continue rather than aborting the whole download.
        }
        done++
        if (done % 5 === 0 || done === TOTAL_CHAPTERS) {
          const progress = Math.min(99, Math.floor((done / TOTAL_CHAPTERS) * 100))
          await db.bibleTranslationDownload.update({
            where: { translation },
            data: { progress, verseCount, bookCount },
          })
        }
      }
      if (bookHadAny) bookCount++
    }
    await db.bibleTranslationDownload.update({
      where: { translation },
      data: { status: 'ready', progress: 100, bookCount, verseCount, errorMessage: null },
    })
  } catch (err) {
    await db.bibleTranslationDownload.update({
      where: { translation },
      data: { status: 'error', errorMessage: err instanceof Error ? err.message : String(err) },
    })
  }
}
