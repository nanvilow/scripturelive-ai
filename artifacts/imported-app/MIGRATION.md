# Going independent from Replit

This document covers the small set of steps required to operate
ScriptureLive AI without any dependency on Replit (workspace, hosting,
secrets, or deployment).

## The short version

| Layer | Already independent? | Action needed |
|---|---|---|
| Installed `.exe` on operator PCs | **Yes** | None |
| Auto-updater | **Yes** (uses GitHub Releases) | None |
| Installer builds | **Yes** (GitHub Actions) | None |
| Source code | **Yes** (GitHub) | None |
| Deepgram / OpenAI API keys | **Yes** (GitHub Actions secrets, baked at build time) | None |
| AI Detection, slides, NDI, Bible translations | **Yes** (all local to the .exe) | None |
| Release ship script | **Yes** (now lives at `scripts/ship-release.mjs`) | None |
| `scripturelive.replit.app` cloud companion | **No** — hosted on Replit | Migrate Next.js app to your own host (see below) |

If your Replit subscription ended tomorrow, **every installed copy of
the desktop app keeps working, keeps auto-updating, and keeps detecting
verses**. The only thing that goes offline is the optional cloud
companion site at `scripturelive.replit.app` (which serves the cloud
admin panel + optional transcribe proxy + opt-in telemetry).

## What `scripturelive.replit.app` actually does

The Replit deployment is the SAME Next.js app as the desktop, hosted in
the cloud, exposing four endpoint groups consumed by desktop installs:

1. **`/api/transcribe`** — fallback transcription proxy. Most installs
   never hit this path because they have Deepgram + OpenAI keys baked
   into the installer.
2. **`/api/telemetry`** — opt-in anonymous install/usage stats. Posts
   silently; failure is a no-op.
3. **`/api/license/cloud/*`** — central license sync + admin panel
   served at `https://scripturelive.replit.app/?admin`. Local
   licensing on each install works without this; only cross-device sync
   + the web admin panel would go offline.
4. **The `https://scriptureliveai.com` redirect target** — operator-
   facing "Visit website" links already point at the public marketing
   domain `scriptureliveai.com`, not the Replit deployment. No change
   needed.

## Migrating the cloud companion off Replit

The Next.js app deploys to anything that runs Node 24:
**Vercel** (zero-config), **Netlify**, **Fly.io**, **Railway**,
**Render**, or a plain VPS.

### 1. Deploy the Next.js app to your new host

```bash
# Same monorepo, same artifact, same build command.
pnpm install
pnpm --filter @workspace/imported-app run build
pnpm --filter @workspace/imported-app run start
```

For a Vercel/Netlify deploy, just point the project at
`artifacts/imported-app/` and set the framework to Next.js — the
existing `next.config.mjs` handles everything.

### 2. Set the runtime environment variables on the new host

The cloud companion needs the same secrets that the GitHub Actions
build uses:

| Var | Purpose | Required? |
|---|---|---|
| `OPENAI_API_KEY` | Server-side transcribe fallback | Only if you keep `/api/transcribe` enabled |
| `DEEPGRAM_API_KEY` | Server-side transcribe fallback | Only if you keep `/api/transcribe` enabled |
| `SCRIPTURELIVE_CLOUD_BASE` | The cloud's own canonical URL (this is the value desktop installs will eventually point at) | Yes |
| `SESSION_SECRET` | Cookie signing | Yes |
| `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | License-purchase emails | If you sell licenses |
| `SMS_API_KEY`, `SMS_SENDER` | License-purchase SMS | If you sell licenses by SMS |

### 3. Point DNS at the new host

Recommended: use a subdomain like `cloud.scriptureliveai.com` (or just
point `scriptureliveai.com` itself at the new host if you want a
unified public site).

### 4. Update the desktop installer to consume the new host

The desktop already reads each cloud endpoint via an env-var override.
There is **nothing to recompile** for operators who set the env vars
on their own machines; the changes below only affect what NEW
installers default to:

| Const to update | File | New value |
|---|---|---|
| `DEFAULT_TRANSCRIBE_PROXY_URL` | `electron/main.ts` | `https://cloud.scriptureliveai.com/api/transcribe` |
| `DEFAULT_TELEMETRY_URL` | `electron/telemetry.ts` | `https://cloud.scriptureliveai.com/api/telemetry` |
| `DEFAULT_CLOUD_BASE` | `src/app/api/license/admin/cloud-sync-test/route.ts` | `https://cloud.scriptureliveai.com` |

