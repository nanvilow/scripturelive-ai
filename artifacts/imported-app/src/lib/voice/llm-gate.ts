// v0.7.29 — Command-likeness gate for the LLM voice classifier.
//
// Phase 2 of the v0.8.0 plan wires `classifyIntent` (v0.7.27) into
// the dispatch pipeline as a fallback when the regex classifier
// (commands.ts → detectCommand) returns null or low confidence. To
// keep the OpenAI roundtrip cost and 1500 ms timeout off the
// critical path for ordinary preaching speech, we GATE the LLM call
// behind a cheap heuristic that only lets through utterances which
// look like command candidates.
//
// The heuristic is intentionally simple and conservative:
//   1. Reject if the trimmed utterance is empty, ≤ 1 word, or > 12
//      words. Real commands are short (typically 2-6 words);
//      anything longer is almost certainly sermon content.
//   2. Accept if the FIRST word is a recognised command-trigger
//      verb (next, previous, skip, go, show, hide, scroll, etc.)
//      OR the utterance contains an explicit "verse N" / "chapter
//      N" / "to <translation>" pattern.
//   3. Reject everything else.
//
// Why a hand-rolled heuristic instead of letting the LLM decide:
//   - Cost: at $0.15 / 1M input tokens for gpt-5-nano, every
//     utterance call is cheap — but a full sermon transcript
//     contains thousands of utterances and we don't want to wait
//     1.5 s on every one of them just to learn "no command here".
//   - Latency: even a 200 ms OpenAI roundtrip blocks the ref
//     engine v2 for that long. With the gate, ~95 % of utterances
//     skip the call entirely.
//   - Predictability: when the operator complains "voice command
//     not firing", it's helpful to be able to point at a regex
//     pattern instead of "the LLM didn't think it was a command
//     today". Adding a verb to TRIGGER_VERBS is one line and ships
//     with a test.
//
// This file exports two pure functions used by speech-provider AND
// pinned by unit tests. Keep it dependency-free so it stays trivial
// to test.

// Verbs that frequently start a voice command. Lowercased — the
// caller normalises before checking. Edit this list (and add a
// matching test) when an operator reports a missed command.
const TRIGGER_VERBS = new Set<string>([
  // Navigation
  'next',
  'previous',
  'prev',
  'back',
  'go',
  'jump',
  'open',
  'skip',
  'forward',
  'continue',
  'advance',
  // Show / hide / display
  'show',
  'hide',
  'blank',
  'clear',
  'close',
  'display',
  'reveal',
  'remove',
  // Scroll / autoscroll
  'scroll',
  'pause',
  'resume',
  'stop',
  'start',
  'play',
  // Translation switch
  'switch',
  'change',
  'translate',
  'use',
  // Find / search
  'find',
  'search',
  'look',
  'lookup',
  'pull',
  'bring',
  'where',
  // Undo / redo
  'undo',
  'redo',
  'delete',
  'erase',
  // Read aloud / cue
  'read',
  'cue',
  'queue',
  'standby',
  // Generic verbs ("can you ...", "let's ...")
  'can',
  'lets',
  "let's",
  'give',
  'take',
])

// Words that, regardless of their position in the sentence, signal
// the operator is trying to issue a verse / chapter / translation
// command. Catches phrases like "the next verse please", "translation
// niv now", "chapter 3 verse 16".
const STRUCTURAL_HINTS: RegExp[] = [
  /\b(?:verse|chapter|passage)\s+(?:\d+|next|previous|last|first)\b/i,
  /\b(?:next|previous|last|first|another)\s+(?:verse|chapter|passage)\b/i,
  /\b(?:translation|version)\s+(?:niv|kjv|esv|amp|msg|nlt|asv|net|web)\b/i,
  /\bto\s+(?:niv|kjv|esv|amp|msg|nlt|asv|net|web)\b/i,
  /\b(?:auto[- ]?scroll|autoscroll)\b/i,
]

const MIN_WORDS = 2
const MAX_WORDS = 12

/**
 * Returns true when the utterance is worth sending to the LLM
 * classifier. Designed to err on the side of REJECTING — a missed
 * command will surface as "say it again" friction, but a flood of
 * unnecessary OpenAI calls would burn quota and add latency to every
 * passing transcript.
 */
export function isLikelyCommandUtterance(text: string): boolean {
  const trimmed = (text || '').trim()
  if (!trimmed) return false

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < MIN_WORDS) return false
  if (words.length > MAX_WORDS) return false

  // Strip leading wake-word ("media,") so the first word check sees
  // the actual command verb. The wake-word itself is not in
  // TRIGGER_VERBS by design — it's already handled upstream by the
  // wake-word path in speech-provider.
  let first = words[0].toLowerCase().replace(/[^a-z']/g, '')
  if (first === 'media' || first === 'okay' || first === 'ok' || first === 'hey') {
    if (words.length < MIN_WORDS + 1) return false
    first = words[1].toLowerCase().replace(/[^a-z']/g, '')
  }

  if (TRIGGER_VERBS.has(first)) return true
  for (const re of STRUCTURAL_HINTS) {
    if (re.test(trimmed)) return true
  }
  return false
}

/**
 * Internal helper exposed for tests — returns the trigger-verb
 * count so we can pin the size of TRIGGER_VERBS and notice when
 * additions silently shrink coverage.
 */
export function _triggerVerbCount(): number {
  return TRIGGER_VERBS.size
}
