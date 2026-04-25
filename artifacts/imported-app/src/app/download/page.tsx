'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Apple, Download, Monitor, ShieldCheck, ShieldAlert, Sparkles, Wifi, ArrowLeft, Cpu, HardDrive, AlertTriangle, Copy, Check, Fingerprint, Loader2, Upload, X, FileText, HelpCircle } from 'lucide-react'
import { createSHA256 } from 'hash-wasm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// Cap the in-browser verification at ~600 MB. Above this we skip hashing
// and let the browser do a normal streaming download — SubtleCrypto.digest
// requires the full buffer in memory and large blobs trip OOM on mobile
// and low-RAM machines.
const MAX_VERIFY_BYTES = 600 * 1024 * 1024

// Trigger a normal browser download via a transient <a download> click.
// Used as the fallback when the file is too big to hash in-browser.
// We deliberately avoid `window.location.href = ...` here because that
// would trigger a top-level navigation and tear down our verification
// status badge mid-flow.
function triggerAnchorDownload(href: string) {
  if (typeof document === 'undefined') return
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

type VerifyState =
  | { kind: 'idle' }
  | {
      kind: 'downloading'
      received: number
      total: number | null
      // Bytes-per-second over a short rolling window (~1–2s). null while we
      // don't have enough samples yet (i.e. the very first chunk).
      speedBps: number | null
      // Seconds remaining at the current speed; null when total is unknown
      // or speed isn't measurable yet.
      etaSeconds: number | null
    }
  | { kind: 'hashing' }
  | { kind: 'verified' }
  | { kind: 'mismatch'; actual: string }
  | { kind: 'fallback'; reason: string }
  | { kind: 'error'; message: string }

function webCryptoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle?.digest === 'function' &&
    typeof ReadableStream !== 'undefined'
  )
}

// The local "drop installer here" zone has a different capability profile
// from the in-browser download path: it streams via File.stream() into
// hash-wasm (WASM-backed incremental SHA-256), so it does NOT need
// crypto.subtle.digest. Gating both on `webCryptoAvailable` would needlessly
// hide the local verifier in non-secure-context browsers where WebCrypto's
// subtle API isn't exposed but File.stream and WASM still are.
function localVerifyAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof File !== 'undefined' &&
    typeof File.prototype.stream === 'function' &&
    typeof WebAssembly !== 'undefined'
  )
}

function bufferToHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < arr.length; i++) {
    out += arr[i].toString(16).padStart(2, '0')
  }
  return out
}

type ExpectedSource = 'sha256sums' | 'manifest'

type BatchItemStatus =
  | { kind: 'queued' }
  | { kind: 'hashing'; received: number; total: number }
  | { kind: 'verified'; actual: string; expected: string; expectedSource: ExpectedSource }
  | { kind: 'mismatch'; actual: string; expected: string; expectedSource: ExpectedSource }
  | { kind: 'no-expected'; actual: string }
  | { kind: 'error'; message: string }

type BatchItem = {
  id: string
  filename: string
  size: number
  file: File
  status: BatchItemStatus
}

type BatchState =
  | { kind: 'idle' }
  | {
      kind: 'active'
      items: BatchItem[]
      // Filename of the SHA256SUMS.txt entry the user dropped, when present.
      // Drives the "matched against SHA256SUMS.txt" notice and the per-row
      // expected-source label.
      sumsFilename: string | null
      // True when a sums file was dropped but we couldn't extract any hash
      // lines from it (parse error or comments-only content). The UI uses
      // this to warn the operator that every row will be no-expected.
      sumsParseError: boolean
    }

type ManifestFile = {
  label: string
  filename: string
  size: number | null
  sha256: string | null
  available: boolean
}

type Manifest = {
  version: string
  releaseNotes?: string
  publishedAt: string | null
  files: Record<string, ManifestFile>
  externalReleaseUrl: string | null
}

type PlatformKey = 'win-x64' | 'mac-arm64' | 'mac-x64'

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  return `${bytes.toLocaleString()} bytes`
}

function shortHash(sha256: string): string {
  return `${sha256.slice(0, 8)}…${sha256.slice(-8)}`
}

function ChecksumRow({ sha256 }: { sha256: string | null }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  if (!sha256) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed border-border/70 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Fingerprint className="h-3 w-3" /> SHA-256
        </span>
        <span>pending build</span>
      </div>
    )
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sha256)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore — clipboard may be unavailable in some browsers/contexts
    }
  }
  return (
    <div className="rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide full SHA-256' : 'Show full SHA-256'}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Fingerprint className="h-3 w-3" /> SHA-256
          <span className="text-[10px] underline-offset-2 hover:underline">
            {expanded ? '(hide)' : '(show full)'}
          </span>
        </button>
        <span className="flex items-center gap-1.5">
          {!expanded && (
            <code className="font-mono text-foreground/90" title={sha256}>
              {shortHash(sha256)}
            </code>
          )}
          <button
            type="button"
            onClick={copy}
            aria-label="Copy SHA-256 checksum"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </span>
      </div>
      {expanded && (
        <code className="mt-1.5 block break-all font-mono text-[10px] leading-relaxed text-foreground/90">
          {sha256}
        </code>
      )}
    </div>
  )
}

function formatProgress(received: number, total: number | null): string {
  const mb = (received / (1024 * 1024)).toFixed(1)
  if (total === null || total === 0) return `${mb} MB`
  const totalMb = (total / (1024 * 1024)).toFixed(1)
  const pct = Math.min(100, Math.round((received / total) * 100))
  return `${mb} / ${totalMb} MB · ${pct}%`
}

