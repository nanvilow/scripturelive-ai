# Desktop installers — drop folder

This is **not** the served download folder. Built installers must be placed in
`artifacts/imported-app/public/downloads/` so they are exposed at:

- `GET /download` — public download page (auto-detects OS)
- `GET /api/download/manifest` — JSON describing what's available
- `GET /api/download/win-x64` → streams `ScriptureLive AI-<version>-Setup-x64.exe`
- `GET /api/download/mac-arm64` → streams `ScriptureLive AI-<version>-arm64.dmg`
- `GET /api/download/mac-x64` → streams `ScriptureLive AI-<version>-x64.dmg`

## Workflow

1. Build on Windows: `pnpm --filter @workspace/imported-app run package:win`
2. Build on macOS: `pnpm --filter @workspace/imported-app run package:mac`
3. Copy the produced files from `artifacts/imported-app/release/` into
   `artifacts/imported-app/public/downloads/` keeping their original filenames.
4. Bump the `version` in `public/downloads/manifest.json` if needed and update
   `releaseNotes`.
5. Restart the dev/prod server. The `/download` page will auto-detect the new
   files (size + availability are read from disk).

## Hosting on GitHub Releases instead

If you would rather host the binaries on GitHub Releases (recommended for
larger files), open `public/downloads/manifest.json` and set
`externalReleaseUrl` to the release base URL, e.g.:

```json
{
  "externalReleaseUrl": "https://github.com/your-org/scripturelive-ai/releases/download/v0.2.0"
}
```

The download endpoints will then 302-redirect to that host instead of streaming
local files.
