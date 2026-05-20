#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const STRUCTURE = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'src/data/bible-structure.json'), 'utf8'),
)

const BOOK_ORDER = Object.keys(STRUCTURE).filter((k) => !k.startsWith('_'))

// v0.5.52 — operator decision is to bundle KJV + NIV + ESV, so the
// default when no args are given is all three (not just KJV). Pass
// explicit args to override (e.g. `node scripts/bundle-bibles.mjs kjv`).
// v0.7.137 — Asante Twi + Ewe added (wldeh path).
// v0.7.164 — NKJV + NLT + AMP added (bolls path) per operator request:
// "somewhere in between" between bundling everything and only the
// safe public-domain set. NKJV is the main pulpit Bible most preachers
// in Ghana use, NLT is the everyday-language pew Bible, AMP is the
// study Bible preachers reach for to expand a verse mid-sermon. Same
// copyright stance as the existing NIV/ESV bundling decision.
const TRANSLATIONS = (process.argv.slice(2).length ? process.argv.slice(2) : ['kjv', 'niv', 'esv', 'nkjv', 'nlt', 'amp', 'twiasante', 'ewe'])
  .map((t) => t.toLowerCase())

const OUT_DIR = path.join(repoRoot, 'src/data/bibles')
fs.mkdirSync(OUT_DIR, { recursive: true })

// Always write empty `{}` stubs for the three operator translations if
// they are not present yet. This guarantees `next build` succeeds even
// when the operator chose to skip the bundle step (or it failed on a
// flaky network) — local-bible.ts then sees an empty object and
// lookupVerse / lookupRange return null, so callers transparently fall
// back to the online fetchBibleVerse path. FORCE=1 leaves the stubs
// alone and lets the download below overwrite them.
// v0.7.137 — Ghanaian translations bundled alongside the English
// trio so the Windows build runs offline. Sourced from
// wldeh/bible-api (different shape from bolls — see bundleWldeh below).
for (const t of ['kjv', 'niv', 'esv', 'nkjv', 'nlt', 'amp', 'twiasante', 'ewe']) {
  const f = path.join(OUT_DIR, `${t}.json`)
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, '{}')
    console.log(`[stub]  wrote empty ${t}.json so the next build never errors on a missing import`)
  }
}

