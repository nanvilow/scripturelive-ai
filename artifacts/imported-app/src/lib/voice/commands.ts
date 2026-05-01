// Voice Command parser — v0.5.52, expanded in v0.7.19.
//
// Detects operator commands at the START of an utterance and returns
// a structured `Command`. The SpeechProvider runs this BEFORE the
// Bible reference engine so a recognised command suppresses verse
// detection on the same transcript line.
//
// v0.7.19 — Advanced voice command system:
//   • New intents: `change_translation`, `delete_previous_verse`,
//     `show_verse_n`.
//   • Wake-word "Media" now elevates priority. Utterances of the form
//     "Media, <command>" strip the wake word, lower the natural-tail
//     suppression heuristic, and bump confidence.
//   • Filler-word pre-filter — bare "okay", "thank you", "thank you
//     media", "very good" never reach pattern matching.
//   • Translation aliases — natural phrases like "give me the message
//     version", "amplified version", "switch to NKJV", "in ESV" map
//     to translation codes.
//   • Multi-command chaining — call `detectCommandChain(text)` to get
//     an array of commands separated by "," / "and then" / period.
//
// Anti-false-trigger:
//   • The command phrase must be the leading content of the utterance
//     (after stripping common transcript prefixes).
//   • "next verse says ..." is NOT recognised as a command — the
//     "says" continuation flips us to NOT a command.
//   • All commands require ≥ 80 confidence; ambiguous matches return
//     null.

import { parseExplicitReference, type DetectedReference } from '@/lib/bibles/reference-engine'

export type CommandKind =
  | 'next_verse'
  | 'previous_verse'
  | 'next_chapter'
  | 'previous_chapter'
  | 'go_to_reference'
  | 'bible_says'
  | 'scroll_up'
  | 'scroll_down'
  | 'autoscroll_start'
  | 'autoscroll_pause'
  | 'autoscroll_stop'
  | 'clear_screen'
  | 'blank_screen'
  // v0.7.19 — new intents.
  | 'change_translation'
  | 'delete_previous_verse'
  | 'show_verse_n'

export interface VoiceCommand {
  kind: CommandKind
  /** 0..100 confidence — always ≥ 80 when returned. */
  confidence: number
  /** Display label for the toast feedback. */
  label: string
  /** Bible reference if kind === 'go_to_reference' or 'bible_says'. */
  reference?: DetectedReference
  /** Target translation code if kind === 'change_translation'. */
  translation?: string
  /** Verse number (1-indexed) if kind === 'show_verse_n'. */
  verseNumber?: number
  /**
   * True when the utterance was prefixed with the "Media" wake word.
   * Dispatch can use this to boost priority (e.g. always-execute even
   * if the dedupe window would normally suppress).
   */
  wakeWord?: boolean
}

interface Pattern {
  // Either a string list of leading triggers, or a regex applied to
  // the leading whitespace-trimmed start of the utterance.
  triggers: string[]
  kind: CommandKind
  label: string
  /** When true, anything after the trigger is parsed as a Bible reference. */
  takesReference?: boolean
}

