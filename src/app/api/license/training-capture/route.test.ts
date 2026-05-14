// v0.7.19 — Tests for the auto-learning capture endpoint.
//
// We isolate the on-disk side-effect by pointing
// SCRIPTURELIVE_LICENSE_DIR at a per-test temp dir, then exercise
// the POST handler with hand-rolled NextRequest-shaped objects.
// The endpoint is deliberately unauthenticated so there's no
// session plumbing to fake.

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { POST } from './route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/license/training-capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

let tmpDir: string
let prevDir: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-train-'))
  prevDir = process.env.SCRIPTURELIVE_LICENSE_DIR
  process.env.SCRIPTURELIVE_LICENSE_DIR = tmpDir
})

afterEach(() => {
  if (prevDir === undefined) delete process.env.SCRIPTURELIVE_LICENSE_DIR
  else process.env.SCRIPTURELIVE_LICENSE_DIR = prevDir
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/license/training-capture', () => {
  it('rejects missing body with 400', async () => {
    const req = new Request('http://localhost/api/license/training-capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects body without `raw` with 400', async () => {
    const res = await POST(makeReq({ source: 'manual' }) as never)
    expect(res.status).toBe(400)
    const data = (await res.json()) as { ok: boolean }
    expect(data.ok).toBe(false)
  })

  it('persists a minimal valid row and returns an id', async () => {
    const res = await POST(
      makeReq({ raw: 'John tree sixteen', source: 'parser_miss' }) as never,
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; id: string }
    expect(data.ok).toBe(true)
    expect(data.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/)

    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0]) as Record<string, unknown>
    expect(row.raw).toBe('John tree sixteen')
    expect(row.normalized).toBe('john tree sixteen')
    expect(row.source).toBe('parser_miss')
    expect(typeof row.capturedAt).toBe('string')
  })

  it('drops invalid intents but keeps the row', async () => {
    const res = await POST(
      makeReq({
        raw: 'something the parser did not get',
        proposedIntent: 'NOT A REAL INTENT',
      }) as never,
    )
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as Record<string, unknown>
    expect(row.proposedIntent).toBeNull()
    expect(row.raw).toBe('something the parser did not get')
  })

  it('keeps a recognised intent and primitive entities', async () => {
    const res = await POST(
      makeReq({
        raw: 'Show verse twelve',
        proposedIntent: 'Navigation',
        actualAction: 'show_verse_n',
        entities: { verseStart: 12, action: 'show_verse_n' },
      }) as never,
    )
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as Record<string, unknown>
    expect(row.proposedIntent).toBe('Navigation')
    expect(row.actualAction).toBe('show_verse_n')
    expect(row.entities).toEqual({ verseStart: 12, action: 'show_verse_n' })
  })

  it('drops non-primitive entity values', async () => {
    const res = await POST(
      makeReq({
        raw: 'noisy entity',
        entities: { good: 'kept', bad: { nested: true }, alsoGood: 7 },
      }) as never,
    )
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as { entities?: Record<string, unknown> }
    expect(row.entities).toEqual({ good: 'kept', alsoGood: 7 })
  })

  it('truncates raw transcripts longer than 2 KB', async () => {
    const huge = 'x'.repeat(5000)
    const res = await POST(makeReq({ raw: huge }) as never)
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as { raw: string }
    expect(row.raw.length).toBe(2048)
  })

  it('appends rather than overwrites on repeated calls', async () => {
    await POST(makeReq({ raw: 'first' }) as never)
    await POST(makeReq({ raw: 'second' }) as never)
    await POST(makeReq({ raw: 'third' }) as never)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).raw).toBe('first')
    expect(JSON.parse(lines[2]).raw).toBe('third')
  })

  it('caps entity object at MAX_ENTITY_KEYS (20) — extras dropped', async () => {
    const huge: Record<string, number> = {}
    for (let i = 0; i < 100; i++) huge[`k${i}`] = i
    const res = await POST(makeReq({ raw: 'noisy', entities: huge }) as never)
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as { entities?: Record<string, number> }
    expect(row.entities).toBeDefined()
    expect(Object.keys(row.entities!).length).toBe(20)
  })

  it('drops over-long entity keys and truncates over-long string values', async () => {
    const longKey = 'a'.repeat(200)
    const longVal = 'b'.repeat(1000)
    const res = await POST(
      makeReq({
        raw: 'long-entity test',
        entities: {
          ok: 'kept',
          [longKey]: 'should-be-dropped',
          big: longVal,
        },
      }) as never,
    )
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as { entities?: Record<string, string> }
    expect(row.entities!.ok).toBe('kept')
    expect(row.entities![longKey]).toBeUndefined()
    expect(row.entities!.big.length).toBe(256)
  })

  it('returns HTTP 507 once the JSONL exceeds the configured byte cap', async () => {
    process.env.SCRIPTURELIVE_TRAINING_FEEDBACK_MAX_BYTES = '500'
    try {
      // Append enough rows to bust 500 bytes (~250 B per row).
      for (let i = 0; i < 5; i++) {
        const r = await POST(makeReq({ raw: `pre-${i}` }) as never)
        // The first one or two will succeed; later ones may 507.
        expect([200, 507]).toContain(r.status)
      }
      const finalRes = await POST(makeReq({ raw: 'overflow' }) as never)
      expect(finalRes.status).toBe(507)
      const data = (await finalRes.json()) as {
        ok: boolean
        maxBytes: number
        currentBytes: number
      }
      expect(data.ok).toBe(false)
      expect(data.maxBytes).toBe(500)
      expect(data.currentBytes).toBeGreaterThanOrEqual(500)
    } finally {
      delete process.env.SCRIPTURELIVE_TRAINING_FEEDBACK_MAX_BYTES
    }
  })

  it('coerces an unknown source value to the safe default', async () => {
    const res = await POST(
      makeReq({ raw: 'weird source', source: 'rogue_value' }) as never,
    )
    expect(res.status).toBe(200)
    const lines = fs
      .readFileSync(path.join(tmpDir, 'voice-feedback.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const row = JSON.parse(lines[0]) as { source: string }
    expect(row.source).toBe('parser_miss')
  })
})
