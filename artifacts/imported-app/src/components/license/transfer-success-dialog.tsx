'use client'

// v0.7.125 — Post-transfer success dialog (replaces window.alert).
//
// Operator screenshot (https://ibb.co/YTt9ytv2) showed a raw Windows
// alert titled "@workspace/imported-app" displaying the activation
// code in plain serif body text after a Move-to-PC operation. Looks
// like a system error — congregants seated near the operator's
// console see the OS chrome and assume the app crashed.
//
// We cannot just swap the window.alert for an in-tree React Dialog:
// v0.7.102 specifically REMOVED the React transferOpen Dialog
// because rendering it after the deactivation API resolved was
// triggering chrome-error painted before the operator could click
// "Got it". The crash chain was:
//
//   API resolves
//   → setTransferOpen(true)            → dialog mounts
//   → license-provider's 30 s status poll mutates context mid-paint
//   → useEffect throws against an in-flight fetch with stale auth
//   → renderer crashes
//
// Solution: do the v0.7.122 ActivationSuccessDialog trick. Stash the
// transfer payload in localStorage, hard-reload IMMEDIATELY (no
// alert, no dialog in the doomed renderer), and on the FRESH page
// load this component reads localStorage and pops a styled Radix
// Dialog. The fresh page has a settled license context (post-
// deactivation), so the "render mid-mutation" race cannot recur.
//
// The localStorage payload (`sl.lastTransferCode`) was already being
// written by handleTransfer() in settings.tsx as a fallback. v0.7.125
// just promotes it from "fallback for clipboard failure" to
// "primary delivery channel for the success notification."
//
// Like ActivationSuccessDialog we track a "celebrated" key so the
// dialog only fires ONCE per transfer, not on every refresh.

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

type TransferPayload = {
  code: string
  msLeft: number
  at: number
}

const PAYLOAD_KEY = 'sl.lastTransferCode'
const CELEBRATED_KEY = 'sl-celebrated-transfer'
/** Window after the transfer during which we still consider the
 *  payload fresh enough to surface. 10 minutes covers the hard-
 *  reload + cold Next-render delay even on slow Windows installs. */
const FRESH_WINDOW_MS = 10 * 60 * 1000

function readPayload(): TransferPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PAYLOAD_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<TransferPayload>
    if (typeof j.code !== 'string' || !j.code) return null
    if (typeof j.at !== 'number') return null
    return {
      code: j.code,
      msLeft: typeof j.msLeft === 'number' ? j.msLeft : 0,
      at: j.at,
    }
  } catch {
    return null
  }
}

function lastCelebrated(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CELEBRATED_KEY)
  } catch {
    return null
  }
}

function markCelebrated(code: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CELEBRATED_KEY, code)
  } catch {
    /* silent */
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0 minutes'
  const totalMin = Math.ceil(ms / 60000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin - days * 60 * 24) / 60)
  const minutes = totalMin - days * 60 * 24 - hours * 60
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hours} hour${hours === 1 ? '' : 's'}`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}, ${minutes} minute${minutes === 1 ? '' : 's'}`
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function TransferSuccessDialog() {
  const [payload, setPayload] = useState<TransferPayload | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const p = readPayload()
    if (!p) return
    const ageMs = Date.now() - p.at
    if (ageMs > FRESH_WINDOW_MS) return
    if (lastCelebrated() === p.code) return
    markCelebrated(p.code)
    setPayload(p)
    setOpen(true)
  }, [])

  const handleCopy = async () => {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload.code)
      setCopied(true)
      toast.success('Activation code copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy automatically — select the code and press Ctrl+C')
    }
  }

  if (!payload) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-2 border-sky-500/50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-400">
            <ArrowRightLeft className="h-5 w-5" />
            License released on this PC
          </DialogTitle>
          <DialogDescription>
            Type or paste this code into the Activate dialog on the new PC and the
            same remaining time will be restored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Remaining time preserved</span>
              <span className="font-mono text-foreground">{formatRemaining(payload.msLeft)}</span>
            </div>
          </div>
          <div className="rounded-md border border-sky-500/40 bg-sky-500/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Activation code
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all font-mono text-base text-foreground break-all">
                {payload.code}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Already copied to your clipboard if your system allowed it. Otherwise
              click Copy above.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
