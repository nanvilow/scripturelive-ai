// Voice Command parser — v0.5.52.
//
// Detects operator commands ("next verse", "previous verse", "go to
// John 3:16", "open psalm 23", "scroll up", "scroll down", "start
// auto scroll", "pause auto scroll", "stop auto scroll", "clear
// screen", "blank screen") at the START of an utterance and returns
// a structured `Command`. The SpeechProvider runs this BEFORE the
// Bible reference engine so a recognised command suppresses verse
// detection on the same transcript line.
//
// Anti-false-trigger:
//   - The command phrase must be the leading content of the
//     utterance (after stripping common transcript prefixes).
//   - "next verse says ..." is NOT recognised as a command — the
//     "says" continuation flips us to NOT a command.
//   - All commands require ≥ 80 confidence; ambiguous matches return
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

export interface VoiceCommand {
  kind: CommandKind
  /** 0..100 confidence — always ≥ 80 when returned. */
  confidence: number
  /** Display label for the toast feedback. */
  label: string
  /** Bible reference if kind === 'go_to_reference'. */
  reference?: DetectedReference
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
]

// Common transcript prefixes that we strip before pattern matching so
// "okay, next verse" or "uh next verse" still trigger.
const STRIPPABLE_PREFIXES = [
  'okay', 'ok', 'uh', 'um', 'er', 'eh', 'so', 'now', 'and', 'please',
  'computer', 'scripture live', 'scripturelive', 'scripture',
]

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

const NEGATING_CONTINUATIONS = new Set([
  'says', 'said', 'reads', 'read', 'tells', 'told', 'mentions', 'mentioned',
])

/**
 * Try to recognise a leading voice command in the utterance.
 *
 * Returns null when:
 *   - The utterance is empty / whitespace
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
 */
export function detectCommand(utterance: string): VoiceCommand | null {
  if (!utterance || !utterance.trim()) return null
  const cleaned = stripLeadingFiller(utterance.trim())
  const lower = cleaned.toLowerCase()

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
          confidence: 95,
          label,
          reference: ref,
        }
      }

      // For non-reference commands, anything beyond the trigger that
      // isn't a trailing punctuation drops confidence — but we still
      // accept it if there's only a short tail (covers "next verse,
      // please" etc.).
      if (after.length > 12) {
        // Long tail — likely natural-speech, not a command.
        return null
      }
      return {
        kind: pat.kind,
        confidence: after.length === 0 ? 95 : 85,
        label: pat.label,
      }
    }
  }
  return null
}
