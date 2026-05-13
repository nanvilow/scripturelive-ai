// v0.5.52 — Offline Bible lookup against the bundled JSON in
// src/data/bibles/{kjv,niv,esv}.json. Each translation file is shaped
// `{ [book]: { [chapter]: { [verse]: text } } }` keyed by the
// canonical book name from src/data/bible-structure.json.
//
// Loading is lazy + synchronous via `require()` so the cost of pulling
// in ~5 MB of JSON is paid only when the operator first hits a verse.
// The Electron build inlines these files into the standalone bundle.
//
// scripts/bundle-bibles.mjs guarantees that empty `{}` stub files
// always exist (it writes them at the top of the script before any
// download runs), so the static `require()` calls below NEVER fail at
// build time even when the operator skips the download step. At
// runtime an empty stub yields a 0-key TranslationMap and
// `isTranslationBundled` returns false, so callers transparently fall
// through to the existing bolls.life / bible-api fetch path.

import type { BibleTranslation } from '@/lib/store'

type ChapterMap = Record<string, string>
type BookMap = Record<string, ChapterMap>
type TranslationMap = Record<string, BookMap>

const cache: Partial<Record<BibleTranslation, TranslationMap | null>> = {}

function isPopulated(d: unknown): d is TranslationMap {
  // Treat `{}` and non-objects as "not bundled" so callers fall back
  // to the online fetch path. A real bundle has 39+ book keys.
  return (
    !!d &&
    typeof d === 'object' &&
    !Array.isArray(d) &&
    Object.keys(d as Record<string, unknown>).length > 0
  )
}

function loadTranslation(t: BibleTranslation): TranslationMap | null {
  if (t in cache) return cache[t] ?? null
  try {
    // Webpack/Turbopack pull these into the client bundle. Stubs are
    // guaranteed by scripts/bundle-bibles.mjs so resolution never
    // fails. Each populated file is keyed by the canonical book name
    // from bible-structure.json.
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
      // v0.7.164 — NKJV/NLT/AMP added per operator request: "somewhere
      // in between" between bundling everything and only the safe
      // public-domain set. Same copyright stance as the existing
      // NIV/ESV bundling decision (v0.5.52). Sourced from bolls.life
      // by scripts/bundle-bibles.mjs alongside the existing English
      // trio. Each case follows the same require/stub pattern so the
      // build succeeds even when the operator skipped the download.
      case 'nkjv':
        mod = require('@/data/bibles/nkjv.json')
        break
      case 'nlt':
        mod = require('@/data/bibles/nlt.json')
        break
      case 'amp':
        mod = require('@/data/bibles/amp.json')
        break
      // v0.7.137 — Ghanaian translations bundled offline so the
      // Electron desktop build keeps working without an internet
      // connection during a live service. wldeh/bible-api source.
      // v0.7.163 — TWI (Akuapem) case removed; only TWIASANTE + EWE
      // ship now per operator request.
      case 'twiasante':
        mod = require('@/data/bibles/twiasante.json')
        break
      case 'ewe':
        mod = require('@/data/bibles/ewe.json')
        break
      default:
        mod = null
    }
    const raw = (mod as { default?: unknown } | unknown)
    const unwrapped =
      raw && typeof raw === 'object' && 'default' in (raw as object)
        ? (raw as { default?: unknown }).default
        : raw
    const resolved = isPopulated(unwrapped) ? unwrapped : null
    cache[t] = resolved
    return resolved
  } catch {
    // require() failure (stub missing in some pathological dev setup)
    // → behave exactly like the empty-stub case so the speech path
    // still works via the online fallback.
    cache[t] = null
    return null
  }
}

/** Whether the bundled JSON for a translation is populated (not just a
 *  build-time `{}` stub). Callers should use this to short-circuit
 *  online fetches when bundled data is available. */
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
