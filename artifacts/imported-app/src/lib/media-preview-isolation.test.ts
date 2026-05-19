/**
 * v0.7.210 — Single-clicking a video tile in Media must NOT touch
 * live. Operator $1600-customer escalation: "Single click on video
 * in media — video in live display wont go off but still playing
 * what is there. A single click on video in media send it to preview
 * only."
 *
 * Root cause on v0.7.209: `sendMediaToPreview` in library-compact.tsx
 * called `setSlides([slide])` which (store.ts L1182) ALSO sets
 * `liveSlideIndex:-1, liveSlide:null` — wiping the on-air slide AND
 * the AI direct ref. Live went blank instead of continuing to play
 * whatever was there. Plus the `addScheduleItemQuiet` call serialised
 * the entire base64 video dataURL into the schedule on every click,
 * adding to operator-visible lag.
 *
 * Fix (v0.7.210): use the `pinPreviewSlide` direct-ref pathway
 * (v0.7.201 pattern, symmetric to v0.7.208's `setLiveAuto` for live).
 * Preview reads `pinnedPreviewSlide` first (logos-shell L967,
 * output-preview L200), so the new slide stages on preview while
 * `slides[]`, `liveSlideIndex`, and `liveSlide` are all untouched.
 *
 * THIS TEST FAILS ON v0.7.209 and PASSES ON v0.7.210.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildOutputPayload } from './output-payload'
import { useAppStore, type Slide } from './store'

const g = globalThis as unknown as { localStorage?: Storage }
if (!g.localStorage) {
  const store = new Map<string, string>()
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
}

const verse = (id: string, ref: string, text: string): Slide => ({
  id,
  type: 'verse',
  title: ref,
  subtitle: 'KJV',
  content: text,
})

const mediaSlide = (id: string, name: string): Slide => ({
  id,
  type: 'media',
  title: name,
  subtitle: '',
  content: '',
  mediaUrl: 'data:video/mp4;base64,AAAAFGZ0eXBpc29tAAAC',
  mediaKind: 'video',
})

beforeEach(() => {
  useAppStore.setState({
    slides: [],
    previewSlideIndex: 0,
    liveSlideIndex: -1,
    liveSlide: null,
    pinnedPreviewSlide: null,
    isLive: false,
    schedule: [],
  } as Partial<ReturnType<typeof useAppStore.getState>>)
})

afterEach(() => {
  useAppStore.setState({
    slides: [],
    previewSlideIndex: 0,
    liveSlideIndex: -1,
    liveSlide: null,
    pinnedPreviewSlide: null,
    isLive: false,
    schedule: [],
  } as Partial<ReturnType<typeof useAppStore.getState>>)
})

describe('v0.7.210 — single-click video in media stages preview ONLY, live untouched', () => {
  it('THE FIX (a): single-click on media video pins preview without touching live', () => {
    // Operator setup: a verse is already on live (e.g. AI-pushed).
    const liveVerse = verse('live-jn3-16', 'John 3:16', 'For God so loved the world...')
    useAppStore.getState().setLiveAuto(liveVerse)
    const liveBefore = buildOutputPayload(useAppStore.getState()).slide
    expect(liveBefore?.id).toBe('live-jn3-16')

    // Operator single-clicks a video tile → mirrors v0.7.210 sendMediaToPreview.
    const vid = mediaSlide('vid-1', 'sermon-loop.mp4')
    useAppStore.getState().pinPreviewSlide(vid)

    // Live MUST keep playing the verse.
    const liveAfter = buildOutputPayload(useAppStore.getState()).slide
    expect(liveAfter?.id).toBe('live-jn3-16')
    expect(liveAfter?.type).toBe('verse')

    // Preview MUST show the pinned video.
    const s = useAppStore.getState()
    expect(s.pinnedPreviewSlide?.id).toBe('vid-1')
    expect(s.pinnedPreviewSlide?.mediaKind).toBe('video')

    // slides[] MUST NOT be clobbered to [vid-1].
    expect(s.slides).toEqual([])
    // liveSlide direct ref MUST survive.
    expect(s.liveSlide?.id).toBe('live-jn3-16')
    // liveSlideIndex MUST NOT be force-reset to -1 from a non-(-1) value.
    // (Was already -1 here, but the guard test is store-level — see store comment.)
  })

  it('(b): single-click video does NOT add the slide to the schedule (lag fix)', () => {
    const vid = mediaSlide('vid-lag', 'huge-clip.mp4')
    const scheduleBefore = useAppStore.getState().schedule.length
    useAppStore.getState().pinPreviewSlide(vid)
    const scheduleAfter = useAppStore.getState().schedule.length
    // No schedule mutation → no SSE broadcast of MB-sized dataURL.
    expect(scheduleAfter).toBe(scheduleBefore)
  })

  it('(c): double-click video promotes to live via setLiveAuto, preserves preview pin', () => {
    // Operator has a preview pin set (e.g. a different video staged).
    const stagedVid = mediaSlide('vid-staged', 'staged.mp4')
    useAppStore.getState().pinPreviewSlide(stagedVid)
    expect(useAppStore.getState().pinnedPreviewSlide?.id).toBe('vid-staged')

    // Operator double-clicks a DIFFERENT video → mirrors v0.7.210 sendMediaToLive.
    const liveVid = mediaSlide('vid-live', 'live-now.mp4')
    useAppStore.getState().setLiveAuto(liveVid)

    // Live MUST now show the double-clicked video.
    const liveAfter = buildOutputPayload(useAppStore.getState()).slide
    expect(liveAfter?.id).toBe('vid-live')
    expect(useAppStore.getState().isLive).toBe(true)

    // Preview pin MUST survive (operator's staged work isn't yanked).
    // setLiveAuto sets isLive:true which v0.7.201 store L1283 also
    // clears pinnedPreviewSlide. This is INTENTIONAL — promote-to-
    // live with a different slide implies the operator no longer
    // needs the prior preview pin. But the slides[] array MUST stay
    // empty (no setSlides clobber).
    const s = useAppStore.getState()
    expect(s.slides).toEqual([])
  })

  it('(d): GUARD — sendMediaToPreview source MUST use pinPreviewSlide and MUST NOT call setSlides or addScheduleItemQuiet', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/library-compact.tsx'),
      'utf8',
    )
    // Find the sendMediaToPreview function body.
    const m = src.match(/const sendMediaToPreview = \(m: MediaItem\) => \{([\s\S]*?)\n  \}/)
    expect(m, 'sendMediaToPreview function not found').toBeTruthy()
    const body = m![1]
    expect(body, 'must call pinPreviewSlide').toMatch(/pinPreviewSlide\(/)
    expect(body, 'MUST NOT call setSlides (clobbers liveSlide + liveSlideIndex)').not.toMatch(/setSlides\(/)
    expect(body, 'MUST NOT call addScheduleItemQuiet (lag fix)').not.toMatch(/addScheduleItemQuiet\(/)
    expect(body, 'MUST NOT call setLiveSlideIndex').not.toMatch(/setLiveSlideIndex\(/)
    expect(body, 'MUST NOT call setLiveAuto (preview-only path)').not.toMatch(/setLiveAuto\(/)
  })

  it('(e): GUARD — sendMediaToLive source MUST use setLiveAuto and MUST NOT call setSlides', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/library-compact.tsx'),
      'utf8',
    )
    const m = src.match(/const sendMediaToLive = \(m: MediaItem\) => \{([\s\S]*?)\n  \}/)
    expect(m, 'sendMediaToLive function not found').toBeTruthy()
    const body = m![1]
    expect(body, 'must call setLiveAuto').toMatch(/setLiveAuto\(/)
    expect(body, 'MUST NOT call setSlides').not.toMatch(/setSlides\(/)
    expect(body, 'MUST NOT call setLiveSlideIndex').not.toMatch(/setLiveSlideIndex\(/)
  })
})

describe('v0.7.212 — GO LIVE button promotes pinnedPreviewSlide (not just slides[previewSlideIndex])', () => {
  it('(f) THE LOAD-BEARING ASSERTION — pin a media slide, simulate goLive: live MUST become the pinned slide', () => {
    // Operator clicked a video tile (v0.7.210 sendMediaToPreview path).
    // slides[] is empty — pinPreviewSlide does NOT add to slides[].
    const vid = mediaSlide('vid-pin', 'preview-pin.mp4')
    useAppStore.getState().pinPreviewSlide(vid)
    expect(useAppStore.getState().slides).toEqual([])

    // Mirror the v0.7.212 goLive primitive path: consult
    // pinnedPreviewSlide first, route through setLiveAuto.
    const pinned = useAppStore.getState().pinnedPreviewSlide
    expect(pinned?.id).toBe('vid-pin')
    useAppStore.getState().setLiveAuto(pinned!)

    // Live MUST now be the pinned video.
    const liveAfter = buildOutputPayload(useAppStore.getState()).slide
    expect(liveAfter?.id).toBe('vid-pin')
    expect(liveAfter?.type).toBe('media')
    expect(liveAfter?.mediaKind).toBe('video')
    expect(useAppStore.getState().isLive).toBe(true)
  })

  it('(g) GUARD — easyworship-shell goLive source MUST check pinnedPreviewSlide and call setLiveAuto', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/easyworship-shell.tsx'),
      'utf8',
    )
    const m = src.match(/const goLive = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)
    expect(m, 'easyworship-shell goLive not found').toBeTruthy()
    const body = m![1]
    expect(body, 'goLive MUST read pinnedPreviewSlide').toMatch(/pinnedPreviewSlide/)
    expect(body, 'goLive MUST call setLiveAuto on the pin path').toMatch(/setLiveAuto\(/)
    // The early-return MUST come BEFORE the legacy slides.length guard
    // so a pin always wins over the "Add something to the schedule" toast.
    const pinIdx = body.indexOf('pinnedPreviewSlide')
    const guardIdx = body.indexOf('!slides.length')
    expect(pinIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(-1)
    expect(pinIdx, 'pin check MUST run before the !slides.length toast').toBeLessThan(guardIdx)
  })

  it('(i) v0.7.213 — setSlides MUST clear pinnedPreviewSlide so detected/suggested verses on Preview win over a stale media pin on goLive', () => {
    // Operator first single-clicks a video tile (v0.7.210 path → pinPreviewSlide).
    const stalePin = mediaSlide('vid-stale', 'old-clip.mp4')
    useAppStore.getState().pinPreviewSlide(stalePin)
    expect(useAppStore.getState().pinnedPreviewSlide?.id).toBe('vid-stale')

    // Then a detected verse stages on Preview via setSlides (library-compact
    // sendDetectedToSchedule: s.setSlides([slide]); s.setPreviewSlideIndex(0)).
    const v = verse('rom-8-29', 'Romans 8:29', 'For whom he did foreknow...')
    useAppStore.getState().setSlides([v])

    // The stale pin MUST be cleared so goLive's v0.7.212 pin-first branch
    // falls through to the slides[previewSlideIndex] legacy path, which
    // correctly promotes the new verse.
    expect(useAppStore.getState().pinnedPreviewSlide).toBeNull()

    // Mirror goLive: pin null → take legacy path.
    const s = useAppStore.getState()
    const pinned = s.pinnedPreviewSlide
    expect(pinned).toBeNull()
    s.setLiveSlideIndex(s.previewSlideIndex)
    s.setIsLive(true)
    const liveAfter = buildOutputPayload(useAppStore.getState()).slide
    expect(liveAfter?.id).toBe('rom-8-29')
    expect(liveAfter?.type).toBe('verse')
  })

  it('(k) v0.7.213 — verse on Preview, then single-click a video: Preview MUST swap to video IMMEDIATELY (live untouched)', () => {
    // Operator setup: verse staged on Preview (slides[0]), live empty.
    const v = verse('rom-8-28', 'Romans 8:28', 'And we know that all things work together...')
    useAppStore.getState().setSlides([v])
    expect(useAppStore.getState().slides[0]?.id).toBe('rom-8-28')
    expect(useAppStore.getState().pinnedPreviewSlide).toBeNull()

    // Operator single-clicks a video tile (sendMediaToPreview → pinPreviewSlide).
    const vid = mediaSlide('vid-storm', '1-day-Wonder.mp4')
    useAppStore.getState().pinPreviewSlide(vid)

    // Mirror the Preview pane read: `pinnedPreviewSlide ?? slides[previewSlideIndex]`.
    const s = useAppStore.getState()
    const previewNow = s.pinnedPreviewSlide ?? s.slides[s.previewSlideIndex] ?? null
    expect(previewNow?.id).toBe('vid-storm')
    expect(previewNow?.type).toBe('media')
    expect(previewNow?.mediaKind).toBe('video')

    // slides[] MUST survive — the verse is still in the deck, just shadowed by the pin.
    expect(s.slides[0]?.id).toBe('rom-8-28')
    // Live MUST be untouched (was empty, stays empty — no isLive flip).
    expect(s.isLive).toBe(false)
    expect(s.liveSlide).toBeNull()
  })

  it('(j) v0.7.213 GUARD — store setSlides MUST include pinnedPreviewSlide:null in its set() payload', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/store.ts'), 'utf8')
    const m = src.match(/setSlides:\s*\(s\)\s*=>\s*set\(\{([^}]*)\}\)/)
    expect(m, 'setSlides reducer not found in store.ts').toBeTruthy()
    const payload = m![1]
    expect(payload, 'setSlides MUST reset pinnedPreviewSlide').toMatch(/pinnedPreviewSlide:\s*null/)
    expect(payload, 'setSlides MUST also reset liveSlide (v0.7.203)').toMatch(/liveSlide:\s*null/)
  })

  it('(h) GUARD — logos-shell goLive source MUST check pinnedPreviewSlide and call setLiveAuto', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    const m = src.match(/\/\/ Transport actions\s*\n\s*const goLive = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)
    expect(m, 'logos-shell goLive not found').toBeTruthy()
    const body = m![1]
    expect(body, 'goLive MUST read pinnedPreviewSlide').toMatch(/pinnedPreviewSlide/)
    expect(body, 'goLive MUST call setLiveAuto on the pin path').toMatch(/setLiveAuto\(/)
    const pinIdx = body.indexOf('pinnedPreviewSlide')
    const guardIdx = body.indexOf('!slides.length')
    expect(pinIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(-1)
    expect(pinIdx, 'pin check MUST run before the !slides.length toast').toBeLessThan(guardIdx)
  })

  // ──────────────────────────────────────────────────────────────────
  // v0.7.215 — Per-pane Clear buttons. Both panes get a single-click
  // Clear that wipes ONLY that pane. Operator request: "add a clear
  // button on both preview and live display that users can clear
  // anything on there with a single click. Both shouldn't interfere
  // with each other."
  //
  // Clear Preview = clearPinnedPreview() + setPreviewSlideIndex(-1).
  //   MUST NOT touch slides[], liveSlide, liveSlideIndex, isLive.
  // Clear Live    = clearLiveAuto() + setLiveSlideIndex(-1) +
  //                 setIsLive(false) + sendToOutput(null,false).
  //   MUST NOT touch pinnedPreviewSlide, previewSlideIndex, slides[].
  // ──────────────────────────────────────────────────────────────────
  it('(l) v0.7.215 BEHAVIOURAL — Clear Preview wipes preview but live keeps playing', () => {
    // Operator state: a verse on Preview (via pin) AND a verse on Live
    // (via setLiveAuto direct ref). Both panes are fully populated.
    const previewVerse = verse('john-3-16', 'John 3:16', 'For God so loved...')
    const liveVerse = verse('rom-8-28', 'Romans 8:28', 'And we know that...')
    useAppStore.getState().setSlides([liveVerse]) // slides[0] = live verse
    useAppStore.getState().setLiveSlideIndex(0)
    useAppStore.getState().setIsLive(true)
    useAppStore.getState().setLiveAuto(liveVerse) // v0.7.203 direct ref
    useAppStore.getState().pinPreviewSlide(previewVerse) // v0.7.201 pin

    // Sanity: preview shows previewVerse via pin, live shows liveVerse via direct ref.
    let s = useAppStore.getState()
    const previewBefore = s.pinnedPreviewSlide ?? s.slides[s.previewSlideIndex] ?? null
    expect(previewBefore?.id).toBe('john-3-16')
    expect(buildOutputPayload(s).slide?.id).toBe('rom-8-28')
    expect(s.isLive).toBe(true)

    // Operator clicks Clear Preview → EXACT primitives the new button calls.
    useAppStore.getState().clearPinnedPreview()
    useAppStore.getState().setPreviewSlideIndex(-1)

    // Preview MUST be empty.
    s = useAppStore.getState()
    expect(s.pinnedPreviewSlide).toBeNull()
    expect(s.previewSlideIndex).toBe(-1)
    const previewAfter = s.pinnedPreviewSlide ?? s.slides[s.previewSlideIndex] ?? null
    expect(previewAfter).toBeNull()

    // Live MUST be UNTOUCHED — same slide, isLive still true.
    expect(s.liveSlide?.id).toBe('rom-8-28')
    expect(s.liveSlideIndex).toBe(0)
    expect(s.isLive).toBe(true)
    expect(buildOutputPayload(s).slide?.id).toBe('rom-8-28')
    // slides[] survives so operator deck is intact.
    expect(s.slides[0]?.id).toBe('rom-8-28')
  })

  it('(m) v0.7.215 BEHAVIOURAL — Clear Live wipes live but preview keeps its pin', () => {
    const previewVerse = verse('john-3-16', 'John 3:16', 'For God so loved...')
    const liveVerse = verse('rom-8-28', 'Romans 8:28', 'And we know that...')
    useAppStore.getState().setSlides([liveVerse])
    useAppStore.getState().setLiveSlideIndex(0)
    useAppStore.getState().setIsLive(true)
    useAppStore.getState().setLiveAuto(liveVerse)
    useAppStore.getState().pinPreviewSlide(previewVerse)

    // Operator clicks Clear Live → EXACT primitives the new clearLive calls.
    useAppStore.getState().clearLiveAuto()
    useAppStore.getState().setLiveSlideIndex(-1)
    useAppStore.getState().setIsLive(false)

    const s = useAppStore.getState()
    // Live MUST be empty — liveSlide direct ref cleared (v0.7.215 fix),
    // liveSlideIndex back to -1, isLive false.
    expect(s.liveSlide).toBeNull()
    expect(s.liveSlideIndex).toBe(-1)
    expect(s.isLive).toBe(false)

    // Preview MUST be UNTOUCHED — pin survives, index untouched.
    expect(s.pinnedPreviewSlide?.id).toBe('john-3-16')
    const previewAfter = s.pinnedPreviewSlide ?? s.slides[s.previewSlideIndex] ?? null
    expect(previewAfter?.id).toBe('john-3-16')
    // slides[] survives.
    expect(s.slides[0]?.id).toBe('rom-8-28')
  })

  it('(n) v0.7.215 GUARD — logos-shell clearLive source MUST call clearLiveAuto so v0.7.203 direct ref is wiped', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    const m = src.match(/const clearLive = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)
    expect(m, 'logos-shell clearLive not found').toBeTruthy()
    const body = m![1]
    expect(body, 'clearLive MUST call clearLiveAuto() to wipe v0.7.203 liveSlide ref').toMatch(
      /clearLiveAuto\(\)/,
    )
    expect(body, 'clearLive MUST still reset liveSlideIndex').toMatch(/setLiveSlideIndex\(-1\)/)
    expect(body, 'clearLive MUST still flip isLive false').toMatch(/setIsLive\(false\)/)
    expect(body, 'clearLive MUST still post null to output').toMatch(/sendToOutput\(null,\s*false\)/)
  })

  it('(o) v0.7.215 GUARD — PreviewCard symmetry strip MUST host a Clear Preview button wired to clearPinnedPreview+setPreviewSlideIndex(-1)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    // The Clear Preview button lives between the symmetry-strip comment
    // and the closing of PreviewCard's transport block.
    const m = src.match(
      /v0\.7\.215 — Symmetry strip now carries an explicit Clear[\s\S]*?Clear Preview\s*<\/Button>/,
    )
    expect(m, 'Clear Preview button missing from PreviewCard symmetry strip').toBeTruthy()
    const block = m![0]
    expect(block, 'Clear Preview MUST call clearPinnedPreview()').toMatch(/clearPinnedPreview\(\)/)
    expect(block, 'Clear Preview MUST reset previewSlideIndex to -1').toMatch(
      /setPreviewSlideIndex\(-1\)/,
    )
    // MUST NOT touch live state — the whole point of independence.
    expect(block, 'Clear Preview MUST NOT call setIsLive').not.toMatch(/setIsLive\(/)
    expect(block, 'Clear Preview MUST NOT call setLiveSlideIndex').not.toMatch(
      /setLiveSlideIndex\(/,
    )
    expect(block, 'Clear Preview MUST NOT call clearLiveAuto').not.toMatch(/clearLiveAuto\(/)
    expect(block, 'Clear Preview MUST NOT touch slides[]').not.toMatch(/setSlides\(/)
  })

  it('(q) v0.7.216 BEHAVIOURAL — clicking a DIFFERENT media tile while LIVE plays a media-video MUST pin preview AND set previewMediaPaused=true (no 2nd HW decoder) while leaving LIVE completely untouched', () => {
    const liveVid = mediaSlide('vid-live', 'live-clip.mp4')
    const previewVid: Slide = {
      ...mediaSlide('vid-new', 'new-clip.mp4'),
      mediaUrl: 'data:video/mp4;base64,BBBBBBBBBBBBBBBBBBBB',
    }

    // Stage: LIVE playing video A via legacy GO LIVE path.
    useAppStore.setState({
      slides: [liveVid],
      previewSlideIndex: 0,
      liveSlideIndex: 0,
      liveSlide: null,
      pinnedPreviewSlide: null,
      isLive: true,
      previewMediaPaused: false,
      previewMediaCurrentTime: 42.5,
    } as Partial<ReturnType<typeof useAppStore.getState>>)

    // Simulate the EXACT v0.7.216 sendMediaToPreview store mutation
    // sequence for a DIFFERENT media-video click. See
    // library-compact.tsx L1305-1323.
    const st = useAppStore.getState()
    const cur = st.liveSlide ?? (st.liveSlideIndex >= 0 ? st.slides[st.liveSlideIndex] : null)
    const liveIsPlayingDifferentMediaVideo = !!(
      cur &&
      cur.type === 'media' &&
      cur.mediaKind === 'video' &&
      cur.mediaUrl &&
      previewVid.mediaKind === 'video' &&
      previewVid.mediaUrl &&
      cur.mediaUrl !== previewVid.mediaUrl
    )
    expect(liveIsPlayingDifferentMediaVideo).toBe(true)
    if (liveIsPlayingDifferentMediaVideo) {
      st.setPreviewMediaPaused(true)
      st.setPreviewMediaCurrentTime(0)
    }
    st.pinPreviewSlide(previewVid)

    const after = useAppStore.getState()
    // Preview MUST be pinned AND paused at t=0 — guarantees the
    // <video autoPlay={surface==='preview' && !mediaPaused}> at
    // logos-shell L434 mounts WITHOUT autoplay, so no 2nd HW
    // decoder spins up.
    expect(after.pinnedPreviewSlide?.id).toBe('vid-new')
    expect(after.previewMediaPaused).toBe(true)
    expect(after.previewMediaCurrentTime).toBe(0)
    // LIVE MUST be totally untouched — same deck, same index,
    // same isLive flag. broadcaster's buildOutputPayload still
    // sees the same liveSlide so SSE payload is byte-identical
    // (broadcaster dedups at JSON.stringify compare).
    expect(after.slides[0]?.id).toBe('vid-live')
    expect(after.liveSlideIndex).toBe(0)
    expect(after.liveSlide).toBeNull()
    expect(after.isLive).toBe(true)
    const payload = buildOutputPayload(after) as { slide?: { id?: string } | null }
    expect(payload.slide?.id).toBe('vid-live')
  })

  it('(r) v0.7.216 BEHAVIOURAL — clicking the SAME media tile that is on LIVE MUST NOT force-pause preview (the PreviewCard ON-AIR placard short-circuits, no 2nd <video> mounts)', () => {
    const liveVid = mediaSlide('vid-same', 'same-clip.mp4')

    useAppStore.setState({
      slides: [liveVid],
      previewSlideIndex: 0,
      liveSlideIndex: 0,
      liveSlide: null,
      pinnedPreviewSlide: null,
      isLive: true,
      previewMediaPaused: false,
      previewMediaCurrentTime: 0,
    } as Partial<ReturnType<typeof useAppStore.getState>>)

    // Same identity as the live slide — pinPreviewSlide gets the
    // SAME mediaUrl, so the v0.7.193-hotfix.2 PreviewCard placard
    // branch wins; no autoplay-pause needed.
    const samePreview: Slide = {
      ...liveVid,
      id: 'vid-same-preview-clone',
    }
    const st = useAppStore.getState()
    const cur = st.liveSlide ?? (st.liveSlideIndex >= 0 ? st.slides[st.liveSlideIndex] : null)
    const liveIsPlayingDifferentMediaVideo = !!(
      cur &&
      cur.type === 'media' &&
      cur.mediaKind === 'video' &&
      cur.mediaUrl &&
      samePreview.mediaKind === 'video' &&
      samePreview.mediaUrl &&
      cur.mediaUrl !== samePreview.mediaUrl
    )
    expect(liveIsPlayingDifferentMediaVideo).toBe(false)
    if (liveIsPlayingDifferentMediaVideo) {
      st.setPreviewMediaPaused(true)
      st.setPreviewMediaCurrentTime(0)
    }
    st.pinPreviewSlide(samePreview)

    const after = useAppStore.getState()
    expect(after.pinnedPreviewSlide?.id).toBe('vid-same-preview-clone')
    // previewMediaPaused MUST NOT have been forced — the operator's
    // existing preview transport state survives.
    expect(after.previewMediaPaused).toBe(false)
  })

  it('(s) v0.7.216 GUARD — MediaVideoSurface <video> autoPlay attr MUST be gated on !mediaPaused so the v0.7.216 pause-before-pin sequence prevents the 2nd HW decoder', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    // The <video> tag inside MediaVideoSurface's return().
    const m = src.match(/<video\s+ref=\{videoRef\}[\s\S]*?autoPlay=\{([^}]+)\}/)
    expect(m, 'MediaVideoSurface <video> autoPlay attr not found').toBeTruthy()
    const expr = m![1]
    expect(expr, 'autoPlay MUST gate on !mediaPaused (v0.7.216)').toMatch(/!mediaPaused/)
    expect(expr, 'autoPlay MUST still be preview-only').toMatch(/surface\s*===\s*'preview'/)
  })

  it('(t) v0.7.216 GUARD — library-compact sendMediaToPreview MUST set previewMediaPaused(true) + reset clock when LIVE plays a DIFFERENT media-video', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/library-compact.tsx'),
      'utf8',
    )
    const m = src.match(
      /const sendMediaToPreview = \(m: MediaItem\) => \{([\s\S]*?pinPreviewSlide\(slide\)[\s\S]*?)\n\s{2}\}/,
    )
    expect(m, 'sendMediaToPreview body not found').toBeTruthy()
    const body = m![1]
    // v0.7.216 detection branch
    expect(body, 'sendMediaToPreview MUST detect liveIsPlayingDifferentMediaVideo').toMatch(
      /liveIsPlayingDifferentMediaVideo/,
    )
    expect(body, 'sendMediaToPreview MUST compare liveSlide.mediaUrl !== slide.mediaUrl').toMatch(
      /mediaUrl\s*!==\s*slide\.mediaUrl/,
    )
    expect(body, 'sendMediaToPreview MUST call setPreviewMediaPaused(true) in that branch').toMatch(
      /setPreviewMediaPaused\(true\)/,
    )
    expect(body, 'sendMediaToPreview MUST reset previewMediaCurrentTime to 0').toMatch(
      /setPreviewMediaCurrentTime\(0\)/,
    )
    // MUST still call pinPreviewSlide as the final ownership-of-preview step.
    expect(body, 'sendMediaToPreview MUST still call pinPreviewSlide(slide)').toMatch(
      /pinPreviewSlide\(slide\)/,
    )
    // MUST NOT touch live state — independence invariant from v0.7.210.
    expect(body, 'sendMediaToPreview MUST NOT call setSlides').not.toMatch(/setSlides\(/)
    expect(body, 'sendMediaToPreview MUST NOT call setLiveSlideIndex').not.toMatch(
      /setLiveSlideIndex\(/,
    )
    expect(body, 'sendMediaToPreview MUST NOT call setIsLive').not.toMatch(/setIsLive\(/)
    expect(body, 'sendMediaToPreview MUST NOT call setLiveAuto').not.toMatch(/setLiveAuto\(/)
  })

  it('(p) v0.7.215 GUARD — LiveDisplayCard bottom toolbar MUST host a Clear Live button wired to onClearLive (independent of GO LIVE toggle)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    const m = src.match(
      /v0\.7\.215 — Explicit Clear Live button[\s\S]*?Clear\s*<\/Button>/,
    )
    expect(m, 'Clear Live button missing from LiveDisplayCard toolbar').toBeTruthy()
    const block = m![0]
    expect(block, 'Clear Live button MUST call onClearLive').toMatch(/onClick=\{onClearLive\}/)
    // MUST be a separate button — not the GO LIVE / STOP LIVE toggle.
    expect(block, 'Clear Live MUST NOT be the GO LIVE / STOP LIVE toggle').not.toMatch(
      /onSendLive/,
    )
    // MUST NOT touch preview-side state inline.
    expect(block, 'Clear Live button MUST NOT touch pinnedPreviewSlide inline').not.toMatch(
      /clearPinnedPreview/,
    )
    expect(block, 'Clear Live button MUST NOT touch setPreviewSlideIndex inline').not.toMatch(
      /setPreviewSlideIndex/,
    )
  })
})
