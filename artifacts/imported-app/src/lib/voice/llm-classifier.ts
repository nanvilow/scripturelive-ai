// LLM-based voice intent classifier — v0.7.27 (Phase 1 of v0.8.0).
//
// SCOPE: This file is INFRASTRUCTURE ONLY. No runtime call site has
// been wired in yet. The dispatch path in
// src/components/providers/speech-provider.tsx still goes through
// the regex classifier in commands.ts → detectCommand() exclusively.
// To actually USE this classifier in production, a follow-up release
// must (a) add the feature flag to the settings store, (b) add the
// fallback wiring in the dispatcher, and (c) ship after operator
// testing of false-positive rates. This release is reviewable and
// rollback-able on its own with zero behaviour change.
//
// WHY: The existing regex classifier reaches ~80 % of operator
// intents but misses paraphrased commands — "skip ahead", "go to
// the next bit", "hide the screen", "what does it say next" — the
// kind of natural English a preacher uses mid-sermon when they are
// not thinking about voice command syntax. Instead of growing the
// PATTERNS list indefinitely (and increasing false-positive risk
// for non-command speech that happens to start with "next" or
// "show"), we add an LLM classifier as a controlled fallback.
//
// HYBRID PLAN (full v0.8.0 roadmap, NOT this release):
//   1. Try regex classifier first. If it returns a command with
//      confidence ≥ 90, dispatch immediately. (Fastest path, zero
//      LLM cost, zero network latency.)
//   2. If regex returns null AND the utterance starts with one of
//      a small set of "trigger candidate" prefixes (verb-led, short),
//      send it to the LLM classifier with the live slide context.
//   3. If the LLM returns a high-confidence command, dispatch it.
//      If low-confidence, surface a clarification toast ("Did you
//      mean: skip to next verse?").
//   4. Embedding-based semantic fallback for the find_by_quote case
//      stays as-is (already shipped in v0.7.23/24/25).
//
// CONTRACT: Returns the SAME VoiceCommand shape as the regex
// classifier so the dispatcher does not need to know which path
// produced the command. New fields (e.g. `suggestion` for
// clarification UX) are additive and ignored by older consumers.

import OpenAI from 'openai'
import { z } from 'zod'

import type { VoiceCommand, CommandKind } from './commands'
import { parseExplicitReference } from '@/lib/bibles/reference-engine'

/**
 * The full enumeration of intents the LLM is allowed to return.
 * MUST stay in sync with the `CommandKind` union in commands.ts —
 * the test file pins this with a type-level assertion so a new
 * CommandKind added without updating this list fails CI.
 */
export const LLM_INTENT_KINDS = [
  'next_verse',
  'previous_verse',
  'next_chapter',
  'previous_chapter',
  'go_to_reference',
  'bible_says',
  'scroll_up',
  'scroll_down',
  'autoscroll_start',
  'autoscroll_pause',
  'autoscroll_stop',
  'clear_screen',
  'blank_screen',
  'change_translation',
  'delete_previous_verse',
  'show_verse_n',
  'find_by_quote',
] as const satisfies readonly CommandKind[]

/**
 * Zod schema for the structured JSON the LLM returns. Strict — extra
 * fields are stripped, unknown intent values fail validation, and
 * confidence is clamped 0..100. The optional `suggestion` field is
 * for the Phase 4 clarification UX ("Did you mean: …?").
 */
export const LlmClassifierResponseSchema = z.object({
  intent: z.enum(LLM_INTENT_KINDS).nullable(),
  confidence: z.number().min(0).max(100),
  args: z
    .object({
      reference: z.string().optional(),
      translation: z.string().optional(),
      verseNumber: z.number().int().positive().optional(),
      quoteText: z.string().optional(),
    })
    .optional(),
  suggestion: z.string().max(120).optional(),
  reasoning: z.string().max(240).optional(),
})

export type LlmClassifierResponse = z.infer<typeof LlmClassifierResponseSchema>

/**
 * Live slide context fed into the prompt so the LLM can resolve
 * deictic references like "the next one" or "go back two". All
 * fields optional — the classifier degrades gracefully when the
 * dispatcher hasn't loaded a passage yet.
 */
export interface LlmClassifierContext {
  /** Current passage reference, e.g. "John 3:16" or "Romans 12". */
  currentReference?: string
  /** Translation code currently active, e.g. "kjv", "niv". */
  currentTranslation?: string
  /** 1-based index of the currently-displayed verse within the chapter. */
  currentVerseIndex?: number
  /** Total verses in the current chapter (for bounds reasoning). */
  chapterVerseCount?: number
  /** True when an autoscroll is currently running. */
  autoscrollActive?: boolean
}

