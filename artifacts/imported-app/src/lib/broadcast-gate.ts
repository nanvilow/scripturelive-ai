// v0.7.234 — Slider-drag broadcast suppression gate.
//
// Problem this solves (operator escalation against v0.7.233): dragging
// ANY scale slider in Settings or the operator console glitches text
// in the Preview card, Live Display card, and every settings-preview
// box. Root cause: every pixel of slider motion fires
// `updateSettings({...})` → Zustand store update → OutputBroadcaster
// subscribe callback → JSON.stringify(buildPayload(...)) → 16ms timer
// → POST /api/output → SSE fan-out → every receiver re-renders → and
// inside slide-renderer.tsx `pickContentCqi` walks every character to
// recompute auto-fit. That whole chain runs ~60 times per second
// during a drag, on every preview surface in the app — that is the
// glitch.
//
// Fix: a module-local suppression gate that the Slider primitive flips
// to `true` on pointerdown and back to `false` on pointerup/cancel.
// OutputBroadcaster.schedule() checks the flag and defers the POST
// while suppressed; on release it drains the dirty snapshot in a
// single flush so receivers snap to the operator's final value (no
// 60Hz drag preview, which operators have never asked for).
//
// Why module-local (not Zustand state):
//   - Zero re-render cost. A store flag would itself trip the
//     OutputBroadcaster subscribe callback and partially defeat the
//     fix.
//   - The gate is purely runtime / UI plumbing — not persisted, not
//     restored, not observed by render code anywhere else.
//
// Safety against stuck-suppressed:
//   - Slider attaches a window-level pointerup/pointercancel listener
//     in the same pointerdown handler so a pointer release OUTSIDE
//     the thumb still flips the gate off. Radix's own pointer-capture
//     usually catches this, but we belt-and-brace because a stuck
//     gate would silently freeze ALL settings/slide broadcasts.
//   - Slider component cleanup releases the gate on unmount.
//   - If multiple sliders somehow set the gate concurrently (split
//     panels, settings preview iframe sharing the same module
//     instance), the last release wins — acceptable; the worst case
//     is one extra deferred-then-flushed POST.

let suppressed = false
const listeners = new Set<() => void>()

export function setBroadcastSuppressed(value: boolean): void {
  if (suppressed === value) return
  suppressed = value
  for (const cb of listeners) {
    try { cb() } catch { /* swallow — one bad listener must not block others */ }
  }
}

export function isBroadcastSuppressed(): boolean {
  return suppressed
}

export function onSuppressionChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