// Human-readable transfer rate. Returns null when the rate isn't usable yet
// (no samples, or the rolling window measured ~0 bytes), so the caller can
// just hide the speed line instead of showing "0 B/s".
function formatSpeed(bps: number | null): string | null {
  if (bps === null || !Number.isFinite(bps) || bps <= 0) return null
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`
  return `${Math.round(bps)} B/s`
}

// Compact "time left" string. We keep the leading "~" so users read it as
// an estimate, and we cap the smallest bucket at 1s so values don't flicker
// to "0s left" in the final stretch. Total seconds is rounded *first* so we
// never produce rollover strings like "1m 60s left" (which would happen if
// we floored minutes and rounded the seconds remainder independently).
function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
  if (seconds < 1) return '~1s left'
  const total = Math.round(seconds)
  if (total < 60) return `~${total}s left`
  const totalMinutes = Math.floor(total / 60)
  const remSec = total % 60
  if (totalMinutes < 60) {
    return remSec > 0 ? `~${totalMinutes}m ${remSec}s left` : `~${totalMinutes}m left`
  }
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return mins > 0 ? `~${hours}h ${mins}m left` : `~${hours}h left`
}

function IndeterminateBar() {
  // A short segment that slides across the track. Visually distinct from
  // the determinate bar so users can tell hashing from downloading.
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="indeterminate-bar absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary" />
    </div>
  )
}

function VerifyBadge({ state, onCancel }: { state: VerifyState; onCancel?: () => void }) {
  if (state.kind === 'idle') return null
  if (state.kind === 'downloading') {
    const hasTotal = state.total !== null && state.total > 0
    const pct = hasTotal
      ? Math.min(100, Math.round((state.received / (state.total as number)) * 100))
      : null
    const speedLabel = formatSpeed(state.speedBps)
    // ETA only makes sense when we know the total size — otherwise we'd be
    // dividing by an unknown remaining distance. Per the task spec, when the
    // total is unknown we show speed only.
    const etaLabel = hasTotal ? formatEta(state.etaSeconds) : null
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="flex-1 min-w-0 truncate">Downloading… {formatProgress(state.received, state.total)}</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel download"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {pct === null ? (
          <IndeterminateBar />
        ) : (
          <Progress
            value={pct}
            aria-label={`Downloading installer, ${pct}% complete`}
            className="h-1.5"
          />
        )}
        {(speedLabel || etaLabel) && (
          <div
            className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted-foreground/90"
            aria-live="off"
          >
            <span>{speedLabel ?? ''}</span>
            <span>{etaLabel ?? ''}</span>
          </div>
        )}
      </div>
    )
  }
  if (state.kind === 'hashing') {
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="flex-1 min-w-0 truncate">Verifying SHA-256…</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel verification"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <IndeterminateBar />
      </div>
    )
  }
  if (state.kind === 'verified') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-300"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Verified — SHA-256 matches the manifest.</span>
      </div>
    )
  }
  if (state.kind === 'mismatch') {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
      >
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Hash mismatch — do not run this file.</span>
        </div>
        <div className="mt-1 break-all font-mono text-[10px] text-red-200/90">
          got {state.actual}
        </div>
      </div>
    )
  }
  if (state.kind === 'fallback') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{state.reason}</span>
      </div>
    )
  }
  // error
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200"
    >
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>Couldn&apos;t verify in-browser ({state.message}). The download still works — verify with the SHA-256 above.</span>
    </div>
  )
}

// Parse a SHA256SUMS.txt body. The format we accept is the standard
// sha256sum / shasum output:
//   <hex-64>  <filename>      (text mode, two spaces)
//   <hex-64> *<filename>      (binary mode, space + asterisk)
// We also tolerate single-space separators, drop comments / blank lines,
// and normalize the filename to its basename so a user who saved the file
// list with relative paths still matches against the dropped basename.
function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/)
    if (!m) continue
    const [, hash, fname] = m
    const base = fname.replace(/^.*[\\/]/, '').toLowerCase()
    map.set(base, hash.toLowerCase())
  }
  return map
}

// Walk a single FileSystemEntry (the result of webkitGetAsEntry) into a
// flat list of File objects so a dropped folder behaves like a multi-select.
async function readEntryRecursive(entry: FileSystemEntry): Promise<File[]> {
  const out: File[] = []
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    )
    out.push(file)
    return out
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns at most ~100 entries per call — keep reading
    // until it returns an empty batch.
    for (;;) {
      const batch: FileSystemEntry[] = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      )
      if (batch.length === 0) break
      for (const child of batch) {
        out.push(...(await readEntryRecursive(child)))
      }
    }
  }
  return out
}

// Extract a flat File list from a DataTransfer, walking dropped folders
// when the browser exposes the entries API. Falls back to dt.files for
// browsers that don't (Safari < 15 etc.), which means folder-drops there
// degrade to "no installers found" — still better than throwing.
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  if (dt.items && dt.items.length > 0) {
    const items = Array.from(dt.items)
    const entries = items
      .map((it) =>
        typeof (it as DataTransferItem & {
          webkitGetAsEntry?: () => FileSystemEntry | null
        }).webkitGetAsEntry === 'function'
          ? (it as DataTransferItem & {
              webkitGetAsEntry: () => FileSystemEntry | null
            }).webkitGetAsEntry()
          : null,
      )
      .filter((e): e is FileSystemEntry => !!e)
    if (entries.length === items.length) {
      const out: File[] = []
      for (const entry of entries) {
        out.push(...(await readEntryRecursive(entry)))
      }
      return out
    }
  }
  return Array.from(dt.files ?? [])
}

function isSumsFilename(name: string): boolean {
  return /^sha256sums(\.txt)?$/i.test(name)
}

function shortHashMid(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-10)}` : hash
}

