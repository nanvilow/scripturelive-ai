// v0.5.52 — Offline Bible lookup against the bundled JSON in
// src/data/bibles/{kjv,niv,esv}.json. Each translation file is shaped
// `{ [book]: { [chapter]: { [verse]: text } } }` keyed by the
// canonical book name from src/data/bible-structure.json.
//
// Loading is lazy + synchronous via `require()` so the cost of pulling
// in ~5 MB of JSON is paid only when the operator first hits a verse.
// The Electron build inlines these files into the standalone bundle.
// If a translation file is missing (e.g. NIV/ESV bundle skipped at
// build time), `lookupVerse` returns null and callers should fall
// back to their existing bolls.life fetch path.

import type { BibleTranslation } from '@/lib/store'

type ChapterMap = Record<string, string>
type BookMap = Record<string, ChapterMap>
type TranslationMap = Record<string, BookMap>

const cache: Partial<Record<BibleTranslation, TranslationMap | null>> = {}

function loadTranslation(t: BibleTranslation): TranslationMap | null {
  if (t in cache) return cache[t] ?? null
  try {
    // Webpack/Turbopack will pull these into the client bundle. Each
    // file is keyed exactly to the canonical book name from
    // bible-structure.json.
    let mod: unknown = null
    switch (t) {
      case 'kjv':
        mod = require('@/data/bibles/kjv.json')
        break
      case 'niv':
        mod = require('@/data/bibles/niv.json')
        break
      case 'esv':
        mod = require('@/data/bibles/esv.json')
        break
      default:
        mod = null
    }
    const data = (mod as { default?: TranslationMap } | TranslationMap | null)
    const resolved =
      data && typeof data === 'object' && 'default' in (data as object)
        ? ((data as { default?: TranslationMap }).default ?? null)
        : (data as TranslationMap | null)
    cache[t] = resolved
    return resolved
  } catch {
    cache[t] = null
    return null
  }
}

/** Whether the bundled JSON for a translation is available. */
export function isTranslationBundled(t: BibleTranslation): boolean {
  return loadTranslation(t) != null
}

/** Look up a single verse. Returns null when the translation isn't
 *  bundled OR the address isn't present in the bundled data. */
export function lookupVerse(
  book: string,
  chapter: number,
  verse: number,
  translation: BibleTranslation,
): string | null {
  const data = loadTranslation(translation)
  if (!data) return null
  const b = data[book]
  if (!b) return null
  const c = b[String(chapter)]
  if (!c) return null
  const v = c[String(verse)]
  return typeof v === 'string' ? v : null
}

/** Look up an inclusive verse range. Each verse becomes a separate
 *  newline-joined line so callers can split on `\n` to render verse
 *  numbers. Returns null when the translation isn't bundled or the
 *  range is empty. */
export function lookupRange(
  book: string,
  chapter: number,
  vStart: number,
  vEnd: number,
  translation: BibleTranslation,
): { lines: string[]; text: string } | null {
  const data = loadTranslation(translation)
  if (!data) return null
  const b = data[book]
  if (!b) return null
  const c = b[String(chapter)]
  if (!c) return null
  const lines: string[] = []
  for (let v = vStart; v <= vEnd; v++) {
    const text = c[String(v)]
    if (typeof text === 'string' && text.trim()) {
      lines.push(`${v} ${text.trim()}`)
    }
  }
  if (!lines.length) return null
  return { lines, text: lines.join('\n') }
}
