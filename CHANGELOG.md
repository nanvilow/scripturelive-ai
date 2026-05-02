# Changelog

All notable user-visible changes ship in this file. The release workflow
(`.github/workflows/release-desktop.yml`) extracts the section matching the
git tag and uses it as the GitHub Release body, so anything you write
here under the right heading appears verbatim on the Releases page and in
the in-app "What's new" panel that electron-updater surfaces.

Format rules (so the workflow's extractor keeps working):

- One section per version, headed by `## v<MAJOR>.<MINOR>.<PATCH>` exactly
  (no extra prefix). The first whitespace after the version is fine —
  e.g. `## v0.5.28 — 2026-04-25` is OK.
- Each section ends at the next `## v` heading (or end of file).
- Group changes under `### Added` / `### Fixed` / `### Changed` /
  `### Removed` / `### Security` so it reads cleanly.
- Write for the operator, not the engineer. "Verses now appear within
  ~250ms" beats "reduced CHUNK_MS from 4500 to 2500".

## v0.7.25 — 2026-05-02

### Changed

- **AI features now work out of the box on every install — no
  operator setup required.** Operator feedback on v0.7.24: "I
  don't want every church having to paste an OpenAI key into
  Admin → Keys; do it the same way Deepgram works." This release
  restores the build-time OpenAI key bake (which v0.7.20 had
  removed when the project was Deepgram-only). Now:
  - The build-time OpenAI key is shipped inside the installer the
    same way the Deepgram key is.
  - On every operator's PC, AI Verse Search ("find the verse that
    says love your enemies") and passive AI Scripture Detection
    activate the moment they launch v0.7.25 — no Admin → Keys
    step, no env vars, no extra configuration.
  - The per-PC override path added in v0.7.24 still works — a
    church that wants to bill against their own OpenAI account
    can still paste their own key in the Admin modal and it
    takes precedence over the bundled default.
  - The OpenAI key stays on the server side only (it's used by
    the `/api/scripture/semantic-match` Next.js API route, never
    by the renderer), so it doesn't appear in the browser bundle
    where end users could read it from devtools.

### Notes

- For maintainers: the GitHub Actions release workflow already
  forwards `OPENAI_API_KEY` from the repo secret of the same
  name (release-desktop.yml line 79). If that secret isn't set,
  the bake will be empty and operators will fall back to either
  their per-PC license override or the silent no-op behaviour
  that was in v0.7.24. Set `OPENAI_API_KEY` as a GitHub repo
  secret on `nanvilow/scripturelive-ai` if you haven't already.
- Same trust and cost model as Deepgram: every install hits
  OpenAI on the build-owner's account. The matcher uses
  text-embedding-3-small at roughly $0.02 per million tokens
  with most voice commands under 20 tokens, so usage is
  negligible even across many churches.

## v0.7.24 — 2026-05-02

### Fixed

- **"Next verse" / "previous verse" now rolls into the next chapter
  automatically.** Operator bug report: when the live screen showed
  John 3:36 (last verse of chapter 3) and the operator said "next
  verse", nothing happened — they had to use a separate "next
  chapter" command. Now "next verse" on John 3:36 correctly advances
  to John 4:1, and "previous verse" on John 4:1 rolls back to John
  3:36. A small toast announces the chapter change so the operator
  knows the rollover happened. Rollover stays within the same book
  — at a book boundary (Revelation 22:21 + next, Genesis 1:1 +
  previous) the existing legacy behaviour kicks in. The standalone
  "next chapter" / "previous chapter" commands still work exactly
  as before.

- **AI Scripture Detection and AI Verse Search now actually use the
  OpenAI key admins set in the in-app Admin modal.** Operator bug
  report after v0.7.23: the AI features stayed silent even though
  the key was configured under Admin → Keys. Root cause: the matcher
  was reading `process.env.OPENAI_API_KEY` only, and the admin-set
  key was being saved to the license config without ever being
  wired through to the matcher. v0.7.24 resolves the OpenAI key
  from BOTH sources (env first, then admin license config), so:
  - If you already entered your OpenAI key in Admin → Keys, AI
    Scripture Detection and AI Verse Search start working
    immediately on next launch (no env var, no env file, no
    restart of anything else).
  - The matcher rebuilds its OpenAI client automatically when you
    rotate the key in Admin, no app restart needed.
  - The status flag (`/api/scripture/semantic-match` GET) now
    returns `hasApiKey: true` when EITHER source is populated.

### Notes

- If you don't already have an OpenAI key configured, open the
  Admin modal (license/admin entry point) → Keys → paste your key.
  AI features will activate within a few seconds.

## v0.7.23 — 2026-05-02

### Added

- **AI Verse Search by voice.** Operators can now describe a verse in
  their own words and ScriptureLive will find it using AI. Speak any
  of these forms (with or without the "Media" wake word):
  - *"Find the verse about loving your enemies"* → Matthew 5:44
  - *"What's the scripture that says love is patient"* → 1 Corinthians 13:4
  - *"Where does the bible say be still and know"* → Psalm 46:10
  - *"Show me the verse about a city on a hill"* → Matthew 5:14
  The match is found via the same OpenAI embeddings engine that
  already powers the live AI scripture detection in the sermon
  panel — so paraphrased and out-of-order quotes are recognised.
  The found verse is loaded in your currently-selected translation
  and pushed to live, exactly as if you had said the canonical
  reference. Falls back to a clear toast message when no good match
  is found, when there's no internet, or when the OpenAI key is
  missing — never a silent failure.

### Notes

- AI Verse Search currently searches the popular-verses corpus
  (~480 of the most-quoted verses across the whole Bible). Verses
  outside that corpus will not be matched in this release; we'll
  expand coverage in v0.8.0.
- AI features need an `OPENAI_API_KEY` configured in your
  environment. If you already have AI Scripture Detection working
  in the live sermon panel, AI Verse Search will work too.

## v0.7.22 — 2026-05-02

### Fixed

- **"Next verse" / "previous verse" voice commands now actually
  advance through scripture.** Operator bug report on v0.7.21:
  *"When it's on John 3:3 and a voice command is given for 'next
  verse', it should move to John 3:4."* The old handler only moved
  the highlight inside multi-verse passages and silently did nothing
  on single-verse slides — which is what most operators are on.
  Now saying *"next verse"* on John 3:3 loads John 3:4 from the
  Bible and pushes it live (same for the entire Bible — book + chapter
  boundaries are respected, so it won't try to load John 3:37 or jump
  past Revelation 22). *"Previous verse"* works the same way going
  backwards.

### Changed

- **Trial shortened from 3 hours to 70 minutes.** Operators reported
  that 3 hours was effectively letting trial users get through a full
  Sunday service for free. 70 minutes is enough to walk through the
  installer, see verses appear in a short test, and decide whether
  to activate — without covering an entire service. **Existing
  trials keep their original 180-minute budget** (the change applies
  to fresh installs only); paid installs are not affected.

## v0.7.21 — 2026-05-01

### Fixed

- **Packaging hotfix.** The v0.7.20 Windows build failed to compile
  because one source file (`local-bible.ts`, the offline KJV/NIV/ESV
  lookup module) was present locally but had never been committed to
  git. v0.7.21 ships the missing file. There are no other code or
  feature changes vs v0.7.20 — see the v0.7.20 notes below for the
  full list of what's new since v0.7.18.

## v0.7.20 — 2026-05-01

This release rolls up everything from v0.7.19 (which was committed but
never tagged as a release) plus the operator-requested OpenAI cleanup.

### Added

- **You get a real 3-hour trial.** New installs now get a full 3 hours
  of unactivated runtime, up from the old 30 minutes. If you're
  already in a running trial it's automatically extended; paid
  installs are not affected.
- **Welcome popup on first launch.** The very first time the app
  opens on a PC you'll see a short "Welcome to ScriptureLive AI"
  dialog explaining the trial and how to activate. It dismisses
  permanently after the first close — you'll never see it again on
  that PC.
- **Voice commands understand more of what you say.**
  - **"Change to NIV"** (or NLT, ESV, MSG, AMP, KJV, NKJV, NASB,
    CSB, NRSV, RSV, ASV, NCV, GNT, CEV, ERV, WEB) — switches the
    on-screen Bible translation immediately, no clicking required.
  - **"Delete previous verse"** — removes the last verse you sent
    to the screen.
  - **"Show verse 7"** (or any number) — re-displays a specific
    verse from the chapter currently on screen.
  - **"Media, [command]"** — say "media" first to disambiguate from
    sermon speech, e.g. *"media, change to NIV"*.
  - You can chain commands: *"show John 3:16, change to NIV, show
    verse 17"* runs all three back-to-back.
- **Smarter, more accurate voice command recognition.** A 5,300-
  example training dataset was added so the engine handles
  natural phrasing variants ("turn to", "open to", "let's read")
  in addition to the exact phrases.
- **The packaged installer ships with a default admin password
  baked in.** Operators reported that the admin password they set
  on PC1 (e.g. "1234") didn't carry over to PC2 — every fresh
  install fell back to "admin". Now every PC running the same
  installer shares the same default password the operator set at
  build time. You can still override it per-PC via Admin →
  Settings if you want different passwords on different PCs.

### Changed

- **Startup test email is now opt-in instead of opt-out.** Previously
  the server sent a test email on every cold-start (boot, redeploy,
  workflow restart). Operators reported being spammed by these once
  SMTP was already verified. Now you have to set
  `SEND_STARTUP_TEST_EMAIL=1` in the deployment secrets to receive
  one. For ad-hoc re-testing, POST `/api/license/test-email` fires a
  single email without restarting the server.
- **Transcription is Deepgram-only.** OpenAI Whisper has been removed
  from the engine fallback chain — every PC now goes straight to
  Deepgram for the streaming-fast latency you saw in v0.5.35+. The
  engine picker no longer offers "Whisper".

### Removed

- **OpenAI is no longer used anywhere in the build.** The OpenAI key
  is no longer baked into the installer, no longer required as a
  deployment secret, and no longer printed in the startup
  diagnostic. v0.7.19 already cut OpenAI from transcription;
  v0.7.20 finishes the job by stripping it from the build pipeline
  entirely.

### Notes for operators

- If you previously set `OPENAI_API_KEY` in your Replit deployment
  secrets, you can delete it — it's no longer read by anything in
  the app.
- The desktop installer is now ~558 MB (unchanged from v0.7.18).
  Existing installs on v0.7.17+ will auto-update in the background
  via electron-updater.

## v0.5.36 — 2026-04-26

### Fixed

- **Last words of every utterance are no longer lost on Stop.** When
  the operator pressed Stop (or the engine restarted), the desktop
  app used to close the streaming connection too quickly, before
  Deepgram had finished sending the tail of the current sentence
  (~200-500 ms of pending transcript). Now both ends do a graceful
  drain — the desktop tells the server it's done, the server tells
  Deepgram to flush, the final results flow back, and only then
  does the connection close. Operators see complete sentences in
  the transcript panel instead of cut-off ones.
- **Mic indicator turns off when the connection drops unexpectedly.**
  If the streaming connection died mid-sermon (network blip, server
  restart), the OS microphone indicator used to stay lit and the UI
  kept claiming the engine was "listening" even though no audio was
  reaching the server. The desktop now detects unexpected
  disconnects, surfaces a clear toast ("Live transcription
  disconnected"), and tears down the mic capture so the OS
  indicator goes dark.

## v0.5.35 — 2026-04-26

### Changed

- **Live Transcription is now real-time.** Replaced the chunked Whisper
  loop (which posted a fresh 2.5-second audio clip every cycle) with
  Deepgram Nova-3 streaming over a single WebSocket. Words now appear
  in the transcript panel within ~250 ms of being spoken instead of
  waiting for the next 2.5-second chunk to upload, transcribe, and
  return. Verse detection fires the moment the speaker finishes the
  reference, not seconds later.
- **Bible book names are pre-boosted.** Every Deepgram session is
  primed with all 66 Bible book names (in singular, "1/2/3", and
  spoken "First/Second/Third" forms) plus reference vocabulary
  ("chapter", "verse", "turn to", "the Bible says"). Hard-to-spell
  books like Habakkuk, Zephaniah, and Philippians now transcribe
  reliably; previously Whisper would mishear them as everyday words
  and verse detection would silently miss the reference.

### Fixed

- **No more silence-hallucinations in the transcript panel.** Whisper
  used to invent phrases like "thanks for watching", "subscribe", and
  "you" during natural pauses in speech. Deepgram does not. The
  v0.5.30 hallucination blocklist is no longer needed because the
  source no longer produces those phrases at all.
- **Mid-utterance verses are no longer split by chunk boundaries.** The
  old chunked path could cut a reference in half ("…three" / "sixteen")
  and never recognise it. Streaming sees the whole utterance as one
  continuous transcript.

### Notes for operators

After installing this update, the api-server on Replit must be
republished so the new `/api/transcribe-stream` WebSocket endpoint is
live on `scripturelive.replit.app`. Until then, the desktop app's
transcription will surface a "Live transcription unavailable" error
on the Live Display footer. The shared Deepgram key lives only on
Replit and is never installed on customer machines.

## v0.5.33 — 2026-04-25

### Fixed

- **Live Detection no longer goes silent on spoken Bible references.** The
  spoken-number normaliser was summing every consecutive number word into a
  single total, so "John three sixteen" became "John 19" instead of
  "John 3 16" and the verse detector silently rejected it. Each number word
  now emits its own digit, with classic compounds preserved
  ("twenty one" → 21, "three hundred" → 300). Sermon references like
  "Romans eight twenty eight" now reliably commit as Romans 8:28.
- **Loose verse references without a colon are now accepted from speech.**
  Speech-to-text rarely produces the colon, so a normalised "John 3 16"
  needed extra signal to commit. The detector now accepts the loose form
  when the source text was normalised from spoken numbers OR has a strong
  scripture-context word nearby. Bare "John 3 16" typed into the operator
  console with no other signal is still rejected, so the conversational
  false-positive class ("John had 3 apples and 16 oranges") stays blocked.
- **Output / NDI surface no longer goes pure black between slides.** Once
  the operator had broadcast their first slide, `showStartupLogo` flipped
  to `false` permanently, and any subsequent clear state painted solid
  black. The clear state now ALWAYS paints the Scripture AI splash
  watermark unless the operator explicitly disabled it. True black still
  requires the explicit Black button (`s.blanked`).
- **Output surface is no longer blank during the SSE handshake.** The
  initial HTML body is now seeded with the Scripture AI splash watermark
  so the projector / NDI feed has visible content from the moment the
  page loads, not from the moment the first state arrives.

## v0.5.32 — 2026-04-25

### Fixed

- **Output and NDI surfaces no longer go black between slides.** The previous
  fade transition briefly faded the screen to fully black before the new
  slide painted, which on a stalled timer (background tab, slow machine)
  could leave the projector or NDI receiver blank for a noticeable beat.
  The renderer now paints the new slide instantly and softly cross-fades
  it in — opacity never reaches zero, so the surface is never blank.
- **NDI receivers always cut hard.** The soft-fade animation is skipped on
  the NDI surface so vMix / OBS see a clean frame-by-frame switch instead
  of a 350 ms opacity ramp on every slide. The receiver's own program
  transitions are unaffected and remain in the operator's control.
- **Live Transcription / Detected Verses no longer fire on conversational
  speech.** The verse detector now requires either an explicit
  "chapter:verse" colon ("John 3:16"), an explicit "chapter X verse Y"
  phrasing, or a strong scripture context lead-in ("turn to", "the Bible
  says", "according to") before accepting a reference. The old behaviour
  matched bare "John 3" anywhere in the transcript, which produced false
  positives like "John had 3 apples" → "John 3" in the Detected Verses
  panel. The minimum confidence floor for committing a detection was
  also raised so word-soup matches drop silently.
- **Manual Bible Lookup still accepts whole-chapter inputs.** Typing
  "Psalms 23", "1 Corinthians 13", or "Gen 1" into the lookup search
  box continues to pull the entire chapter, even though the speech
  detector now requires a colon or context word. The lookup parser
  uses a tolerant whole-string match that can never trigger on a
  sentence excerpt — your typed reference, and only your typed
  reference, is what gets looked up.

## v0.5.29 — 2026-04-25

### Added
- **Update-available popup.** When a new release is detected, a clear
  modal pops up in the middle of the app announcing the new version
  with a preview of the release notes and *Download now* / *Later*
  buttons. Complements the corner toast (which is suppressed
  mid-broadcast and at app launch by the on-air gate) so you actually
  see the update notice when you open the app.
- **Installer copied to your Desktop automatically.** After an update
  finishes downloading, a copy of `ScriptureLive AI Setup <version>.exe`
  lands on your Desktop so you have a backup you can keep, carry to
  another PC, or re-run later.
- **On-air badge on Settings → Updates.** While NDI is broadcasting,
  the Updates card shows an *On Air* badge so it's obvious why install
  actions are held.
- **Operator override: install mid-broadcast.** A one-click *Install
  Anyway* path for the rare case you genuinely need to patch during a
  live service.
- **Mute the update toast.** A new Settings toggle lets you silence
  the corner update toast — useful if you'd rather see only the new
  modal popup or check Settings yourself.

### Fixed
- **Cleaner release-notes preview in the update toast.** Long GitHub
  URLs are no longer dumped into the toast preview — link text is
  shown, the bare URL is dropped, so the preview is actually readable.
- **Auto-update filename mismatch.** The installer name embedded in
  `latest.yml` now exactly matches the asset on the Releases page, so
  the in-app updater finds and downloads the new build instead of
  silently 404-ing.

### Notes
- The installer is still unsigned. Windows SmartScreen will show
  *Windows protected your PC* — click *More info* → *Run anyway*.
- Internal: the release pipeline now skips signature verification
  automatically when no code-signing certificate is configured (so
  unsigned CI runs no longer fail), and end-to-end coverage was added
  for the hide-to-tray vs quit-on-close toggle.

## v0.5.28 — 2026-04-25

### Fixed
- **NDI / output letter-drop on verse text.** The browser output tab and
  the NDI feed were silently dropping characters from verse bodies
  ("subjection" rendered as "ubjection", "gospel" as "go pel") whenever
  the verse text contained Strong's `<S>`/`<s>` markup the renderer was
  treating as raw HTML. Verse content is now properly sanitised before
  broadcast, so what you see on preview is exactly what your
  congregation sees.
- **Auto-update signature gate could block releases when no signing
  certificate was configured.** A new build-time signature check rode
  along with this release; it has been made conditional on
  `WIN_CSC_LINK` being configured, so unsigned builds no longer fail
  the pipeline. (You'll see a SmartScreen warning on install until a
  proper code-signing certificate is wired up.)

### Changed
- **Verse detection feels instant.** Cloud Whisper now records 2.5s
  chunks instead of 4.5s, and clicking *Detect Verses Now* forces an
  immediate transcription instead of waiting for the next chunk
  boundary. Failures are now surfaced as a brief toast instead of
  failing silently.
- **Media autoplay with sound** on both preview and live by default.
  Drop a video into the slide and you'll hear it without flipping the
  speaker / headphone toggle first.

### Notes
- The installer is unsigned for now. Windows SmartScreen will show
  "Windows protected your PC" — click *More info* → *Run anyway*.
- If you're upgrading from v0.5.27 and the in-app *Check for Updates
  Now* button finds nothing, you can also install this build manually
  from the Releases page; v0.5.27's auto-update path had a manifest
  filename mismatch that v0.5.28 corrects.
