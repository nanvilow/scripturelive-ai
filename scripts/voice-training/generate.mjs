// scripts/voice-training/generate.mjs
//
// v0.7.19 — Voice training-dataset generator.
//
// Produces src/data/voice-training.json — a structured corpus of how
// preachers naturally phrase commands, scripture references, partial
// quotations, and back-channel utterances. The runtime voice-command
// parser (src/lib/voice/commands.ts) consumes the dataset to:
//
//   - extend its FILLER_UTTERANCES set from the "Ignore" entries,
//   - power an exact-match fast-path that wins before rule matching
//     for known phrasings (any "raw" string that appears in the
//     dataset is dispatched directly using the labelled intent),
//   - seed translation alias variants and verse-navigation patterns.
//
// The dataset is generated PROGRAMMATICALLY from template tables
// rather than hand-curated, so the operator can grow it from ~2,500
// entries up to 5,000+ by adding rows to the template arrays in
// this file and re-running:
//
//     pnpm --filter @workspace/imported-app run training:generate
//
// Output schema (each entry):
//
//   {
//     "raw": "Give me message version",
//     "normalized": "give me message version",
//     "intent": "Translation Change",
//     "entities": { "translation": "MSG" },
//     "confidence": 95
//   }
//
// Intent vocabulary — DO NOT add new intents; the parser only
// dispatches the seven below:
//
//   Scripture Request | Partial Verse Match | Translation Change |
//   Navigation | Media Control | Clear Screen | Ignore

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(REPO_ROOT, 'src', 'data', 'voice-training.json')

// ── Word-number lookup (for "John three sixteen" style phrasings) ────
const NUMBER_WORDS = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
  11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
  15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen',
  19: 'nineteen', 20: 'twenty', 21: 'twenty one', 22: 'twenty two',
  23: 'twenty three', 24: 'twenty four', 25: 'twenty five',
  26: 'twenty six', 27: 'twenty seven', 28: 'twenty eight',
  29: 'twenty nine', 30: 'thirty',
}
const numWord = (n) => NUMBER_WORDS[n] ?? String(n)

// ── Scripture reference templates ─────────────────────────────────────
//
// Top 50 most-cited verses in evangelical preaching. Each will be
// expanded into ~12 phrasings (bare, with chapter/verse words, with
// "book of" prefix, with "let's go to / open / turn to" lead-in,
// with number-word substitution, etc.) — yielding ~600 entries from
// this section alone.
const POPULAR_VERSES = [
  ['John', 3, 16],
  ['John', 1, 1],
  ['John', 14, 6],
  ['Genesis', 1, 1],
  ['Psalm', 23, 1],
  ['Psalm', 23, 4],
  ['Psalm', 27, 1],
  ['Psalm', 91, 1],
  ['Psalm', 119, 105],
  ['Psalm', 46, 10],
  ['Romans', 8, 28],
  ['Romans', 6, 23],
  ['Romans', 12, 1],
  ['Romans', 12, 2],
  ['Romans', 10, 9],
  ['Philippians', 4, 13],
  ['Philippians', 4, 6],
  ['Philippians', 4, 19],
  ['Ephesians', 2, 8],
  ['Ephesians', 6, 11],
  ['Ephesians', 6, 12],
  ['Galatians', 5, 22],
  ['Galatians', 2, 20],
  ['1 Corinthians', 13, 4],
  ['1 Corinthians', 13, 13],
  ['2 Corinthians', 5, 17],
  ['Hebrews', 11, 1],
  ['Hebrews', 11, 6],
  ['Hebrews', 13, 5],
  ['James', 1, 2],
  ['James', 4, 7],
  ['1 Peter', 5, 7],
  ['1 John', 4, 8],
  ['1 John', 4, 19],
  ['Matthew', 6, 33],
  ['Matthew', 11, 28],
  ['Matthew', 28, 19],
  ['Matthew', 28, 20],
  ['Mark', 16, 15],
  ['Luke', 1, 37],
  ['Acts', 1, 8],
  ['Acts', 2, 38],
  ['Isaiah', 41, 10],
  ['Isaiah', 53, 5],
  ['Isaiah', 40, 31],
  ['Jeremiah', 29, 11],
  ['Proverbs', 3, 5],
  ['Proverbs', 3, 6],
  ['Joshua', 1, 9],
  ['Deuteronomy', 31, 6],
]

