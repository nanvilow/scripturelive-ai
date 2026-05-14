// v0.7.28 — Wiring integration test for matchTranscriptToVerses.
//
// stripIntroducingPreamble has its own focused unit suite in
// semantic-matcher.test.ts. This file tests one thing: that the
// stripped phrase actually reaches the OpenAI embeddings endpoint.
// Without this, a future refactor could pass the raw transcript by
// accident and silently break the operator-reported case again — the
// stripper unit tests would still pass.
//
// We mock the `openai` package and the two key-resolution sources,
// then capture the `input` argument every embeddings.create() call
// receives. The FIRST call(s) are the popular-verses cache warm; the
// LAST call is the query embed and is the one we assert on.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted shared state so the vi.mock factory can reference it
// without TDZ issues. vi.mock is hoisted to the top of the file by
// vitest, so it runs BEFORE any normal `const` declarations.
const { embeddingsCreate, OpenAIMock } = vi.hoisted(() => {
  const embeddingsCreate = vi.fn()
  class OpenAIMock {
    embeddings = { create: embeddingsCreate }
    constructor(_opts?: { apiKey?: string }) {
      // no-op; preserves `new` semantics that getClient() relies on.
    }
  }
  return { embeddingsCreate, OpenAIMock }
})

vi.mock('openai', () => ({
  default: OpenAIMock,
}))

// Build a deterministic 1536-dim vector for fake embedding responses.
// Real cosine values don't matter — we only assert on the `input`
// argument shape, not on the returned matches.
const EMBEDDING_DIM = 1536
function fakeVec(seed: number): number[] {
  const out = new Array(EMBEDDING_DIM)
  for (let i = 0; i < EMBEDDING_DIM; i++) out[i] = Math.sin(seed + i) * 0.001
  return out
}

describe('matchTranscriptToVerses — wiring of stripIntroducingPreamble', () => {
  const originalKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    vi.resetModules()
    embeddingsCreate.mockReset()
    process.env.OPENAI_API_KEY = 'sk-test-fake-key-for-wiring-test'

    // First call(s) (cache warm) get a batched array of inputs. The
    // matcher batches popular verses by 100. We return one fake
    // vector per input regardless of mode (batch or single).
    embeddingsCreate.mockImplementation(async (req: { input: string | string[] }) => {
      const inputs = Array.isArray(req.input) ? req.input : [req.input]
      return {
        data: inputs.map((_: string, i: number) => ({ embedding: fakeVec(i) })),
      }
    })
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  })

  it('passes the STRIPPED topic phrase to embeddings.create when a preamble is present', async () => {
    const mod = await import('./semantic-matcher')

    await mod.matchTranscriptToVerses("here's a verse about loving your enemies")

    expect(embeddingsCreate).toHaveBeenCalled()
    // The LAST call is the query embed (preceded by 1+ cache-warm
    // calls). Check that its `input` is the stripped phrase, not the
    // raw transcript.
    const lastCall = embeddingsCreate.mock.calls[embeddingsCreate.mock.calls.length - 1]
    expect(lastCall[0]).toMatchObject({
      model: 'text-embedding-3-small',
      input: 'loving your enemies',
    })
    // Critically, the wrapper must NOT appear:
    expect(lastCall[0].input).not.toContain("here's a verse about")
  })

  it('passes the ORIGINAL phrase unchanged when no preamble matches', async () => {
    const mod = await import('./semantic-matcher')

    // A real paraphrase the stripper must NOT touch.
    const paraphrase = 'the Lord is my shepherd I shall not want'
    await mod.matchTranscriptToVerses(paraphrase)

    expect(embeddingsCreate).toHaveBeenCalled()
    const lastCall = embeddingsCreate.mock.calls[embeddingsCreate.mock.calls.length - 1]
    expect(lastCall[0]).toMatchObject({
      model: 'text-embedding-3-small',
      input: paraphrase,
    })
  })

  it('passes a stripped "let me read a verse about" phrase', async () => {
    const mod = await import('./semantic-matcher')

    await mod.matchTranscriptToVerses('let me read a verse about forgiveness')

    const lastCall = embeddingsCreate.mock.calls[embeddingsCreate.mock.calls.length - 1]
    expect(lastCall[0].input).toBe('forgiveness')
  })
})
