'use client'

// ─────────────────────────────────────────────────────────────────────
// STABLE STAGE
// ─────────────────────────────────────────────────────────────────────
// v0.5.51 — operator complaint:
//
//   "While dragging the cursor with the mouse between columns, let the
//    text of the Preview and Live Display stay still without the bible
//    text losing its alignments."
//
// The Preview and Live Display panels render their slide content with
// CSS container-query units (`cqi` / `cqw` / `cqh`) so the bible text
// auto-scales to whatever column width the operator has chosen. That
// works perfectly while the column is RESTING — but while the operator
// is actively dragging the column splitter, the container width
// changes on every pointer-move tick, so:
//
//   - font-sizes recompute every frame (jitter)
//   - line wraps shift (a word can hop down one line then back up)
//   - vertical / horizontal alignment of the verse drifts
//   - the reference badge wraps differently from the body
//
// ie. the text "loses its alignments" mid-drag, exactly as reported.
//
// FIX — render the slide into a FIXED-SIZE 1920×1080 reference canvas
// and apply a single GPU `transform: scale(...)` to fit it inside
// whatever column width the operator dragged to. The inner DOM never
// changes size, so:
//
//   - container queries inside resolve to the same pixel values
//     forever, so font-sizes never recompute
//   - line wraps are FROZEN at the 1920px reference width
//   - alignment is preserved to the pixel
//   - dragging is silky because only the GPU transform matrix is
//     animated (no layout, no reflow)
//
// This is the same trick broadcast tools (vMix, ProPresenter, OBS
// Studio sources) use to keep an output preview crisp at any UI size.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

// 1920×1080 — the reference resolution. Picked to match the
// congregation TV / NDI feed so what the operator sees in the
// scaled-down preview is pixel-proportional to what shows on air.
const REF_W = 1920
const REF_H = 1080

// SSR-safe layout effect — stays useEffect on the server, becomes
// useLayoutEffect in the browser so the first measure happens before
// paint and the operator never sees a flash of unscaled (=oversized)
// content.
const useIsoLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export function StableStage({
  children,
  scale = 1,
  className,
}: {
  /**
   * Slide content to render at the fixed 1920×1080 reference size.
   * Anything inside (SlideThumb, lower-third overlay, etc.) can rely
   * on the container being EXACTLY 1920×1080, so its container-query
   * font sizing produces identical pixel values regardless of how
   * narrow or wide the operator has dragged the column.
   */
  children: ReactNode
  /**
   * Optional user-supplied scale multiplier — used by the Live
   * Display "Size" slider on top of the auto-fit-to-column scale.
   * 1 = exactly fit the column; 0.5 = half size; 2 = double size.
   */
  scale?: number
  /**
   * Extra classes for the OUTER container (the one that occupies the
   * column). Use this to pass `ring-2 ring-red-500` etc.
   */
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Fit factor = REAL column width ÷ 1920. Starts at 0 so the inner
  // canvas is invisible until the first measure resolves — prevents a
  // 1-frame flash of a 1920px-wide stage spilling out of a tiny
  // column.
  const [fit, setFit] = useState(0)

  useIsoLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      const fitW = rect.width / REF_W
      // Belt-and-braces — also clamp to height-fit for parents that
      // constrain height tighter than aspect-video would imply.
      const fitH = rect.height > 0 ? rect.height / REF_H : fitW
      const next = Math.min(fitW, fitH)
      setFit(next > 0 ? next : 0)
    }

    // First measure synchronously so paint #1 already has the right
    // transform applied.
    measure()

    // Then track every subsequent size change with a ResizeObserver.
    // Wrap the callback in requestAnimationFrame so we coalesce
    // multiple drag-tick resizes into a single layout-aligned write
    // — keeps the splitter buttery smooth even on slow machines.
    let pending = false
    const ro = new ResizeObserver(() => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        measure()
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full aspect-video overflow-hidden',
        className,
      )}
    >
      {/* The fixed 1920×1080 stage. Centered via translate(-50%,-50%)
          so it scales from the middle (matches the existing Live
          Display "Size" slider behaviour). transform-origin is on the
          centre point too so the SIZE slider feels symmetric. */}
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: `${REF_W}px`,
          height: `${REF_H}px`,
          transform: `translate(-50%, -50%) scale(${fit * scale})`,
          transformOrigin: 'center center',
          // Tell the compositor up-front so the GPU keeps a layer
          // ready — avoids a re-rasterize on the first drag tick.
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
}