// Phrasings each verse gets expanded into. {book}, {ch}, {v},
// {chWord}, {vWord} are templated.
const SCRIPTURE_PHRASINGS = [
  '{book} {ch}:{v}',
  '{book} {ch} {v}',
  '{book} chapter {ch} verse {v}',
  '{book} chapter {chWord} verse {vWord}',
  '{book} {chWord} {vWord}',
  'Book of {book} {ch}:{v}',
  'Book of {book} chapter {ch} verse {v}',
  "Let's go to {book} {ch}:{v}",
  'Open {book} {ch}:{v}',
  'Turn to {book} {ch}:{v}',
  'Bring up {book} {ch}:{v}',
  'Pull up {book} {ch}:{v}',
  'Show me {book} {ch}:{v}',
  'Read {book} {ch}:{v}',
  'Go to {book} {ch}:{v}',
  'Display {book} {ch}:{v}',
  'Jump to {book} {ch}:{v}',
]

// "1 John" → "First John" / "Psalm" → "Psalms" alternates.
function bookAlternates(book) {
  const alts = new Set([book])
  if (book.startsWith('1 ')) alts.add('First ' + book.slice(2))
  if (book.startsWith('2 ')) alts.add('Second ' + book.slice(2))
  if (book.startsWith('3 ')) alts.add('Third ' + book.slice(2))
  if (book === 'Psalm') alts.add('Psalms')
  if (book === 'Psalms') alts.add('Psalm')
  return [...alts]
}

function expandTemplate(tpl, ctx) {
  return tpl
    .replaceAll('{book}', ctx.book)
    .replaceAll('{ch}', String(ctx.ch))
    .replaceAll('{v}', String(ctx.v))
    .replaceAll('{chWord}', numWord(ctx.ch))
    .replaceAll('{vWord}', numWord(ctx.v))
}

// ── Famous partial-verse text snippets ───────────────────────────────
//
// First-N-words slices of well-known passages. The runtime engine
// treats these as Partial Verse Match → it does NOT dispatch a
// command, but it DOES seed the fuzzy-match index so the existing
// reference engine has a higher chance of correctly resolving the
// verse from a partial quotation.
const PARTIAL_QUOTES = [
  ['In the beginning was the Word', 'John', 1, 1],
  ['In the beginning was the Word and the Word was with God', 'John', 1, 1],
  ['In the beginning God created the heaven and the earth', 'Genesis', 1, 1],
  ['In the beginning God created', 'Genesis', 1, 1],
  ['The Lord is my shepherd', 'Psalm', 23, 1],
  ['The Lord is my shepherd I shall not want', 'Psalm', 23, 1],
  ['Yea though I walk through the valley', 'Psalm', 23, 4],
  ['Though I walk through the valley of the shadow of death', 'Psalm', 23, 4],
  ['I can do all things through Christ', 'Philippians', 4, 13],
  ['I can do all things through Christ which strengtheneth me', 'Philippians', 4, 13],
  ['For God so loved the world', 'John', 3, 16],
  ['For God so loved the world that he gave', 'John', 3, 16],
  ['I am the way the truth and the life', 'John', 14, 6],
  ['Be still and know that I am God', 'Psalm', 46, 10],
  ['Trust in the Lord with all thine heart', 'Proverbs', 3, 5],
  ['Lean not unto thine own understanding', 'Proverbs', 3, 5],
  ['In all thy ways acknowledge him', 'Proverbs', 3, 6],
  ['And we know that all things work together for good', 'Romans', 8, 28],
  ['For the wages of sin is death', 'Romans', 6, 23],
  ['But God commendeth his love toward us', 'Romans', 5, 8],
  ['By grace are ye saved through faith', 'Ephesians', 2, 8],
  ['Faith is the substance of things hoped for', 'Hebrews', 11, 1],
  ['Without faith it is impossible to please him', 'Hebrews', 11, 6],
  ['Casting all your care upon him', '1 Peter', 5, 7],
  ['He careth for you', '1 Peter', 5, 7],
  ['Submit yourselves therefore to God', 'James', 4, 7],
  ['Resist the devil and he will flee from you', 'James', 4, 7],
  ['God is love', '1 John', 4, 8],
  ['We love him because he first loved us', '1 John', 4, 19],
  ['Come unto me all ye that labour', 'Matthew', 11, 28],
  ['Take my yoke upon you and learn of me', 'Matthew', 11, 29],
  ['Seek ye first the kingdom of God', 'Matthew', 6, 33],
  ['Go ye therefore and teach all nations', 'Matthew', 28, 19],
  ['Lo I am with you alway', 'Matthew', 28, 20],
  ['Ye shall receive power after that the Holy Ghost is come upon you', 'Acts', 1, 8],
  ['Repent and be baptized every one of you', 'Acts', 2, 38],
  ['Fear thou not for I am with thee', 'Isaiah', 41, 10],
  ['But they that wait upon the Lord shall renew their strength', 'Isaiah', 40, 31],
  ['He was wounded for our transgressions', 'Isaiah', 53, 5],
  ['By his stripes we are healed', 'Isaiah', 53, 5],
  ['For I know the thoughts that I think toward you', 'Jeremiah', 29, 11],
  ['Be strong and of a good courage', 'Joshua', 1, 9],
  ['Be not afraid neither be thou dismayed', 'Joshua', 1, 9],
  ['He will never leave thee nor forsake thee', 'Hebrews', 13, 5],
  ['God is faithful', '1 Corinthians', 1, 9],
  ['Charity suffereth long and is kind', '1 Corinthians', 13, 4],
  ['Now abideth faith hope charity', '1 Corinthians', 13, 13],
  ['If any man be in Christ he is a new creature', '2 Corinthians', 5, 17],
  ['The fruit of the Spirit is love joy peace', 'Galatians', 5, 22],
  ['I am crucified with Christ', 'Galatians', 2, 20],
  ['Put on the whole armour of God', 'Ephesians', 6, 11],
  ['We wrestle not against flesh and blood', 'Ephesians', 6, 12],
]

