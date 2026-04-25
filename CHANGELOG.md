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
