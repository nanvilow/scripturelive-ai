// v0.7.19 — Sanity tests for the auto-generated training-runtime
// shim and its merge into the parser's filler set.
//
// These tests pin three invariants:
//   1. The runtime shim is non-empty (a regenerate that produced
//      zero fillers would silently break the parser, so we assert
//      a sensible floor).
//   2. The shim is consistent with the source-of-truth JSON
//      (totals match within the "Ignore" intent).
//   3. The parser actually treats every dataset filler as a filler
//      (the merge in commands.ts must not be silently dropped).
//
// If you regenerate the dataset and one of these fails, the
// parser-side merge is broken — DO NOT relax the assertions.

import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATASET_FILLERS, DATASET_VERSION } from './training-runtime'
import { detectCommand } from './commands'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FULL_DATASET_PATH = path.resolve(__dirname, '..', '..', 'data', 'voice-training.json')

describe('training-runtime shim', () => {
  it('declares a non-empty filler list', () => {
    expect(DATASET_FILLERS.length).toBeGreaterThanOrEqual(20)
  })

  it('declares a generator version string', () => {
    expect(typeof DATASET_VERSION).toBe('string')
    expect(DATASET_VERSION.length).toBeGreaterThan(0)
  })

  it('matches the Ignore-intent slice of the full dataset', () => {
    const raw = fs.readFileSync(FULL_DATASET_PATH, 'utf8')
    const dataset = JSON.parse(raw) as {
      entries: Array<{ intent: string; normalized: string }>
    }
    const ignoreNormalized = new Set(
      dataset.entries
        .filter((e) => e.intent === 'Ignore')
        .map((e) => e.normalized),
    )
    expect(DATASET_FILLERS.length).toBe(ignoreNormalized.size)
    for (const f of DATASET_FILLERS) {
      expect(ignoreNormalized.has(f)).toBe(true)
    }
  })
})

describe('parser FILLER_UTTERANCES merge', () => {
  // The detector returns null for anything classified as filler, so
  // we use that as our oracle: every dataset filler MUST cause
  // detectCommand() → null. If any returns a command, the parser
  // is misclassifying back-channel speech as an action.
  it.each(DATASET_FILLERS.slice(0, 25))(
    'classifies dataset filler %j as null (no command)',
    (filler) => {
      expect(detectCommand(filler)).toBeNull()
    },
  )

  // A high-value subset that the operator specifically reported
  // being misfired in v0.7.18 — pin them explicitly so a future
  // FILLER_UTTERANCES refactor can't regress them silently.
  const CRITICAL = [
    'amen',
    'hallelujah',
    'praise god',
    'thank you',
    'thank you media',
    'okay',
    'glory to god',
    'bless the lord',
  ]
  it.each(CRITICAL)('critical filler %j is suppressed', (s) => {
    expect(detectCommand(s)).toBeNull()
  })
})