export interface LlmClassifierOptions {
  /** API key. In production this is the baked operator key. */
  apiKey: string
  /** Optional OpenAI base URL override. Set when routing through the
   *  Replit AI Integrations proxy (v0.7.61) so the apiKey is sent to
   *  the proxy URL instead of api.openai.com. */
  baseURL?: string
  /** Model to call. Default `gpt-4o-mini` for speed, cost, AND
   *  compatibility with `temperature: 0` + `response_format` JSON
   *  mode. v0.7.31 reverted from `gpt-5-nano` after live testing
   *  showed gpt-5-nano (a reasoning model) rejects `temperature: 0`
   *  with HTTP 400 'Unsupported value' and our broad try/catch
   *  swallowed the error as a silent no-op classification. */
  model?: string
  /** Override the OpenAI client (used by tests). */
  client?: OpenAI
  /** AbortSignal so the dispatcher can cancel mid-utterance. */
  signal?: AbortSignal
  /** Response confidence floor; lower returns null. Default 70. */
  confidenceFloor?: number
  /** Max wall-clock the dispatcher will tolerate. Default 1500 ms. */
  timeoutMs?: number
}

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_CONFIDENCE_FLOOR = 70
const DEFAULT_TIMEOUT_MS = 1500

const SYSTEM_PROMPT = [
  'You are an intent classifier for a church livestream operator app.',
  'The operator speaks naturally during a sermon; you map their words to one of the supported commands.',
  '',
  'Supported intents:',
  '  next_verse, previous_verse              — move to adjacent verse',
  '  next_chapter, previous_chapter          — move to adjacent chapter',
  '  go_to_reference                         — jump to an explicit reference (set args.reference)',
  '  bible_says                              — cue an explicit reference to the standby slot only',
  '  scroll_up, scroll_down                  — manual scroll',
  '  autoscroll_start, autoscroll_pause, autoscroll_stop',
  '  clear_screen, blank_screen              — hide content',
  '  change_translation                      — switch Bible version (set args.translation, e.g. "niv", "kjv", "esv", "amp", "msg")',
  '  delete_previous_verse                   — undo the most recent live push',
  '  show_verse_n                            — jump to verse N within the current chapter (set args.verseNumber)',
  '  find_by_quote                           — fuzzy search by topic / quote (set args.quoteText)',
  '',
  'Rules:',
  '  - Output VALID JSON matching the schema. No prose outside the JSON.',
  '  - Set intent to null and confidence to 0 when the utterance is not a command (e.g. preaching, prayer, filler).',
  '  - confidence is your honest 0..100 estimate. If unsure, choose < 70 so the dispatcher can ask for clarification.',
  '  - Resolve deictic phrases ("next one", "back two") using the supplied context.',
  '  - For change_translation, normalise to a short code: niv, kjv, esv, amp, msg, nkjv, nlt, nasb.',
  '  - Never invent a reference for go_to_reference; if you cannot extract a clear book+chapter+verse, fall back to find_by_quote with the operator\'s words as quoteText.',
].join('\n')

/**
 * Build the user prompt by concatenating the (optional) live context
 * with the operator transcript. Kept as a pure helper so tests can
 * snapshot the wire format.
 */
export function buildUserPrompt(transcript: string, context?: LlmClassifierContext): string {
  const lines: string[] = []
  if (context) {
    if (context.currentReference) lines.push(`current_reference: ${context.currentReference}`)
    if (context.currentTranslation) lines.push(`current_translation: ${context.currentTranslation}`)
    if (typeof context.currentVerseIndex === 'number')
      lines.push(`current_verse_index: ${context.currentVerseIndex}`)
    if (typeof context.chapterVerseCount === 'number')
      lines.push(`chapter_verse_count: ${context.chapterVerseCount}`)
    if (typeof context.autoscrollActive === 'boolean')
      lines.push(`autoscroll_active: ${context.autoscrollActive}`)
  }
  lines.push('')
  lines.push(`transcript: ${JSON.stringify(transcript)}`)
  return lines.join('\n')
}

/**
 * Map the validated LLM response into the existing VoiceCommand
 * shape so dispatch.ts and the toast layer don't need a new branch.
 * Returns null when the model declined to classify, when confidence
 * is below the floor, or when args are missing for an intent that
 * requires them.
 */