const PATTERNS: Pattern[] = [
  {
    triggers: ['next verse', 'next slide', 'next', 'forward'],
    kind: 'next_verse',
    label: 'Next verse',
  },
  {
    triggers: ['previous verse', 'prev verse', 'previous slide', 'back', 'go back', 'previous'],
    kind: 'previous_verse',
    label: 'Previous verse',
  },
  // v0.7.4 — Chapter navigation. Placed BEFORE the bare "next" /
  // "previous" triggers above so the longer "next chapter" pattern
  // wins the leading-position match. (PATTERNS is iterated in order.)
  {
    triggers: ['next chapter'],
    kind: 'next_chapter',
    label: 'Next chapter',
  },
  {
    triggers: ['previous chapter', 'prev chapter', 'last chapter'],
    kind: 'previous_chapter',
    label: 'Previous chapter',
  },
  {
    triggers: ['go to', 'goto', 'open', 'show', 'display', 'jump to', 'turn to'],
    kind: 'go_to_reference',
    label: 'Go to reference',
    takesReference: true,
  },
  // v0.7.4 — "the bible says <ref>" is a STANDBY hot-trigger: parses
  // the following text as an explicit reference and routes the result
  // to the operator's preview slot only — it never auto-fires Live,
  // even when Auto Go-Live is on. Lets a preacher cue up a passage
  // mid-sermon ("the bible says John three sixteen…") without
  // hijacking the live output.
  {
    triggers: ['the bible says', 'bible says', 'scripture says'],
    kind: 'bible_says',
    label: 'Standby',
    takesReference: true,
  },
  {
    triggers: ['scroll up'],
    kind: 'scroll_up',
    label: 'Scroll up',
  },
  {
    triggers: ['scroll down'],
    kind: 'scroll_down',
    label: 'Scroll down',
  },
  {
    triggers: ['start auto scroll', 'start autoscroll', 'play auto scroll', 'play autoscroll', 'auto scroll start', 'autoscroll start'],
    kind: 'autoscroll_start',
    label: 'Auto-scroll started',
  },
  {
    triggers: ['pause auto scroll', 'pause autoscroll', 'auto scroll pause', 'autoscroll pause'],
    kind: 'autoscroll_pause',
    label: 'Auto-scroll paused',
  },
  {
    triggers: ['stop auto scroll', 'stop autoscroll', 'auto scroll stop', 'autoscroll stop', 'end auto scroll', 'end autoscroll'],
    kind: 'autoscroll_stop',
    label: 'Auto-scroll stopped',
  },
  {
    triggers: ['clear screen', 'clear display', 'clear output'],
    kind: 'clear_screen',
    label: 'Screen cleared',
  },
  {
    triggers: ['blank screen', 'black screen', 'cut to black', 'go black'],
    kind: 'blank_screen',
    label: 'Screen blanked',
  },
  // v0.7.19 — Cleanup intent. "Delete previous verse / bars / scripture"
  // pops the most-recently-pushed verse slide off the stack so the
  // operator can recover from a misfired auto-detection without
  // touching the keyboard. "Delete previous bars" is a vernacular
  // operators in Ghana use to mean "the last lines you put on screen"
  // — same action as "delete previous verse".
  {
    triggers: [
      'delete previous verse',
      'delete previous bars',
      'delete that verse',
      'delete last verse',
      'remove previous verse',
      'remove last verse',
      'remove that verse',
      'remove that scripture',
      'undo last verse',
    ],
    kind: 'delete_previous_verse',
    label: 'Removed last verse',
  },
]

