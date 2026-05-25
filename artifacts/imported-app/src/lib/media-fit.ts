import type { Slide } from '@/lib/store'

/**
 * v0.7.230 — Canonical mapping for the operator's per-clip `mediaFit`
 * choice to (a) the CSS `object-fit` value the <video>/<img> should use
 * and (b) the `aspectRatio` the surrounding container should be locked
 * to (null = inherit the surface's natural frame, i.e. 16/9 for preview).
 *
 * Centralised because the same five-way mapping has to be applied
 * identically across four surfaces or the operator sees one thing in
 * the preview box and a different thing on the secondary screen / NDI
 * / OBS:
 *
 *   1. Output renderer            (congregation/route.ts L1824-1830)
 *   2. Slide renderer             (slide-renderer.tsx L19-36)
 *   3. Operator MediaVideoSurface (logos-shell.tsx L504-505)  ← was 3-case
 *   4. Standby preview poster     (logos-shell.tsx L1434-1441) ← was 3-case
 *
 * Surfaces 3 + 4 were drifting (only handled fill / stretch / default)
 * which made the operator preview boxes letterbox 16:9 / 4:3 clips even
 * when the output WAS honouring the picked aspect ratio. Operator
 * escalation: "what I see in the preview is not what shows up on the
 * second screen and NDI." Using a single helper makes the drift
 * impossible to reintroduce — adding a new fit value updates all four
 * surfaces with one edit.
 *
 * Mapping rules — keep IDENTICAL with `congregation/route.ts` L1824-1830:
 *   'fill'     → object-fit:cover  (fills frame, may crop)
 *   'stretch'  → object-fit:fill   (CSS object-fit:fill = no crop, distort)
 *   '16:9'     → object-fit:contain, aspect-ratio:16/9
 *   '4:3'      → object-fit:contain, aspect-ratio:4/3
 *   'fit' / unset → object-fit:contain (letterbox inside surface frame)
 */
export type ResolvedMediaFit = {
  objectFit: 'contain' | 'cover' | 'fill'
  aspect: string | null
}

export function resolveMediaFit(fit: Slide['mediaFit']): ResolvedMediaFit {
  switch (fit) {
    case 'fill':
      return { objectFit: 'cover', aspect: null }
    case 'stretch':
      return { objectFit: 'fill', aspect: null }
    case '16:9':
      return { objectFit: 'contain', aspect: '16 / 9' }
    case '4:3':
      return { objectFit: 'contain', aspect: '4 / 3' }
    case 'fit':
    default:
      return { objectFit: 'contain', aspect: null }
  }
}
