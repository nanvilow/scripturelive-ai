// LLM classifier unit tests — v0.7.27 (Phase 1 of v0.8.0).
//
// These tests pin the LLM-fallback contract so a future swap-in of
// llm-classifier.ts into the dispatch pipeline (Phase 2) is safe.
// The OpenAI client is fully mocked — these run offline and never
// hit the live model. Behaviour exercised:
//
//   • Schema validation: malformed responses, out-of-range
//     confidence, unknown intents, garbage JSON → null (not throw).
//   • Confidence floor: responses below the floor return null.
//   • Args mapping: every intent that requires args
//     (change_translation, show_verse_n, find_by_quote,
//     go_to_reference, bible_says) returns null when args are
//     missing; populated args land in the right VoiceCommand field.
//   • Network failures and AbortSignal → null, never throw.
//   • Prompt construction: snapshot of the wire format so a future
//     edit to buildUserPrompt is reviewable.
//
// What is NOT tested here: anything that requires the live model.
// A separate operator-driven QA pass (NOT in this release) will run
// 200-400 real transcript samples through the model and tune the
// confidence floor + prompt wording before the dispatcher actually
// calls classifyIntent in production.

import { describe, it, expect, vi } from 'vitest'

import {
  classifyIntent,
  buildUserPrompt,
  llmResponseToCommand,
  LlmClassifierResponseSchema,
  LLM_INTENT_KINDS,
  type LlmClassifierContext,
  type LlmClassifierResponse,
} from './llm-classifier'
import type { CommandKind } from './commands'

// ---------------------------------------------------------------
// Mock OpenAI client factory.
//
// `chat.completions.create` returns the response shape we care
// about; everything else is a noop. The mock is parameterised by
// the JSON string we want the model to "return", so each test sets
// up its own stub response. We keep this local rather than reaching
// for vi.mock('openai') because the classifier accepts an injected
// `client` for exactly this purpose.
// ---------------------------------------------------------------

interface MockOpenAILike {
  chat: {
    completions: {
      create: ReturnType<typeof vi.fn>
    }
  }
}

function makeClientReturning(content: string | null): MockOpenAILike {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  }
}

function makeClientThrowing(err: Error): MockOpenAILike {
  return {
    chat: {
      completions: {
        create: vi.fn().mockRejectedValue(err),
      },
    },
  }
}

// Helper: classifyIntent expects an OpenAI-typed `client`. The mock
// implements the subset we use; cast through unknown is safe and
// keeps the test free of the real openai package surface.
function asClient(mock: MockOpenAILike): never {
  return mock as never
}

// ---------------------------------------------------------------
// Type-level assertion: LLM_INTENT_KINDS stays in sync with
// CommandKind. Adding a new CommandKind without updating the
// classifier list will fail this assignability check.
// ---------------------------------------------------------------

describe('LLM_INTENT_KINDS — sync with CommandKind', () => {
  it('every entry assigns to CommandKind', () => {
    const kinds: readonly CommandKind[] = LLM_INTENT_KINDS
    expect(kinds.length).toBe(17)
  })

  it('contains every documented intent (smoke list)', () => {
    const expected: CommandKind[] = [
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
    ]
    for (const k of expected) {
      expect(LLM_INTENT_KINDS).toContain(k)
    }
  })
})

// ---------------------------------------------------------------
// Zod schema unit tests. These guard against silent acceptance of
// malformed model responses.
// ---------------------------------------------------------------