// ── Translation phrasing templates ───────────────────────────────────
//
// 17 translation codes × 12 phrasings each. The {tx}/{txAlias} slots
// are filled from the alias map below. Aliases are deliberately
// duplicated with the parser's own TRANSLATION_ALIASES so the dataset
// stays useful as the canonical source even if the parser's rules
// drift.
const TRANSLATION_PHRASING = [
  'Give me {txAlias}',
  'Give me {txAlias} version',
  'Give me the {txAlias}',
  'Give me the {txAlias} version',
  'Switch to {txAlias}',
  'Change to {txAlias}',
  'Use {txAlias}',
  'Read in {txAlias}',
  'Show me {txAlias}',
  'Show me {txAlias} version',
  'Open in {txAlias}',
  'Put it in {txAlias}',
  'Load {txAlias}',
  'Read it in {txAlias}',
  'Change translation to {txAlias}',
]
const TRANSLATION_TABLE = [
  // [code, [phrasing-aliases]]
  ['KJV', ['KJV', 'King James', 'King James Version', 'King James Bible']],
  ['NKJV', ['NKJV', 'New King James', 'New King James Version']],
  ['MSG', ['MSG', 'Message', 'message', 'the Message', 'Message Bible']],
  ['AMP', ['AMP', 'Amplified', 'Amplified Bible']],
  ['ESV', ['ESV', 'English Standard', 'English Standard Version']],
  ['NIV', ['NIV', 'NIV', 'New International', 'New International Version']],
  ['NLT', ['NLT', 'New Living', 'New Living Translation']],
  ['NASB', ['NASB', 'New American Standard', 'New American Standard Bible']],
  ['CSB', ['CSB', 'Christian Standard', 'Christian Standard Bible']],
  ['RSV', ['RSV', 'Revised Standard', 'Revised Standard Version']],
  ['ASV', ['ASV', 'American Standard']],
  ['WEB', ['WEB', 'World English Bible']],
  ['BBE', ['BBE', 'Basic English']],
  ['YLT', ['YLT', "Young's Literal", 'Young Literal']],
  ['DARBY', ['Darby', 'Darby Translation']],
  ['OEB', ['OEB', 'Open English Bible']],
]

// ── Navigation phrasings ─────────────────────────────────────────────
const NAV_NEXT = [
  'Next verse', 'Next slide', 'Next', 'Forward', 'Move forward',
  'Go to next verse', 'Move to next', 'Continue',
]
const NAV_PREV = [
  'Previous verse', 'Previous slide', 'Previous', 'Back', 'Go back',
  'Last verse', 'Move back', 'Step back',
]
const NAV_NEXT_CHAPTER = [
  'Next chapter', 'Move to next chapter', 'Go to next chapter',
]
const NAV_PREV_CHAPTER = [
  'Previous chapter', 'Last chapter', 'Go back to previous chapter',
]
// "Show verse N" / "Go to verse N" — N=1..30
const NAV_SHOW_VERSE_TEMPLATES = [
  'Show verse {n}',
  'Show verse {nWord}',
  'Go to verse {n}',
  'Go to verse {nWord}',
  'Display verse {n}',
  'Jump to verse {n}',
  'Read verse {n}',
  'Verse {n}',
  'Verse {nWord}',
]

