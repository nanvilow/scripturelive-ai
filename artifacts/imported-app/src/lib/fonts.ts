/**
 * Central font registry.
 *
 * Operators expect to see typography changes apply identically across
 * the operator preview, the secondary congregation screen, and the
 * NDI/SSE feed. To keep that contract, every surface looks up the
 * actual CSS `font-family` stack here from the same key — instead of
 * each renderer mapping `'sans' → font-sans` on its own.
 *
 * `googleFamily` is set for fonts that need to be loaded from Google
 * Fonts. We pull them once via a single `<link>` in app/layout.tsx
 * (see `googleFontsHref` below) and inject the same link into the
 * standalone /api/output/congregation HTML so the secondary screen
 * renders with the same metrics.
 */
export interface FontDef {
  key: string
  label: string
  group: 'Sans-serif' | 'Serif' | 'Display' | 'Monospace'
  stack: string
  googleFamily?: string
}

export const FONT_REGISTRY: FontDef[] = [
  { key: 'sans', label: 'System Sans-Serif', group: 'Sans-serif',
    stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
  { key: 'arial', label: 'Arial', group: 'Sans-serif',
    stack: 'Arial,Helvetica,sans-serif' },
  { key: 'helvetica', label: 'Helvetica', group: 'Sans-serif',
    stack: 'Helvetica,Arial,sans-serif' },
  { key: 'open-sans', label: 'Open Sans', group: 'Sans-serif',
    stack: '"Open Sans",Arial,sans-serif', googleFamily: 'Open+Sans:wght@400;600;700' },
  { key: 'roboto', label: 'Roboto', group: 'Sans-serif',
    stack: 'Roboto,Arial,sans-serif', googleFamily: 'Roboto:wght@400;500;700' },
  { key: 'lato', label: 'Lato', group: 'Sans-serif',
    stack: 'Lato,Arial,sans-serif', googleFamily: 'Lato:wght@400;700;900' },

  { key: 'serif', label: 'System Serif', group: 'Serif',
    stack: 'Georgia,"Times New Roman",serif' },
  { key: 'times', label: 'Times New Roman', group: 'Serif',
    stack: '"Times New Roman",Times,serif' },
  { key: 'georgia', label: 'Georgia', group: 'Serif',
    stack: 'Georgia,"Times New Roman",serif' },
  { key: 'playfair', label: 'Playfair Display', group: 'Display',
    stack: '"Playfair Display",Georgia,serif', googleFamily: 'Playfair+Display:wght@400;600;700' },

  { key: 'montserrat', label: 'Montserrat', group: 'Display',
    stack: 'Montserrat,Arial,sans-serif', googleFamily: 'Montserrat:wght@400;600;700' },
  { key: 'poppins', label: 'Poppins', group: 'Display',
    stack: 'Poppins,Arial,sans-serif', googleFamily: 'Poppins:wght@400;500;700' },

  { key: 'mono', label: 'Monospace', group: 'Monospace',
    stack: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' },
]

const FONT_BY_KEY = new Map(FONT_REGISTRY.map((f) => [f.key, f]))

export function getFontStack(key: string | undefined | null): string {
  if (!key) return FONT_BY_KEY.get('sans')!.stack
  // Tolerate legacy values where the operator-saved setting was the
  // class name itself (e.g. 'font-sans'), so persisted state from
  // earlier builds keeps rendering correctly.
  if (key.startsWith('font-')) key = key.slice(5)
  return (FONT_BY_KEY.get(key) || FONT_BY_KEY.get('sans')!).stack
}

/**
 * Multiplier applied on top of the per-frame base size so the four
 * preset buckets actually look different across every surface.
 *   sm = 0.85x · md = 1.00x · lg = 1.25x · xl = 1.50x
 */
export const FONT_SIZE_MULT: Record<string, number> = {
  sm: 0.85,
  md: 1.0,
  lg: 1.25,
  xl: 1.5,
}

/**
 * Build a single Google Fonts CSS URL with every web font we expose so
 * we can inject one `<link>` in app/layout.tsx and one in the
 * congregation HTML — keeping both surfaces metric-identical.
 */
export const googleFontsHref: string = (() => {
  const families = FONT_REGISTRY
    .map((f) => f.googleFamily)
    .filter((f): f is string => Boolean(f))
  const params = families.map((f) => `family=${f}`).join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
})()

// ── Reference typography fallback (Bug #5) ──────────────────────────
// The Settings card now exposes independent Typography controls for
// the verse REFERENCE label (e.g. "John 3:16") on top of the existing
// body controls. Each renderer must read the resolved values through
// this helper so a missing reference field gracefully falls back to
// the body equivalent — that lets persisted operator settings from
// earlier builds keep rendering identically until the operator
// explicitly customises the reference style.
export interface ResolvedReferenceTypography {
  fontStack: string
  fontSize: 'sm' | 'md' | 'lg' | 'xl'
  textShadow: boolean
  textScale: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
}
export function resolveReferenceTypography(s: {
  fontFamily?: string
  fontSize?: 'sm' | 'md' | 'lg' | 'xl'
  textShadow?: boolean
  textScale?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  referenceFontFamily?: string
  referenceFontSize?: 'sm' | 'md' | 'lg' | 'xl'
  referenceTextShadow?: boolean
  referenceTextScale?: number
  referenceTextAlign?: 'left' | 'center' | 'right' | 'justify'
}): ResolvedReferenceTypography {
  return {
    fontStack: getFontStack(s.referenceFontFamily ?? s.fontFamily),
    fontSize: s.referenceFontSize ?? s.fontSize ?? 'lg',
    textShadow: s.referenceTextShadow ?? s.textShadow ?? true,
    textScale: s.referenceTextScale ?? s.textScale ?? 1,
    textAlign: s.referenceTextAlign ?? s.textAlign ?? 'center',
  }
}

// ── Lower-third clamp formula (Bug #4) ──────────────────────────────
// Single source of truth for lower-third body + reference font-size
// clamp() strings. Used by:
//   • OutputPreview (Settings WYSIWYG preview)
//   • The embedded JS in /api/output/congregation (broadcast HTML
//     used for the secondary screen AND the NDI capture window)
// so all three surfaces produce visually identical lower-third
// metrics for the same content + settings.
//
// `scale` is the operator's textScale × FONT_SIZE_MULT[fontSize] —
// already combined so this helper doesn't need to know which bucket
// the operator picked.
export function lowerThirdClamp(args: {
  totalChars: number
  bodyScale: number
  refScale: number
}): { body: string; reference: string } {
  const { totalChars, bodyScale, refScale } = args
  // Body band shrinks as the verse gets longer so long passages
  // still fit inside the rounded card.
  let band = totalChars > 320 ? 5 : totalChars > 180 ? 7 : totalChars > 90 ? 9 : 11
  band *= bodyScale
  const cap = Math.max(1.4, 2 * bodyScale)
  const min = Math.max(0.4, 0.6 * bodyScale)
  const body = `clamp(${min}rem,min(${band * 0.55}cqw,${band}cqh),${cap}rem)`
  // Reference band: smaller than body, but still scales with the
  // reference textScale + fontSize bucket so the operator's
  // independent reference Typography settings actually move the
  // needle on the projector + NDI feed.
  const refBand = Math.max(2.5, 4 * refScale)
  const refCap = Math.max(1, 1.4 * refScale)
  const refMin = Math.max(0.35, 0.5 * refScale)
  const reference = `clamp(${refMin}rem,min(${refBand * 0.5}cqw,${refBand}cqh),${refCap}rem)`
  return { body, reference }
}
