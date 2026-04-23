import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

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
  return { ok: true }
}

function tempWavPath(): string {
  const id = randomUUID().slice(0, 8)
  return path.join(os.tmpdir(), `scripturelive-${id}.wav`)
}

export async function transcribeWav(wavBytes: Buffer, language = 'en'): Promise<string> {
  const avail = isWhisperAvailable()
  if (!avail.ok) throw new Error(avail.reason)
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

    // --no-prints silences whisper-cli's progress log so stderr stays
    // usable for real errors. -otxt writes the transcript to a sidecar
    // we read after the process exits — safer than parsing stdout,
    // which mixes timestamps and decoded tokens.
    const args = [
      '-m', model,
      '-f', wavPath,
      '-l', language,
      '-nt',            // no timestamps
      '-otxt',          // write transcript to <wav>.txt
      '--no-prints',    // silence progress chatter
      '--threads', String(Math.max(2, Math.min(8, os.cpus().length))),
    ]

    await new Promise<void>((resolve, reject) => {
      const p = spawn(bin, args, { windowsHide: true })
      let stderr = ''
      p.stderr.on('data', (b) => { stderr += b.toString() })
      p.on('error', (e) => reject(e))
      p.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`whisper-cli exited with code ${code}: ${stderr.trim().slice(-300)}`))
      })
    })

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
