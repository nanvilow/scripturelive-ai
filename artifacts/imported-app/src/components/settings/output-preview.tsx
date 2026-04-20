'use client'

import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

/**
 * Compact WYSIWYG preview used inside the Settings cards. It mirrors
 * the rendering rules in /api/output/congregation so operators can see
 * typography / alignment / lower-third changes without having to open
 * the secondary screen.
 *
 * `mode` selects which output state the preview simulates:
 *   - 'auto'         → follows settings.displayMode
 *   - 'full'         → forces full-screen preview
 *   - 'lower-third'  → forces lower-third bar over the themed backdrop
 */
export function OutputPreview({
  mode = 'auto',
  label,
  sample,
}: {
  mode?: 'auto' | 'full' | 'lower-third'
  label?: string
  sample?: { reference: string; text: string }
}) {
  const settings = useAppStore((s) => s.settings)
  const dm =
    mode === 'auto'
      ? settings.displayMode || 'full'
      : mode === 'lower-third'
        ? 'lower-third'
        : 'full'
  const isLT = dm === 'lower-third' || dm === 'lower-third-black'
  const isBlack = dm === 'lower-third-black'
  const ltPos = settings.lowerThirdPosition === 'top' ? 'top' : 'bottom'
  const ltHeightMap = { sm: 22, md: 33, lg: 45 } as const
  const ltHeightPct = ltHeightMap[settings.lowerThirdHeight] ?? 33
  const ta = settings.textAlign ?? 'center'
  const itemsClass =
    ta === 'left' ? 'items-start' : ta === 'right' ? 'items-end' : 'items-center'
  const textClass =
    ta === 'left'
      ? 'text-left'
      : ta === 'right'
        ? 'text-right'
        : ta === 'justify'
          ? 'text-justify'
          : 'text-center'

  const ref = sample?.reference || 'John 3:16'
  const body =
    sample?.text ||
    'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'

  // Theme-derived backdrop matching the slide-renderer themes.
  const themeMap: Record<string, string> = {
    worship: 'linear-gradient(135deg,#1e0a3c,#1e1b4b)',
    sermon: 'linear-gradient(135deg,#3c1a0a,#451a03)',
    easter: 'linear-gradient(135deg,#0a3c2a,#042f2e)',
    christmas: 'linear-gradient(135deg,#3c0a0a,#4c0519)',
    praise: 'linear-gradient(135deg,#3c3a0a,#451a03)',
    minimal: 'linear-gradient(135deg,#0a0a0a,#171717)',
  }
  const bg = themeMap[settings.congregationScreenTheme] || themeMap.minimal
  const shadow = settings.textShadow !== false ? '0 2px 12px rgba(0,0,0,.4)' : 'none'

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          {label}
        </div>
      )}
      <div
        className="relative w-full aspect-video bg-black overflow-hidden rounded-md ring-1 ring-border"
        style={{ background: isLT && isBlack ? '#000' : bg, containerType: 'size' }}
      >
        {settings.customBackground && !(isLT && isBlack) && (
          <img
            src={settings.customBackground}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}

        {!isLT && (
          <div
            className={cn(
              'absolute inset-0 flex flex-col justify-center text-white',
              itemsClass,
              textClass,
            )}
            style={{
              padding: '6% 6%',
              fontFamily: settings.fontFamily,
              textShadow: shadow,
            }}
          >
            {settings.showReferenceOnOutput !== false && (
              <p
                className="m-0 p-0 opacity-60"
                style={{
                  fontSize: 'clamp(7px, min(2cqw, 4cqh), 18px)',
                  lineHeight: 1.2,
                  marginBottom: '1cqh',
                }}
              >
                {ref}
              </p>
            )}
            <p
              className="m-0 p-0 font-medium"
              style={{
                fontSize: 'clamp(10px, min(4cqw, 8cqh), 28px)',
                lineHeight: 1.4,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {body}
            </p>
          </div>
        )}

        {isLT && (
          <div
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{
              [ltPos]: '6%',
              height: `${ltHeightPct}%`,
              padding: '0 6%',
              containerType: 'size',
            }}
          >
            <div
              className={cn(
                'w-full h-full max-w-[68rem] mx-auto rounded-md flex flex-col justify-center text-white',
                itemsClass,
                textClass,
              )}
              style={{
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '3% 5%',
                gap: '0.6cqh',
                overflow: 'hidden',
                fontFamily: settings.fontFamily,
                textShadow: shadow,
              }}
            >
              {settings.showReferenceOnOutput !== false && (
                <p
                  className="m-0 p-0 opacity-70 font-medium"
                  style={{
                    fontSize: 'clamp(7px, min(2cqw, 4cqh), 18px)',
                    lineHeight: 1.2,
                  }}
                >
                  {ref}
                </p>
              )}
              <p
                className="m-0 p-0 font-semibold w-full"
                style={{
                  fontSize: 'clamp(9px, min(4cqw, 9cqh), 24px)',
                  lineHeight: 1.4,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {body}
              </p>
            </div>
          </div>
        )}

        <div className="absolute top-1 right-1 z-10">
          <span className="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/80 border border-white/10">
            {isLT ? (isBlack ? 'L/3 · Black' : 'Lower Third') : 'Full Screen'}
          </span>
        </div>
      </div>
    </div>
  )
}
