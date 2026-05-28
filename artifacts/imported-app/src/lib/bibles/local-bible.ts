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

// v0.7.168 — Server-side filesystem fallback. In packaged Electron
// (`output: 'standalone'` + electron-builder) the 4-MB-each bible JSONs
// can be split out of the webpack chunk graph instead of inlined; when
// that happens the `require('@/data/bibles/<key>.json')` below resolves
// to an empty object at runtime and `isTranslationBundled` returns
// false, dropping the operator to the online fetch path. Offline service
// then breaks. We fix this in TWO complementary places:
//   (1) next.config.ts adds `outputFileTracingIncludes` so the literal
//       `src/data/bibles/*.json` files are guaranteed to be copied into
//       `.next/standalone/artifacts/imported-app/src/data/bibles/`.
//   (2) The fallback below tries to read the file directly via `fs`
//       when the webpack require returned an empty stub. Three
//       candidate paths cover dev (artifact root cwd), packaged
//       Electron (standalone artifact cwd), and any unexpected
//       working-directory drift.
// The fallback is server-only (`typeof window === 'undefined'`); the
// renderer keeps using the webpack-inlined chunk path which DOES work
// reliably client-side because the JSON ends up in static chunks the
// postbuild script copies wholesale.
function fsFallback(t: BibleTranslation): TranslationMap | null {
  if (typeof window !== 'undefined') return null
  try {
    // v0.7.171 — `require('node:fs')` and `require('node:path')` MUST
    // be resolved through `eval('require')` rather than the static
    // `require()` form. Reason: `local-bible.ts` is imported by the
    // client component `live-translation-sync.tsx`, which means
    // webpack's CLIENT pass for the production build follows it into
    // the page bundle. Static `require('node:fs')` is statically
    // detected by webpack 5 and crashes with `UnhandledSchemeError:
    // Reading from "node:fs" is not handled by plugins (Unhandled
    // scheme)` — this broke the GitHub Actions Windows installer
    // build for v0.7.168/v0.7.169/v0.7.170 even though it ran fine in
    // dev under Turbopack. `eval('require')` evaluates at runtime so
    // the bundler never sees it on the client side; on the Node side
    // it resolves normally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-eval
    const nodeRequire: NodeJS.Require = eval('require')
    const fs = nodeRequire('node:fs') as typeof import('node:fs')
    const path = nodeRequire('node:path') as typeof import('node:path')
    const fname = `${t}.json`
    const candidates = [
      path.join(process.cwd(), 'src', 'data', 'bibles', fname),
      // Standalone packaged path (process.cwd() === .next/standalone/artifacts/imported-app)
      path.join(process.cwd(), 'artifacts', 'imported-app', 'src', 'data', 'bibles', fname),
      // Resolve-from-here as last resort. `__dirname` only exists in
      // CJS contexts; guard with typeof to keep ESM/edge happy.
      ...(typeof __dirname !== 'undefined'
        ? [path.join(__dirname, '..', '..', 'data', 'bibles', fname)]
        : []),
    ]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const txt = fs.readFileSync(p, 'utf8')
          const parsed = JSON.parse(txt) as unknown
          if (isPopulated(parsed)) return parsed
        }
      } catch {
        /* try next candidate */
      }
    }
  } catch {
    /* fs/path unavailable (browser) — caller already short-circuited */
  }
  return null
}

function loadTranslation(tRaw: BibleTranslation): TranslationMap | null {
  // v0.7.261 — CRITICAL: normalize translation key to lowercase.
  // The store stores defaultTranslation as 'KJV' (uppercase) but the
  // switch below and the bundled JSON filenames are all lowercase
  // ('kjv.json'). Without this normalization, every lookupVerse /
  // lookupRange / lookupChapter call from the renderer with an
  // uppercase translation hits `default: mod = null` and falls through
  // to the online fetch — which in offline-Electron returns nothing,
  // and in the AUTO LIVE / sendDetected paths silently falls back to
  // `best.text` (the trigger paraphrase for SEMANTIC detections), so
  // the projector showed paraphrases instead of canonical verses.
  // This was the root cause of v0.7.253 and v0.7.260 "shipping a fix
  // that did nothing" — the lookup never returned a hit, the fallback
  // always fired. Normalizing here covers every call site in one
  // shot (speech-provider, logos-shell, live-translation-sync).
  const t = String(tRaw).trim().toLowerCase() as BibleTranslation
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
    let resolved = isPopulated(unwrapped) ? unwrapped : null
    if (!resolved) {
      // v0.7.168 — webpack returned an empty stub (or chunk-split the
      // 4 MB JSON in a way that didn't inline). Try the server-side
      // filesystem fallback before giving up.
      resolved = fsFallback(t)
    }
    cache[t] = resolved
    return resolved
  } catch {
    // require() failure (stub missing in some pathological dev setup
    // or bundler chunk-split). Try fs fallback once more before
    // surrendering to the online path.
    const resolved = fsFallback(t)
    cache[t] = resolved
    return resolved
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

/** v0.7.172 — Look up a whole chapter from the bundled JSON. Returns
 *  the verse list in the shape the `/api/bible?book=&chapter=` route
 *  emits (`{ verse, text }[]`). Returns null when the translation
 *  isn't bundled OR the chapter address isn't in the data. Used by
 *  the Chapter Navigator path so TWIASANTE / EWE / KJV / NIV / ESV /
 *  NKJV / NLT / AMP chapters work offline (the prior code only
 *  short-circuited single-verse lookups, leaving chapter mode going
 *  straight to the network and failing offline with "Chapter not
 *  found"). */
export function lookupChapter(
  book: string,
  chapter: number,
  translation: BibleTranslation,
): Array<{ verse: number; text: string }> | null {
  const data = loadTranslation(translation)
  if (!data) return null
  const b = data[book]
  if (!b) return null
  const c = b[String(chapter)]
  if (!c) return null
  const out: Array<{ verse: number; text: string }> = []
  for (const k of Object.keys(c)) {
    const n = Number(k)
    if (!Number.isFinite(n) || n < 1) continue
    const text = c[k]
    if (typeof text === 'string' && text.trim()) {
      out.push({ verse: n, text: text.trim() })
    }
  }
  if (!out.length) return null
  out.sort((a, b) => a.verse - b.verse)
  return out
}