describe('LlmClassifierResponseSchema', () => {
  it('accepts a minimal valid no-command response', () => {
    const ok = LlmClassifierResponseSchema.safeParse({
      intent: null,
      confidence: 0,
    })
    expect(ok.success).toBe(true)
  })

  it('accepts a full intent + args response', () => {
    const ok = LlmClassifierResponseSchema.safeParse({
      intent: 'show_verse_n',
      confidence: 92,
      args: { verseNumber: 16 },
      suggestion: 'Show verse 16',
    })
    expect(ok.success).toBe(true)
  })

  it('rejects an unknown intent value', () => {
    const r = LlmClassifierResponseSchema.safeParse({
      intent: 'open_email',
      confidence: 80,
    })
    expect(r.success).toBe(false)
  })

  it('rejects confidence above 100', () => {
    const r = LlmClassifierResponseSchema.safeParse({
      intent: 'next_verse',
      confidence: 150,
    })
    expect(r.success).toBe(false)
  })

  it('rejects confidence below 0', () => {
    const r = LlmClassifierResponseSchema.safeParse({
      intent: 'next_verse',
      confidence: -1,
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-positive verseNumber', () => {
    const r = LlmClassifierResponseSchema.safeParse({
      intent: 'show_verse_n',
      confidence: 90,
      args: { verseNumber: 0 },
    })
    expect(r.success).toBe(false)
  })

  it('rejects fractional verseNumber', () => {
    const r = LlmClassifierResponseSchema.safeParse({
      intent: 'show_verse_n',
      confidence: 90,
      args: { verseNumber: 3.5 },
    })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------
// llmResponseToCommand pure-function tests. Decoupling this from
// the network call lets us pin args→VoiceCommand mapping
// exhaustively.
// ---------------------------------------------------------------

describe('llmResponseToCommand', () => {
  const baseFloor = 70

  it('returns null when intent is null', () => {
    const cmd = llmResponseToCommand(
      { intent: null, confidence: 0 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('returns null when confidence is below the floor', () => {
    const cmd = llmResponseToCommand(
      { intent: 'next_verse', confidence: 50 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('rounds fractional confidence', () => {
    const cmd = llmResponseToCommand(
      { intent: 'next_verse', confidence: 87.6 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd?.confidence).toBe(88)
  })

  it('maps next_verse to a bare VoiceCommand', () => {
    const cmd = llmResponseToCommand(
      { intent: 'next_verse', confidence: 95 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toMatchObject({
      kind: 'next_verse',
      confidence: 95,
      label: 'Next verse',
    })
  })

  it('maps change_translation with translation arg', () => {
    const cmd = llmResponseToCommand(
      {
        intent: 'change_translation',
        confidence: 90,
        args: { translation: 'NIV' },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd?.translation).toBe('niv')
  })

  it('returns null for change_translation when translation is missing', () => {
    const cmd = llmResponseToCommand(
      { intent: 'change_translation', confidence: 90 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('returns null for change_translation when translation is whitespace', () => {
    const cmd = llmResponseToCommand(
      {
        intent: 'change_translation',
        confidence: 90,
        args: { translation: '   ' },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('maps show_verse_n with verseNumber arg', () => {
    const cmd = llmResponseToCommand(
      {
        intent: 'show_verse_n',
        confidence: 92,
        args: { verseNumber: 16 },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd?.verseNumber).toBe(16)
  })

  it('returns null for show_verse_n when verseNumber missing', () => {
    const cmd = llmResponseToCommand(
      { intent: 'show_verse_n', confidence: 92 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('maps find_by_quote with quoteText', () => {
    const cmd = llmResponseToCommand(
      {
        intent: 'find_by_quote',
        confidence: 85,
        args: { quoteText: 'love your enemies' },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd?.quoteText).toBe('love your enemies')
  })

  it('returns null for find_by_quote when quoteText missing', () => {
    const cmd = llmResponseToCommand(
      { intent: 'find_by_quote', confidence: 85 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('maps go_to_reference into a parsed DetectedReference (v0.7.30)', () => {
    // v0.7.30 fix — earlier the reference text was placed in
    // `quoteText` as a temporary carrier and dispatchVoiceCommand
    // silently no-op'd because it needs `cmd.reference`. Now we
    // parse via reference-engine.parseExplicitReference so dispatch
    // works end-to-end.
    const cmd = llmResponseToCommand(
      {
        intent: 'go_to_reference',
        confidence: 90,
        args: { reference: 'John 3:16' },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd?.kind).toBe('go_to_reference')
    expect(cmd?.reference?.book).toBe('John')
    expect(cmd?.reference?.chapter).toBe(3)
    expect(cmd?.reference?.verseStart).toBe(16)
    expect(cmd?.quoteText).toBeUndefined()
  })

  it('returns null for go_to_reference when reference missing', () => {
    const cmd = llmResponseToCommand(
      { intent: 'go_to_reference', confidence: 90 } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('returns null for go_to_reference when reference text is unparseable (v0.7.30)', () => {
    // Defence-in-depth: if the LLM hallucinates "the second one" or
    // similar non-reference text, we'd rather drop the command than
    // dispatch it without a usable DetectedReference.
    const cmd = llmResponseToCommand(
      {
        intent: 'go_to_reference',
        confidence: 90,
        args: { reference: 'the second one over there' },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd).toBeNull()
  })

  it('maps bible_says like go_to_reference (v0.7.30)', () => {
    const cmd = llmResponseToCommand(
      {
        intent: 'bible_says',
        confidence: 88,
        args: { reference: 'Romans 8:28' },
      } satisfies LlmClassifierResponse,
      baseFloor,
    )
    expect(cmd?.kind).toBe('bible_says')
    expect(cmd?.reference?.book).toBe('Romans')
    expect(cmd?.reference?.chapter).toBe(8)
    expect(cmd?.reference?.verseStart).toBe(28)
  })

  // Argument-free intents shouldn't require args at all.
  const argFreeIntents: CommandKind[] = [
    'next_verse',
    'previous_verse',
    'next_chapter',
    'previous_chapter',
    'scroll_up',
    'scroll_down',
    'autoscroll_start',
    'autoscroll_pause',
    'autoscroll_stop',
    'clear_screen',
    'blank_screen',
    'delete_previous_verse',
  ]
  for (const intent of argFreeIntents) {
    it(`maps arg-free intent ${intent} without args`, () => {
      const cmd = llmResponseToCommand(
        { intent, confidence: 90 } satisfies LlmClassifierResponse,
        baseFloor,
      )
      expect(cmd?.kind).toBe(intent)
      expect(cmd?.confidence).toBe(90)
    })
  }
})

// ---------------------------------------------------------------
// buildUserPrompt — pure helper, snapshot the wire format.
// ---------------------------------------------------------------

describe('buildUserPrompt', () => {
  it('returns transcript-only when no context supplied', () => {
    const out = buildUserPrompt('next verse')
    expect(out).toBe('\ntranscript: "next verse"')
  })

  it('JSON-encodes the transcript so quotes are safe', () => {
    const out = buildUserPrompt('he said "go back"')
    expect(out).toContain('transcript: "he said \\"go back\\""')
  })

  it('includes every populated context field on its own line', () => {
    const ctx: LlmClassifierContext = {
      currentReference: 'John 3:16',
      currentTranslation: 'kjv',
      currentVerseIndex: 16,
      chapterVerseCount: 36,
      autoscrollActive: true,
    }
    const out = buildUserPrompt('next', ctx)
    expect(out).toContain('current_reference: John 3:16')
    expect(out).toContain('current_translation: kjv')
    expect(out).toContain('current_verse_index: 16')
    expect(out).toContain('chapter_verse_count: 36')
    expect(out).toContain('autoscroll_active: true')
  })

  it('omits unset context fields', () => {
    const out = buildUserPrompt('next', { currentReference: 'John 3:16' })
    expect(out).toContain('current_reference: John 3:16')
    expect(out).not.toContain('current_translation')
    expect(out).not.toContain('current_verse_index')
    expect(out).not.toContain('autoscroll_active')
  })

  it('handles autoscroll_active === false (boolean, not falsy-skip)', () => {
    const out = buildUserPrompt('next', { autoscrollActive: false })
    expect(out).toContain('autoscroll_active: false')
  })
})

// ---------------------------------------------------------------
// classifyIntent — full path with mocked OpenAI client.
// ---------------------------------------------------------------

describe('classifyIntent — happy path', () => {
  it('returns a VoiceCommand when the model returns a valid response', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: 'next_verse', confidence: 95 }),
    )
    const cmd = await classifyIntent('skip ahead', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toMatchObject({ kind: 'next_verse', confidence: 95 })
    expect(mock.chat.completions.create).toHaveBeenCalledTimes(1)
  })

  it('passes the system prompt and user prompt in the right order', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: null, confidence: 0 }),
    )
    await classifyIntent('skip ahead', { currentReference: 'John 3:16' }, {
      apiKey: 'test',
      client: asClient(mock),
    })
    const args = mock.chat.completions.create.mock.calls[0][0]
    expect(args.messages[0].role).toBe('system')
    expect(args.messages[1].role).toBe('user')
    expect(args.messages[1].content).toContain('current_reference: John 3:16')
    expect(args.messages[1].content).toContain('transcript: "skip ahead"')
  })

  it('requests json_object response_format and temperature 0', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: null, confidence: 0 }),
    )
    await classifyIntent('whatever', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    const args = mock.chat.completions.create.mock.calls[0][0]
    expect(args.response_format).toEqual({ type: 'json_object' })
    expect(args.temperature).toBe(0)
  })

  it('uses the requested model when supplied', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: null, confidence: 0 }),
    )
    await classifyIntent('whatever', undefined, {
      apiKey: 'test',
      client: asClient(mock),
      model: 'gpt-5.4',
    })
    expect(mock.chat.completions.create.mock.calls[0][0].model).toBe('gpt-5.4')
  })

  // v0.7.31 regression: the default model MUST be one that supports
  // `temperature: 0` + `response_format: { type: 'json_object' }`.
  // gpt-5-nano (a reasoning model) rejects temperature: 0 with HTTP
  // 400, our broad try/catch swallowed it, and every utterance came
  // back as a silent null in live testing. Pin the default to a
  // chat-completions model family so this can't regress.
  it('default model is a chat-completions model that supports temperature:0 + JSON mode', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: null, confidence: 0 }),
    )
    await classifyIntent('whatever', undefined, {
      apiKey: 'test',
      client: asClient(mock),
      // no `model` override — must use DEFAULT_MODEL
    })
    const args = mock.chat.completions.create.mock.calls[0][0]
    expect(args.model).toBe('gpt-4o-mini')
    expect(args.temperature).toBe(0)
    expect(args.response_format).toEqual({ type: 'json_object' })
    // Belt-and-braces: forbid the gpt-5-* reasoning families that
    // are known to reject `temperature: 0`.
    expect(args.model).not.toMatch(/^gpt-5/)
    expect(args.model).not.toMatch(/^o[1-9]/)
  })
})

describe('classifyIntent — defensive returns null', () => {
  it('returns null on empty transcript without calling the model', async () => {
    const mock = makeClientReturning('whatever')
    const cmd = await classifyIntent('   ', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
    expect(mock.chat.completions.create).not.toHaveBeenCalled()
  })

  it('returns null when neither apiKey nor client is supplied', async () => {
    const cmd = await classifyIntent('next', undefined, {
      apiKey: '',
    })
    expect(cmd).toBeNull()
  })

  it('returns null when the model returns null content', async () => {
    const mock = makeClientReturning(null)
    const cmd = await classifyIntent('next', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
  })

  it('returns null on non-JSON content', async () => {
    const mock = makeClientReturning('this is not JSON')
    const cmd = await classifyIntent('next', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
  })

  it('returns null on JSON that fails schema validation', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: 'open_email', confidence: 99 }),
    )
    const cmd = await classifyIntent('open my email', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
  })

  it('returns null when confidence is below the default floor (70)', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: 'next_verse', confidence: 65 }),
    )
    const cmd = await classifyIntent('maybe next?', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
  })

  it('returns null when confidence is below a custom floor', async () => {
    const mock = makeClientReturning(
      JSON.stringify({ intent: 'next_verse', confidence: 80 }),
    )
    const cmd = await classifyIntent('skip', undefined, {
      apiKey: 'test',
      client: asClient(mock),
      confidenceFloor: 90,
    })
    expect(cmd).toBeNull()
  })

  it('returns null when the OpenAI call rejects', async () => {
    const mock = makeClientThrowing(new Error('network down'))
    const cmd = await classifyIntent('next', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
  })

  it('returns null when the caller signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const mock = makeClientReturning(
      JSON.stringify({ intent: 'next_verse', confidence: 95 }),
    )
    const cmd = await classifyIntent('next', undefined, {
      apiKey: 'test',
      client: asClient(mock),
      signal: ac.signal,
    })
    expect(cmd).toBeNull()
    expect(mock.chat.completions.create).not.toHaveBeenCalled()
  })
})

describe('classifyIntent — args integration', () => {
  it('returns a change_translation command with normalised translation code', async () => {
    const mock = makeClientReturning(
      JSON.stringify({
        intent: 'change_translation',
        confidence: 90,
        args: { translation: 'MSG' },
      }),
    )
    const cmd = await classifyIntent('give me the message version', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd?.kind).toBe('change_translation')
    expect(cmd?.translation).toBe('msg')
  })

  it('returns null for change_translation with empty translation', async () => {
    const mock = makeClientReturning(
      JSON.stringify({
        intent: 'change_translation',
        confidence: 90,
        args: { translation: '' },
      }),
    )
    const cmd = await classifyIntent('change to', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd).toBeNull()
  })

  it('returns a show_verse_n command with verseNumber', async () => {
    const mock = makeClientReturning(
      JSON.stringify({
        intent: 'show_verse_n',
        confidence: 92,
        args: { verseNumber: 16 },
      }),
    )
    const cmd = await classifyIntent('show verse sixteen', undefined, {
      apiKey: 'test',
      client: asClient(mock),
    })
    expect(cmd?.verseNumber).toBe(16)
  })

  it('returns a find_by_quote command', async () => {
    const mock = makeClientReturning(
      JSON.stringify({
        intent: 'find_by_quote',
        confidence: 85,
        args: { quoteText: 'love your enemies' },
      }),
    )
    const cmd = await classifyIntent(
      'find the verse about loving your enemies',
      undefined,
      { apiKey: 'test', client: asClient(mock) },
    )
    expect(cmd?.quoteText).toBe('love your enemies')
  })
})
