/**
 * transcript-cleaner — light pre-filter for raw whisper output.
 *
 * Bug #1A from the operator report: whisper sometimes hands us a chunk
 * full of stage-direction tokens ("[BLANK_AUDIO]"), runs of duplicate
 * words ("of the of the of the") when the speaker pauses mid-sentence,
 * or stray whitespace. None of that is actionable for the operator and
 * it pollutes the running transcript shown on the Detection panel as
 * well as anything the downstream snap-to-canonical pipeline tries to
 * match. We sanitise BEFORE the chunk lands in the transcript.
 *
 * Pure function; no React, no DOM. Re-used by both the Base Mode
 * (whisper.cpp via Electron IPC) and the OpenAI Mode upload paths in
 * `useWhisperSpeechRecognition`.
 */

// Diagnostic / non-speech tokens whisper.cpp emits when it hears music,
// silence, ambient noise, applause, etc. Not useful in a sermon
// detection context — strip them outright.
const NOISE_TAGS_RE = /\[(?:blank_audio|music|sound|noise|silence|inaudible|applause|laughter|cough|crowd)\]/gi
// Parenthetical stage-direction tokens like "(silence)" / "(applause)".
const PAREN_NOISE_RE = /\((?:silence|applause|inaudible|laughter|music)\)/gi

// v0.5.30 — Whisper has well-documented hallucinations on silent /
// near-silent / music-only audio: it emits canned phrases left over
// from its YouTube training corpus. None of these are ever spoken in
// a sermon, but they flooded the operator's Live Transcription
// panel, gave operators the impression that the mic was "writing
// things the speaker never said", and tripped false-positive Bible
// detections by adding noise to the running text. Strip them outright
// so neither the panel nor the verse detector ever sees them.
const HALLUCINATION_PHRASES = [
  'thanks for watching',
  'thank you for watching',
  'thanks for watching!',
  'thank you for watching!',
  'subscribe to my channel',
  'subscribe to the channel',
  'please subscribe',
  'like and subscribe',
  'see you next time',
  'see you in the next video',
  'see you in the next one',
  'thanks for joining',
  'thanks for joining us',
  "don't forget to subscribe",
  'i will see you in the next video',
  "i'll see you in the next video",
  'this video is sponsored by',
]
const HALLUCINATION_RE = new RegExp(
  '\\b(?:' +
    HALLUCINATION_PHRASES
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\s/g, '\\s+'))
      .join('|') +
    ')\\b[\\s.,!?;:"\']*',
  'gi',
)
// After all cleaning, if the surviving chunk is just one of these
// filler words on its own (Whisper's other go-to silence outputs:
// "you", "you.", "Thanks.", lone interjections) the chunk is dropped
// entirely — don't pollute the transcript with phantom one-word
// utterances the speaker never produced.
const FILLER_ONLY_RE = /^[\s.,!?;:'"\-]*(?:you|thanks?|thank you|hi|hello|um|uh|hmm|mm|mhm|okay|ok|so|bye|bye bye|good\s*bye|the|and)[\s.,!?;:'"\-]*$/i

export function cleanTranscriptText(raw: string): string {
  if (!raw) return ''
  let t = raw

  // Strip non-speech tags first so they don't confuse the dedupe pass.
  t = t.replace(NOISE_TAGS_RE, ' ')
  t = t.replace(PAREN_NOISE_RE, ' ')
  // v0.5.30 — drop Whisper's canned silence-hallucination phrases
  // BEFORE the dedupe pass so they never reach the operator's panel
  // or the verse detector.
  t = t.replace(HALLUCINATION_RE, ' ')

  // Collapse repeated punctuation runs ("....." → "...", ",,," → ",").
  t = t.replace(/([.,!?;:])\1{2,}/g, '$1$1$1')

  // Collapse all whitespace to single spaces (keeps newlines as spaces
  // because the running transcript is rendered as a flowing string).
  t = t.replace(/\s+/g, ' ').trim()

  // Remove immediate-repeat phrase patterns. Whisper is famous for
  // "of the of the" and "and and and" stutters when audio is choppy.
  // We collapse exact bigram and trigram repeats; longer patterns are
  // rare enough that catching them would risk false positives on
  // legitimate parallelism in the text.
  t = collapseImmediateRepeats(t, /* windowWords */ 1)
  t = collapseImmediateRepeats(t, /* windowWords */ 2)
  t = collapseImmediateRepeats(t, /* windowWords */ 3)

  // Trim leading punctuation noise ("- ,- " etc) that comes from
  // whisper's optional timestamp markers being stripped by -nt.
  t = t.replace(/^[\s\-–—,;:.!?]+/, '')

  // v0.5.30 — kill the chunk entirely if all that survives is a
  // single filler word (Whisper's "you" / "Thanks." / "Hmm." for
  // silent chunks). The chunk had nothing to say; emitting it would
  // pollute the transcript and the verse detector for no gain.
  const trimmed = t.trim()
  if (FILLER_ONLY_RE.test(trimmed)) return ''

  return trimmed
}

function collapseImmediateRepeats(input: string, windowWords: number): string {
  if (!input) return input
  const tokens = input.split(/(\s+)/) // keep separators
  const wordIdx: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\s+$/.test(tokens[i]) && tokens[i].length > 0) wordIdx.push(i)
  }
  if (wordIdx.length < windowWords * 2) return input
  const drop = new Set<number>()
  for (let i = 0; i + 2 * windowWords <= wordIdx.length; i++) {
    let same = true
    for (let k = 0; k < windowWords; k++) {
      const a = tokens[wordIdx[i + k]].toLowerCase().replace(/[.,!?;:]/g, '')
      const b = tokens[wordIdx[i + windowWords + k]].toLowerCase().replace(/[.,!?;:]/g, '')
      if (a !== b || !a) { same = false; break }
    }
    if (same) {
      // Drop the duplicate window (and its preceding whitespace
      // separator if any), then advance past it so we don't double-
      // collapse triplets into nothing.
      for (let k = 0; k < windowWords; k++) {
        drop.add(wordIdx[i + windowWords + k])
        if (wordIdx[i + windowWords + k] > 0) drop.add(wordIdx[i + windowWords + k] - 1)
      }
      i += windowWords - 1
    }
  }
  if (!drop.size) return input
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) if (!drop.has(i)) out.push(tokens[i])
  return out.join('').replace(/\s+/g, ' ').trim()
}