// ── Media-control phrasings ──────────────────────────────────────────
//
// "Send to live display" — operator wants a verbal "send to live"
// command. v0.7.19 doesn't wire a NEW dispatch case for this (the
// next-verse / show-verse flow already pushes to live), so these
// entries are dataset-only — they teach the auto-learner what
// "live" intent looks like. The runtime parser dispatches them as
// Media Control → no-op for now, with a TODO to wire to setIsLive.
const MEDIA_CONTROL = [
  'Send to live', 'Send to live display', 'Send it live',
  'Put it live', 'Take it live', 'Go live', 'Show on screen',
  'Show on display', 'Put on the screen', 'Bring it up',
  'Put it on screen', 'Display it', 'Show it', 'Project it',
  'Show this', 'Push to live',
]

// ── Clear / Delete phrasings ─────────────────────────────────────────
const CLEAR_PHRASES = [
  'Clear screen', 'Clear display', 'Clear output',
  'Clear everything', 'Wipe the screen', 'Take it down',
  'Remove from screen', 'Hide it', 'Hide the screen',
]
const BLANK_PHRASES = [
  'Blank screen', 'Black screen', 'Cut to black', 'Go black',
  'Make it black',
]
const DELETE_VERSE_PHRASES = [
  'Delete previous verse', 'Delete previous bars', 'Delete that verse',
  'Delete last verse', 'Remove previous verse', 'Remove last verse',
  'Remove that verse', 'Remove that scripture', 'Undo last verse',
  'Take that off', 'Undo that', 'Remove the last one',
]

// ── Ignore / Filler / Back-channel phrasings ─────────────────────────
const IGNORE_PHRASES = [
  'Amen', 'Amen amen', 'Hallelujah', 'Praise God', 'Praise the Lord',
  'Glory to God', 'Glory be to God', 'Bless the Lord', 'Bless God',
  'Yes Lord', 'Yes Jesus', 'Thank you Jesus', 'Thank you Lord',
  'Thank you', 'Thanks', 'Thank you media', 'Thanks media',
  'Very good', 'Good', 'Excellent', 'Great',
  'Okay', 'Ok', 'Okay okay', 'Alright', 'All right',
  'Mm', 'Mmhm', 'Hmm', 'Uh', 'Um', 'Er', 'Eh',
  'Brother', 'Sister', 'Pastor',
  'Listen', 'Are you with me', 'Did you hear that', "Y'all hear me",
  'Somebody say amen', 'Somebody shout amen', 'Can I get an amen',
]

// ── Speech-error correction pairs (reference data) ───────────────────
//
// Whisper/Deepgram occasionally fragment scripture phrases when audio
// quality is poor. The correction map lets the runtime cleaner do a
// best-effort substitution before reference detection runs.
const SPEECH_ERRORS = [
  ['Chri t Je u', 'Christ Jesus'],
  ['Chri t', 'Christ'],
  ['Je u', 'Jesus'],
  ['king dom', 'kingdom'],
  ['king dom of God', 'kingdom of God'],
  ['rightous ness', 'righteousness'],
  ['salv ation', 'salvation'],
  ['pro phet', 'prophet'],
  ['holy gho st', 'Holy Ghost'],
  ['holy spi rit', 'Holy Spirit'],
  ['gen e sis', 'Genesis'],
  ['phil ipp ians', 'Philippians'],
  ['eph e sians', 'Ephesians'],
  ['cor in thians', 'Corinthians'],
  ['rev e lation', 'Revelation'],
  ['deu ter onomy', 'Deuteronomy'],
]

// ── Wake-word prefix templates ───────────────────────────────────────
//
// Applied to ~20% of generated commands so the dataset reflects
// the operator's actual wake-word usage. Picked deterministically
// (every 5th entry) for reproducibility — no randomness in the
// generator.
const WAKE_PREFIXES = ['Media,', 'Media:', 'Hey media,', 'Okay media,']