// v0.7.137 — wldeh/bible-api per-translation config. Mirrors
// WLDEH_TRANSLATIONS in src/lib/bibles/twi-bible.ts but lives here
// to keep this script free of the @/ alias.
// v0.7.163 — TWI (Akuapem, tw-wakna) entry removed to mirror the
// runtime registry change in src/lib/bibles/twi-bible.ts. Only Asante
// Twi + Ewe ship now per operator request.
const WLDEH = {
  twiasante: {
    cdnSlug: 'tw-wasna',
    bookSlugs: {
      Genesis: '1mose', Exodus: '2mose', Leviticus: '3mose', Numbers: '4mose', Deuteronomy: '5mose',
      Joshua: 'yosua', Judges: 'atemmufoɔ', Ruth: 'rut',
      '1 Samuel': '1samuel', '2 Samuel': '2samuel',
      '1 Kings': '1ahemfo', '2 Kings': '2ahemfo',
      '1 Chronicles': '1berɛsosɛm', '2 Chronicles': '2berɛsosɛm',
      Ezra: 'ɛsra', Nehemiah: 'nehemia', Esther: 'ɛster',
      Job: 'hiob', Psalms: 'nnwom', Proverbs: 'mmɛbusɛm',
      Ecclesiastes: 'ɔsɛnkafoɔ', 'Song of Solomon': 'nnwommudwom',
      Isaiah: 'yesaia', Jeremiah: 'yeremia', Lamentations: 'kwadwom',
      Ezekiel: 'hesekiel', Daniel: 'daniel',
      Hosea: 'hosea', Joel: 'yoɛl', Amos: 'amos', Obadiah: 'obadia',
      Jonah: 'yona', Micah: 'mika', Nahum: 'nahum', Habakkuk: 'habakuk',
      Zephaniah: 'sefania', Haggai: 'hagai', Zechariah: 'sakaria', Malachi: 'malaki',
      Matthew: 'mateo', Mark: 'marko', Luke: 'luka', John: 'yohane',
      Acts: 'asomafoɔ',
      Romans: 'romafoɔ',
      '1 Corinthians': '1korintofoɔ', '2 Corinthians': '2korintofoɔ',
      Galatians: 'galatifoɔ', Ephesians: 'efesofoɔ',
      Philippians: 'filipifoɔ', Colossians: 'kolosefoɔ',
      '1 Thessalonians': '1tesalonikafoɔ', '2 Thessalonians': '2tesalonikafoɔ',
      '1 Timothy': '1timoteo', '2 Timothy': '2timoteo',
      Titus: 'tito', Philemon: 'filemon',
      Hebrews: 'hebrifoɔ', James: 'yakobo',
      '1 Peter': '1petro', '2 Peter': '2petro',
      '1 John': '1yohane', '2 John': '2yohane', '3 John': '3yohane',
      Jude: 'yuda', Revelation: 'adiyisɛm',
    },
  },
  ewe: {
    cdnSlug: 'ee-oal',
    bookSlugs: {
      Genesis: 'mose1', Exodus: 'mose2', Leviticus: 'mose3', Numbers: 'mose4', Deuteronomy: 'mose5',
      Joshua: 'yosua', Judges: 'ʋɔnudrɔ̃lawo', Ruth: 'rut',
      '1 Samuel': 'samuel1', '2 Samuel': 'samuel2',
      '1 Kings': 'fiawo1', '2 Kings': 'fiawo2',
      '1 Chronicles': 'kronika1', '2 Chronicles': 'kronika2',
      Ezra: 'ezra', Nehemiah: 'nehemia', Esther: 'ester',
      Job: 'hiob', Psalms: 'psalmowo', Proverbs: 'lododowo',
      Ecclesiastes: 'nyagblɔla', 'Song of Solomon': 'hawo',
      Isaiah: 'yesaya', Jeremiah: 'yeremia', Lamentations: 'konyifahawo',
      Ezekiel: 'hezekiel', Daniel: 'daniel',
      Hosea: 'hosea', Joel: 'yoel', Amos: 'amos', Obadiah: 'obadia',
      Jonah: 'yona', Micah: 'mika', Nahum: 'nahum', Habakkuk: 'habakuk',
      Zephaniah: 'zefania', Haggai: 'hagai', Zechariah: 'zekaria', Malachi: 'malaki',
      Matthew: 'mateo', Mark: 'marko', Luke: 'luka', John: 'yohanes',
      Acts: 'dɔwɔwɔwo',
      Romans: 'romatɔwo',
      '1 Corinthians': 'korintotɔwo1', '2 Corinthians': 'korintotɔwo2',
      Galatians: 'galatiatɔwo', Ephesians: 'efesotɔwo',
      Philippians: 'filipitɔwo', Colossians: 'kolosetɔwo',
      '1 Thessalonians': 'tesalonikatɔwo1', '2 Thessalonians': 'tesalonikatɔwo2',
      '1 Timothy': 'timoteo1', '2 Timothy': 'timoteo2',
      Titus: 'tito', Philemon: 'filemon',
      Hebrews: 'hebritɔwo', James: 'yakobo',
      '1 Peter': 'petro1', '2 Peter': 'petro2',
      '1 John': 'yohanes1', '2 John': 'yohanes2', '3 John': 'yohanes3',
      Jude: 'yuda', Revelation: 'nyaɖeɖefia',
    },
  },
}

function bookId(book) {
  const idx = BOOK_ORDER.indexOf(book)
  return idx >= 0 ? idx + 1 : null
}

