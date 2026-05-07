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
-   **Dead-Input App-Wide Fix + Cross-Source Dedupe (v0.7.119)**: (a) Operator: "anytime I click an input box to write something it doesn't work — the cursor never appears, applies to all the app." Reproduced on Subscribe modal activation code field, Admin panel, Bible Lookup search, Library search. Root cause: Radix UI Dialog/Popover/DropdownMenu/Select/AlertDialog portals install `pointer-events: none` on `<body>` as their scroll-lock side effect (radix-ui/primitives#1241, #2122) and intermittently fail to remove it on close — every subsequent click is silently swallowed. `admin-modal.tsx:1676` already carried a defensive `style={{ pointerEvents: 'auto' }}` patch on ONE section confirming this bug class. v0.7.119 generalises to a single global override in `globals.css`: `body { pointer-events: auto !important; }`. Scroll-lock still functions via the `overflow: hidden` Radix also applies; only the click-blocking side effect is neutralised. (b) Cross-source dedupe in `store.ts addDetectedVerse` — when the same reference fires from explicit + semantic + suggestion sources, the higher-rank (explicit > semantic > suggestion) entry now evicts the lower-ranked duplicate so the operator never sees the same verse listed twice across COL 1 / COL 2 / COL 3.
-   **Renewed Codes Are Re-Activatable (v0.7.118)**: Operator escalation: "i tried renewing a code but when activating it gives error: This activation code has already been used." Root cause: `renewActivationByCode` in `storage.ts` extended `subscriptionExpiresAt` on a USED row but kept `isUsed:true`, so when the paying customer typed the renewed code into their app, `activateCode()` hit the `if (activation.isUsed) throw 'already been used'` guard and rejected. Almost every renewal path was affected because the admin operator runs the dashboard on a DIFFERENT device than the customer (or the customer's previous device has since been wiped/reinstalled), so the row is not `f.activeSubscription` on the admin PC and falls through to the "no-op" else branch. Fix: in the USED-and-not-on-this-device branch, flip the row into the same lossless transfer-in state that `deactivateSubscription()` uses (v0.7.12 pattern) — `isUsed=false`, `transferredAt=now`, `transferCount++`. The existing transfer-in branch in `activateCode()` then recognises `{ isUsed:false, transferredAt:set, subscriptionExpiresAt:<future> }` and grants exactly the preserved (renewed) deadline. The on-this-device branch is unchanged — if the admin/operator is running both roles, the active sub mirror is updated and the row stays USED so the operator's session keeps running uninterrupted.
-   **Voice / Verse / Live-Display Iteration (v0.7.109 → v0.7.117)**: Long sequence of operator-driven tuning. **Per-column thresholds (v0.7.109)** — COL 1 explicit ≥60%, COL 2 semantic/paraphrased ≥55%, COL 3 suggested 10-49% manual-only; `LIVE_HOLD_MS` anti-flicker dwell on live swap. **Voice Q&A + chapter nav + speaker-follow (v0.7.110)** — natural-question regexes for `find_by_quote`, `next/previous chapter` rerouted to chapter intent (was hijacked by greedy bare-`next` next_verse trigger), speaker-follow switched trigrams→bigrams+unigrams with thresholds 0.20→0.10 / 0.08→0.04. **Voice toast quieting + quote-prefix strip (v0.7.111)** — silenced misfire toasts on find_by_quote, strip leading "in (the) bible/scripture/word of god" from captured quote before semantic search. **Massive preacher vocabulary + always-on commands (v0.7.112)** — `go_to_reference` triggers 7→~50 ("take me to", "let's read", "open your bibles to", "turn with me to", whole-chapter fallback for bare "Psalm 23"), voice command pre-pass moved ABOVE the confidence gate so commands fire even at low Deepgram chunk confidence in noisy churches. **Trailing-punctuation strip (v0.7.113)** — `commands.ts` strips `[.,;:!?]+` from cleaned input at top of `detectCommand` so "next chapter." no longer falls through to next_verse via greedy bare-`next` startsWith match; `show_verse_n` regex similarly fixed. **Toasts off + single-verse chapter jump + 59% demotion bug + narrative event catalogue (v0.7.114)** — `path-aware-toaster.tsx` returns `null` unconditionally (suppresses every Sonner toast without touching ~80 call sites); `next_chapter`/`previous_chapter` loads only `${book} ${ch}:1` not whole chapter range; semantic source-tag cutoff lowered `< 0.6` → `< 0.55` so 0.55-0.59 hits land COL 2 not COL 3; 80+ narrative entries added to `RAW_CATALOGUE` (creation, flood, Red Sea, David+Goliath, Daniel+lions, Jonah+whale, water-into-wine, walking-on-water, feeding 5000, Lazarus, prodigal son, last supper, crucifixion, resurrection, Pentecost, Damascus road, Stephen stoned, Paul+Silas, etc.) all mapping to canonical opening verse. **Translation-switch latency + 1000-phrase catalogue + lower confidence floor + ASR aliases (v0.7.115)** — `LiveTranslationSync` routes through `lookupVerse`/`lookupRange` synchronously when target translation is bundled (sub-ms swap, no network); `preacher-phrases.ts` auto-derives 5-7-word slices from each of 337 verses in `POPULAR_VERSES_KJV` at module load → ~1200 entries dedupe-merged with 470 hand-curated; `transcriptLiveThreshold` default 0.65 → 0.55 (matches Deepgram's 0.50-0.70 noisy-church band); 17 ASR mishearing aliases (Steven→Stephen, lazerus→Lazarus, jerico→Jericho, etc.). **Cross-column switch + auto-derived demotion + fused-hit cap + verse-N trigger expansion (v0.7.116)** — `LIVE_HOLD_MS` 1250→500 ms so brand-new high-confidence COL 2 detection isn't swallowed; auto-derived catalogue entries tagged `autoDerived:true` and demoted to confidence 0.42 + source 'suggestion' (COL 3 only); AI cosine semantic-match capped to highest-scoring match per chunk (was firing 4 fused detections from one chunk); `detectShowVerseCommand` triggers 6→14 (`let's go to`, `take me to`, `scroll down to`, `move to`, `skip to`, `turn to`, etc.). **Live read-lock + auto-derived exact promotion (v0.7.117)** — `LIVE_STICKY_MS = 8000` ms read-lock window in `verse-auto-live.ts`: for 8 s after a verse fires, new candidate must beat live confidence by `LIVE_STICKY_CONFIDENCE_DELTA` (0.10) to override (stops same-chapter near-miss hijacks during operator/preacher read-back); after 8 s falls back to v0.7.116's 500 ms dwell. Auto-derived EXACT verbatim hits promoted from suggestion 0.42 → semantic 0.65 (clears 0.55 live-eligible floor); auto-derived FUZZY stays at 0.42 suggestion. Hand-curated EXACT 0.95, hand-curated FUZZY 0.85.

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