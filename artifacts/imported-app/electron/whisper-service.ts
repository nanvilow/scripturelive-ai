import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

// Track every whisper-cli child we've spawned. The shutdown path
// (electron/main.ts) calls killActiveWhisperChildren() on quit so
// an in-flight transcription doesn't hold whisper-cli + the loaded
// 58 MB ggml model in RAM as a ghost process after the operator
// closes the app — exactly the "still running in Task Manager"
// complaint we are fixing.
const activeChildren = new Set<ChildProcess>()
export function killActiveWhisperChildren(): number {
  let killed = 0
  for (const p of activeChildren) {
    try {
      // SIGKILL maps to TerminateProcess on Windows — guaranteed kill,
      // no graceful-shutdown grace period that whisper-cli wouldn't
      // honour anyway.
      p.kill('SIGKILL')
      killed++
    } catch { /* ignore */ }
  }
  activeChildren.clear()
  return killed
}

/**
 * whisper-service — Local (offline) speech-to-text engine.
 *
 * Runs a bundled whisper-cli.exe (from whisper.cpp releases) against
 * a bundled quantized base.en model (ggml-base.en-q5_1.bin ~58 MB).
 * Both ship inside the installer via electron-builder extraResources
 * (see electron-builder.yml → extraResources → "app/whisper-bundle").
 *
 * The renderer records PCM audio in a WAV header/body and sends the
 * raw bytes via IPC. We write the bytes to a temp file, invoke
 * whisper-cli, read the resulting .txt, and return the transcript.
 *
 * Why spawn instead of Node bindings: whisper.cpp's prebuilt Windows
 * binary is drop-in (no node-gyp, no Visual Studio Build Tools, no
 * Python) and has been rock-solid across Windows 10 / 11 / Server.
 * Per-invocation overhead is ~200-400 ms for model load + decode on a
 * typical PC, so a 5 s chunk round-trips in 2-4 s. Good enough for
 * live detection; the OpenAI path stays ~1 s for operators who want
 * tighter latency.
 */

// Filenames must match what scripts/download-whisper-assets.mjs produces.
const BINARY_NAME = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
const MODEL_NAME = 'ggml-base.en-q5_1.bin'

// 16 kHz × 16 bit × mono = 32 000 bytes per second of PCM.
// We require ≥ 0.5 s of audio for a meaningful chunk; whisper-cli is
// known to exit code 1 on essentially-empty WAVs (header + tiny PCM
// payload) which is the #1 source of the dreaded "whisper-cli exited
// with code 1" report. Returning early with a clear, non-failing
// reason keeps the UI usable while the operator is still ramping up.
const WAV_HEADER_BYTES = 44
const MIN_PCM_SECONDS = 0.5
const MIN_PCM_BYTES = Math.floor(16000 * 2 * MIN_PCM_SECONDS)
const MIN_TOTAL_BYTES = WAV_HEADER_BYTES + MIN_PCM_BYTES

// Minimum acceptable model file size — anything smaller is almost
// certainly a truncated download or an HTML error page that snuck
// through the size check in the asset downloader.
const MIN_MODEL_BYTES = 10 * 1024 * 1024

function resolveBundleDir(): string {
  // Dev run: electron/whisper-bundle relative to the compiled main.js.
  // Packaged: the whisper-bundle folder extracted via extraResources.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'whisper-bundle')
  }
  return path.join(__dirname, '..', 'electron', 'whisper-bundle')
}