// ── v0.7.19 — Translation aliases ─────────────────────────────────────
//
// Maps natural-language phrases preachers actually say to the canonical
// translation code consumed by `setSelectedTranslation`. Sorted longest-
// first inside `findTranslationAlias` so e.g. "new king james version"
// wins over the substring "king james".
//
// Keep keys lowercase, no punctuation. The matcher normalises both
// sides to the same shape before lookup.
const TRANSLATION_ALIASES: Record<string, string> = {
  // King James Version
  'kjv': 'KJV',
  'king james': 'KJV',
  'king james version': 'KJV',
  'king james bible': 'KJV',
  // New King James — must outrank "king james" because the matcher
  // walks longest-first, but listed adjacently for readability.
  'nkjv': 'NKJV',
  'new king james': 'NKJV',
  'new king james version': 'NKJV',
  'new king james bible': 'NKJV',
  // The Message paraphrase
  'msg': 'MSG',
  'message': 'MSG',
  'the message': 'MSG',
  'message version': 'MSG',
  'message bible': 'MSG',
  'the message bible': 'MSG',
  // Amplified
  'amp': 'AMP',
  'amplified': 'AMP',
  'amplified bible': 'AMP',
  'amplified version': 'AMP',
  // English Standard Version
  'esv': 'ESV',
  'english standard': 'ESV',
  'english standard version': 'ESV',
  // New International Version
  'niv': 'NIV',
  'new international': 'NIV',
  'new international version': 'NIV',
  // New Living Translation
  'nlt': 'NLT',
  'new living': 'NLT',
  'new living translation': 'NLT',
  // New American Standard Bible
  'nasb': 'NASB',
  'new american standard': 'NASB',
  'new american standard bible': 'NASB',
  // Christian Standard Bible
  'csb': 'CSB',
  'christian standard': 'CSB',
  'christian standard bible': 'CSB',
  // Revised Standard Version
  'rsv': 'RSV',
  'revised standard': 'RSV',
  'revised standard version': 'RSV',
  // American Standard Version
  'asv': 'ASV',
  'american standard': 'ASV',
  'american standard version': 'ASV',
  // World English Bible
  'web': 'WEB',
  'world english': 'WEB',
  'world english bible': 'WEB',
  // Bible in Basic English
  'bbe': 'BBE',
  'basic english': 'BBE',
  'bible in basic english': 'BBE',
  // Young's Literal
  'ylt': 'YLT',
  'youngs literal': 'YLT',
  'young literal': 'YLT',
  'youngs literal translation': 'YLT',
  // Darby
  'darby': 'DARBY',
  'darby translation': 'DARBY',
  // Open English Bible
  'oeb': 'OEB',
  'open english': 'OEB',
  'open english bible': 'OEB',
}

// Cached longest-first key list so we don't sort on every call.
const TRANSLATION_ALIAS_KEYS = Object.keys(TRANSLATION_ALIASES).sort(
  (a, b) => b.length - a.length,
)