// ──────────────────────────────────────────────────────────────────────
// Per-chunk confidence heuristic for the OpenAI auto-fallback path
// (Bug #1C).
// ──────────────────────────────────────────────────────────────────────
// We have no ground-truth confidence from whisper.cpp (the binary
// doesn't return one), so we approximate from surface stats. The
// fragmentation pattern that produces "Chri t Je u… law of in and
// death" is dominated by:
//   - lots of single-letter / two-letter alphabetic tokens
//   - tokens with no vowels ("Chri", "t", "Je", "u")
//   - average token length much shorter than English prose
// Returns 0..1 where 1 = looks fine, ~0 = looks fragmented.
//
// Empty input returns 1.0 (no opinion — caller decides what to do
// with empty chunks, which usually means "speaker was silent").
export function transcriptChunkConfidence(text: string): number {
  if (!text || !text.trim()) return 1
  const tokens = text.trim().split(/\s+/)
  if (tokens.length === 0) return 1

  const alphaTokens = tokens.filter((t) => /[a-z]/i.test(t))
  if (alphaTokens.length === 0) return 0.5
  let shortFragments = 0
  let noVowel = 0
  let totalAlphaLen = 0
  for (const tk of alphaTokens) {
    const stripped = tk.replace(/[^a-z]/gi, '')
    totalAlphaLen += stripped.length
    if (stripped.length <= 2) shortFragments++
    if (stripped.length >= 2 && !/[aeiouy]/i.test(stripped)) noVowel++
  }
  const fragmentRatio = shortFragments / alphaTokens.length
  const noVowelRatio = noVowel / alphaTokens.length
  const avgLen = totalAlphaLen / alphaTokens.length

  // Score:
  //   start at 1.0
  //   penalise heavy fragment ratio (>20% short tokens is a smell)
  //   penalise no-vowel cluster ratio (>10% is a strong smell)
  //   penalise very short avg length (<3.5 is unusual for English)
  let score = 1
  if (fragmentRatio > 0.2) score -= Math.min(0.5, (fragmentRatio - 0.2) * 1.5)
  if (noVowelRatio > 0.1) score -= Math.min(0.4, (noVowelRatio - 0.1) * 2)
  if (avgLen < 3.5) score -= Math.min(0.3, (3.5 - avgLen) * 0.2)
  return Math.max(0, Math.min(1, score))
}
