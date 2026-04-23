#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────
// download-whisper-assets.mjs
// ────────────────────────────────────────────────────────────────
// Downloads the whisper.cpp Windows CLI binary and the quantized
// base.en model into electron/whisper-bundle/ BEFORE electron-builder
// packages the installer. Called automatically as part of
// `pnpm run electron:build`, so the GitHub Actions workflow needs
// no edits — CI already runs electron:build before electron-builder.
//
// Fails gracefully: if either download fails the script prints a
// warning and exits 0 so local dev builds (where the assets may not
// be needed) still succeed. The Electron whisper service checks for
// both files at runtime and surfaces a clear error in the UI if
// they're missing, which is what triggers the "Switched to OpenAI
// Mode" failsafe in the renderer.
// ────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUT_DIR = path.resolve(__dirname, '..', 'electron', 'whisper-bundle')

// Pinned versions so future whisper.cpp changes don't silently alter
// the bundled runtime mid-release. Bump when you validate a newer
// release on a test machine.
const WHISPER_CPP_VERSION = 'v1.7.4'
const WHISPER_ARCHIVE = 'whisper-bin-x64.zip'
const WHISPER_URL = `https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_CPP_VERSION}/${WHISPER_ARCHIVE}`

// Quantized base.en — ~58 MB (vs 148 MB for full base.en), same
// word-error rate for cleanly-mic'd preaching. From the official
// Hugging Face mirror ggerganov publishes alongside whisper.cpp.
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin'
const MODEL_NAME = 'ggml-base.en-q5_1.bin'

function warn(msg) {
  // Emit as a GitHub Actions warning when running in CI so the
  // operator sees it in the run summary without failing the build.
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning::${msg}`)
  } else {
    console.warn(`[whisper-assets] ${msg}`)
  }
}

function log(msg) {
  console.log(`[whisper-assets] ${msg}`)
}

async function downloadTo(url, dest, redirects = 0) {
  if (redirects > 6) throw new Error(`Too many redirects for ${url}`)
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location
        if (!next) return reject(new Error(`Redirect without Location from ${url}`))
        const abs = next.startsWith('http') ? next : new URL(next, url).toString()
        res.resume()
        downloadTo(abs, dest, redirects + 1).then(resolve, reject)
        return
      }
      if (!res.statusCode || res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const out = fs.createWriteStream(dest)
      pipeline(res, out).then(resolve, reject)
    })
    req.on('error', reject)
    req.setTimeout(300_000, () => { req.destroy(new Error(`Timeout downloading ${url}`)) })
  })
}

function sha256(file) {
  const h = createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex')
}

async function unzipWindows(archive, outDir) {
  // Use PowerShell's Expand-Archive — no extra deps, always present
  // on win32. On non-win32 hosts (macOS/Linux CI runners), fall back
  // to `unzip`. In this project CI is Windows-only for desktop builds
  // per release-desktop.yml, so this branch is the hot path.
  if (process.platform === 'win32') {
    const r = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path "${archive}" -DestinationPath "${outDir}" -Force`,
    ], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`Expand-Archive exited ${r.status}`)
  } else {
    const r = spawnSync('unzip', ['-o', archive, '-d', outDir], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`unzip exited ${r.status}`)
  }
}

async function ensureWhisperBinary() {
  const binName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const finalBin = path.join(OUT_DIR, binName)
  if (fs.existsSync(finalBin)) {
    log(`whisper-cli already present at ${finalBin}`)
    return true
  }
  if (process.platform !== 'win32') {
    // The prebuilt archive we pin is win32-x64 only. On mac/linux we
    // simply skip — whisper-cli isn't needed for Replit dev, and the
    // release job runs on windows-latest.
    warn(`Skipping whisper-cli download on ${process.platform} (win32-x64 prebuilt only).`)
    return false
  }
  const tmpZip = path.join(OUT_DIR, WHISPER_ARCHIVE)
  log(`Downloading whisper.cpp ${WHISPER_CPP_VERSION} → ${tmpZip}`)
  try {
    await downloadTo(WHISPER_URL, tmpZip)
  } catch (e) {
    warn(`whisper.cpp download failed: ${e.message}`)
    return false
  }
  try {
    log(`Unzipping ${tmpZip}`)
    await unzipWindows(tmpZip, OUT_DIR)
  } catch (e) {
    warn(`Unzip failed: ${e.message}`)
    return false
  }
  // The archive nests binaries under Release/ or similar — hoist the
  // .exe we need to the top of whisper-bundle so resolve() stays
  // dead-simple at runtime.
  const candidates = []
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/whisper-cli\.exe$/i.test(ent.name) || /^main\.exe$/i.test(ent.name)) candidates.push(p)
    }
  }
  walk(OUT_DIR)
  const src = candidates[0]
  if (!src) {
    warn('No whisper-cli.exe / main.exe found in unzipped archive. Base Mode will be unavailable.')
    return false
  }
  fs.copyFileSync(src, finalBin)
  log(`Installed whisper-cli → ${finalBin}`)
  // Also copy any DLLs sitting next to the binary (ggml.dll etc).
  const srcDir = path.dirname(src)
  for (const ent of fs.readdirSync(srcDir)) {
    if (/\.dll$/i.test(ent)) {
      const from = path.join(srcDir, ent)
      const to = path.join(OUT_DIR, ent)
      if (!fs.existsSync(to)) {
        fs.copyFileSync(from, to)
        log(`Installed DLL → ${to}`)
      }
    }
  }
  try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }
  return true
}

async function ensureModel() {
  const finalModel = path.join(OUT_DIR, MODEL_NAME)
  if (fs.existsSync(finalModel) && fs.statSync(finalModel).size > 10 * 1024 * 1024) {
    log(`Model already present (${(fs.statSync(finalModel).size / 1024 / 1024).toFixed(1)} MB) at ${finalModel}`)
    return true
  }
  log(`Downloading ${MODEL_NAME} (~58 MB) → ${finalModel}`)
  try {
    await downloadTo(MODEL_URL, finalModel)
  } catch (e) {
    warn(`Model download failed: ${e.message}`)
    try { fs.unlinkSync(finalModel) } catch { /* ignore */ }
    return false
  }
  const size = fs.statSync(finalModel).size
  if (size < 10 * 1024 * 1024) {
    warn(`Model file suspiciously small (${size} bytes) — likely an HTML error page. Removing.`)
    fs.unlinkSync(finalModel)
    return false
  }
  log(`Model installed (${(size / 1024 / 1024).toFixed(1)} MB, sha256=${sha256(finalModel).slice(0, 16)}…)`)
  return true
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const bin = await ensureWhisperBinary()
  const model = await ensureModel()
  if (bin && model) {
    log('✓ whisper-bundle ready for packaging.')
  } else {
    warn('whisper-bundle is INCOMPLETE — installer will ship without Base Mode. Users will see a "Base Model unavailable" notice and can still use OpenAI Mode.')
  }
  // Always exit 0 so a transient download failure never blocks the
  // release. Electron-builder still runs; runtime code handles the
  // missing-asset case by auto-falling-back to OpenAI Mode.
  process.exit(0)
}

main().catch((e) => {
  warn(`Unexpected error: ${e.stack || e.message}`)
  process.exit(0)
})
