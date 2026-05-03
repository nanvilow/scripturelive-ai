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
const TRANSLATIONS = (process.argv.slice(2).length ? process.argv.slice(2) : ['kjv', 'niv', 'esv'])
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
for (const t of ['kjv', 'niv', 'esv']) {
  const f = path.join(OUT_DIR, `${t}.json`)
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, '{}')
    console.log(`[stub]  wrote empty ${t}.json so the next build never errors on a missing import`)
  }
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
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } })
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
      const wait = 500 * Math.pow(2, attempt)
      console.warn(`  retry ${book} ${chapter} (${translation}) attempt ${attempt + 1}: ${e.message}; sleep ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  console.error(`  FAIL ${translation} ${book} ${chapter} — leaving empty`)
  return {}
}

async function bundleTranslation(translation) {
  const outFile = path.join(OUT_DIR, `${translation.toLowerCase()}.json`)
  if (fs.existsSync(outFile) && !process.env.FORCE) {
    console.log(`[skip] ${translation} (${outFile} exists; set FORCE=1 to redownload)`)
    return
  }
  console.log(`[start] downloading ${translation.toUpperCase()} from bolls.life`)
  const result = {}
  const concurrency = 12
  const queue = []
  for (const book of BOOK_ORDER) {
    const chCount = STRUCTURE[book].length
    for (let c = 1; c <= chCount; c++) queue.push({ book, chapter: c })
  }
  let done = 0
  const total = queue.length
  let cursor = 0
  async function worker() {
    while (true) {
      const job = queue[cursor++]
      if (!job) return
      const ch = await fetchChapter(translation, job.book, job.chapter)
      if (!result[job.book]) result[job.book] = {}
      result[job.book][job.chapter] = ch
      done++
      if (done % 50 === 0) {
        process.stdout.write(`  ${translation} ${done}/${total} chapters\n`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
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