export function llmResponseToCommand(
  parsed: LlmClassifierResponse,
  confidenceFloor: number,
): VoiceCommand | null {
  if (parsed.intent === null) return null
  if (parsed.confidence < confidenceFloor) return null

  const base: VoiceCommand = {
    kind: parsed.intent,
    confidence: Math.round(parsed.confidence),
    label: defaultLabelFor(parsed.intent),
  }

  switch (parsed.intent) {
    case 'change_translation': {
      const t = parsed.args?.translation?.trim().toLowerCase()
      if (!t) return null
      return { ...base, translation: t }
    }
    case 'show_verse_n': {
      const n = parsed.args?.verseNumber
      if (typeof n !== 'number' || n < 1) return null
      return { ...base, verseNumber: n }
    }
    case 'find_by_quote': {
      const q = parsed.args?.quoteText?.trim()
      if (!q) return null
      return { ...base, quoteText: q }
    }
    case 'go_to_reference':
    case 'bible_says': {
      // v0.7.30 — Phase 2 wiring: re-parse the reference STRING
      // returned by the LLM through the canonical reference engine
      // so the dispatcher receives a `DetectedReference` it knows
      // how to handle. dispatchVoiceCommand requires `cmd.reference`
      // for these two kinds and no-ops otherwise (silent drop), so
      // returning a `quoteText` carrier the way the v0.7.27 scaffold
      // did was a soft-fail. If parsing yields nothing we return
      // null rather than guessing — the gate + regex pipeline will
      // still run on the next utterance.
      const r = parsed.args?.reference?.trim()
      if (!r) return null
      const reference = parseExplicitReference(r)
      if (!reference) return null
      return { ...base, reference }
    }
    default:
      return base
  }
}

function defaultLabelFor(kind: CommandKind): string {
  switch (kind) {
    case 'next_verse': return 'Next verse'
    case 'previous_verse': return 'Previous verse'
    case 'next_chapter': return 'Next chapter'
    case 'previous_chapter': return 'Previous chapter'
    case 'go_to_reference': return 'Go to reference'
    case 'bible_says': return 'Standby'
    case 'scroll_up': return 'Scroll up'
    case 'scroll_down': return 'Scroll down'
    case 'autoscroll_start': return 'Auto-scroll started'
    case 'autoscroll_pause': return 'Auto-scroll paused'
    case 'autoscroll_stop': return 'Auto-scroll stopped'
    case 'clear_screen': return 'Clear screen'
    case 'blank_screen': return 'Blank screen'
    case 'change_translation': return 'Change translation'
    case 'delete_previous_verse': return 'Delete previous verse'
    case 'show_verse_n': return 'Show verse'
    case 'find_by_quote': return 'Find by quote'
  }
}

/**
 * Lazy singleton OpenAI client cache, scoped by API key. Mirrors the
 * pattern in semantic-matcher.ts so we don't open a fresh socket
 * pool on every utterance. Tests bypass this entirely via
 * `options.client`.
 */
let cachedClient: OpenAI | null = null
let cachedKey: string | undefined
// v0.7.61 — Also re-key on baseURL so a live switch between the
// Replit proxy and a direct OpenAI key never reuses a stale client.
let cachedBaseUrl: string | undefined

function getClient(key: string, baseURL?: string): OpenAI {
  if (!cachedClient || cachedKey !== key || cachedBaseUrl !== baseURL) {
    cachedClient = new OpenAI(baseURL ? { apiKey: key, baseURL } : { apiKey: key })
    cachedKey = key
    cachedBaseUrl = baseURL
  }
  return cachedClient
}

/**
 * Classify a single transcript line. Returns the parsed VoiceCommand
 * or null on no-command / low-confidence / network failure /
 * malformed response. NEVER throws — the dispatcher would otherwise
 * have to wrap every call in a try/catch and the right user-facing
 * outcome on failure is always "fall through to whatever the regex
 * classifier said".
 */
export async function classifyIntent(
  transcript: string,
  context: LlmClassifierContext | undefined,
  options: LlmClassifierOptions,
): Promise<VoiceCommand | null> {
  if (!transcript.trim()) return null
  if (!options.apiKey && !options.client) return null

  const client = options.client ?? getClient(options.apiKey, options.baseURL)
  const model = options.model ?? DEFAULT_MODEL
  const confidenceFloor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Combine caller's signal with our timeout so EITHER trips abort.
  const internalAbort = new AbortController()
  const timeoutHandle = setTimeout(() => internalAbort.abort(), timeoutMs)
  const onCallerAbort = () => internalAbort.abort()
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutHandle)
      return null
    }
    options.signal.addEventListener('abort', onCallerAbort, { once: true })
  }

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(transcript, context) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      },
      { signal: internalAbort.signal },
    )

    const raw = completion.choices?.[0]?.message?.content
    if (!raw) return null

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch {
      return null
    }

    const validated = LlmClassifierResponseSchema.safeParse(parsedJson)
    if (!validated.success) return null

    return llmResponseToCommand(validated.data, confidenceFloor)
  } catch {
    // Network error, abort, JSON malformed at a deeper level — all
    // the same outcome from the dispatcher's perspective: fall back
    // to the regex result (which is always available).
    return null
  } finally {
    clearTimeout(timeoutHandle)
    if (options.signal) {
      options.signal.removeEventListener('abort', onCallerAbort)
    }
  }
}
