# Imported App

A Next.js application providing scripture-related services for web and desktop, enhancing live service experiences, and streamlining administrative tasks.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Run dev server**: `pnpm dev`
-   **Build app**: `pnpm build`
-   **Typecheck**: `pnpm typecheck`
-   **Codegen**: `pnpm codegen` (for API client)
-   **DB Push**: `pnpm db:push` (for Drizzle schema migrations)
-   **Required Env Vars**: `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `SMS_API_KEY`, `SMS_SENDER`

## Stack

-   **Monorepo**: pnpm workspaces
-   **Runtime**: Node.js 24
-   **Language**: TypeScript 5.9
-   **Frontend**: Next.js 16
-   **Backend**: Express 5
-   **Database**: PostgreSQL, SQLite, Replit DB
-   **ORM**: Drizzle ORM, Prisma
-   **Validation**: Zod
-   **Build Tool**: esbuild
-   **API Codegen**: Orval
-   **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe`, Deepgram Nova-3
-   **AI SDK**: OpenAI SDK
-   **NDI Integration**: `grandiose`

## Where things live

-   `apps/nextjs-app`: Next.js frontend and Electron wrapper.
-   `apps/api-server`: Express API backend.
-   `packages/`: Shared utilities and components.
-   `artifacts/imported-app/db/custom.db`: SQLite database for the desktop app.
-   `public/downloads/manifest.json`: Manifest for dynamic downloads.
-   `openapi.yaml`: API contracts (source of truth for Orval codegen).
-   `drizzle/schema.ts`: Drizzle ORM database schema.
-   `styles/theme/`: Theme-related files.

## Architecture decisions