// ────────────────────────────────────────────────────────────────────────
function normalize(s) {
  return s.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim()
}
function pushUnique(arr, seen, entry) {
  const key = normalize(entry.raw) + '|' + entry.intent
  if (seen.has(key)) return false
  seen.add(key)
  arr.push(entry)
  return true
}

const entries = []
const seen = new Set()

// ── A. Direct Scripture Requests ─────────────────────────────────────
for (const [book, ch, v] of POPULAR_VERSES) {
  for (const bookName of bookAlternates(book)) {
    for (const tpl of SCRIPTURE_PHRASINGS) {
      const raw = expandTemplate(tpl, { book: bookName, ch, v })
      pushUnique(entries, seen, {
        raw,
        normalized: normalize(raw),
        intent: 'Scripture Request',
        entities: { book, chapter: ch, verseStart: v },
        confidence: 95,
      })
    }
  }
}

// ── B. Partial Verse Matching ────────────────────────────────────────
for (const [text, book, ch, v] of PARTIAL_QUOTES) {
  pushUnique(entries, seen, {
    raw: text,
    normalized: normalize(text),
    intent: 'Partial Verse Match',
    entities: { book, chapter: ch, verseStart: v },
    confidence: 85,
  })
  // Also register the lowercase form explicitly — operators
  // sometimes get the dataset in lowercase.
  pushUnique(entries, seen, {
    raw: text.toLowerCase(),
    normalized: normalize(text),
    intent: 'Partial Verse Match',
    entities: { book, chapter: ch, verseStart: v },
    confidence: 85,
  })
}

// ── C. Translation Commands ──────────────────────────────────────────
for (const [code, aliases] of TRANSLATION_TABLE) {
  for (const alias of aliases) {
    // Bare alias (operator just says the name)
    pushUnique(entries, seen, {
      raw: alias,
      normalized: normalize(alias),
      intent: 'Translation Change',
      entities: { translation: code },
      confidence: 85,
    })
    // Each phrasing template
    for (const tpl of TRANSLATION_PHRASING) {
      const raw = tpl.replaceAll('{txAlias}', alias)
      pushUnique(entries, seen, {
        raw,
        normalized: normalize(raw),
        intent: 'Translation Change',
        entities: { translation: code },
        confidence: 95,
      })
    }
  }
}

// ── D. Navigation Commands ───────────────────────────────────────────
for (const phrase of NAV_NEXT) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Navigation',
    entities: { action: 'next_verse' },
    confidence: 95,
  })
}
for (const phrase of NAV_PREV) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Navigation',
    entities: { action: 'previous_verse' },
    confidence: 95,
  })
}
for (const phrase of NAV_NEXT_CHAPTER) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Navigation',
    entities: { action: 'next_chapter' },
    confidence: 95,
  })
}
for (const phrase of NAV_PREV_CHAPTER) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Navigation',
    entities: { action: 'previous_chapter' },
    confidence: 95,
  })
}
// Show-verse-N for N=1..30
for (let n = 1; n <= 30; n++) {
  for (const tpl of NAV_SHOW_VERSE_TEMPLATES) {
    const raw = tpl.replaceAll('{n}', String(n)).replaceAll('{nWord}', numWord(n))
    pushUnique(entries, seen, {
      raw,
      normalized: normalize(raw),
      intent: 'Navigation',
      entities: { action: 'show_verse_n', verseStart: n },
      confidence: 90,
    })
  }
}

// ── E. Media Control ─────────────────────────────────────────────────
for (const phrase of MEDIA_CONTROL) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Media Control',
    entities: { action: 'send_to_live' },
    confidence: 80,
  })
}

// ── F. Clear / Delete Commands ───────────────────────────────────────
for (const phrase of CLEAR_PHRASES) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Clear Screen',
    entities: { action: 'clear_screen' },
    confidence: 95,
  })
}
for (const phrase of BLANK_PHRASES) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Clear Screen',
    entities: { action: 'blank_screen' },
    confidence: 95,
  })
}
for (const phrase of DELETE_VERSE_PHRASES) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Clear Screen',
    entities: { action: 'delete_previous_verse' },
    confidence: 90,
  })
}

// ── G. Ignore / Noise ────────────────────────────────────────────────
for (const phrase of IGNORE_PHRASES) {
  pushUnique(entries, seen, {
    raw: phrase,
    normalized: normalize(phrase),
    intent: 'Ignore',
    entities: {},
    confidence: 100,
  })
}

