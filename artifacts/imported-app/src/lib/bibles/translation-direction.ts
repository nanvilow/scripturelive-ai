// v0.7.199 — Translation reading direction (LTR / RTL).
//
// Returns 'rtl' for Bible translations whose original script reads
// right-to-left (Hebrew, Arabic, Aramaic), 'ltr' for everything else.
// The renderers (slide-renderer.tsx React tree + congregation/route.ts
// inline HTML) read this and set `dir=` on the verse container so that:
//   - punctuation lands on the correct side
//   - verse numbers render to the right of the text in RTL scripts
//   - line breaks honor the script's natural flow
//
// Currently bundled translations (kjv/niv/esv/nlt/nkjv/amp/twiasante/ewe)
// are all LTR — so this helper is PLUMBING that future-proofs the
// renderer for the day a Hebrew Tanakh / Arabic SVD / Aramaic Peshitta
// JSON is added to src/data/bibles/. Adding such a translation just
// requires the operator to bundle the JSON and add its id to the
// RTL_TRANSLATION_IDS set below — no renderer changes needed.
//
// Detection precedence:
//   1. Exact match in RTL_TRANSLATION_IDS (case-insensitive)
//   2. Prefix match against any RTL_TRANSLATION_PREFIXES entry
//   3. Otherwise default to 'ltr'

const RTL_TRANSLATION_IDS = new Set<string>([
  // Hebrew (Tanakh / Modern Hebrew Bible)
  'wlc',          // Westminster Leningrad Codex
  'bhs',          // Biblia Hebraica Stuttgartensia
  'hebmodern',    // Modern Hebrew Bible
  'hhh',          // Habrit Hakhadasha / Haderech
  // Arabic
  'arabicsvd',    // Smith-Van Dyke (the standard Arabic Bible)
  'avb',          // Arabic Van Dyke (alias)
  'nav',          // New Arabic Version (Ketab El Hayat)
  'gnb-ar',       // Good News Arabic
  // Aramaic / Syriac
  'peshitta',
  'aramaic',
  // Farsi/Persian (Persian uses Arabic script, reads RTL)
  'pcb',          // Persian Contemporary Bible
  'farsi',
  // Urdu (uses Perso-Arabic script)
  'urdu',
])

const RTL_TRANSLATION_PREFIXES = [
  'heb',       // hebXXX
  'arabic',    // arabicXXX
  'aramaic',
  'syriac',
  'farsi',
  'persian',
  'urdu',
]

export type ReadingDirection = 'ltr' | 'rtl'

export function getTranslationDirection(translation: string | undefined | null): ReadingDirection {
  if (!translation) return 'ltr'
  const id = String(translation).trim().toLowerCase()
  if (!id) return 'ltr'
  if (RTL_TRANSLATION_IDS.has(id)) return 'rtl'
  for (const prefix of RTL_TRANSLATION_PREFIXES) {
    if (id.startsWith(prefix)) return 'rtl'
  }
  return 'ltr'
}

// Convenience: returns the CSS `dir` value or undefined when LTR (so
// callers can spread `{ dir: getDirAttribute(...) }` and only emit the
// attribute on RTL — keeps the LTR DOM identical to pre-v0.7.199).
export function getDirAttribute(translation: string | undefined | null): 'rtl' | undefined {
  return getTranslationDirection(translation) === 'rtl' ? 'rtl' : undefined
}
