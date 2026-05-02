// v0.7.19 — Voice-training auto-learning capture endpoint.
//
// Companion to src/data/voice-training.json. The static dataset
// covers what we KNOW preachers say; this endpoint captures what
// they ACTUALLY say in production so the corpus can grow against
// real-world speech rather than guesswork.
//
// Wire-up flow (recommended client integration — left as a follow-up
// for the renderer team to call from speech-provider.tsx):
//
//   1. Speech provider receives a transcript line.
//   2. It runs detectCommand() and the reference engine.
//   3. If neither produced a result, OR if the user manually triggered
//      a different action within ~3 s, the provider POSTs to this
//      endpoint with the original raw transcript and (optionally) the
//      action the operator actually took. We persist it as a
//      candidate for review.
//
// What this endpoint DOES:
//   • Validates the request body (Zod-light: hand-rolled to avoid a
//     new dep).
//   • Appends a single JSONL row to ~/.scripturelive/voice-feedback.jsonl
//     (created on first use, mode 0o600).
//   • Returns the row id (timestamp + sequence) so the client can
//     correlate later.
//
// What it deliberately does NOT do:
//   • No ML / no live retraining. The operator can review the JSONL
//     periodically and decide which entries to promote into the
//     curated dataset by editing scripts/voice-training/generate.mjs.
//   • No upload to a remote server. Privacy: church audio is
//     sensitive, we keep all transcripts local.
//   • No admin auth gate — capture is high-volume and unauthenticated
//     POSTs from the local renderer are expected. Read-back routes
//     (when added) MUST require admin.
//
// Method:
//   POST /api/license/training-capture
//   Body: {
//     raw: string,                // required, the original transcript
//     normalized?: string,        // optional pre-normalized form
//     proposedIntent?: Intent,    // what the parser THOUGHT (or null)
//     actualAction?: string,      // what the operator manually did
//     entities?: Record<string, unknown>,
//     source?: 'parser_miss' | 'operator_correction' | 'manual',
//   }
//   Response: { ok: true, id: string, count: number }

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_INTENTS = new Set([
  'Scripture Request',
  'Partial Verse Match',
  'Translation Change',
  'Navigation',
  'Media Control',
  'Clear Screen',
  'Ignore',
])

const VALID_SOURCES = new Set([
  'parser_miss',
  'operator_correction',
  'manual',
])

// Cap raw transcripts to keep one runaway transcript from filling
// the operator's disk. 2 KB is more than enough for any single
// utterance — the longest scripture readings cap out around 800
// chars in our telemetry.
const MAX_RAW_LEN = 2048

// v0.7.19 — Per-row abuse guards on the entities blob. The endpoint
// is intentionally unauthenticated (high-volume local renderer
// traffic), so we have to assume any caller could try to balloon
// row size with a giant entities object. These caps keep a single
// "well-formed" request from costing more than ~5 KB of disk.
const MAX_ENTITY_KEYS = 20
const MAX_ENTITY_KEY_LEN = 64
const MAX_ENTITY_STRING_LEN = 256

// Hard ceiling on the JSONL file. Once we exceed this, new captures
// are refused with HTTP 507 (Insufficient Storage) until the
// operator rotates / archives the file. 16 MB at ~250 B per row =
// ~67 000 rows, which is well beyond what the operator can
// realistically curate by hand. Tunable via SCRIPTURELIVE_TRAINING
// _FEEDBACK_MAX_BYTES for tests and ops overrides.
const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024
function maxFileBytes(): number {
  const raw = process.env.SCRIPTURELIVE_TRAINING_FEEDBACK_MAX_BYTES
  if (!raw) return DEFAULT_MAX_FILE_BYTES
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_FILE_BYTES
}

function feedbackDir(): string {
  // Honour the same override the license storage uses, so tests
  // and CI can redirect both into a temp dir with one env var.
  const override = process.env.SCRIPTURELIVE_LICENSE_DIR
  if (override) return override
  return path.join(os.homedir(), '.scripturelive')
}

function feedbackPath(): string {
  return path.join(feedbackDir(), 'voice-feedback.jsonl')
}