function findTranslationAlias(haystack: string): { code: string; alias: string } | null {
  const lower = haystack.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const alias of TRANSLATION_ALIAS_KEYS) {
    // Word-boundary check so "amp" matches "amp", "amp version", "the
    // amp", but NOT "ample" or "trampoline".
    const re = new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`)
    if (re.test(lower)) return { code: TRANSLATION_ALIASES[alias]!, alias }
  }
  return null
}

// Common transcript prefixes that we strip before pattern matching so
// "okay, next verse" or "uh next verse" still trigger.
const STRIPPABLE_PREFIXES = [
  'okay', 'ok', 'uh', 'um', 'er', 'eh', 'so', 'now', 'and', 'please',
  'computer', 'scripture live', 'scripturelive', 'scripture',
]

// v0.7.19 — Filler utterances. When the WHOLE utterance is one of
// these (after trimming punctuation) we return null without trying to
// pattern-match — they're back-channel speech ("okay…", "thank you",
// "very good") that should never trigger anything.
//
// "thank you media" deserves special mention: operators in Ghana
// thank the media team verbally during service. Without this filter
// the trailing "media" gets picked up as a wake word and we end up
// trying to interpret an empty command. Listed explicitly so we
// don't have to special-case wake-word stripping later.
const FILLER_UTTERANCES = new Set([
  'okay',
  'ok',
  'okay okay',
  'thank you',
  'thanks',
  'thank you media',
  'thanks media',
  'very good',
  'good',
  'amen',
  'praise god',
  'hallelujah',
  'mm',
  'mmhm',
  'hmm',
  'uh',
  'um',
  'er',
  'eh',
])

function isFillerUtterance(s: string): boolean {
  const norm = s.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim()
  return FILLER_UTTERANCES.has(norm)
}

function stripLeadingFiller(s: string): string {
  let out = s
  let changed = true
  while (changed) {
    changed = false
    const t = out.trimStart()
    for (const p of STRIPPABLE_PREFIXES) {
      if (t.toLowerCase().startsWith(p + ' ') || t.toLowerCase() === p) {
        out = t.slice(p.length).replace(/^[\s,]+/, '')
        changed = true
        break
      }
    }
  }
  return out
}

// v0.7.19 — Wake-word stripping. Returns the body of the utterance
// with the leading "media" / "media," / "media:" / "hey media" /
// "media please" prefix removed, plus a flag so the caller can
// elevate priority. Only treats it as a wake word when the
// remaining body is non-empty — otherwise the user just said
// "Media" alone (which is a filler ack to the media team, not a
// command).
function stripWakeWord(s: string): { body: string; woke: boolean } {
  const trimmed = s.trim()
  // Patterns we accept (case-insensitive):
  //   "media, ..."   "media: ..."   "media ..."   "hey media ..."
  //   "okay media ..."
  const m = trimmed.match(/^(?:hey\s+|okay\s+|ok\s+)?media\b[\s,:;.\-]+(.+)$/i)
  if (!m) return { body: trimmed, woke: false }
  return { body: m[1]!.trim(), woke: true }
}

const NEGATING_CONTINUATIONS = new Set([
  'says', 'said', 'reads', 'read', 'tells', 'told', 'mentions', 'mentioned',
])

// v0.7.19 — Detect a translation-change command. Recognises:
//   "give me [the] message version"
//   "give me amplified"
//   "switch to NKJV"
//   "change to ESV"
//   "in NKJV"
//   "<alias> [version|bible|translation]"   (after wake word, where
//     the whole utterance is just the alias + optional suffix)
//
// Returns null when no alias is found, or when the surrounding text
// looks like quoted scripture (e.g. "the message of the cross") — the
// translation aliases overlap with common preaching vocabulary, so we
// require either an explicit lead-in verb OR the wake-word context.
function detectTranslationCommand(
  body: string,
  wokeByWakeWord: boolean,
): VoiceCommand | null {
  const lower = body.toLowerCase().trim()
  if (!lower) return null

  // Lead-in verbs that explicitly mark this as a translation request.
  // When one of these is present, ANY alias hit anywhere in the
  // remaining text is accepted — that handles "give me the amplified
  // version", "switch to NKJV please", etc.
  // v0.7.19 — Lead-in verbs intentionally exclude bare "in", "in the",
  // and "translation". Those are too broad and collide with everyday
  // preaching vocabulary ("in the beginning", "in the message of...",
  // "translation work"). Operators who want to use a free-form prefix
  // can always wake-word the command instead ("Media, NKJV").
  const LEAD_IN = [
    'give me',
    'give us',
    'switch to',
    'change to',
    'change translation to',
    'change the translation to',
    'use',
    'load',
    'read in',
    'read it in',
    'show in',
    'show me',
    'open in',
    'put it in',
    'put on',
  ]
  let hasLeadIn = false
  for (const li of LEAD_IN) {
    if (lower === li || lower.startsWith(li + ' ')) {
      hasLeadIn = true
      break
    }
  }

  // Without a lead-in verb AND without the wake word we require the
  // ENTIRE utterance to be just the alias (+ optional "version" /
  // "bible" / "translation"). Stops "the message of the cross" from
  // accidentally switching to MSG.
  const aliasHit = findTranslationAlias(lower)
  if (!aliasHit) return null

  if (!hasLeadIn && !wokeByWakeWord) {
    // Strict mode: the utterance must be JUST the alias (optionally
    // wrapped in "the ..." / "... version|bible|translation"). Stops
    // sentences like "the message of the cross" from accidentally
    // switching translations.
    //
    // We canonicalise BOTH the utterance and the alias in the same
    // way (strip a leading "the ", strip a trailing "version" /
    // "bible" / "translation"), then compare. This way both
    // ("new king james" → matches alias "new king james version") AND
    // ("the message" → matches alias "message") work, regardless of
    // whether the suffix lived in the user's utterance, the alias
    // map, or both.
    const canon = (s: string) =>
      s.replace(/^the\s+/, '').replace(/\s+(version|bible|translation)$/, '').trim()
    if (canon(lower) !== canon(aliasHit.alias)) return null
  }

  return {
    kind: 'change_translation',
    confidence: wokeByWakeWord || hasLeadIn ? 95 : 85,
    label: `Translation → ${aliasHit.code}`,
    translation: aliasHit.code,
    wakeWord: wokeByWakeWord,
  }
}

// v0.7.19 — Detect "show verse N" / "go to verse N" / (after wake
// word) bare "verse N". N must be 1..200 — chapters in the Bible
// have at most 176 verses (Psalm 119), so 200 is a generous cap.
function detectShowVerseCommand(
  body: string,
  wokeByWakeWord: boolean,
): VoiceCommand | null {
  const lower = body.toLowerCase().trim()
  // Word forms: "verse 1" / "verse one" / "show verse 1" / "go to verse 1"
  // Post wake-word (Media): bare "verse 1".
  const re = /^(?:show|display|go\s+to|jump\s+to|open|read)?\s*verse\s+(\d{1,3})\s*$/i
  const m = lower.match(re)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  if (!isFinite(n) || n < 1 || n > 200) return null
  return {
    kind: 'show_verse_n',
    confidence: wokeByWakeWord ? 95 : 88,
    label: `Verse ${n}`,
    verseNumber: n,
    wakeWord: wokeByWakeWord,
  }
}

/**
 * Try to recognise a leading voice command in the utterance.
 *
 * Returns null when:
 *   - The utterance is empty / whitespace
 *   - The utterance is a pure filler ("okay", "thank you", ...)
 *   - No pattern's triggers appear at the leading position
 *   - The continuation immediately after the trigger is a "negating"
 *     word that signals the trigger is part of normal speech (e.g.
 *     "next verse says ...")
 *   - A `takesReference` pattern is matched but no valid reference
 *     follows the trigger
 *
 * Confidence:
 *   - Leading-position match: 80
 *   - Leading + clean (no negating continuation, no extra unrelated
 *     words after a non-reference command): 95
 *   - Leading + with-reference + reference confidence ≥ 80: 95
 *   - Wake-word ("Media, ...") prefix bumps confidence by 5.
 */
export function detectCommand(utterance: string): VoiceCommand | null {
  if (!utterance || !utterance.trim()) return null

  // v0.7.19 — Filler-word fast-path. Stops "thank you media" from
  // ever reaching the wake-word stripper (which would leave an empty
  // body) and short-circuits the common back-channel utterances.
  if (isFillerUtterance(utterance)) return null

  // v0.7.19 — Wake-word stripping. "Media, next verse" → body = "next
  // verse", woke = true. Used to bump confidence and to relax the
  // natural-tail length heuristic for commands that are short.
  const { body, woke } = stripWakeWord(utterance.trim())

  // Re-check filler after wake-word strip: "Media, okay" should still
  // be ignored.
  if (isFillerUtterance(body)) return null

  const cleaned = stripLeadingFiller(body)
  const lower = cleaned.toLowerCase()

  // v0.7.19 — Specialised intent matchers BEFORE the generic PATTERNS
  // table. These handle natural-language forms that don't fit the
  // simple "leading trigger phrase" mould.
  const txCmd = detectTranslationCommand(cleaned, woke)
  if (txCmd) return txCmd
  const verseCmd = detectShowVerseCommand(cleaned, woke)
  if (verseCmd) return verseCmd

  for (const pat of PATTERNS) {
    for (const trig of pat.triggers) {
      // Trigger must be at the START. We accept the trigger followed
      // either by end-of-string OR a single space + more content.
      if (lower !== trig && !lower.startsWith(trig + ' ')) continue

      // Negating continuation guard: "next verse says ..." → not a
      // command, the user is reading a verse.
      const after = lower === trig ? '' : lower.slice(trig.length + 1).trim()
      const firstAfter = after.split(/\s+/, 1)[0] ?? ''
      if (NEGATING_CONTINUATIONS.has(firstAfter)) return null

      if (pat.takesReference) {
        if (!after) return null
        const ref = parseExplicitReference(after)
        if (!ref) return null
        // v0.7.4 — kind-aware label so "the bible says" surfaces as
        // a distinct standby toast ("Standby: John 3:16") rather than
        // looking like a regular Go To.
        const label = pat.kind === 'bible_says'
          ? `Standby: ${ref.reference}`
          : `Go to ${ref.reference}`
        return {
          kind: pat.kind,
          confidence: woke ? 100 : 95,
          label,
          reference: ref,
          wakeWord: woke,
        }
      }

      // For non-reference commands, anything beyond the trigger that
      // isn't a trailing punctuation drops confidence — but we still
      // accept it if there's only a short tail (covers "next verse,
      // please" etc.).
      // v0.7.19 — wake word relaxes the tail-length heuristic to 24
      // (from 12) because operators wake-prefixing a command often
      // follow with a courtesy phrase ("Media, clear screen now thanks").
      const tailLimit = woke ? 24 : 12
      if (after.length > tailLimit) {
        // Long tail — likely natural-speech, not a command.
        return null
      }
      return {
        kind: pat.kind,
        confidence: after.length === 0 ? (woke ? 100 : 95) : (woke ? 90 : 85),
        label: pat.label,
        wakeWord: woke,
      }
    }
  }
  return null
}

/**
 * v0.7.19 — Multi-command chaining.
 *
 * Splits an utterance on chain separators ("," / ";" / " and then " /
 * " then ") and returns the LIST of recognised commands. Used by the
 * SpeechProvider to support compound utterances like:
 *
 *   "John 3:16, message version, next verse"
 *
 * Behaviour:
 *   • Each segment is fed through `detectCommand` independently.
 *   • If the FIRST segment looks like a Bible reference (starts with
 *     a book name) it's NOT treated as a voice command — the chain
 *     dispatcher in speech-provider.tsx falls back to letting the
 *     normal reference-engine handle it as the first action.
 *   • Returns an empty array if no segment recognises a command.
 *   • The wake-word flag is propagated to every segment after the
 *     first if the original utterance was wake-prefixed — so "Media,
 *     KJV, next verse" treats both segments as wake-prioritised.
 *
 * Single-command utterances should still go through `detectCommand`
 * directly; this helper only fires when the operator chains commands.
 */
export function detectCommandChain(utterance: string): VoiceCommand[] {
  if (!utterance || !utterance.trim()) return []
  if (isFillerUtterance(utterance)) return []

  // Detect wake word once on the whole utterance; if present, prepend
  // "media, " to each segment so each segment sees the elevated
  // context.
  const { body, woke } = stripWakeWord(utterance.trim())
  const segments = body
    .split(/\s*(?:,|;|\band then\b|\bthen\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length <= 1) {
    // Not actually a chain; fall through to single detection so
    // callers don't have to special-case length-1.
    const single = detectCommand(utterance)
    return single ? [single] : []
  }

  const out: VoiceCommand[] = []
  for (const seg of segments) {
    // Re-attach wake word context if the original utterance had it,
    // so each segment's confidence reflects the elevated priority.
    const segUtter = woke ? `media, ${seg}` : seg
    const cmd = detectCommand(segUtter)
    if (cmd) {
      out.push(cmd)
      continue
    }
    // v0.7.19 — Chain-mode reference fallback. A bare Bible reference
    // ("John 3:16") inside a chain isn't a command per se, but the
    // operator clearly meant "load that". Synthesize a go_to_reference
    // command so the chain dispatcher in speech-provider.tsx can fire
    // the existing reference-loading branch. Outside of chains we
    // deliberately don't do this — single bare references are handled
    // by the more sophisticated detectBestReference engine, which has
    // confidence scoring and dedupe.
    const ref = parseExplicitReference(seg)
    if (ref && ref.confidence >= 80) {
      out.push({
        kind: 'go_to_reference',
        confidence: ref.confidence,
        label: `Go to ${ref.reference}`,
        reference: ref,
        wakeWord: woke,
      })
    }
  }
  return out
}