// ── H. Wake-word variants ────────────────────────────────────────────
//
// Apply each WAKE_PREFIX to every COMMAND-class entry (i.e. NOT
// Scripture Request / Partial Verse Match / Ignore) so the dataset
// reflects how operators actually invoke the system.
const commandIntents = new Set([
  'Translation Change', 'Navigation', 'Media Control', 'Clear Screen',
])
const baseEntries = [...entries]
for (const e of baseEntries) {
  if (!commandIntents.has(e.intent)) continue
  for (const prefix of WAKE_PREFIXES) {
    const raw = `${prefix} ${e.raw}`
    pushUnique(entries, seen, {
      raw,
      normalized: normalize(raw),
      intent: e.intent,
      entities: { ...e.entities, wakeWord: true },
      confidence: Math.min(100, e.confidence + 5),
    })
  }
}

// ── I. Speech-error correction reference data ────────────────────────
for (const [bad, good] of SPEECH_ERRORS) {
  pushUnique(entries, seen, {
    raw: bad,
    normalized: normalize(bad),
    intent: 'Partial Verse Match',
    entities: { correction: good },
    confidence: 70,
  })
}

// ────────────────────────────────────────────────────────────────────────
// Quality-control sweep: all entries already deduped via `seen`.
// Sort by intent + raw so the JSON diff is stable across regenerations.
entries.sort((a, b) => {
  if (a.intent !== b.intent) return a.intent.localeCompare(b.intent)
  return a.raw.localeCompare(b.raw)
})

// Tally by intent for the operator-facing summary.
const byIntent = {}
for (const e of entries) byIntent[e.intent] = (byIntent[e.intent] || 0) + 1

const out = {
  $schema: './voice-training.schema.json',
  generatedAt: new Date().toISOString(),
  generatorVersion: '0.7.19',
  totalEntries: entries.length,
  byIntent,
  intents: [
    'Scripture Request',
    'Partial Verse Match',
    'Translation Change',
    'Navigation',
    'Media Control',
    'Clear Screen',
    'Ignore',
  ],
  entries,
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')

// ── Runtime index emit ───────────────────────────────────────────────
//
// The full JSON is ~1.3 MB and must NOT be imported by client-side
// code (it would balloon the Next.js bundle). Instead we emit a
// small TS module containing ONLY the indexes the runtime parser
// (commands.ts → FILLER_UTTERANCES) actually needs:
//
//   - DATASET_FILLERS: deduped, sorted lower-case array of every
//     "Ignore" intent's normalized form
//   - DATASET_VERSION: matches generatorVersion above so the parser
//     can log which dataset slice it's using
//
// Anything else (full entry list, exact-match maps, partial quotes)
// stays server-side and is loaded on demand by the auto-learning /
// admin endpoints, where bundle size doesn't matter.
const fillers = entries
  .filter((e) => e.intent === 'Ignore')
  .map((e) => e.normalized)
  .filter((s, i, arr) => arr.indexOf(s) === i)
  .sort()

const RUNTIME_OUT = path.join(REPO_ROOT, 'src', 'lib', 'voice', 'training-runtime.ts')
const runtimeSrc = `// AUTO-GENERATED by scripts/voice-training/generate.mjs — DO NOT EDIT.
// Run \`pnpm --filter @workspace/imported-app run training:generate\`
// to regenerate from src/data/voice-training.json.

export const DATASET_VERSION = ${JSON.stringify(out.generatorVersion)}
export const DATASET_GENERATED_AT = ${JSON.stringify(out.generatedAt)}

/**
 * Normalized lower-case forms of every "Ignore" intent in the
 * training corpus. Merged into FILLER_UTTERANCES at parser-load
 * time so back-channel utterances ("amen", "hallelujah", "thank
 * you media", ...) are dropped before command classification.
 */
export const DATASET_FILLERS: readonly string[] = ${JSON.stringify(fillers, null, 2)}
`
fs.writeFileSync(RUNTIME_OUT, runtimeSrc, 'utf8')

console.log('[voice-training] wrote', OUT)
console.log('[voice-training] wrote', RUNTIME_OUT, `(${fillers.length} fillers)`)
console.log('[voice-training] total entries:', entries.length)
for (const [k, v] of Object.entries(byIntent).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}`)
}
