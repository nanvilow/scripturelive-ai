'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Download, Trash2, CheckCircle2, AlertCircle, Loader2, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface DownloadRow {
  id: string
  translation: string
  name: string
  language: string
  status: 'pending' | 'downloading' | 'ready' | 'error'
  progress: number
  bookCount: number
  verseCount: number
  errorMessage?: string | null
}

interface CatalogueEntry {
  translation: string
  name: string
  language: string
  download: DownloadRow | null
}

/**
 * Settings panel: download Bible translations for offline use.
 *
 * Shown inside the Bible card on the Settings page. Lists every
 * translation our catalogue knows about plus any custom ones the user
 * has previously downloaded. The download itself runs server-side; we
 * poll the status endpoint every couple seconds while jobs are active.
 */
export function BibleOfflineDownloads() {
  const confirm = useConfirm()
  const [items, setItems] = useState<CatalogueEntry[]>([])
  const [loading, setLoading] = useState(true)
  // v0.7.239 — surface fetch failures instead of silently rendering a
  // blank gap. Operator escalation: opening Settings → Offline Bible
  // Translations showed only the header + footer text with no list and
  // no spinner, because a transient internal-fetch error (DB lock
  // during a background download, packaged-server boot race, etc.)
  // dropped the catalogue payload and the silent `catch` swallowed it.
  // Tracking the error here drives an explicit "Failed to load" row
  // with a Retry button below.
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/bible/translations', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setItems(data.catalogue || [])
      setLoadError(null)
    } catch (e) {
      // Don't blow away a previously-loaded list, but surface the
      // error so the operator sees Something Is Wrong instead of an
      // empty card. If we never had a list, the empty-state block
      // below renders a Retry CTA.
      setLoadError(e instanceof Error ? e.message : 'Failed to load translations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(() => {
      const anyActive = items.some((i) => i.download?.status === 'downloading' || i.download?.status === 'pending')
      if (anyActive) refresh()
    }, 2500)
    return () => clearInterval(id)
  }, [refresh, items])

  const startDownload = async (entry: CatalogueEntry) => {
    try {
      const res = await fetch('/api/bible/translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translation: entry.translation, name: entry.name, language: entry.language }),
      })
      if (!res.ok) throw new Error((await res.json())?.error || 'Failed to start download')
      toast.success(`${entry.translation} download started`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    }
  }

  const removeDownload = async (entry: CatalogueEntry) => {
    if (!entry.download) return
    if (!(await confirm({
      title: 'Remove offline copy?',
      description: `Remove the offline copy of ${entry.name}?\n\nThe app will fall back to the online edition until you download it again.`,
      confirmText: 'Remove',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/bible/translations?t=${encodeURIComponent(entry.translation)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success(`${entry.translation} removed from offline cache`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber-400" />
          Offline Bible Translations
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Cache full Bibles to your machine so lookup works without internet during a service.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && items.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading translations…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="h-6 w-6 text-amber-400" />
            <div className="text-sm font-medium text-foreground">Couldn't load translations</div>
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
              {loadError
                ? `The bundled server didn't return the translation list (${loadError}). This usually clears with a retry — if it doesn't, restart the app.`
                : 'No translations in the catalogue. This usually means the bundled server is still starting up.'}
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setLoading(true); refresh() }}>
              <Loader2 className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} /> Retry
            </Button>
          </div>
        )}
        {!loading && items.length > 0 && loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
            <span>Translation list may be out of date — last refresh failed ({loadError}). Click any Download or Retry button to refresh.</span>
          </div>
        )}
        {items.map((entry) => {
          const dl = entry.download
          const status = dl?.status || 'idle'
          return (
            <div key={entry.translation} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{entry.name}</span>
                  <Badge variant="outline" className="text-[10px]">{entry.translation}</Badge>
                  {status === 'ready' && (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/20 text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Offline ready
                    </Badge>
                  )}
                  {status === 'downloading' && (
                    <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/20 text-[10px] gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> {dl?.progress ?? 0}%
                    </Badge>
                  )}
                  {status === 'error' && (
                    <Badge className="bg-red-500/15 text-red-300 border-red-500/20 text-[10px] gap-1">
                      <AlertCircle className="h-3 w-3" /> Failed
                    </Badge>
                  )}
                </div>
                {dl?.status === 'downloading' && (
                  <Progress value={dl.progress} className="h-1.5 mt-2" />
                )}
                {dl?.status === 'ready' && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {dl.bookCount} books · {dl.verseCount.toLocaleString()} verses cached locally
                  </p>
                )}
                {dl?.status === 'error' && dl.errorMessage && (
                  <p className="text-[10px] text-red-300 mt-1 truncate">{dl.errorMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {status === 'ready' || status === 'error' ? (
                  <>
                    {status === 'error' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => startDownload(entry)}>
                        <Download className="h-3 w-3" /> Retry
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() => removeDownload(entry)}
                      title="Remove offline copy"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : status === 'downloading' ? (
                  <Button size="sm" variant="ghost" disabled className="h-7 text-xs">
                    Downloading…
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => startDownload(entry)}>
                    <Download className="h-3 w-3" /> Download
                  </Button>
                )}
              </div>
            </div>
          )
        })}
        <p className="text-[10px] text-muted-foreground pt-2 leading-relaxed">
          Downloads cache every chapter of every book of the Bible into your local database. The first download of a translation may take a few minutes; subsequent lookups are instant and work without internet.
        </p>
      </CardContent>
    </Card>
  )
}
