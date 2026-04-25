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