function ensureDir() {
  const dir = feedbackDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

interface CaptureBody {
  raw?: unknown
  normalized?: unknown
  proposedIntent?: unknown
  actualAction?: unknown
  entities?: unknown
  source?: unknown
}

function asString(v: unknown, max = MAX_RAW_LEN): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

export async function POST(req: NextRequest) {
  let body: CaptureBody
  try {
    body = (await req.json()) as CaptureBody
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const raw = asString(body.raw)
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: 'Missing or empty `raw` field' },
      { status: 400 },
    )
  }

  // Optional fields — validate but don't reject the whole request
  // if they're shaped wrong; just drop them. A noisy 200 with a
  // clean row is more useful than a 400 that loses the example.
  const normalized = asString(body.normalized) ?? raw.toLowerCase().trim()

  const rawIntent = asString(body.proposedIntent, 64)
  const proposedIntent = rawIntent && VALID_INTENTS.has(rawIntent) ? rawIntent : null

  const actualAction = asString(body.actualAction, 128)

  const rawSource = asString(body.source, 32) ?? 'parser_miss'
  const source = VALID_SOURCES.has(rawSource) ? rawSource : 'parser_miss'

  // Entities: only keep if it's a plain object with primitive values
  // (string / number / boolean). Anything else gets dropped — we
  // don't want operator-supplied JSON blobs ballooning the file.
  //
  // Hard caps applied (abuse guard — endpoint is unauthenticated):
  //   • at most MAX_ENTITY_KEYS keys,
  //   • each key at most MAX_ENTITY_KEY_LEN chars (over-long keys
  //     are dropped, not truncated, so the operator notices the
  //     rejection rather than getting a silently-mangled column),
  //   • string values truncated to MAX_ENTITY_STRING_LEN chars.
  let entities: Record<string, string | number | boolean> | undefined
  if (
    body.entities &&
    typeof body.entities === 'object' &&
    !Array.isArray(body.entities)
  ) {
    const cleaned: Record<string, string | number | boolean> = {}
    let kept = 0
    for (const [k, v] of Object.entries(body.entities as Record<string, unknown>)) {
      if (kept >= MAX_ENTITY_KEYS) break
      if (typeof k !== 'string' || k.length === 0 || k.length > MAX_ENTITY_KEY_LEN) {
        continue
      }
      if (typeof v === 'string') {
        cleaned[k] = v.length > MAX_ENTITY_STRING_LEN ? v.slice(0, MAX_ENTITY_STRING_LEN) : v
        kept++
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        cleaned[k] = v
        kept++
      }
    }
    if (Object.keys(cleaned).length > 0) entities = cleaned
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const row = {
    id,
    capturedAt: new Date().toISOString(),
    raw,
    normalized,
    proposedIntent,
    actualAction,
    entities,
    source,
  }

  // Best-effort persist. If the disk is full / permissions fail we
  // still return ok=false rather than throwing — the renderer should
  // not retry indefinitely on a transient capture failure.
  //
  // File-size ceiling check first: if the JSONL has grown beyond the
  // configured cap we refuse the write with HTTP 507 (Insufficient
  // Storage) rather than silently appending forever. The operator
  // can rotate / archive ~/.scripturelive/voice-feedback.jsonl out
  // of band and POSTs will resume on next call.
  try {
    ensureDir()
    const fp = feedbackPath()
    let currentSize = 0
    try {
      currentSize = fs.statSync(fp).size
    } catch {
      // file doesn't exist yet — treat as size 0
    }
    if (currentSize >= maxFileBytes()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Feedback log is full; rotate ~/.scripturelive/voice-feedback.jsonl',
          maxBytes: maxFileBytes(),
          currentBytes: currentSize,
        },
        { status: 507 },
      )
    }
    fs.appendFileSync(fp, JSON.stringify(row) + '\n', { mode: 0o600 })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to persist feedback row',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // Quick row-count for the operator's UI. Cheap-ish: one stat +
  // one read of just the byte count, no full file load. We approximate
  // with byte length / avg row size (~250 B) — exact count would
  // require reading the whole file, not worth it on a hot path.
  let approxCount: number | undefined
  try {
    const stat = fs.statSync(feedbackPath())
    approxCount = Math.max(1, Math.round(stat.size / 250))
  } catch {
    /* ignore — diagnostic only */
  }

  return NextResponse.json({ ok: true, id, count: approxCount })
}