-   **Monorepo Structure**: Uses pnpm workspaces for managing multiple related packages.
-   **Hybrid Deployment**: Supports both web and desktop (Electron) environments from a single codebase.
-   **API Routing**: API server is routed to `/__api-server` to avoid conflicts with Next.js routes.
-   **NDI Integration**: Browser-only NDI output and native NDI sender via Electron, supporting transparent overlays and configurable display modes, with pixel parity via pinned zoom.
-   **Multi-tiered Speech Recognition**: Employs Deepgram, Whisper, and browser speech engines with auto-fallback, VAD, and hallucination guard, complemented by AI semantic matching.
-   **Atomic License Persistence**: Uses an atomic-write JSON file for local license persistence, ensuring data integrity during critical operations like deactivation and transfer.
-   **Hard Reset for License State Changes**: Critical license state changes (activate, deactivate, transfer) trigger a hard `window.location.assign('/')` reload to prevent renderer crashes caused by stale React contexts. v0.7.107 extends the same recovery to UNCAUGHT renderer exceptions via `app/global-error.tsx` + `app/error.tsx` — any thrown React error hard-reloads to `/` instead of letting Chromium paint chrome-error://chromewebdata. Fixes the "This page couldn't load" page seen on cold boot when activation has just expired.
-   **Per-Column Auto-Live Thresholds (v0.7.109)**: COL 1 "Auto Verse Match" (explicit regex hits like "Amos 1:3") ≥60%, COL 2 "Bible Reference Quoted" (semantic / paraphrased quotations) ≥55%, COL 3 "Suggested Verses" 10-49% manual-only. **`LIVE_HOLD_MS = 1250`** — when a new qualifying detection arrives, the previous live verse stays on screen for ~1.25 s (midpoint of the operator-spec 1-1.5 s range) before the swap. Within that window further detections are queued; once it elapses the next qualifying NEWEST detection fires. Newest-first ordering preserved across all columns; same-id-as-currentLive still blocks a refire.
-   **Voice Q&A + Chapter Nav + Speaker-Follow (v0.7.110)**: Three production bugs fixed together. (1) `find_by_quote` PATTERNS extended with 6 natural-question regexes ("show me where X", "where did X", "where was X", "where does X", "who said X", "what did X say about Y") — pre-110 the matcher silently rejected these because it required the literal word "verse"/"scripture"/"passage". (2) `next chapter`/`previous chapter` triggers route to their own intent kinds again (v0.7.78 had hijacked them to one-verse step); chapter triggers MOVED above next_verse in PATTERNS table because the bare `'next'` trigger of next_verse was greedy-matching `"next chapter"`. (3) Speaker-Follow switched from trigrams to bigrams+unigrams, switchThreshold 0.20→0.10, minDelta 0.08→0.04 — pre-110 the trigram model + 0.20 floor meant real paraphrased preaching almost never crossed the threshold, so the highlight never moved.
-   **Toasts Off + Single-Verse Chapter Jump + 59% Demotion Bug + Narrative Event Catalogue (v0.7.114)**: Four operator complaints addressed at once. (a) "Disable all the notifications showing in the app; I don't like them showing." — `path-aware-toaster.tsx` now returns `null` unconditionally, suppressing every Sonner toast across all surfaces without touching the ~80 individual `toast.*()` call sites. (b) "Next chapter brings a bunch of scriptures and live displays them, which is very embarrassing." — pre-114 the `next_chapter`/`previous_chapter` handler loaded the WHOLE chapter range as `${book} ${ch}:1-${verseCount}` (e.g. John 2:1-25); now loads only `${book} ${ch}:1` via `lookupVerse`, matching standard Bible-app behaviour. (c) "59% of verse detections go to the Suggested Verses column instead from 10 to 49%" — both semantic emit sites in `speech-provider.tsx` (lines 1793, 1933) tagged hits with `source: 'suggestion'` whenever `confidence < 0.6`, but `SEMANTIC_AUTO_LIVE_MIN` is 0.55, so 0.55-0.59 hits got banished to col 3. Lowered the source-tag cutoff to `< 0.55` so the demotion threshold matches the live-eligible floor exactly. (d) "Jesus turning water into wine / Steven was stoned to death — AI detectors can even search for that verse in the Bible to auto-send it out." Pre-114 the preacher-phrase catalogue only contained paraphrased QUOTATIONS, never narrative event descriptors. Added 80+ narrative entries to `RAW_CATALOGUE` (creation, flood, Joseph's coat, Moses+burning bush, Red Sea, ten commandments, Jericho walls, David+Goliath, Daniel+lions, three Hebrew boys, Jonah+whale, water-into-wine, walking-on-water, feeding 5000, Lazarus, prodigal son, good Samaritan, last supper, crucifixion, resurrection, Pentecost, Damascus road, Stephen stoned, Paul+Silas, etc.) all mapping to the canonical opening verse of each story. Catalogue is matched via the existing local substring + Levenshtein-1 fuzzy scan in `preacher-phrases.ts`, so it works offline and fires regardless of Deepgram chunk confidence.
-   **Trailing-Punctuation Strip — "next chapter" no longer routes to next_verse (v0.7.113)**: Operator reported "next chapter" was firing as next-verse step. Root cause: ASR engines append a period/comma to final transcript chunks ("next chapter."). The strict trigger comparison in `commands.ts` (`lower !== trig && !lower.startsWith(trig + ' ')`) failed on "next chapter." because no trailing space, then the loop fell through to the next_verse pattern where bare "next" matched `startsWith("next ")` against "next chapter." with tail "chapter." (length 8, under the 12-char tail limit) — silently firing next_verse. Same regression broke `show_verse_n`'s `^...verse \d+\s*$` regex which couldn't see past trailing punctuation, so "verse 10." was rejected. Fix: strip trailing `[.,;:!?]+` from `cleaned` once at the top of `detectCommand` before any matcher runs. Locked with 5 new regression tests in `commands.test.ts`.
-   **Massive Preacher Vocabulary + Always-On Commands (v0.7.112)**: Operators reported "nothing works" — voice commands silently failing on natural preacher speech. Two root causes fixed: (a) PATTERNS table only had 7 trigger phrases for `go_to_reference` ("go to / open / show / display / jump to / turn to") so common preacher utterances like "take me to John 3:16", "let's read Psalm 23", "open your bibles to John 14", "turn with me to Ephesians 2:8", "the book of Romans chapter 8" silently no-op'd. Now ~50 trigger phrases including "take me to", "let's go to / read / open / look at / turn to", "open your bible(s) to", "turn with me to", "please turn to / open / read", "we are reading", "read with me from", "from/in the book of", plus a whole-chapter fallback so bare "Book N" ("Psalm 23", "John 14", "Romans chapter 8") loads chapter:1 instead of returning null. Chapter and verse navigation similarly expanded ("take me to the next chapter", "let's go to the next verse", "go back a chapter"). (b) The `liveT = 0.65` confidence gate dropped the ENTIRE pipeline (commands AND verses) when Deepgram reported low chunk confidence in noisy church environments — even a perfectly-spoken "next verse" was swallowed when surrounding music dragged the chunk score below threshold. Voice command pre-pass moved ABOVE the confidence gate so commands always fire; only verse detection / semantic match remains gated.
-   **Voice Toast Quieting + Quote-Prefix Strip (v0.7.111)**: Two operator complaints after v0.7.110. (a) Misfired voice questions like "show me where in the bible Jesus was crucified" generated red `No match for "in the bible"` toasts on every misfire — silenced. The find_by_quote dispatcher in `speech-provider.tsx` now (i) suppresses the loading toast (console-only), (ii) silently dismisses the loading toast on no-match (no error toast), and (iii) the outer pipeline skips the cmd.label `Find: ...` toast when `cmd.kind === 'find_by_quote'` since the dispatcher manages its own messaging — only the success toast remains visible. (b) Captured quote prepended with "in (the) bible/scripture/scriptures/word (of god)" leaked the prefix into the semantic search and tanked the recall — `commands.ts` now strips that leading phrase before returning the command. New tests in `commands.test.ts` (7 tests) pin the strip behaviour.

## Product

-   Dynamic downloads for various OS, with file hashing and multi-threaded support.
-   Real-time slide updates and live congregation output.
-   NDI broadcasting with configurable display modes (lower-third, full-screen).
-   Advanced speech recognition with AI semantic matching for scripture verses.
-   Comprehensive admin dashboard for managing activations, user licenses, and telemetry.
-   Self-hosted, MoMo-based subscription system with free trial and license transfer.
-   Customizable UI/UX with dark/light themes and theme designer.
-   Voice commands for navigation and verse lookup.
-   Automated email and SMS notifications for activations.

## User preferences

-   After EVERY fix / version bump, build and present a fresh ZIP of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
-   Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

## Gotchas

-   `persist()` operations are fire-and-forget async writes to prevent UI freezes, with retries for disk contention.
-   License state changes (activate/deactivate/transfer) trigger hard page reloads; avoid complex UI interactions immediately after these operations.
-   NDI sender has a 60-second "linger mode" after disconnect to maintain OBS/vMix connections.
-   Renderer crashes are handled by a crash mask that attempts recovery and logs full history.
-   Auto-live confidence thresholds and stability gates are crucial for projection; consult `verse-auto-live.ts` for current logic. As of v0.7.109: explicit ≥0.60, semantic ≥0.55, suggestions 0.10-0.49, **1.25 s anti-flicker dwell** (previous verse stays live), newest-first ordering.
-   The "Detected Verses" card now separates explicit, semantic, and suggested verses into three distinct columns, each with independent auto-live decisions.

## Pointers

-   **Next.js Docs**: [https://nextjs.org/docs](https://nextjs.org/docs)
-   **Express Docs**: [https://expressjs.com/](https://expressjs.com/)
-   **Drizzle ORM Docs**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
-   **Zod Docs**: [https://zod.dev/](https://zod.dev/)
-   **pnpm Workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)
-   **Electron Docs**: [https://www.electronjs.org/docs](https://www.electronjs.org/docs)
-   **OpenAPI/Orval**: [https://openapi-generator.tech/](https://openapi-generator.tech/), [https://orval.dev/](https://orval.dev/)
-   **NDI SDK**: _Populate as you build_