// v0.7.58 — Robust verse-text cleaner. The previous implementation was
// `text.replace(/<[^>]+>/g, '').trim()` which produced three categories
// of garbage in the bundled JSON:
//
//   1. KJV: bolls wraps Strong's numbers as `<S>1234</S>`. Stripping just
//      the tags left the bare number glued to the preceding word, so
//      99.96% of KJV verses looked like "In the beginning7225 God430
//      created1254 853 the heaven8064 and853 the earth776." Operators
//      reading from KJV could not project a single clean verse.
//
//   2. NIV: bolls inlines section headings, chapter titles, and Psalm
//      superscriptions into verse 1 (and the verse where each section
//      starts) separated by `<br/>`. With the old strip the separator
//      vanished and the heading welded onto the verse — e.g. John 3:1
//      became "Jesus Teaches NicodemusNow there was a man…". Same
//      mechanism welded poetry line breaks across the entire Psalter:
//      Psalm 23:4 read "Even though I walkthrough the valley of the
//      shadow of death,I will fear no evil,for you are with me;your
//      rod and your staff,they comfort me."
//
//   3. ESV: bolls leaves stray double / leading whitespace inside the
//      verse text, which the old strip never normalised. ~10% of ESV
//      verses had visible double-space artefacts on the projector.
//
// Plus inline `<sup>…</sup>` footnotes (KJV) bleeding into verse text,
// `&nbsp;` and similar entities, and italicised numerals like
// `<i>30</i>silver` welding the digits onto the next word.
//
// The cleaner below fixes all of the above by:
//   - removing `<S>NNNN</S>` and `<sup>…</sup>` content entirely
//   - converting `<br/>` to `\n` (poetry line breaks survive; the
//     verse-splitter at bible-api.ts already splits on `\n`)
//   - replacing every other tag with a single space (never the empty
//     string) so adjacent tagged words can never collide
//   - decoding the few HTML entities bolls actually emits
//   - normalising NBSP / zero-width chars and per-line whitespace
//   - fixing space-before-punctuation artefacts left by Strong's removal
//   - peeling off NIV editorial headings and Psalm superscriptions
//     while preserving real poetry first-lines (Psalm 23:4's
//     "Even though I walk" stays because the next line "through the
//     valley…" starts with a lowercase continuation, not a fresh
//     sentence).
function cleanVerseText(raw) {
  if (typeof raw !== 'string') return ''
  let s = raw

  // 1. Strip Strong's tags AND their numeric content (KJV).
  s = s.replace(/<S>[^<]*<\/S>/gi, '')

  // 2. Strip <sup>…</sup> footnote content (KJV inline footnotes).
  s = s.replace(/<sup>[^<]*<\/sup>/gi, '')

  // 3. Convert hard line breaks to newlines.
  s = s.replace(/<br\s*\/?>/gi, '\n')

  // 4. Strip every remaining tag, replacing with a SPACE so adjacent
  //    tagged tokens never collide (e.g. <i>30</i>silver → "30 silver").
  s = s.replace(/<[^>]+>/g, ' ')

  // 5. Decode the entities bolls actually emits.
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&hellip;/gi, '\u2026')

  // 6. Normalise unicode whitespace.
  s = s
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')

  // 7. Per-line: collapse runs of horizontal whitespace, trim, drop blanks.
  s = s
    .split('\n')
    .map((ln) => ln.replace(/[ \t]+/g, ' ').trim())
    .filter((ln) => ln.length > 0)
    .join('\n')

  // 8. Fix space-before-punctuation artefacts.
  s = s.replace(/[ \t]+([,.;:!?\)\]\u201D\u2019])/g, '$1')

  // 9. Peel off leading NIV editorial headings / Psalm superscriptions.
  while (s.includes('\n')) {
    const idx = s.indexOf('\n')
    const head = s.slice(0, idx)
    const rest = s.slice(idx + 1)
    if (!isEditorialHeading(head, rest)) break
    s = rest
  }

  // 10. Peel off TRAILING editorial postscripts. Some psalms (and
  //     Habakkuk 3:19) end with a musical direction tacked onto the
  //     final verse, e.g. "…the heights.\nFor the director of music.
  //     On my stringed instruments.". Only strong patterns are eligible
  //     here — weak title-case heuristics could falsely eat real
  //     poetic last-lines.
  while (s.includes('\n')) {
    const idx = s.lastIndexOf('\n')
    const tail = s.slice(idx + 1)
    if (!isStrongEditorial(tail)) break
    s = s.slice(0, idx)
  }

  return s
}

const STOP_WORDS = new Set([
  'a','an','and','of','the','to','for','in','on','at','by','with',
  'from','as','or','but','about','into','over','through','his','her','its',
])