function BatchSummary({ batch }: { batch: Extract<BatchState, { kind: 'active' }> }) {
  let verified = 0
  let mismatched = 0
  let noExpected = 0
  let errored = 0
  let pending = 0
  for (const it of batch.items) {
    switch (it.status.kind) {
      case 'verified': verified++; break
      case 'mismatch': mismatched++; break
      case 'no-expected': noExpected++; break
      case 'error': errored++; break
      case 'queued':
      case 'hashing': pending++; break
    }
  }
  const total = batch.items.length
  const allDone = pending === 0 && total > 0
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 text-[11px]',
        mismatched > 0
          ? 'border-red-500/40 bg-red-500/10 text-red-200'
          : allDone && verified === total && total > 0
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            : 'border-border/70 bg-muted/30 text-muted-foreground',
      )}
    >
      <span className="font-semibold text-foreground">
        {allDone ? 'Batch verification complete' : `Verifying ${total} file${total === 1 ? '' : 's'}…`}
      </span>
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-200">
        <ShieldCheck className="h-3 w-3" /> {verified} verified
      </span>
      <span className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        mismatched > 0 ? 'bg-red-500/15 text-red-200' : 'bg-muted/60 text-muted-foreground',
      )}>
        <ShieldAlert className="h-3 w-3" /> {mismatched} mismatch{mismatched === 1 ? '' : 'es'}
      </span>
      <span className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        noExpected > 0 ? 'bg-muted/80 text-foreground/80' : 'bg-muted/60 text-muted-foreground',
      )}>
        <HelpCircle className="h-3 w-3" /> {noExpected} no expected hash
      </span>
      {errored > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200">
          <AlertTriangle className="h-3 w-3" /> {errored} error{errored === 1 ? '' : 's'}
        </span>
      )}
      {pending > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {pending} pending
        </span>
      )}
    </div>
  )
}

