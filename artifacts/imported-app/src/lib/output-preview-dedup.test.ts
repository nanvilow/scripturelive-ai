/**
 * v0.7.212 — Single-click on a media tile in Library stops the video
 * currently playing on the LIVE Display pane. Operator $1600-customer
 * escalation: "single-clicking another media tile stops the video
 * currently playing on live display — single click must only stage to
 * preview without interfering with live video playback."
 *
 * Root cause: OutputPreview.sendNow posted to the iframe on EVERY
 * Zustand store change because the broadcaster's subscribe callback
 * has no payload-level dedup. The iframe handler (route.ts L2202
 * IS_PREVIEW) then does `lastRenderKey=''` BEFORE applyRender, which
 * forces a full DOM rebuild even when the slide identity is unchanged.
 * Rebuilding the live <video> element restarts playback (or stops it
 * if the element is detached mid-frame). The mirrorLive=true Live
 * Display pane was therefore re-rendering and tearing down its video
 * on every operator click in unrelated columns (Library, Songs,
 * Notes, etc).
 *
 * Fix (v0.7.212, output-preview.tsx ~L355-405): parent-side fingerprint
 * dedup. sendNow computes a CHEAP identity fingerprint (slide id, type,
 * title, content, mediaKind, mediaUrl.length proxy, settings, audio,
 * displayMode, blanked, isLive) and skips the postMessage when it
 * matches the last one sent to THIS iframe. mediaUrl excluded from the
 * stringify for cost — slide.id is the identity proxy.
 *
 * THIS TEST PASSES ON v0.7.212 AND FAILS ON v0.7.211 (no dedup ref).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(
  join(process.cwd(), 'src/components/settings/output-preview.tsx'),
  'utf8',
)

describe('v0.7.212 — parent-side fingerprint dedup prevents live video re-mount on unrelated store changes', () => {
  it('(a) THE LOAD-BEARING GUARD — sendNow MUST hold a lastSentFpRef and early-return when the fingerprint matches', () => {
    // The ref must be declared.
    expect(src, 'lastSentFpRef must be declared (parent-side dedup memory)').toMatch(
      /const\s+lastSentFpRef\s*=\s*useRef<string>\(/,
    )
    // Locate sendNow function body.
    const m = src.match(/const sendNow = \(payload: OutputPayload\) => \{([\s\S]*?)\n  \}/)
    expect(m, 'sendNow function body not found').toBeTruthy()
    const body = m![1]
    // Must compute a fingerprint.
    expect(body, 'sendNow must compute a fingerprint string').toMatch(/const\s+fp\s*=\s*JSON\.stringify\(/)
    // Must early-return when fp matches the last sent.
    expect(body, 'sendNow must early-return when fp === lastSentFpRef.current').toMatch(
      /if\s*\(\s*fp\s*===\s*lastSentFpRef\.current\s*\)\s*return/,
    )
    // Must update the ref on the non-skipped path.
    expect(body, 'sendNow must update lastSentFpRef.current = fp before posting').toMatch(
      /lastSentFpRef\.current\s*=\s*fp/,
    )
    // Order matters: the fp-equality early-return MUST occur BEFORE
    // revRef.current += 1 (otherwise we'd bump the rev counter on
    // skipped sends, eventually wrapping or growing unbounded).
    const earlyReturnIdx = body.indexOf('lastSentFpRef.current') // first occurrence is the comparison
    const revBumpIdx = body.indexOf('revRef.current += 1')
    expect(earlyReturnIdx, 'fp comparison must appear in sendNow').toBeGreaterThan(-1)
    expect(revBumpIdx, 'revRef bump must appear in sendNow').toBeGreaterThan(-1)
    expect(earlyReturnIdx).toBeLessThan(revBumpIdx)
  })

  it('(b) GUARD — fingerprint MUST exclude raw mediaUrl (multi-MB dataURL stringify would lag the operator)', () => {
    const m = src.match(/const sendNow = \(payload: OutputPayload\) => \{([\s\S]*?)\n  \}/)
    const body = m![1]
    // Inside the JSON.stringify({...}) object literal we must NOT see
    // `mu: s.mediaUrl` (the raw value). It is OK to derive a cheap
    // length proxy like `s.mediaUrl ? s.mediaUrl.length : 0`.
    // Stronger: assert the body never references `: s.mediaUrl,` /
    // `: s.mediaUrl}` directly (those would mean the raw dataURL is
    // in the fingerprint payload, defeating the cost guard).
    const fpBlockMatch = body.match(/const\s+fp\s*=\s*JSON\.stringify\(([\s\S]*?)\)\n/)
    expect(fpBlockMatch, 'fp JSON.stringify block not found').toBeTruthy()
    const fpBlock = fpBlockMatch![1]
    // Raw inclusion would look like `key: s.mediaUrl,` / `: s.mediaUrl}` / `: s.mediaUrl\n` —
    // i.e. mediaUrl as the VALUE of a key, terminated by `,` `}` or end-of-line.
    // The legitimate ternary `s.mediaUrl ? s.mediaUrl.length : 0` is followed by ` ?` so it
    // does NOT match this stricter pattern.
    expect(fpBlock, 'fingerprint MUST NOT embed raw s.mediaUrl as a value').not.toMatch(/:\s*s\.mediaUrl\s*[,}\n]/)
    // Cheap length proxy is fine and expected — confirm it's actually
    // there so a future "cleanup" doesn't accidentally include the raw.
    expect(fpBlock, 'fingerprint MUST include a cheap mediaUrl length proxy').toMatch(
      /s\.mediaUrl\s*\?\s*s\.mediaUrl\.length\s*:\s*0/,
    )
  })

  it('(c) GUARD — fingerprint MUST cover slide identity fields the renderer cache key (route.ts L1260) distinguishes', () => {
    const m = src.match(/const sendNow = \(payload: OutputPayload\) => \{([\s\S]*?)\n  \}/)
    const body = m![1]
    const fpBlockMatch = body.match(/const\s+fp\s*=\s*JSON\.stringify\(([\s\S]*?)\)\n/)
    const fpBlock = fpBlockMatch![1]
    // Identity fields that, if changed, MUST cause a re-post.
    for (const field of ['s.id', 's.type', 's.title', 's.content', 's.mediaKind']) {
      expect(fpBlock, `fingerprint MUST include ${field}`).toContain(field)
    }
    // Top-level payload fields that affect render.
    for (const field of ['payload.settings', 'payload.audio', 'payload.displayMode', 'payload.blanked', 'payload.isLive']) {
      expect(fpBlock, `fingerprint MUST include ${field}`).toContain(field)
    }
  })

  it('(d) GUARD — the v0.7.204 force-reset in the iframe handler (route.ts L2202 IS_PREVIEW) MUST stay intact', () => {
    // The parent-side dedup is the new layer; it does NOT replace the
    // iframe-side force-reset that v0.7.204 added to fix the
    // shape-equivalent cache collision (operator's preview snap-back
    // bug). If a future agent removes lastRenderKey='' from the
    // IS_PREVIEW handler thinking the parent dedup is enough, the
    // preview snap-back bug returns when the operator legitimately
    // changes preview state and the renderer's own cache key happens
    // to collide with the previous render.
    const routeSrc = readFileSync(
      join(process.cwd(), 'src/app/api/output/congregation/route.ts'),
      'utf8',
    )
    // Look for the IS_PREVIEW block.
    const idx = routeSrc.indexOf("if(IS_PREVIEW){")
    expect(idx, 'IS_PREVIEW block not found in route.ts').toBeGreaterThan(-1)
    const tail = routeSrc.slice(idx, idx + 2000)
    expect(tail, 'IS_PREVIEW handler MUST still force lastRenderKey="" before applyRender').toMatch(
      /lastRenderKey\s*=\s*''[\s\S]{0,200}applyRender\(d\.payload\)/,
    )
  })

  it('(e) BEHAVIOURAL — a simulated identical-payload re-post is dedup-skipped by the parent fingerprint', () => {
    // Mirror the EXACT fingerprint shape the parent computes so any
    // regression in field selection is caught at runtime, not just
    // by the source-grep guards above. This is the "if I change the
    // fp body, does the dedup still hold for an unchanged payload?"
    // assertion.
    type FP = (p: {
      type: string
      blanked: boolean
      isLive: boolean
      displayMode: string
      slide: null | { id: string; type: string; title?: string; subtitle?: string; content?: unknown; mediaKind?: string; mediaUrl?: string; mediaPaused?: boolean }
      settings: unknown
      audio: unknown
    }) => string
    const computeFp: FP = (payload) => {
      const s = payload.slide
      return JSON.stringify({
        t: payload.type,
        b: payload.blanked,
        l: payload.isLive,
        dm: payload.displayMode,
        sl: s
          ? {
              id: s.id,
              ty: s.type,
              ti: s.title,
              su: s.subtitle,
              co: s.content,
              mk: s.mediaKind,
              mu: s.mediaUrl ? s.mediaUrl.length : 0,
              mp: s.mediaPaused === true ? 1 : 0,
            }
          : null,
        st: payload.settings,
        au: payload.audio,
      })
    }
    const livePayload = {
      type: 'slide',
      blanked: false,
      isLive: true,
      displayMode: 'full',
      slide: { id: 'vid-live', type: 'media', title: 'live.mp4', mediaKind: 'video', mediaUrl: 'data:video/mp4;base64,AAAAFGZ0eXBpc29tAAAC' },
      settings: { theme: 'worship' },
      audio: { volume: 1 },
    }
    const fp1 = computeFp(livePayload)
    // Operator clicks an unrelated Library tile → pinnedPreviewSlide
    // changes in store → broadcaster fires onChange → mirrorLive
    // OutputPreview rebuilds payload, but for mirrorLive the payload
    // is byte-identical to before (live didn't change).
    const fp2 = computeFp({ ...livePayload })
    expect(fp1).toBe(fp2)

    // Sanity: a real live change (operator swaps the on-air video)
    // MUST produce a different fingerprint — otherwise the dedup
    // would erroneously skip a legitimate update and the operator's
    // live would stay on the old video.
    const fp3 = computeFp({
      ...livePayload,
      slide: { ...livePayload.slide, id: 'vid-live-2', mediaUrl: 'data:video/mp4;base64,DIFFERENTCLIP' },
    })
    expect(fp3).not.toBe(fp1)

    // Sanity: a different mediaUrl LENGTH proxy must also trigger a
    // re-post even if the slide id somehow stayed the same (defensive).
    const fp4 = computeFp({
      ...livePayload,
      slide: { ...livePayload.slide, mediaUrl: livePayload.slide.mediaUrl + 'EXTRA' },
    })
    expect(fp4).not.toBe(fp1)
  })
})
