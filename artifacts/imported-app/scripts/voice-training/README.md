# Voice Training Dataset

This directory contains the generator for the AI training dataset that
teaches the ScriptureLive voice command parser how preachers actually
speak — including incomplete sentences, variations, wake-words, and
common speech errors.

## Files

- `generate.mjs` — Procedural generator. Reads template tables and
  emits two outputs.
- `../../src/data/voice-training.json` — Full curated dataset
  (≈ 5 300 entries, ~1.3 MB). Server-side / documentation use.
- `../../src/lib/voice/training-runtime.ts` — Auto-generated runtime
  shim with just the index the client parser needs (filler set).
  Imported by `commands.ts`.

## Schema

Every entry in `voice-training.json`:

```json
{
  "raw": "Give me message version",
  "normalized": "give me message version",
  "intent": "Translation Change",
  "entities": { "translation": "MSG" },
  "confidence": 95
}
```

### Intents (closed vocabulary — do not invent new ones)

| Intent                | Used for                                              |
|-----------------------|-------------------------------------------------------|
| `Scripture Request`   | Direct verse references like "John 3:16"              |
| `Partial Verse Match` | Famous verse text snippets ("In the beginning…")     |
| `Translation Change`  | "Switch to NKJV", "Give me the message version"       |
| `Navigation`          | "Next verse", "Show verse 12", "Previous chapter"     |
| `Media Control`       | "Send to live", "Show on screen"                      |
| `Clear Screen`        | "Clear screen", "Black screen", "Delete that verse"   |
| `Ignore`              | Back-channel — "Amen", "Thank you media", "Hmm"       |

## Regenerating

After editing the template tables in `generate.mjs`:

```bash
pnpm --filter @workspace/imported-app run training:generate
```

This rewrites BOTH the JSON and the runtime shim. Commit both files.

## How the runtime uses the dataset

1. **Filler suppression** — `commands.ts` merges every `Ignore`
   entry's `normalized` form into its `FILLER_UTTERANCES` set so
   utterances like "Hallelujah" and "Bless the Lord" never reach
   pattern matching.

2. **Documentation source** — Every other intent's entries serve as
   reference cases: when extending the parser, they tell you what
   real preacher speech looks like.

## Auto-learning capture

The companion endpoint `POST /api/license/training-capture` records
real-world utterances the parser missed:

```bash
curl -X POST http://localhost/api/license/training-capture \
  -H 'content-type: application/json' \
  -d '{
    "raw": "John tree sixteen",
    "proposedIntent": "Scripture Request",
    "actualAction": "open_john_3_16",
    "source": "parser_miss"
  }'
```

Rows append to `~/.scripturelive/voice-feedback.jsonl` (mode 0o600,
local only — never uploaded). Periodically review the file and
promote useful examples into the template tables in `generate.mjs`,
then regenerate.

## Quality control

- No duplicate entries (the generator dedupes by
  `normalized + intent`).
- Stable sort order (intent then raw text) so the JSON diff is
  reviewable across regenerations.
- Number-word substitution ("three" ↔ "3") applied to every
  scripture phrasing.
- 1 John ↔ "First John", Psalm ↔ Psalms book-name alternates
  generated automatically.

## Growing the corpus

Current size: ~5 300 entries (production-ready tier).

To expand:

- Add rows to `POPULAR_VERSES`, `PARTIAL_QUOTES`, `IGNORE_PHRASES`
  etc. in `generate.mjs`.
- Add a phrasing template to `SCRIPTURE_PHRASINGS` or
  `TRANSLATION_PHRASING` to multiplicatively increase coverage.
- Add a new `WAKE_PREFIXES` entry to capture a new wake-word
  variant.

Each new template combines with all existing data, so single-row
additions can yield hundreds of new dataset entries.