export function isWhisperAvailable(): { ok: true } | { ok: false; reason: string } {
  const bundle = resolveBundleDir()
  const bin = path.join(bundle, BINARY_NAME)
  const model = path.join(bundle, MODEL_NAME)
  if (!fs.existsSync(bin)) return { ok: false, reason: `Missing ${BINARY_NAME} in ${bundle}. Reinstall the app.` }
  if (!fs.existsSync(model)) return { ok: false, reason: `Missing ${MODEL_NAME} in ${bundle}. Reinstall the app.` }
  // Catch a truncated / corrupted model that exists but is unusable.
  // Without this check whisper-cli loads the model, segfaults inside
  // the GGML loader, and exits code 1 with no meaningful stderr —
  // exactly the bug report we keep getting.
  try {
    const sz = fs.statSync(model).size
    if (sz < MIN_MODEL_BYTES) {
      return { ok: false, reason: `Model file is too small (${sz} bytes — expected ≥ ${(MIN_MODEL_BYTES / 1024 / 1024).toFixed(0)} MB). Likely a corrupted download. Reinstall the app.` }
    }
  } catch (e) {
    return { ok: false, reason: `Cannot stat model file: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

function tempWavPath(): string {
  const id = randomUUID().slice(0, 8)
  return path.join(os.tmpdir(), `scripturelive-${id}.wav`)
}

export async function transcribeWav(wavBytes: Buffer, language = 'en'): Promise<string> {
  const avail = isWhisperAvailable()
  if (!avail.ok) throw new Error(avail.reason)

  // Reject obviously-too-short audio BEFORE spawning whisper-cli.
  // The renderer can flush a chunk almost immediately after the user
  // taps Detect Verses Now (or right after stop), and a tiny WAV is
  // the #1 cause of "whisper-cli exited with code 1" with no useful
  // stderr. Returning '' here is treated as "no speech detected" by
  // the speech provider and never surfaces as a crash.
  if (!wavBytes || wavBytes.length < MIN_TOTAL_BYTES) {
    return ''
  }

  const bundle = resolveBundleDir()
  const bin = path.join(bundle, BINARY_NAME)
  const model = path.join(bundle, MODEL_NAME)

  // Bounce the byte blob through a temp file — whisper-cli reads from
  // disk. Using a tag in the filename lets us cheaply grep "orphaned"
  // temp WAVs if a crash ever leaks them. The .txt companion is auto-
  // produced by whisper-cli (-otxt) with the same base name.
  const wavPath = tempWavPath()
  const txtPath = wavPath + '.txt'
  try {
    await fs.promises.writeFile(wavPath, wavBytes)

    // -otxt writes the transcript to a sidecar we read after the
    // process exits — safer than parsing stdout, which mixes
    // timestamps and decoded tokens. -nt suppresses timestamps inside
    // the .txt. We do NOT pass --no-prints because that flag was added
    // late in the whisper.cpp lifecycle and breaks older binaries with
    // "unknown argument" → exit code 1; we just ignore stdout chatter.
    const args = [
      '-m', model,
      '-f', wavPath,
      '-l', language,
      '-nt',            // no timestamps
      '-otxt',          // write transcript to <wav>.txt
      '--threads', String(Math.max(2, Math.min(8, os.cpus().length))),
    ]

    let stderr = ''
    let stdout = ''
    let exitCode: number | null = null
    let spawnError: Error | null = null

    await new Promise<void>((resolve) => {
      const p = spawn(bin, args, { windowsHide: true })
      activeChildren.add(p)
      p.stderr.on('data', (b) => { stderr += b.toString() })
      p.stdout.on('data', (b) => { stdout += b.toString() })
      p.on('error', (e) => {
        // ENOENT = binary missing or wrong path; EACCES = perms;
        // ENOEXEC = wrong arch / corrupt binary. All worth surfacing.
        spawnError = e
        activeChildren.delete(p)
        resolve()
      })
      p.on('close', (code) => {
        exitCode = code
        activeChildren.delete(p)
        resolve()
      })
    })

    if (spawnError) {
      throw new Error(`Failed to launch whisper-cli (${(spawnError as NodeJS.ErrnoException).code || 'spawn error'}): ${(spawnError as Error).message}`)
    }
    if (exitCode !== 0) {
      // Combine stderr + stdout tails so the operator can see what
      // whisper.cpp actually said (it prints model-load errors and
      // GGML diagnostics to stdout, not stderr). Truncate to keep
      // the IPC payload small.
      const tail = (stderr + '\n' + stdout).trim().slice(-400)
      throw new Error(`whisper-cli exited with code ${exitCode}${tail ? ': ' + tail : ' (no diagnostic output)'}`)
    }

    // whisper-cli writes the transcript file next to the input WAV. On
    // older builds it uses the stem (no .wav extension), on newer it
    // uses the full name. Try both.
    let text = ''
    const candidates = [
      txtPath,
      wavPath.replace(/\.wav$/, '') + '.txt',
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        text = await fs.promises.readFile(c, 'utf8')
        break
      }
    }
    return text.trim()
  } finally {
    // Best-effort cleanup — a leak here is harmless (OS tmp reaper will
    // eventually handle it) but noisy if we're wrong about the path.
    for (const p of [wavPath, txtPath, wavPath.replace(/\.wav$/, '') + '.txt']) {
      try { if (fs.existsSync(p)) await fs.promises.unlink(p) } catch { /* ignore */ }
    }
  }
}

// Expose a model-hash helper so the renderer's Settings diagnostics can
// confirm the bundled model hasn't been tampered with. Cheap: the hash
// is computed once per app run and cached.
let cachedHash: string | null = null
export async function getModelHash(): Promise<string> {
  if (cachedHash) return cachedHash
  const model = path.join(resolveBundleDir(), MODEL_NAME)
  if (!fs.existsSync(model)) return ''
  const h = createHash('sha256')
  const s = fs.createReadStream(model)
  for await (const chunk of s) h.update(chunk as Buffer)
  cachedHash = h.digest('hex')
  return cachedHash
}

// ──────────────────────────────────────────────────────────────────────
// DIAGNOSE — runtime self-check for Settings → Base Model
// ──────────────────────────────────────────────────────────────────────
// Operators hit "whisper-cli exited with code 1" with no follow-up
// information: which file is missing? Is the binary actually
// runnable? Is the model corrupt? This helper produces a structured
// snapshot the Settings panel renders verbatim so the operator (or
// support) can see exactly what's wrong without digging in DevTools.
export interface WhisperDiagnostics {
  bundleDir: string
  isPackaged: boolean
  platform: NodeJS.Platform
  arch: string
  binary: { name: string; path: string; exists: boolean; size?: number }
  model: { name: string; path: string; exists: boolean; size?: number; sha256?: string }
  files: Array<{ name: string; size: number }>
  helpProbe?: { ok: boolean; exitCode: number | null; stdoutHead: string; stderrHead: string; spawnError?: string }
  available: { ok: boolean; reason?: string }
}

export async function diagnose(): Promise<WhisperDiagnostics> {
  const bundle = resolveBundleDir()
  const binPath = path.join(bundle, BINARY_NAME)
  const modelPath = path.join(bundle, MODEL_NAME)
  const out: WhisperDiagnostics = {
    bundleDir: bundle,
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    binary: { name: BINARY_NAME, path: binPath, exists: fs.existsSync(binPath) },
    model: { name: MODEL_NAME, path: modelPath, exists: fs.existsSync(modelPath) },
    files: [],
    available: isWhisperAvailable(),
  }

  if (out.binary.exists) {
    try { out.binary.size = fs.statSync(binPath).size } catch { /* ignore */ }
  }
  if (out.model.exists) {
    try { out.model.size = fs.statSync(modelPath).size } catch { /* ignore */ }
    try { out.model.sha256 = (await getModelHash()).slice(0, 16) } catch { /* ignore */ }
  }
  // List every file in the bundle so missing DLLs (the silent killer
  // of whisper-cli on Windows) become obvious at a glance.
  if (fs.existsSync(bundle)) {
    try {
      for (const ent of fs.readdirSync(bundle, { withFileTypes: true })) {
        if (ent.isFile()) {
          const p = path.join(bundle, ent.name)
          try {
            out.files.push({ name: ent.name, size: fs.statSync(p).size })
          } catch { /* ignore */ }
        }
      }
      out.files.sort((a, b) => a.name.localeCompare(b.name))
    } catch { /* ignore */ }
  }

  // Probe the binary by running `--help`. If the binary can't load
  // (missing DLL, wrong arch, blocked by AV) this is where we'll see
  // it — usually as a non-zero exit code with a Windows error popup
  // captured in stderr, or a spawn ENOENT/EACCES.
  if (out.binary.exists) {
    out.helpProbe = await new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let spawnErr: string | undefined
      try {
        const p = spawn(binPath, ['--help'], { windowsHide: true })
        p.stdout.on('data', (b) => { stdout += b.toString() })
        p.stderr.on('data', (b) => { stderr += b.toString() })
        p.on('error', (e) => {
          spawnErr = `${(e as NodeJS.ErrnoException).code || ''} ${e.message}`.trim()
          resolve({ ok: false, exitCode: null, stdoutHead: stdout.slice(0, 400), stderrHead: stderr.slice(0, 400), spawnError: spawnErr })
        })
        p.on('close', (code) => {
          // whisper-cli --help exits with 0 on most builds, but some
          // older releases exit non-zero after printing help. Either
          // way, getting any output proves the binary is loadable.
          const ok = (code === 0) || (stdout.length > 0 && /usage|whisper/i.test(stdout))
          resolve({ ok, exitCode: code, stdoutHead: stdout.slice(0, 400), stderrHead: stderr.slice(0, 400) })
        })
      } catch (e) {
        resolve({ ok: false, exitCode: null, stdoutHead: '', stderrHead: '', spawnError: e instanceof Error ? e.message : String(e) })
      }
    })
  }

  return out
}

// Quick "is this audio chunk worth sending" guard exposed for tests
// and for the renderer if we ever want to do client-side trimming.
export function isWavLikelyTranscribable(byteLength: number): boolean {
  return byteLength >= MIN_TOTAL_BYTES
}