function BatchItemRow({
  item,
  sumsPresent,
  manifest,
  onPickPlatform,
}: {
  item: BatchItem
  sumsPresent: boolean
  manifest: Manifest | null
  onPickPlatform: (id: string, key: PlatformKey) => void
}) {
  const { status } = item
  const sizeLabel = formatSize(item.size)
  const baseRow =
    'flex flex-col gap-1.5 rounded-md border px-2.5 py-2 text-[11px]'
  if (status.kind === 'queued') {
    return (
      <div className={cn(baseRow, 'border-border/70 bg-muted/30 text-muted-foreground')}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="flex-1 truncate font-mono text-foreground/90">{item.filename}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground/80">{sizeLabel}</span>
        </div>
        <span className="text-muted-foreground/80">Queued…</span>
      </div>
    )
  }
  if (status.kind === 'hashing') {
    const hasTotal = status.total > 0
    const pct = hasTotal ? Math.min(100, Math.round((status.received / status.total) * 100)) : null
    return (
      <div className={cn(baseRow, 'border-border/70 bg-muted/30 text-muted-foreground')}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="flex-1 truncate font-mono text-foreground/90">{item.filename}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground/80">{formatProgress(status.received, status.total)}</span>
        </div>
        {pct === null ? (
          <IndeterminateBar />
        ) : (
          <Progress value={pct} aria-label={`Hashing ${item.filename}, ${pct}% complete`} className="h-1.5" />
        )}
      </div>
    )
  }
  if (status.kind === 'verified') {
    const sourceLabel = status.expectedSource === 'sha256sums' ? 'SHA256SUMS.txt' : 'manifest'
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(baseRow, 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200')}
      >
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <span className="flex-1 truncate font-mono text-emerald-100">{item.filename}</span>
          <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
            verified
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-200/80">
          <span>Matches {sourceLabel}</span>
          <code className="font-mono" title={status.actual}>
            {shortHashMid(status.actual)}
          </code>
        </div>
      </div>
    )
  }
  if (status.kind === 'mismatch') {
    const sourceLabel = status.expectedSource === 'sha256sums' ? 'SHA256SUMS.txt' : 'manifest'
    return (
      <div
        role="alert"
        className={cn(baseRow, 'border-red-500/40 bg-red-500/10 text-red-200')}
      >
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-300" />
          <span className="flex-1 truncate font-mono text-red-100">{item.filename}</span>
          <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-200">
            mismatch
          </span>
        </div>
        <div className="text-[10px] text-red-200/90">
          Does not match {sourceLabel} — do not run this file.
        </div>
        <div className="break-all font-mono text-[10px] text-red-200/80">
          got      {status.actual}
          {'\n'}expected {status.expected}
        </div>
      </div>
    )
  }
  if (status.kind === 'no-expected') {
    return (
      <div className={cn(baseRow, 'border-border/70 bg-muted/40 text-muted-foreground')}>
        <div className="flex items-center gap-2 font-medium">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate font-mono text-foreground/90">{item.filename}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            no expected hash
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/90">
          <span>
            {sumsPresent
              ? 'Filename not listed in SHA256SUMS.txt.'
              : 'No matching entry in the manifest.'}
          </span>
          <code className="font-mono" title={status.actual}>
            {shortHashMid(status.actual)}
          </code>
        </div>
        {manifest && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {(['win-x64', 'mac-arm64', 'mac-x64'] as PlatformKey[]).map((key) => {
              const f = manifest.files[key]
              if (!f?.sha256) return null
              return (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onPickPlatform(item.id, key)}
                >
                  Verify against {f.label || key}
                </Button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
  // error
  return (
    <div
      role="alert"
      className={cn(baseRow, 'border-amber-500/40 bg-amber-500/10 text-amber-200')}
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate font-mono text-amber-100">{item.filename}</span>
        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          error
        </span>
      </div>
      <div className="text-[10px] text-amber-200/80">{status.message}</div>
    </div>
  )
}

function detectPlatform(): PlatformKey | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform?.toLowerCase()
  if (platform?.includes('win') || ua.includes('windows')) return 'win-x64'
  if (platform?.includes('mac') || ua.includes('mac os x')) {
    // Best-effort: Apple Silicon detection isn't exposed; default to arm64 since it covers all M-series
    return 'mac-arm64'
  }
  return null
}

export default function DownloadPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [detected, setDetected] = useState<PlatformKey | null>(null)
  const [verifyStates, setVerifyStates] = useState<Record<string, VerifyState>>({})
  const [cryptoOk, setCryptoOk] = useState(false)
  const [localOk, setLocalOk] = useState(false)
  const [batch, setBatch] = useState<BatchState>({ kind: 'idle' })
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Bumped each time a new batch starts so any in-flight stream-read loops
  // from a previous batch detect that they should abandon work and not stomp
  // on the freshly-set state.
  const verifyTokenRef = useRef(0)
  // One AbortController per in-flight platform download so the user can
  // cancel a specific card without affecting others.
  const downloadControllersRef = useRef<Map<PlatformKey, AbortController>>(new Map())
  // Per-key token bumped when a download is cancelled so any work that's
  // already past the abortable fetch (e.g. crypto.subtle.digest on the
  // buffered chunks) knows to discard its result instead of overwriting
  // the freshly-reset idle state.
  const downloadTokensRef = useRef<Map<PlatformKey, number>>(new Map())

  useEffect(() => {
    setDetected(detectPlatform())
    setCryptoOk(webCryptoAvailable())
    setLocalOk(localVerifyAvailable())
    fetch('/api/download/manifest', { cache: 'no-store' })
      .then((r) => r.json())
      .then((m: Manifest) => setManifest(m))
      .finally(() => setLoading(false))
  }, [])

  const setVerify = useCallback((key: string, state: VerifyState) => {
    setVerifyStates((prev) => ({ ...prev, [key]: state }))
  }, [])

  // Verify a list of local installers in one go. If the user dropped a
  // SHA256SUMS.txt file alongside the installers, each file is matched by
  // its filename against the lines in that file (works for older releases
  // where we don't have manifest hashes). Otherwise we fall back to the
  // manifest, so the existing single-file flow still works.
  const startBatch = useCallback(
    async (rawFiles: File[]) => {
      // Bump token so any prior batch's pending stream loops bail out.
      verifyTokenRef.current++
      const token = verifyTokenRef.current

      // Filter out hidden / metadata artifacts (.DS_Store, Thumbs.db, etc.)
      // that sneak in when a folder is dropped.
      const files = rawFiles.filter((f) => {
        const n = f.name
        if (!n) return false
        if (n.startsWith('.')) return false
        if (n === 'Thumbs.db' || n === 'desktop.ini') return false
        return true
      })
      if (files.length === 0) {
        setBatch({ kind: 'idle' })
        return
      }

      const sumsFile = files.find((f) => isSumsFilename(f.name)) ?? null
      let checksums = new Map<string, string>()
      let sumsParseError = false
      if (sumsFile) {
        try {
          const text = await sumsFile.text()
          checksums = parseChecksums(text)
          if (checksums.size === 0) sumsParseError = true
        } catch {
          sumsParseError = true
        }
      }

      // Manifest fallback. Only consulted when the user did NOT drop a
      // SHA256SUMS.txt — when they did, the spec is to match exclusively
      // against that file (so older releases verify against the same source
      // the project actually shipped, and a missing line means
      // "no expected hash" rather than a silent fall-through to the
      // manifest).
      const manifestMap = new Map<string, string>()
      if (manifest && !sumsFile) {
        for (const key of ['win-x64', 'mac-arm64', 'mac-x64'] as PlatformKey[]) {
          const f = manifest.files[key]
          if (f?.filename && f.sha256) {
            manifestMap.set(f.filename.toLowerCase(), f.sha256.toLowerCase())
          }
        }
      }

      const installerFiles = files.filter((f) => f !== sumsFile)
      if (installerFiles.length === 0) {
        // User dropped only a SHA256SUMS.txt — nothing to hash.
        setBatch({
          kind: 'active',
          items: [],
          sumsFilename: sumsFile?.name ?? null,
          sumsParseError,
        })
        return
      }

      const items: BatchItem[] = installerFiles.map((f, i) => ({
        id: `${token}-${i}-${f.name}`,
        filename: f.name,
        size: f.size,
        file: f,
        status: { kind: 'queued' },
      }))
      setBatch({
        kind: 'active',
        items,
        sumsFilename: sumsFile?.name ?? null,
        sumsParseError,
      })

      const updateItem = (id: string, status: BatchItemStatus) => {
        if (token !== verifyTokenRef.current) return
        setBatch((prev) => {
          if (prev.kind !== 'active') return prev
          let changed = false
          const next = prev.items.map((it) => {
            if (it.id !== id) return it
            changed = true
            return { ...it, status }
          })
          return changed ? { ...prev, items: next } : prev
        })
      }

      // Spin up one streaming hasher per file. hash-wasm runs in WASM and
      // the JS event loop interleaves the chunked reads, so this stays
      // memory-bounded even for multi-GB folders.
      const tasks = items.map(async (item) => {
        const lowered = item.filename.toLowerCase()
        // Source-of-truth selection: when the user dropped a SHA256SUMS.txt,
        // match exclusively against it (so a missing line is an honest
        // "no expected hash", not a silent manifest fall-through). The
        // manifest map is only populated above when no sums file was
        // dropped, so this single lookup covers both paths.
        let expected: string | null = null
        let expectedSource: ExpectedSource | null = null
        if (sumsFile) {
          const sumsExpected = checksums.get(lowered)
          if (sumsExpected) {
            expected = sumsExpected
            expectedSource = 'sha256sums'
          }
        } else {
          const manifestExpected = manifestMap.get(lowered)
          if (manifestExpected) {
            expected = manifestExpected
            expectedSource = 'manifest'
          }
        }

        try {
          const hasher = await createSHA256()
          hasher.init()
          const reader = item.file.stream().getReader()
          let received = 0
          let lastUiUpdate = 0
          updateItem(item.id, { kind: 'hashing', received: 0, total: item.file.size })
          for (;;) {
            if (token !== verifyTokenRef.current) {
              try { await reader.cancel() } catch {}
              return
            }
            const { done, value } = await reader.read()
            if (done) break
            if (!value) continue
            hasher.update(value)
            received += value.byteLength
            const now = performance.now()
            if (now - lastUiUpdate > 120 || received === item.file.size) {
              lastUiUpdate = now
              updateItem(item.id, { kind: 'hashing', received, total: item.file.size })
            }
          }
          if (token !== verifyTokenRef.current) return
          const actual = hasher.digest('hex').toLowerCase()
          if (expected && expectedSource) {
            const expectedLower = expected.toLowerCase()
            if (actual === expectedLower) {
              updateItem(item.id, {
                kind: 'verified',
                actual,
                expected: expectedLower,
                expectedSource,
              })
            } else {
              updateItem(item.id, {
                kind: 'mismatch',
                actual,
                expected: expectedLower,
                expectedSource,
              })
            }
          } else {
            updateItem(item.id, { kind: 'no-expected', actual })
          }
        } catch (err) {
          if (token !== verifyTokenRef.current) return
          const message = err instanceof Error ? err.message : 'Unknown error'
          updateItem(item.id, { kind: 'error', message })
        }
      })

      await Promise.all(tasks)
    },
    [manifest],
  )

  // Compare an already-hashed item's actual hash against a manifest platform's
  // expected hash. Used by the per-row "Verify against …" buttons so a user
  // who renamed an installer can still confirm it.
  const verifyAgainstPlatform = useCallback(
    (id: string, platform: PlatformKey) => {
      if (!manifest) return
      const expected = manifest.files[platform]?.sha256
      if (!expected) return
      const expectedLower = expected.toLowerCase()
      setBatch((prev) => {
        if (prev.kind !== 'active') return prev
        return {
          ...prev,
          items: prev.items.map((it) => {
            if (it.id !== id) return it
            if (it.status.kind !== 'no-expected') return it
            const actual = it.status.actual
            const status: BatchItemStatus = actual === expectedLower
              ? { kind: 'verified', actual, expected: expectedLower, expectedSource: 'manifest' }
              : { kind: 'mismatch', actual, expected: expectedLower, expectedSource: 'manifest' }
            return { ...it, status }
          }),
        }
      })
    },
    [manifest],
  )

  const clearBatch = useCallback(() => {
    verifyTokenRef.current++
    setBatch({ kind: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragActive(false)
      const dt = e.dataTransfer
      if (!dt) return
      // Stale-drop guard: walking a dropped folder is async (one
      // readEntries call per ~100 entries), so a second drop landing
      // mid-walk could otherwise resolve later and let our older batch
      // overwrite the user's newer one. Bump the token before extraction
      // and bail if it changed during the walk.
      verifyTokenRef.current++
      const dropToken = verifyTokenRef.current
      const files = await filesFromDataTransfer(dt)
      if (dropToken !== verifyTokenRef.current) return
      if (files.length > 0) void startBatch(files)
    },
    [startBatch],
  )

  const cancelVerifiedDownload = useCallback(
    (key: PlatformKey) => {
      const controller = downloadControllersRef.current.get(key)
      if (controller) {
        controller.abort()
        downloadControllersRef.current.delete(key)
      }
      // Bump this card's token so any work past the abortable fetch
      // (notably crypto.subtle.digest, which has no signal of its own)
      // knows to discard its result rather than land 'verified' / 'mismatch'
      // on top of our just-cleared state.
      const cur = downloadTokensRef.current.get(key) ?? 0
      downloadTokensRef.current.set(key, cur + 1)
      setVerify(key, { kind: 'idle' })
    },
    [setVerify],
  )

  const startVerifiedDownload = useCallback(
    async (key: PlatformKey, file: ManifestFile) => {
      if (!file.sha256) return
      const url = `/api/download/${key}`
      // Cancel any prior in-flight download on this card before starting a new one.
      const prior = downloadControllersRef.current.get(key)
      if (prior) {
        try { prior.abort() } catch {}
      }
      const controller = new AbortController()
      downloadControllersRef.current.set(key, controller)
      const token = (downloadTokensRef.current.get(key) ?? 0) + 1
      downloadTokensRef.current.set(key, token)
      const isCurrent = () => downloadTokensRef.current.get(key) === token
      setVerify(key, {
        kind: 'downloading',
        received: 0,
        total: file.size ?? null,
        speedBps: null,
        etaSeconds: null,
      })
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }
        const lenHeader = res.headers.get('Content-Length')
        const total = lenHeader ? Number(lenHeader) : file.size ?? null
        if (total !== null && total > MAX_VERIFY_BYTES) {
          try { await res.body.cancel() } catch {}
          setVerify(key, { kind: 'fallback', reason: 'File is too large to verify in-browser — download started; verify with the SHA-256 above.' })
          triggerAnchorDownload(url)
          return
        }

        const reader = res.body.getReader()
        const chunks: Uint8Array[] = []
        let received = 0
        // Rolling-window samples for speed estimation. We keep ~1.5s of
        // history so a transient stall (Wi-Fi roam, server pause) doesn't
        // tank the displayed rate, but the number still moves quickly when
        // conditions actually change.
        const SPEED_WINDOW_MS = 1500
        // Throttle React updates to ~4–5 Hz so the speed/ETA numbers don't
        // jitter on every chunk (chunks can arrive at hundreds of Hz over
        // a fast LAN). Progress still appears smooth at this cadence.
        const UI_THROTTLE_MS = 220
        const startedAt = performance.now()
        const samples: { time: number; bytes: number }[] = [{ time: startedAt, bytes: 0 }]
        let lastUiUpdate = startedAt
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          received += value.byteLength
          if (received > MAX_VERIFY_BYTES) {
            try { await reader.cancel() } catch {}
            setVerify(key, { kind: 'fallback', reason: 'File is too large to verify in-browser — download started; verify with the SHA-256 above.' })
            triggerAnchorDownload(url)
            return
          }
          chunks.push(value)
          const now = performance.now()
          samples.push({ time: now, bytes: received })
          // Drop samples older than the window (always keep at least one
          // anchor so we can still measure speed when chunks arrive slowly).
          while (samples.length > 1 && samples[0].time < now - SPEED_WINDOW_MS) {
            samples.shift()
          }
          const isLastChunk = total !== null && received >= total
          if (now - lastUiUpdate >= UI_THROTTLE_MS || isLastChunk) {
            lastUiUpdate = now
            const oldest = samples[0]
            const dtSec = (now - oldest.time) / 1000
            const speedBps = dtSec > 0 ? (received - oldest.bytes) / dtSec : null
            const etaSeconds =
              total !== null && speedBps !== null && speedBps > 0
                ? Math.max(0, (total - received) / speedBps)
                : null
            setVerify(key, { kind: 'downloading', received, total, speedBps, etaSeconds })
          }
        }

        const blob = new Blob(chunks as BlobPart[])

        // Save the bytes we just downloaded to disk so the user keeps the
        // exact same content we're about to hash.
        const objectUrl = URL.createObjectURL(blob)
        try {
          const a = document.createElement('a')
          a.href = objectUrl
          a.download = file.filename
          a.rel = 'noopener'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        } finally {
          // Defer revoke so the browser can start the save dialog.
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
        }

        setVerify(key, { kind: 'hashing' })
        const buf = await blob.arrayBuffer()
        const digest = await crypto.subtle.digest('SHA-256', buf)
        // crypto.subtle.digest can't be aborted mid-flight, so we only let
        // its result land if the user hasn't cancelled in the meantime.
        if (!isCurrent()) return
        const actual = bufferToHex(digest)
        if (actual.toLowerCase() === file.sha256.toLowerCase()) {
          setVerify(key, { kind: 'verified' })
        } else {
          setVerify(key, { kind: 'mismatch', actual })
        }
      } catch (err) {
        // User-initiated cancel (AbortController.abort) shows up as either
        // a DOMException with name 'AbortError' or controller.signal.aborted.
        // Either way, swallow it — the cancel handler already cleared state.
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return
        }
        const message = err instanceof Error ? err.message : 'Unknown error'
        setVerify(key, { kind: 'error', message })
      } finally {
        // Only clear the controller if it's still ours — a fresh start
        // would have replaced the entry already.
        if (downloadControllersRef.current.get(key) === controller) {
          downloadControllersRef.current.delete(key)
        }
      }
    },
    [setVerify],
  )

  const cards: { key: PlatformKey; icon: React.ReactNode; sub: string }[] = useMemo(() => [
    { key: 'win-x64', icon: <Monitor className="h-6 w-6" />, sub: 'NSIS installer · 64-bit' },
    { key: 'mac-arm64', icon: <Apple className="h-6 w-6" />, sub: 'Disk image · Apple Silicon' },
    { key: 'mac-x64', icon: <Apple className="h-6 w-6" />, sub: 'Disk image · Intel Macs' },
  ], [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to ScriptureLive AI
          </Link>
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ScriptureLive AI" className="h-9 w-auto" />
          </div>
        </div>

        {/* Hero */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-8 md:p-10">
          <Badge className="mb-4 bg-amber-500/15 text-amber-300 border border-amber-500/20 gap-1.5">
            <Sparkles className="h-3 w-3" /> Desktop app · v{manifest?.version ?? '0.2.0'}
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            ScriptureLive AI for Windows &amp; macOS
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
            Get the full ScriptureLive AI presentation platform on your machine — with{' '}
            <strong className="text-foreground">built-in native NDI output</strong> that vMix, Wirecast,
            and OBS pick up automatically on your LAN. No screen capture, no extra tools.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" /> Native NDI sender
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" /> Local-first · runs offline
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5">
              <Cpu className="h-3.5 w-3.5 text-violet-400" /> Apple Silicon &amp; Intel
            </span>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map(({ key, icon, sub }) => {
            const file = manifest?.files[key]
            const recommended = detected === key
            const available = !!file?.available
            return (
              <div
                key={key}
                className={cn(
                  'rounded-xl border p-5 transition-colors flex flex-col',
                  recommended ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg',
                      recommended ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground/80')}>
                      {icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{file?.label || key}</div>
                      <div className="text-[11px] text-muted-foreground">{sub}</div>
                    </div>
                  </div>
                  {recommended && <Badge className="text-[10px]">Detected</Badge>}
                </div>

                <div className="mt-auto space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <HardDrive className="h-3.5 w-3.5" />
                      <span>{formatSize(file?.size ?? null)}</span>
                      {file?.size ? (
                        <span className="text-[10px] text-muted-foreground/70">
                          ({formatBytes(file.size)})
                        </span>
                      ) : null}
                    </span>
                    <span>v{manifest?.version ?? '—'}</span>
                  </div>
                  <ChecksumRow sha256={file?.sha256 ?? null} />
                  {(() => {
                    const verifyState = verifyStates[key] ?? { kind: 'idle' as const }
                    const canVerify = available && cryptoOk && !!file?.sha256
                    const inProgress = verifyState.kind === 'downloading' || verifyState.kind === 'hashing'
                    if (!available) {
                      return (
                        <Button disabled className="w-full gap-2" variant="outline">
                          <span className="inline-flex items-center justify-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> Build pending
                          </span>
                        </Button>
                      )
                    }
                    if (canVerify) {
                      return (
                        <Button
                          type="button"
                          disabled={loading || inProgress}
                          onClick={() => file && startVerifiedDownload(key, file)}
                          className={cn('w-full gap-2', recommended && 'bg-primary')}
                          variant="default"
                        >
                          {inProgress ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {inProgress ? 'Downloading…' : 'Download'}
                        </Button>
                      )
                    }
                    // Fallback: no Web Crypto, or no expected hash to compare
                    // against — let the browser do a plain download.
                    return (
                      <>
                        <Button
                          asChild
                          disabled={loading}
                          className={cn('w-full gap-2', recommended && 'bg-primary')}
                          variant="default"
                        >
                          <a href={`/api/download/${key}`} download>
                            <Download className="h-4 w-4" /> Download
                          </a>
                        </Button>
                        {!cryptoOk && file?.sha256 && (
                          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                              In-browser verification isn&apos;t supported in
                              this browser. Compare the SHA-256 above with
                              the command below after downloading.
                            </span>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  <VerifyBadge
                    state={verifyStates[key] ?? { kind: 'idle' }}
                    onCancel={() => cancelVerifiedDownload(key)}
                  />
                  {!available && !loading && (
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      First cloud build pending. The GitHub Actions pipeline at
                      {' '}<code className="bg-muted px-1 rounded">.github/workflows/release-desktop.yml</code>{' '}
                      builds this on a real {key.startsWith('mac') ? 'Mac' : 'Windows machine'} when you push a <code className="bg-muted px-1 rounded">v*</code> tag.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Verify your download */}
        <div className="mt-8 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h3 className="font-semibold text-sm">Verify your download</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Each installer above shows its exact byte size and SHA-256 checksum. After downloading, run
            the matching command on your machine and confirm the output equals the value shown on the card
            (use the copy button next to the hash). This is especially important while the installers are
            unsigned.
          </p>

          {/* Local file drop zone — re-verify an installer the user already
              has on disk (e.g. downloaded earlier or grabbed straight from
              GitHub Releases) without re-downloading or shelling out. The
              hash is computed by streaming the file through hash-wasm so it
              works for installers larger than the in-browser fetch cap. */}
          {localOk && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-foreground">
                  Already have the installers? Drop the whole batch here to verify
                </div>
                {batch.kind !== 'idle' && (
                  <button
                    type="button"
                    onClick={clearBatch}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Drop installers (or a folder containing them) here, or click to choose files"
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center text-[11px] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50',
                  dragActive
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50',
                )}
              >
                <Upload className={cn('h-5 w-5', dragActive ? 'text-primary' : 'text-muted-foreground')} />
                <div>
                  <span className="font-medium text-foreground">Drop installers or a folder here</span>{' '}
                  <span className="text-muted-foreground">or click to choose files</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Include <code className="rounded bg-background/40 px-1 font-mono">SHA256SUMS.txt</code> to verify the whole set in one shot.
                  Hashing happens in your browser — nothing is uploaded.
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".exe,.dmg,.zip,.blockmap,.txt,application/octet-stream,text/plain"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  if (picked.length > 0) void startBatch(picked)
                  // Reset so picking the same files again still triggers onChange.
                  e.target.value = ''
                }}
              />
              {batch.kind === 'active' && (
                <div className="mt-3 space-y-2">
                  <BatchSummary batch={batch} />
                  {batch.sumsFilename && !batch.sumsParseError && (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-200">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Matching against <span className="font-mono">{batch.sumsFilename}</span> from your drop.
                        Files not listed there will show "no expected hash".
                      </span>
                    </div>
                  )}
                  {batch.sumsFilename && batch.sumsParseError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Couldn&apos;t read any SHA-256 lines from{' '}
                        <span className="font-mono">{batch.sumsFilename}</span>. Every row will show
                        &quot;no expected hash&quot; — re-grab the file from the release and try again.
                      </span>
                    </div>
                  )}
                  {batch.items.length === 0 ? (
                    <div className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                      No installers in the drop — only <span className="font-mono">{batch.sumsFilename}</span>. Add the .exe / .dmg files alongside it.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {batch.items.map((item) => (
                        <BatchItemRow
                          key={item.id}
                          item={item}
                          sumsPresent={!!batch.sumsFilename}
                          manifest={manifest}
                          onPickPlatform={verifyAgainstPlatform}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!localOk && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                In-browser file verification isn&apos;t supported in this
                browser. Use the SHA-256 commands below instead.
              </span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>Verifying multiple installers? Grab a single file:</span>
            <a
              href="/api/download/checksums"
              download="SHA256SUMS.txt"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3 w-3" /> SHA256SUMS.txt
            </a>
            <span>then run <code className="rounded bg-muted px-1 font-mono">sha256sum -c SHA256SUMS.txt</code> next to the installers.</span>
          </div>

          {/* End-to-end verification: a detached minisign signature on the
              manifest + checksums file lets admins verify the chain even if
              the page itself is compromised — the public key is published
              out-of-band on this site and the GitHub README, so an attacker
              who swaps both an installer and its hash on the page still can't
              forge a signature without the maintainer's private key. */}
          {manifest?.externalReleaseUrl && (
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Verify the manifest itself (advanced)
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The hashes above are only as trustworthy as this page. For an
                end-to-end check, fetch the signed{' '}
                <code className="rounded bg-muted px-1 font-mono">manifest.json</code>{' '}
                and its detached{' '}
                <code className="rounded bg-muted px-1 font-mono">.minisig</code>{' '}
                signature from the GitHub Release, plus our public key (also
                pinned in the GitHub README), and verify with{' '}
                <a
                  href="https://jedisct1.github.io/minisign/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  minisign
                </a>:
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <a
                  href={`${manifest.externalReleaseUrl}/manifest.json`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono hover:bg-muted transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3 w-3" /> manifest.json
                </a>
                <a
                  href={`${manifest.externalReleaseUrl}/manifest.json.minisig`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono hover:bg-muted transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3 w-3" /> manifest.json.minisig
                </a>
                <a
                  href={`${manifest.externalReleaseUrl}/SHA256SUMS.txt.minisig`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono hover:bg-muted transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3 w-3" /> SHA256SUMS.txt.minisig
                </a>
                <a
                  href="/downloads/minisign.pub"
                  download="scripturelive-minisign.pub"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono hover:bg-muted transition-colors"
                >
                  <Download className="h-3 w-3" /> minisign.pub
                </a>
              </div>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
{`# one-time: install minisign (brew install minisign / apt install minisign / scoop install minisign)
minisign -Vm manifest.json -p scripturelive-minisign.pub
minisign -Vm SHA256SUMS.txt -p scripturelive-minisign.pub
# then trust the SHA-256 lines and verify each installer:
sha256sum -c SHA256SUMS.txt`}
              </pre>
              <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
                Cross-check the public-key fingerprint against the copy
                pinned in the project's GitHub repo README — that out-of-band
                channel is what makes the chain tamper-evident. (If you got
                here from a link in that README, you've already done it.)
              </p>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Windows (PowerShell)</div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono">
{`Get-FileHash .\\ScriptureLive*Setup-x64.exe -Algorithm SHA256`}
              </pre>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">macOS / Linux</div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono">
{`shasum -a 256 ScriptureLive*.dmg`}
              </pre>
            </div>
          </div>
        </div>

        {/* Install instructions */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="h-4 w-4 text-sky-400" />
              <h3 className="font-semibold text-sm">Install on Windows</h3>
            </div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
              <li>Run the downloaded <code className="bg-muted px-1 rounded">.exe</code> installer.</li>
              <li>If SmartScreen warns about an unknown publisher, click <em>More info → Run anyway</em>.</li>
              <li>Choose an install folder, then launch <strong>ScriptureLive AI</strong> from the Start menu.</li>
              <li>Install <a href="https://ndi.video/tools/" target="_blank" rel="noopener noreferrer" className="underline">NDI Tools</a> (free) on every machine that needs the runtime.</li>
              <li>In Settings → Native NDI Output, click <strong>Enable NDI</strong>. The source appears in vMix / OBS / Wirecast on the same LAN.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Apple className="h-4 w-4 text-zinc-200" />
              <h3 className="font-semibold text-sm">Install on macOS</h3>
            </div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
              <li>Open the downloaded <code className="bg-muted px-1 rounded">.dmg</code> and drag <strong>ScriptureLive AI</strong> into Applications.</li>
              <li>The first launch: right-click the app → <em>Open</em>, then confirm (Gatekeeper).</li>
              <li>Install <a href="https://ndi.video/tools/" target="_blank" rel="noopener noreferrer" className="underline">NDI Tools</a> for the runtime.</li>
              <li>In Settings → Native NDI Output, click <strong>Enable NDI</strong>.</li>
              <li>Apple Silicon Macs use the <code className="bg-muted px-1 rounded">arm64</code> DMG; older Intel Macs use <code className="bg-muted px-1 rounded">x64</code>.</li>
            </ol>
          </div>
        </div>

        {/* Release notes */}
        {manifest?.releaseNotes && (
          <div className="mt-10 rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-sm mb-2">What's new in v{manifest.version}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{manifest.releaseNotes}</p>
          </div>
        )}

        <div className="mt-10 text-center text-xs text-muted-foreground">
          Need the browser-only experience instead?{' '}
          <Link href="/" className="underline hover:text-foreground">Open the web app</Link>.
        </div>
      </div>
    </div>
  )
}