// STRONG editorial patterns — unambiguous markers that are NEVER part
// of verse content. Used both as a head-strip rule (without any
// next-line safety gate, unlike the weak title-case rule) AND as a
// tail-strip rule for musical postscripts that appear at the END of a
// verse (Habakkuk 3:19: "…feet of a deer,\n…heights.\nFor the director
// of music. On my stringed instruments.").
function isStrongEditorial(text) {
  if (!text) return false

  // (a) Chapter title — "Psalm 119", "Song 1".
  if (/^(Psalm|Psalms|Song)\s+\d+$/i.test(text)) return true

  // (b) Hebrew acrostic markers in Psalm 119 — single Hebrew letter
  //     U+05D0..U+05EA optionally followed by an English transliteration
  //     ("א Aleph", "ב Beth", "ת Taw", and bare "א").
  if (/^[\u05D0-\u05EA](\s+[A-Z][A-Za-z]+)?$/.test(text)) return true

  // (c) Psalm superscriptions / musical directions. Always open with a
  //     small set of words ("A psalm of David.", "An ode…",
  //     "For the director of music. …", "Of David…", "To the tune…",
  //     "On my stringed instruments.") and end with `.` or `:`,
  //     optionally followed by a closing quote (Ps 52:1 ends with
  //     `."` because the superscription quotes Saul). Can be quite
  //     long — Psalm 18:1's superscription is ~210 chars; cap at 320
  //     for safety. Real verse content never opens with these words
  //     AND ends in `.`/`:` before a `<br/>`, because bolls only
  //     inserts `<br/>` for headings and poetry line breaks — and
  //     poetry lines end in `,` / `;` / no punctuation, not `.` / `:`.
  //
  //     Two terminator shapes are allowed:
  //       (i)  `.` or `:` optionally followed by a closing quote
  //            (covers most superscriptions — Ps 18:1 ends `:`,
  //            Ps 51:1 / 102:1 end `.`, Ps 52:1 ends `."`).
  //       (ii) `?` or `!` REQUIRED to be followed by a closing quote
  //            (covers Ps 54:1 which quotes the Ziphites:
  //            `…said, "Is not David hiding among us?"`). The closing
  //            quote is mandatory here so we never eat real poetic
  //            questions like Psalm 18:31 "For who is God besides the
  //            Lord?" (no quote, real verse).
  if (
    /^(A|An|For|Of|On|To)\b/.test(text) &&
    /(?:[\.:]["”’')\]]?|[?!]["”’')\]])$/.test(text) &&
    text.length <= 320
  ) return true

  return false
}

function isEditorialHeading(head, rest) {
  if (!head || !rest) return false

  // STRONG patterns are stripped without consulting the next chunk —
  // necessary because Psalm 119's chapter title "Psalm 119" is
  // followed by "א Aleph" (Hebrew, not Latin capital), so the
  // next-line-starts-capital safety gate below would refuse to strip
  // it. The strong rules are also reused for tail-stripping musical
  // postscripts (see cleanVerseText step 10).
  if (isStrongEditorial(head)) return true

  // WEAK pattern — Title-cased prose section heading like "Jesus
  // Teaches Nicodemus" or "John the Baptist's Testimony About Jesus".
  // The next-chunk-starts-capital gate is REQUIRED here so that poetry
  // first-lines like Psalm 23:4's "Even though I walk" are preserved
  // (its next line "through the valley…" starts with lowercase, so the
  // gate correctly refuses to treat the first line as a heading).
  if (head.length > 90) return false
  if (/[,;:\u2014\u2013]$/.test(head)) return false
  const nextFirstLine = rest.split('\n', 1)[0].trim()
  if (!/^[A-Z\u201C\u2018"']/.test(nextFirstLine)) return false
  const words = head.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 12) return false
  let upper = 0, content = 0
  for (const w of words) {
    const stripped = w.replace(/[^A-Za-z']/g, '')
    if (!stripped) continue
    if (STOP_WORDS.has(stripped.toLowerCase())) continue
    content++
    if (/^[A-Z]/.test(stripped)) upper++
  }
  if (content === 0) return false
  return upper / content >= 0.6
}

async function fetchChapter(translation, book, chapter) {
  const id = bookId(book)
  const url = `https://bolls.life/get-text/${translation.toUpperCase()}/${id}/${chapter}/`
  // v0.7.164 — bolls.life enforces an undocumented per-IP rate-limit
  // (~5 req/s) that triggers HTTP 429 in bursts. Earlier 4-attempt
  // exponential schedule (0.5/1/2/4 s) was too short — by attempt 4
  // the burst was still in progress and the chapter was abandoned.
  // Bumped to 8 attempts with a longer base + 429-aware sleep that
  // honours `Retry-After` when present so we wait the actual cool-off
  // instead of guessing.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } })
      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get('retry-after') || '0', 10)
        const wait = Math.max(retryAfter * 1000, 1500 * Math.pow(2, Math.min(attempt, 5)))
        console.warn(`  429 ${book} ${chapter} (${translation}) attempt ${attempt + 1}; sleep ${wait}ms`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      if (!Array.isArray(data)) throw new Error('not array')
      const out = {}
      for (const v of data) {
        if (v && typeof v.verse === 'number' && typeof v.text === 'string') {
          const cleaned = cleanVerseText(v.text)
          if (cleaned) out[v.verse] = cleaned
        }
      }
      return out
    } catch (e) {
      const wait = 800 * Math.pow(2, Math.min(attempt, 5))
      console.warn(`  retry ${book} ${chapter} (${translation}) attempt ${attempt + 1}: ${e.message}; sleep ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  console.error(`  FAIL ${translation} ${book} ${chapter} — leaving empty`)
  return {}
}

// v0.7.137 — wldeh chapter fetcher. Returns a map of {verseNum: text}
// shaped exactly like fetchChapter() above so bundleTranslation()
// stays source-agnostic.
async function fetchWldehChapter(translation, book, chapter) {
  const cfg = WLDEH[translation]
  if (!cfg) return {}
  const slug = cfg.bookSlugs[book]
  if (!slug) return {}
  // v0.7.163 — Use raw.githubusercontent.com instead of jsdelivr.net.
  // jsdelivr was timing out / serving slow from CI networks (5+ s per
  // chapter); raw.githubusercontent.com responds in ~250 ms, turning a
  // 6-hour bundle into a ~5-minute one. Runtime fetcher in
  // src/lib/bibles/twi-bible.ts still uses jsdelivr (cached at the edge
  // for live-service hot paths) — only the offline-bundle phase
  // switches to the raw mirror.
  const url = `https://raw.githubusercontent.com/wldeh/bible-api/master/bibles/${cfg.cdnSlug}/books/${encodeURIComponent(slug)}/chapters/${chapter}.json`
  // v0.7.163 — Authenticated raw.githubusercontent.com fetch when
  // GH_PAT (or GITHUB_TOKEN) is present in the env. Anonymous hits
  // are throttled to 60/hr per IP which makes a 3567-chapter bundle
  // (3 wldeh translations × 1189 chapters) impossible on CI; an
  // authenticated session raises the ceiling to 5000/hr, fitting
  // the full bundle into ~5 minutes wall-clock.
  const ghHeaders = { Accept: 'application/json' }
  const ghToken = process.env.GH_PAT || process.env.GITHUB_TOKEN
  if (ghToken) ghHeaders.Authorization = `Bearer ${ghToken}`
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: ghHeaders })
      if (!r.ok) {
        // 404 = chapter doesn't exist in this translation (some
        // small books have variable chapter counts upstream). Don't
        // retry — just return empty so the bundle stays consistent.
        if (r.status === 404) return {}
        // 403 = secondary rate limit / abuse detection. Honour the
        // x-ratelimit-reset header by sleeping until then (capped
        // at 60 s so we don't deadlock the bundle for an hour).
        if (r.status === 403) {
          const reset = parseInt(r.headers.get('x-ratelimit-reset') || '0', 10)
          const now = Math.floor(Date.now() / 1000)
          const waitSec = Math.min(60, Math.max(2, reset - now))
          console.warn(`  rate-limited ${book} ${chapter} (${translation}/${cfg.cdnSlug}); sleeping ${waitSec}s`)
          await new Promise((res) => setTimeout(res, waitSec * 1000))
          continue
        }
        throw new Error(`HTTP ${r.status}`)
      }
      const data = await r.json()
      const rows = Array.isArray(data && data.data) ? data.data : []
      const out = {}
      for (const row of rows) {
        const v = typeof row.verse === 'string' ? parseInt(row.verse, 10) : Number(row.verse)
        const text = typeof row.text === 'string' ? row.text.trim() : ''
        if (Number.isFinite(v) && v > 0 && text) out[v] = text
      }
      return out
    } catch (e) {
      const wait = 500 * Math.pow(2, attempt)
      console.warn(`  retry ${book} ${chapter} (${translation}/${cfg.cdnSlug}) attempt ${attempt + 1}: ${e.message}; sleep ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  console.error(`  FAIL ${translation} ${book} ${chapter} — leaving empty`)
  return {}
}

async function bundleTranslation(translation) {
  const outFile = path.join(OUT_DIR, `${translation.toLowerCase()}.json`)
  // v0.7.163 — Incremental, resumable bundling. Load whatever's
  // already in the file (could be a partial bundle from a previous
  // run that got SIGKILLed by the CI watchdog) and only fetch books
  // that aren't fully populated yet. Save after every book so the
  // next invocation can pick up where this one left off without
  // refetching anything. FORCE=1 wipes the existing file first so
  // operators can force a clean redownload after an upstream change.
  if (process.env.FORCE && fs.existsSync(outFile)) {
    fs.writeFileSync(outFile, '{}')
  }
  let result = {}
  if (fs.existsSync(outFile)) {
    try { result = JSON.parse(fs.readFileSync(outFile, 'utf8')) || {} } catch { result = {} }
  }
  // Decide if the existing bundle is already complete (every expected
  // book/chapter has at least one verse). Skip in that case so daily
  // CI runs are no-ops.
  let missingChapters = 0
  for (const book of BOOK_ORDER) {
    const chCount = STRUCTURE[book].length
    for (let c = 1; c <= chCount; c++) {
      const got = result[book]?.[c]
      if (!got || Object.keys(got).length === 0) missingChapters++
    }
  }
  if (missingChapters === 0 && Object.keys(result).length === BOOK_ORDER.length && !process.env.FORCE) {
    console.log(`[skip] ${translation} already complete (${BOOK_ORDER.length} books)`)
    return
  }
  const isWldeh = translation in WLDEH
  console.log(`[start] downloading ${translation.toUpperCase()} from ${isWldeh ? `wldeh/bible-api (${WLDEH[translation].cdnSlug})` : 'bolls.life'} — ${missingChapters} chapters still missing`)
  // v0.7.164 — Per-source concurrency. wldeh/raw.github happily takes
  // 12 parallel streams with auth (5000 req/hr ceiling). bolls.life
  // 429s past ~3 concurrent (no published ceiling, observed empirically
  // — concurrency 12 produced a 429 storm that wiped the NKJV run).
  // Pin bolls to 3 — slower (~6-8 min/translation vs ~2-3) but
  // actually completes.
  const concurrency = isWldeh ? 12 : 3
  let done = 0
  let totalDoneSinceSave = 0
  for (const book of BOOK_ORDER) {
    const chCount = STRUCTURE[book].length
    if (!result[book]) result[book] = {}
    const queue = []
    for (let c = 1; c <= chCount; c++) {
      const have = result[book][c]
      if (!have || Object.keys(have).length === 0) queue.push(c)
    }
    if (queue.length === 0) continue
    let cursor = 0
    async function worker() {
      while (true) {
        const ch = queue[cursor++]
        if (ch === undefined) return
        const verses = isWldeh
          ? await fetchWldehChapter(translation, book, ch)
          : await fetchChapter(translation, book, ch)
        result[book][ch] = verses
        done++
        totalDoneSinceSave++
        if (done % 50 === 0) {
          process.stdout.write(`  ${translation} ${done} new chapters fetched (${book} ${ch})\n`)
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    // Persist after every book so a SIGKILL can't undo this book's work.
    if (totalDoneSinceSave > 0) {
      fs.writeFileSync(outFile, JSON.stringify(result))
      totalDoneSinceSave = 0
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(result))
  const bytes = fs.statSync(outFile).size
  console.log(`[ok]   ${translation} → ${outFile} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
}

;(async () => {
  for (const t of TRANSLATIONS) {
    await bundleTranslation(t)
  }
  console.log('[done]')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
