'use client'

// v1 licensing — Live Transcription column lock overlay.
//
// Renders an absolute-positioned curtain over its parent Card when the
// subscription is not active. The parent (the Live Transcription card)
// is `relative`-positioned by default in the LogosShell layout (the
// `<section>` in the Card primitive uses overflow-hidden). We add
// `relative` defensively in case the Card primitive ever changes.
//
// Two visual states:
//   • trial_expired / never_activated — soft amber, "Free trial ended,
//     activate to continue"
//   • expired — red, "Subscription expired"
// Both surfaces a single CTA that opens the Subscribe modal.

import { Lock, Sparkles } from 'lucide-react'
import { useLicense } from './license-provider'
import { cn } from '@/lib/utils'

export function LiveTranscriptionLockOverlay() {
  const { status, openSubscribe, isLocked } = useLicense()
  if (!isLocked) return null

  const expired = status.state === 'expired'
  const palette = expired
    ? {
        ring: 'ring-rose-500/40 bg-rose-950/40',
        badge: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
        button: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400',
        icon: <Lock className="h-7 w-7" />,
      }
    : {
        ring: 'ring-amber-500/40 bg-amber-950/40',
        badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
        button: 'bg-amber-500 hover:bg-amber-400 text-amber-950 border-amber-300',
        icon: <Sparkles className="h-7 w-7" />,
      }

  const title = expired
    ? 'Subscription Expired'
    : 'Free Trial Ended'
  const subtitle = expired
    ? 'Your activation has expired. Re-activate to keep using AI Detection.'
    : 'Your 1-hour free trial of Live Transcription has ended. Activate a subscription to continue.'

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center',
        'backdrop-blur-md bg-zinc-950/70 ring-1 ring-inset',
        palette.ring,
      )}
      role="dialog"
      aria-label="Live Transcription locked"
    >
      <span className={cn('inline-flex items-center justify-center h-14 w-14 rounded-full border', palette.badge)}>
        {palette.icon}
      </span>
      <h3 className="mt-4 text-base font-semibold text-zinc-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[12px] text-zinc-300 leading-relaxed">{subtitle}</p>

      <button
        type="button"
        onClick={openSubscribe}
        className={cn(
          'mt-5 inline-flex items-center gap-2 h-9 px-4 rounded-md text-[11px] font-semibold uppercase tracking-wider',
          'border shadow-lg transition-colors',
          palette.button,
        )}
      >
        <Lock className="h-3.5 w-3.5" />
        Activate AI Detection Now
      </button>

      <p className="mt-4 text-[10px] text-zinc-500">
        ScriptureLive AI helps churches display scripture instantly without typing.<br />
        Activate today and transform your worship experience.
      </p>
    </div>
  )
}
