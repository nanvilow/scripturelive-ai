'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Apple, Download, Monitor, ShieldCheck, Sparkles, Wifi, ArrowLeft, Cpu, HardDrive, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    setDetected(detectPlatform())
    fetch('/api/download/manifest', { cache: 'no-store' })
      .then((r) => r.json())
      .then((m: Manifest) => setManifest(m))
      .finally(() => setLoading(false))
  }, [])

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
                    <span className="inline-flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" /> {formatSize(file?.size ?? null)}</span>
                    <span>v{manifest?.version ?? '—'}</span>
                  </div>
                  <Button
                    asChild={available}
                    disabled={!available || loading}
                    className={cn('w-full gap-2', recommended && available && 'bg-primary')}
                    variant={available ? 'default' : 'outline'}
                  >
                    {available ? (
                      <a href={`/api/download/${key}`} download>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Build pending
                      </span>
                    )}
                  </Button>
                  {!available && !loading && (
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Awaiting first build. See <code className="bg-muted px-1 rounded">DESKTOP_BUILD.md</code> — build on the matching OS, then drop the file into <code className="bg-muted px-1 rounded">public/downloads/</code>.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
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
