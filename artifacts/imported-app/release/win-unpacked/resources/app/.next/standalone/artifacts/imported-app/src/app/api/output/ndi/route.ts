import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/output/ndi
 *
 * Legacy compatibility shim. The historic NDI surface had its own
 * standalone renderer with its own font scaling and a 3-line content
 * cap that silently truncated long verses — i.e. Preview, the
 * secondary screen and NDI all looked subtly different and any verse
 * longer than three short lines lost text on the NDI feed.
 *
 * Per operator feedback ("One text engine. No split logic. Preview =
 * Output Display = NDI") this route is now a thin 308 redirect into
 * the unified congregation renderer with `?ndi=1`. Any extra flags
 * the NDI capture window passes (transparent matte, force-lower-third
 * overlay, lower-third position) are forwarded so the single renderer
 * can honour them without duplicating the layout code.
 *
 * Forwarded query params:
 *   transparent=1   → renders body / stage / output with no fill so
 *                     vMix / OBS receive an alpha matte for keying
 *   lowerThird=1    → forces lower-third regardless of the operator's
 *                     ndiDisplayMode (legacy "force NDI as overlay")
 *   position=top|bottom → overrides the lower-third bar position
 */
export async function GET(req: NextRequest) {
  const incoming = new URL(req.url)
  const target = new URL('/api/output/congregation', incoming.origin)
  target.searchParams.set('ndi', '1')
  if (incoming.searchParams.get('transparent') === '1') {
    target.searchParams.set('transparent', '1')
  }
  if (incoming.searchParams.get('lowerThird') === '1') {
    target.searchParams.set('lowerThird', '1')
  }
  const pos = incoming.searchParams.get('position')
  if (pos === 'top' || pos === 'bottom') {
    target.searchParams.set('position', pos)
  }
  return NextResponse.redirect(target.toString(), 308)
}
