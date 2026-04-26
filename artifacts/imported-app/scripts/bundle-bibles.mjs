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

const TRANSLATIONS = (process.argv.slice(2).length ? process.argv.slice(2) : ['kjv'])
  .map((t) => t.toLowerCase())

const OUT_DIR = path.join(repoRoot, 'src/data/bibles')
fs.mkdirSync(OUT_DIR, { recursive: true })

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
