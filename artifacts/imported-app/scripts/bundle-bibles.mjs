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
          out[v.verse] = v.text.replace(/<[^>]+>/g, '').trim()
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