Then ship a new release:

```bash
cd artifacts/imported-app
GH_PAT=ghp_xxxxxxxxxxxxxxxxxxxx node scripts/ship-release.mjs 0.7.256
```

Existing installs keep working unchanged (they point at the old
`scripturelive.replit.app` until they auto-update). To shorten the
overlap window, leave `scripturelive.replit.app` alive for one or two
release cycles after cutover.

### 5. Per-operator overrides (no recompile needed)

Operators can override any of the three URLs by setting an environment
variable on their machine before launching the app:

| Env var | Overrides |
|---|---|
| `TRANSCRIBE_PROXY_URL` | Transcription fallback URL |
| `SCRIPTURELIVE_TELEMETRY_URL` | Telemetry post URL (empty string disables) |
| `SCRIPTURELIVE_CLOUD_BASE` | Cloud admin / license sync host (empty string disables) |

This means individual operators can switch hosts ahead of a binary
update if they ever need to.

## Moving local development off Replit

Already mostly done:

1. Clone `git@github.com:nanvilow/scripturelive-ai.git` on any machine
   with Node 24 + pnpm.
2. `pnpm install` (Replit's main-agent sandbox blocks this; outside
   Replit it works normally).
3. `pnpm --filter @workspace/imported-app run dev` for the Next.js
   side, or `pnpm --filter @workspace/imported-app run electron:dev`
   for the full Electron shell.
4. Copy the env vars from above into a local `.env` file.

The Replit "Secrets" panel is only used for local dev/testing IN
Replit; production secrets already live in **GitHub Actions secrets**
(`DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, `GH_PAT`, etc.) where the
actual installer builds happen.

## Cutting releases off Replit

`scripts/ship-release.mjs` is fully standalone. Anywhere you have:

- A clone of this repo
- Node 24+
- A GitHub PAT with `repo` + `workflow` scopes (exported as `GH_PAT`)

…you can ship a release:

```bash
cd artifacts/imported-app
GH_PAT=ghp_xxxxxxxxxxxxxxxxxxxx node scripts/ship-release.mjs 0.7.256
```

The script atomically pushes drifted files to a `release/v0.7.256`
branch via the GitHub git-data API and triggers the
`release-desktop.yml` workflow with the correct `inputs.tag=v0.7.256`
payload. Builds happen on GitHub's Windows runner; the signed
installer lands on the GitHub Release page; auto-update picks it up.

## What dies if Replit goes away tomorrow with NO migration

1. The cloud admin panel at `https://scripturelive.replit.app/?admin`
   stops responding. Operators using local-only licensing are
   unaffected.
2. The `/api/transcribe` fallback proxy stops responding. Operators
   with baked Deepgram + OpenAI keys are unaffected (the default path).
3. The `/api/telemetry` endpoint stops responding. Telemetry posts
   silently fail; no operator-visible effect.
4. This Replit workspace becomes unavailable for development. The
   source still lives on GitHub; clone it anywhere else and keep going.

**Nothing on operator PCs changes.** AI Detection, slides, NDI output,
Bible translations, voice search, and auto-updates all keep working
because they depend on:

- Bundled assets (Bible translations, NDI runtime, OpenAI/Deepgram
  keys baked at build time)
- GitHub-hosted releases (auto-update)
- Third-party APIs (Deepgram, OpenAI) — Replit isn't in the path

…and that's the whole dependency graph for the desktop runtime.
