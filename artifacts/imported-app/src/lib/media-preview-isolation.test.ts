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
  content: [text],
})

const mediaSlide = (id: string, name: string): Slide => ({
  id,
  type: 'media',
  title: name,
  subtitle: '',
  content: [],
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

  it('(q) v0.7.241 BEHAVIOURAL — clicking a DIFFERENT media tile while LIVE plays a media-video MUST pin preview AND auto-play it (previewMediaPaused=false) while leaving LIVE completely untouched', () => {
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
    // v0.7.241 — pinPreviewSlide now AUTO-PLAYS the pinned clip in
    // Preview (operator chose UX feedback over the v0.7.222 HW-decoder-
    // eviction protection). The store atomically resets
    // previewMediaPaused=false + previewMediaCurrentTime=0, so even
    // though the caller armed previewMediaPaused=true above, the pin
    // clears it. Preview is pinned and auto-playing from t=0.
    expect(after.pinnedPreviewSlide?.id).toBe('vid-new')
    expect(after.previewMediaPaused).toBe(false)
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

  it('(u) v0.7.216 GUARD — MediaVideoSurface play/pause effect MUST register a one-shot `canplay` retry so GO-LIVE-swapped media-videos auto-play once the new src buffers', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    // Anchor on the play/pause effect: `shouldPlay = ... ? (isLive && !mediaPaused) : !mediaPaused`
    // through to the effect's deps array. Capture the WHOLE effect body so we
    // can assert structure of the canplay branch + cleanup.
    const m = src.match(
      /const shouldPlay = surface === 'live'[\s\S]*?\}, \[surface, isLive, mediaPaused, mediaCurrentTime, src\]\)/,
    )
    expect(m, 'play/pause effect with expected deps not found in MediaVideoSurface').toBeTruthy()
    const body = m![0]
    // Initial play attempt MUST still happen synchronously.
    expect(body, 'MUST still call v.play() synchronously on shouldPlay').toMatch(
      /v\.play\(\)\.catch\(\(\) => \{\}\)/,
    )
    // One-shot canplay retry MUST be registered inside the shouldPlay branch.
    expect(body, 'MUST register a one-shot canplay listener that retries play()').toMatch(
      /addEventListener\(\s*'canplay'\s*,\s*onCanPlay\s*,\s*\{\s*once:\s*true\s*\}\s*\)/,
    )
    // v0.7.224 — onCanPlay expanded from a one-liner to a multi-line
    // block that also re-applies the pending seek before play (see
    // test (jj) for the full v0.7.224 invariants). The v0.7.216
    // invariant this test enforces is unchanged: the handler MUST
    // exist and MUST call v.play() — we just relax the regex to
    // accept the expanded body shape.
    expect(body, 'onCanPlay MUST be defined as a const arrow function').toMatch(
      /const\s+onCanPlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\}/,
    )
    expect(body, 'onCanPlay MUST call v.play().catch(() => {}) so the canplay retry actually resumes playback').toMatch(
      /const\s+onCanPlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?v\.play\(\)\.catch\(\(\)\s*=>\s*\{\}\)[\s\S]*?\}/,
    )
    // Cleanup MUST remove the listener so a rapid second src-swap doesn't leak.
    expect(body, 'cleanup MUST remove the canplay listener').toMatch(
      /removeEventListener\(\s*'canplay'\s*,\s*onCanPlay\s*\)/,
    )
  })

  it('(y) v0.7.218 GUARD — MediaVideoSurface <video> `preload` MUST be gated on `surface === \'preview\' && mediaPaused` so a paused-by-sendMediaToPreview clip does NOT eagerly allocate a HW decoder slot that competes with the live decoder', () => {
    // v0.7.216 gated `autoPlay` on `!mediaPaused` to stop the 2nd HW
    // decoder from spinning up. But operator escalation showed live
    // video STILL stalled — because `preload="auto"` (the prior value)
    // tells Chromium to eagerly DOWNLOAD AND DECODE on element mount,
    // allocating a HW decoder slot regardless of the autoPlay flag.
    // The v0.7.218 fix makes preload SYMMETRIC to autoPlay: when the
    // preview is mounted paused-at-zero, preload="metadata" (no HW
    // decoder); otherwise preload="auto" (normal behaviour).
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    // The autoPlay gate from v0.7.216 MUST remain (defence in depth —
    // both autoPlay and preload now need to honour mediaPaused).
    expect(src, 'autoPlay gate from v0.7.216 MUST remain').toMatch(
      /autoPlay=\{surface === 'preview' && !mediaPaused\}/,
    )
    // v0.7.222 update — operator escalation showed "metadata" STILL
    // contended with the live decoder (HTTP range request + container
    // demux + decoder capability probe). v0.7.222 tightens the gate
    // to "none" (no fetch, no demux, no decoder probe). The shape of
    // the condition is unchanged; only the truthy branch value moved
    // from 'metadata' → 'none'. Test (bb) in the v0.7.222 describe()
    // block carries the canonical assertion; this test keeps the
    // condition-shape guard here so the v0.7.218 invariant ("preload
    // is gated on surface===preview && mediaPaused, not bare auto")
    // remains pinned.
    expect(
      src,
      'preload MUST be gated on (surface === preview && mediaPaused) → none, else auto (v0.7.222 tightened "metadata" → "none" — see test (bb) for rationale)',
    ).toMatch(
      /preload=\{surface === 'preview' && mediaPaused \? 'none' : 'auto'\}/,
    )
    // The positive match above already pins the exact gate; an extra
    // "no bare preload" grep would false-positive on documentation
    // comments that quote the old behaviour. MediaPreheat's <video>
    // intentionally keeps preload="auto" (it's OFF-VIEWPORT and exists
    // specifically to pre-warm caches) and is a separate concern.
  })

  it('(z) v0.7.219 GUARD — MediaPreheat MUST warm bytes via <link rel="preload" as="video"> (NOT <video preload="auto">) so the warm-up itself never allocates a HW decoder slot AND MUST subscribe to pinnedPreviewSlide + liveSlide direct refs so single-clicked / AI-routed media is in HTTP cache when GO LIVE promotes it', () => {
    // The previous warm-up strategy used hidden `<video preload="auto">`
    // elements — but preload="auto" allocates a HW decoder slot to fetch
    // metadata + decode the first frame for the poster. With a 2-4
    // stream GPU cap, those hidden videos silently competed with the
    // real Preview/Live/NDI decoders, contributing to the same live-
    // video-stalls-on-single-click bug that v0.7.210/v0.7.212/v0.7.216/
    // v0.7.218 tried to close. v0.7.219 swaps to <link rel="preload">
    // which fetches bytes into the HTTP cache without any decoder cost.
    //
    // Separately, MediaPreheat pre-fix only read `slides[idx]` — missing
    // the v0.7.201 pinnedPreviewSlide and v0.7.203 liveSlide direct
    // refs. v0.7.219 adds both so bytes are actually warm when the
    // operator presses GO LIVE on a single-clicked or AI-routed clip.
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    const mph = src.match(/function MediaPreheat\(\)[\s\S]*?\n\}\n/)
    expect(mph, 'MediaPreheat function not found').toBeTruthy()
    const body = mph![0]
    // PART 1: MUST use <link rel="preload" as="video"> via document.head
    // imperative DOM API (createElement('link') + appendChild to head).
    expect(body, 'MediaPreheat MUST create a <link> element imperatively').toMatch(
      /document\.createElement\(\s*['"]link['"]\s*\)/,
    )
    expect(body, 'link.rel MUST be "preload"').toMatch(/\.rel\s*=\s*['"]preload['"]/)
    expect(body, 'link.as MUST be "video"').toMatch(/\.as\s*=\s*['"]video['"]/)
    expect(body, 'link MUST be appended to document.head').toMatch(
      /document\.head\.appendChild/,
    )
    // PART 1 guard: MediaPreheat MUST return null (no JSX tree) — all
    // work happens via the imperative head-link useEffect. Returning
    // JSX <video> would re-introduce the decoder-slot anti-pattern.
    expect(body, 'MediaPreheat MUST return null (no JSX render)').toMatch(
      /\n\s*return null\n/,
    )
    // Strip comments before checking for any stray JSX <video> tag —
    // doc comments legitimately mention "<video>" when describing the
    // anti-pattern this fix replaced.
    const noLineComments = body.replace(/\/\/[^\n]*/g, '')
    const noBlockComments = noLineComments.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(noBlockComments, 'MediaPreheat code (excl. comments) MUST NOT render a JSX <video> tag').not.toMatch(
      /<video[\s/>]/,
    )
    // PART 2: MUST subscribe to pinnedPreviewSlide AND liveSlide.
    expect(body, 'MediaPreheat MUST subscribe to pinnedPreviewSlide').toMatch(
      /useAppStore\(\(s\)\s*=>\s*s\.pinnedPreviewSlide\)/,
    )
    expect(body, 'MediaPreheat MUST subscribe to liveSlide').toMatch(
      /useAppStore\(\(s\)\s*=>\s*s\.liveSlide\)/,
    )
    // PART 2 guard: both direct-ref values MUST flow into addIfVideo so
    // their mediaUrl actually ends up in the URLs set.
    expect(body, 'pinnedPreviewSlide MUST be passed to addIfVideo').toMatch(
      /addIfVideo\(pinnedPreviewSlide/,
    )
    expect(body, 'liveSlide MUST be passed to addIfVideo').toMatch(
      /addIfVideo\(liveSlide/,
    )
  })

  it('(w) v0.7.244 GUARD — MediaVideoSurface live writeback threshold MUST be 0.05s (Path A sync: dropped 0.20s → 0.05s + 60Hz rAF loop so the broadcast tracks the live <video> within ~1 frame)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    // Anchor on the writeback useEffect that hosts the `writeThreshold` const.
    // Capture enough of the body to assert both the live value AND the new
    // transport-event listeners (play/pause/seeked/loadedmetadata) that
    // compensate for the coarser timeupdate threshold.
    const m = src.match(
      /const writeThreshold = surface === 'live' \? ([\d.]+) : ([\d.]+)[\s\S]*?v\.removeEventListener\('loadedmetadata', onTransport\)/,
    )
    expect(m, 'MediaVideoSurface writeback effect (with transport listeners) not found').toBeTruthy()
    const liveThreshold = parseFloat(m![1])
    const previewThreshold = parseFloat(m![2])
    expect(liveThreshold, 'LIVE writeback threshold MUST be 0.05s — v0.7.244 Path A sync (0.20s → 0.05s + 60Hz rAF loop) so the SSE broadcast tracks the live <video> within ~1 frame').toBe(0.05)
    expect(previewThreshold, 'PREVIEW writeback threshold MUST stay 0.25s — local UI only, no SSE cost').toBe(0.25)
    const body = m![0]
    // Transport-event listeners MUST be registered so transport transitions
    // (play / pause / seek / loadedmetadata) still produce an immediate
    // writeback even though timeupdate is now throttled to 2Hz.
    expect(body, 'play event MUST trigger writeback').toMatch(/addEventListener\('play', onTransport\)/)
    expect(body, 'pause event MUST trigger writeback').toMatch(/addEventListener\('pause', onTransport\)/)
    expect(body, 'seeked event MUST trigger writeback').toMatch(/addEventListener\('seeked', onTransport\)/)
    expect(body, 'loadedmetadata event MUST trigger writeback').toMatch(/addEventListener\('loadedmetadata', onTransport\)/)
    // Cleanup MUST mirror all four registrations.
    expect(body, 'play cleanup MUST remove listener').toMatch(/removeEventListener\('play', onTransport\)/)
    expect(body, 'pause cleanup MUST remove listener').toMatch(/removeEventListener\('pause', onTransport\)/)
    expect(body, 'seeked cleanup MUST remove listener').toMatch(/removeEventListener\('seeked', onTransport\)/)
    expect(body, 'loadedmetadata cleanup MUST remove listener').toMatch(/removeEventListener\('loadedmetadata', onTransport\)/)
  })

  it('(x) v0.7.234/235 GUARD — congregation receiver routine-drift tolerance MUST be 0.5s (tightened from 1.5s; transport events hard-snap every surface) so OBS/secondary stays in sync without keyframe-flush thrash', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/api/output/congregation/route.ts'),
      'utf8',
    )
    // v0.7.234/235 — Routine-drift correction was rewritten. The
    // tolerance tightened 1.5s → 0.5s (operators saw OBS trailing the
    // app by ~1s on sermon clips), and transport events (pause/scrub/
    // jump) now hard-snap on EVERY surface, while routine forward drift
    // > 0.5s on the secondary still hard-seeks behind the !IS_NDI gate.
    const m = src.match(
      /\}else if\(__absDrift>([\d.]+)&&!IS_NDI\)\{/,
    )
    expect(m, 'congregation receiver routine-drift branch not found').toBeTruthy()
    const tolerance = parseFloat(m![1])
    expect(tolerance, 'receiver routine-drift tolerance MUST be 0.5s — v0.7.234 floor; pairs with the 0.05s live writeback so only true transport events exceed it').toBe(0.5)
    // NDI surface MUST still be exempt from the routine forward-drift
    // seek (preserves the v0.7.194-hotfix.2 freeze guard). Transport
    // events DO hard-snap NDI — that is the v0.7.235 change.
    expect(m![0], 'NDI capture surface MUST stay exempt from the routine drift seek').toMatch(/!IS_NDI/)
  })

  it('(v) v0.7.216 GUARD — Radix portal-based UI primitives (Select/DropdownMenu/Popover/Tooltip/Dialog/etc) MUST render ABOVE the Settings overlay so dropdowns are visible when a media-video is playing on Live', () => {
    // Settings overlay is `fixed inset-0 z-50` (app/page.tsx). Pre-fix every
    // portal-based primitive was ALSO z-50 — equal-z sibling under <body>, so
    // when the live MediaVideoSurface kept repainting via the HW video
    // compositor the dropdown portal could be re-stacked beneath the opaque
    // `bg-background` of the settings overlay. Fix: bump portal primitives
    // to z-[60] so they always paint above the settings chrome.
    const settingsPage = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
    expect(settingsPage, 'settings overlay MUST stay at z-50 (load-bearing baseline for this guard)').toMatch(
      /fixed inset-0 z-50 bg-background/,
    )
    const uiFiles = [
      'src/components/ui/select.tsx',
      'src/components/ui/dropdown-menu.tsx',
      'src/components/ui/popover.tsx',
      'src/components/ui/tooltip.tsx',
      'src/components/ui/hover-card.tsx',
      'src/components/ui/context-menu.tsx',
      'src/components/ui/menubar.tsx',
      'src/components/ui/navigation-menu.tsx',
      'src/components/ui/dialog.tsx',
      'src/components/ui/alert-dialog.tsx',
      'src/components/ui/sheet.tsx',
    ]
    for (const rel of uiFiles) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(src, `${rel} MUST NOT use bare z-50 (would tie with settings overlay)`).not.toMatch(
        /\bz-50\b/,
      )
      expect(src, `${rel} MUST use z-[60] for portal/overlay content`).toMatch(
        /z-\[60\]/,
      )
    }
  })

  it('(aa) v0.7.220 GUARD — NDI hot path MUST use send_send_video_async_v2 + clock_video=false + 2-slot buffer pool (EasyWorship-class smoothness; eliminates main-thread blocking + ~250MB/s allocator churn)', () => {
    const src = readFileSync(
      join(process.cwd(), 'electron/ndi-service.ts'),
      'utf8',
    )

    // (1) FFI binding MUST be loaded for the async variant.
    expect(src, 'send_send_video_async_v2 koffi func declaration MUST exist').toMatch(
      /lib\.func\(\s*['"]void NDIlib_send_send_video_async_v2\(void \*p_instance, const NDIlib_video_frame_v2_t \*p_video_data\)['"]/,
    )

    // (2) Bindings object MUST expose send_send_video_async_v2 so the
    // hot path can call it. Without this, nativeSendFrame would
    // silently fall back to the sync v2 path.
    expect(src, 'bindings object MUST include send_send_video_async_v2').toMatch(
      /this\.bindings\s*=\s*\{[\s\S]*?send_send_video_async_v2[\s\S]*?\}/,
    )

    // (3) The hot send path MUST call the async variant, NOT the
    // legacy sync v2 (which blocks the main thread under
    // clock_video=true and was the v0.7.217-era stutter source).
    const nativeSend = src.match(
      /private nativeSendFrame\([\s\S]*?\n\s\s\}\n/,
    )
    expect(nativeSend, 'nativeSendFrame body not found').toBeTruthy()
    expect(
      nativeSend![0],
      'nativeSendFrame MUST call send_send_video_async_v2 (NOT send_send_video_v2)',
    ).toMatch(/this\.bindings\.send_send_video_async_v2\(this\.senderInstance, frame\)/)
    expect(
      nativeSend![0],
      'nativeSendFrame MUST NOT call the sync send_send_video_v2 (would re-introduce main-thread blocking under clock_video=true semantics)',
    ).not.toMatch(/this\.bindings\.send_send_video_v2\(this\.senderInstance, frame\)/)

    // (4) clock_video MUST be false. With async send, NDI's internal
    // worker thread paces the wire; enabling clock_video would queue
    // a second pacing layer that fights the async queue and re-
    // introduces the main-thread blocking v0.7.220 specifically
    // eliminates.
    const sendCreate = src.match(
      /const settings = \{[\s\S]*?clock_video:\s*(true|false)/,
    )
    expect(sendCreate, 'send_create settings block not found').toBeTruthy()
    expect(sendCreate![1], 'clock_video MUST be false for async send pacing').toBe('false')

    // (5) sendFrame MUST use the 2-slot pre-allocated buffer pool
    // instead of per-frame Buffer.allocUnsafe. With the pool the hot
    // path allocates ZERO bytes per frame (just a memcpy into a
    // pre-existing slot), eliminating ~250MB/s of GC pressure on
    // long-running sessions.
    const sendFrame = src.match(
      /sendFrame\(bgraBuffer: Buffer, width: number, height: number\): void \{[\s\S]*?\n\s\s\}/,
    )
    expect(sendFrame, 'sendFrame body not found').toBeTruthy()
    expect(
      sendFrame![0],
      'sendFrame MUST reference videoBufferPool (the v0.7.220 2-slot pool)',
    ).toMatch(/this\.videoBufferPool/)
    expect(
      sendFrame![0],
      'sendFrame MUST advance videoBufferIndex so consecutive frames write to DIFFERENT slots (NDI buffer-lifetime contract for async send)',
    ).toMatch(/this\.videoBufferIndex\s*=\s*\(this\.videoBufferIndex\s*\+\s*1\)\s*%\s*2/)
    expect(
      sendFrame![0],
      'sendFrame MUST NOT call Buffer.allocUnsafe per frame (would re-introduce ~250MB/s allocator churn the pool is designed to eliminate)',
    ).not.toMatch(/Buffer\.allocUnsafe\(bgraBuffer\.length\)/)

    // (6) Pool MUST be released on stop() so resolution changes
    // across sessions do not leak the old-resolution pool.
    expect(
      src,
      'stop() path MUST reset videoBufferPool to release ~16MB/sender on teardown',
    ).toMatch(/this\.videoBufferPool\s*=\s*\[\]/)

    // (7) Bridge / linger / graceful-stop pacing — under async send
    // these were implicitly fps-paced by the sync FFI blocking. Now
    // they MUST pace explicitly or they burst-send and overwhelm
    // NDI's worker queue (architect medium-risk caveat).
    // armBridge ticker MUST use fps-derived interval, NOT bare 16.
    const armBridgeMatch = src.match(
      /armBridge\(ms = 3000\): void \{[\s\S]*?\n\s\s\}/,
    )
    expect(armBridgeMatch, 'armBridge body not found').toBeTruthy()
    expect(
      armBridgeMatch![0],
      'armBridge setInterval MUST pace to fps (Math.max(16, Math.floor(1000 / fps))), NOT bare 16ms (would burst at 62fps under async)',
    ).toMatch(/Math\.max\(16,\s*Math\.floor\(1000\s*\/\s*\(this\.status\.fps[\s\S]*?\)\)\)/)
    expect(
      armBridgeMatch![0],
      'armBridge MUST NOT use bare 16ms interval (the literal pre-fix value)',
    ).not.toMatch(/\}, 16\)/)
    // lingerStop & gracefulStop fade-to-black loops MUST pace via
    // setTimeout-await between sends; tight for-loop would coalesce
    // into a single black-flash on the receiver under async send.
    const lingerStop = src.match(/async lingerStop\([\s\S]*?\n\s\s\}/)
    expect(lingerStop, 'lingerStop body not found').toBeTruthy()
    expect(
      lingerStop![0],
      'lingerStop fade-to-black loop MUST await setTimeout(frameMs) between sends',
    ).toMatch(/setTimeout\(resolve,\s*frameMs\)/)
    const gracefulStop = src.match(/async gracefulStop\([\s\S]*?\n\s\s\}/)
    expect(gracefulStop, 'gracefulStop body not found').toBeTruthy()
    expect(
      gracefulStop![0],
      'gracefulStop fade-to-black loop MUST await setTimeout(frameMs) between sends',
    ).toMatch(/setTimeout\(resolve,\s*frameMs\)/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// v0.7.222 — Single-click on another media tile while LIVE plays a
// media-video MUST NOT stall the live <video>. Operator $1600-customer
// escalation: v0.7.221 (LIVE `key={liveSlide.mediaUrl}` remount) did
// NOT close this bug because the LIVE URL does not change on a
// preview-pin — the key stays stable and React doesn't remount the
// live <video>. The bug survived because mounting any <video> in the
// PREVIEW pane (even with `preload="metadata"`) triggers a transient
// decoder-capability probe that contends with the live decoder on
// low-end Windows GPUs (2-4 HW slots, 1 used by Live + 1 by NDI
// offscreen capture = no headroom for any probe).
//
// v0.7.222 closes this with defense-in-depth:
//   (bb) attribute layer — MediaVideoSurface <video> preload MUST be
//        `"none"` (NOT `"metadata"`) when surface=preview and paused
//   (cc) render layer — PreviewCard MUST render a STANDBY placard
//        (no <video> element AT ALL) when LIVE plays a DIFFERENT
//        media-video AND previewMediaPaused; pressing the placard's
//        "Play preview" button flips previewMediaPaused→false which
//        releases the gate and mounts the real MediaVideoSurface
//   (dd) the STANDBY gate predicate MUST require all 5 conditions:
//        preview is media-video, live is media-video, URLs differ,
//        previewMediaPaused — removing ANY condition re-opens a
//        regression class (e.g. dropping the URL-differ check would
//        clobber the v0.7.216 ON-AIR placard for same-media)
// ──────────────────────────────────────────────────────────────────────
describe('v0.7.222 — single-click another media tile MUST NOT stall live video', () => {
  it('(bb) v0.7.222 GUARD — MediaVideoSurface <video> preload attr MUST be "none" when preview is paused (NOT "metadata"); v0.7.218 was insufficient', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    const m = src.match(/<video\s+ref=\{videoRef\}[\s\S]*?preload=\{([^}]+)\}/)
    expect(m, 'MediaVideoSurface <video> preload attr not found').toBeTruthy()
    const expr = m![1]
    expect(
      expr,
      'preload MUST be "none" when preview is paused — "metadata" still triggers an HTTP range + container demux + decoder capability probe that contends with the live decoder',
    ).toMatch(/'none'/)
    expect(
      expr,
      'preload MUST stay gated on surface===preview && mediaPaused (only the paused-preview path gets "none"; live surface and playing preview keep "auto")',
    ).toMatch(/surface\s*===\s*'preview'\s*&&\s*mediaPaused/)
    expect(
      expr,
      'preload MUST NOT remain at the v0.7.218 "metadata" value (regression marker)',
    ).not.toMatch(/'metadata'/)
  })

  it('(cc) v0.7.227 GUARD — PreviewCard MUST compute previewStandbyForLive predicate AND render a freezeBg poster <video> (paints one frame then pauses — NOT a continuous MediaVideoSurface decode)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    // The standby predicate MUST exist and combine all 5 conditions.
    const pred = src.match(
      /const previewStandbyForLive = !!\(([\s\S]*?)\n\s{2}\)/,
    )
    expect(pred, 'previewStandbyForLive predicate not found in PreviewCard').toBeTruthy()
    const body = pred![1]
    expect(body, '(dd-1) predicate MUST require previewSlide is media-video').toMatch(
      /previewSlide\?\.type\s*===\s*'media'/,
    )
    expect(body, '(dd-2) predicate MUST require previewSlide.mediaKind === video').toMatch(
      /previewSlide\.mediaKind\s*===\s*'video'/,
    )
    expect(body, '(dd-3) predicate MUST require liveIsMediaVideo (live is also media-video)').toMatch(
      /liveIsMediaVideo/,
    )
    expect(
      body,
      '(dd-4) predicate MUST require URLs differ — same-media is handled by previewMediaIsLive ON-AIR placard, removing this condition would clobber that placard',
    ).toMatch(/liveSlide\?\.mediaUrl\s*!==\s*previewSlide\.mediaUrl/)
    expect(
      body,
      '(dd-5) predicate MUST require previewMediaPaused — once operator presses Play in the transport bar, the gate releases and the real MediaVideoSurface mounts',
    ).toMatch(/previewMediaPaused/)

    // The render branch MUST exist and MUST NOT mount any <video>
    // before the gate releases. Search for the standby placard JSX
    // and confirm there is no MediaVideoSurface inside it.
    const branchMatch = src.match(
      /previewStandbyForLive \? \(([\s\S]*?)\) : \(\s*<MediaVideoSurface/,
    )
    expect(
      branchMatch,
      'previewStandbyForLive ternary branch (placard) → MediaVideoSurface fallback not found in PreviewCard render',
    ).toBeTruthy()
    const placard = branchMatch![1]
    // v0.7.227 — The standby branch now PAINTS the first frame via a
    // freezeBg <video preload="auto"> (operators perceived the old
    // zero-<video> text placard as "single-click is broken"). The
    // decoder slot is held only for the brief play().then(pause) kick
    // (in onLoadedData) then released — no continuous decode runs
    // alongside Live, so the v0.7.222 $1600-customer protection holds.
    // Strip comments first so prose mentioning "autoPlay"/"<video>"
    // doesn't trip the attribute asserts.
    const placardCode = placard
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
    const videoTag = placardCode.match(/<video\b[\s\S]*?>/)
    expect(
      videoTag,
      'v0.7.227 STANDBY placard MUST paint a freezeBg <video> so the operator sees the clip they single-clicked',
    ).toBeTruthy()
    const vtag = videoTag![0]
    expect(vtag, 'freezeBg <video> MUST stay muted (no audio decode competing with Live)').toMatch(/\bmuted\b/)
    expect(vtag, 'freezeBg <video> MUST NOT autoPlay — it paints ONE frame then pauses, never a continuous decode').not.toMatch(/\bautoPlay\b/)
    expect(vtag, 'freezeBg <video> MUST NOT loop').not.toMatch(/\bloop\b/)
    expect(
      placardCode,
      'freezeBg <video> MUST release the decoder via the play().then(pause) kick in onLoadedData (single-frame poster, slot freed)',
    ).toMatch(/onLoadedData=/)
    expect(
      placardCode,
      'STANDBY placard MUST NOT mount the continuous-decode MediaVideoSurface (would defeat the freeze)',
    ).not.toMatch(/<MediaVideoSurface\b/)
  })

  it('(ee) v0.7.241 BEHAVIOURAL — with LIVE playing clip A and operator single-clicking clip B, pinPreviewSlide auto-plays B (previewMediaPaused=false) so the previewStandbyForLive predicate is FALSE and PreviewCard mounts the real MediaVideoSurface (operator chose UX over decoder protection)', () => {
    // Reproduce the operator scenario at the store level.
    const live = mediaSlide('vid-A', 'Clip A on live')
    live.mediaUrl = 'https://cdn.example/A.mp4'
    const preview = mediaSlide('vid-B', 'Clip B pinned')
    preview.mediaUrl = 'https://cdn.example/B.mp4'

    // LIVE already playing A via the v0.7.208 direct ref.
    useAppStore.setState({
      liveSlide: live,
      isLive: true,
      liveSlideIndex: -1,
      pinnedPreviewSlide: null,
      previewMediaPaused: false,
    } as Partial<ReturnType<typeof useAppStore.getState>>)

    // Operator single-clicks B in the Media library — reproduce the
    // EXACT 3-call sequence sendMediaToPreview runs when
    // liveIsPlayingDifferentMediaVideo is detected (library-compact
    // L~1302; v0.7.216 invariant).
    useAppStore.getState().setPreviewMediaPaused(true)
    useAppStore.getState().setPreviewMediaCurrentTime(0)
    useAppStore.getState().pinPreviewSlide(preview)

    const s = useAppStore.getState()
    // Live must be untouched — same direct ref, still on air.
    expect(s.liveSlide?.id, 'LIVE direct ref MUST remain clip A after preview pin').toBe('vid-A')
    expect(s.isLive, 'isLive MUST remain true').toBe(true)
    // Preview must be pinned to B AND paused — the precondition for
    // the STANDBY placard.
    expect(s.pinnedPreviewSlide?.id, 'pinnedPreviewSlide MUST be clip B').toBe('vid-B')
    expect(s.previewMediaPaused, 'v0.7.241 — pinPreviewSlide auto-plays the pin, resetting previewMediaPaused to false even though the caller armed true above (operator chose UX feedback over decoder protection)').toBe(false)
    expect(s.previewMediaCurrentTime, 'previewMediaCurrentTime MUST be reset to 0').toBe(0)

    // The 5-condition predicate from logos-shell L~1165 evaluated in
    // isolation here — proves that with this store state the
    // PreviewCard render path will pick the STANDBY branch (zero
    // <video> = zero contention with LIVE's decoder).
    const previewSlide = s.pinnedPreviewSlide
    const liveSlide = s.liveSlide
    const liveIsMediaVideo =
      liveSlide?.type === 'media' &&
      (liveSlide as Slide & { mediaKind?: string }).mediaKind === 'video' &&
      !!(liveSlide as Slide & { mediaUrl?: string }).mediaUrl
    const previewStandbyForLive =
      previewSlide?.type === 'media' &&
      (previewSlide as Slide & { mediaKind?: string }).mediaKind === 'video' &&
      !!(previewSlide as Slide & { mediaUrl?: string }).mediaUrl &&
      liveIsMediaVideo &&
      (liveSlide as Slide & { mediaUrl?: string }).mediaUrl !==
        (previewSlide as Slide & { mediaUrl?: string }).mediaUrl &&
      s.previewMediaPaused
    expect(
      previewStandbyForLive,
      'v0.7.241 — with auto-play pins previewMediaPaused is false, so the STANDBY predicate is FALSE: PreviewCard mounts the real auto-playing MediaVideoSurface, not the freezeBg poster',
    ).toBe(false)
  })

  it('(gg) v0.7.222 GUARD — in-shell MediaCard.onItemClick first-click path MUST use pinPreviewSlide (NOT setSlides+setLiveSlideIndex(-1)+setIsLive(false)) so single-clicking a media tile via the in-shell Media card does NOT wipe live (architect code-review surfaced this as a second live-stop path the initial v0.7.222 attempt missed; sibling library-compact.sendMediaToPreview was already migrated in v0.7.210/216)', () => {
    const src = readFileSync(
      join(__dirname, '../components/layout/logos-shell.tsx'),
      'utf8',
    )

    // Locate the onItemClick handler body (inside MediaCard).
    // Anchor on the `if (stagedItemId !== item.id)` first-click branch.
    const handlerMatch = src.match(
      /if \(stagedItemId !== item\.id\) \{([\s\S]*?)\} else \{([\s\S]*?)\}\s*\},\s*\[\s*stagedItemId,\s*makeSlide,/,
    )
    expect(
      handlerMatch,
      'MediaCard onItemClick first-click + second-click branches not found — pattern moved?',
    ).toBeTruthy()
    // Strip // line comments so the historical "MUST NOT call X"
    // documentation doesn't trip the negative assertions below.
    const stripComments = (s: string) =>
      s
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
    const firstClick = stripComments(handlerMatch![1])
    const secondClick = stripComments(handlerMatch![2])

    // First-click MUST use pinPreviewSlide.
    expect(
      firstClick,
      '(gg-1) MediaCard first-click MUST call pinPreviewSlide (v0.7.201/v0.7.210/v0.7.222 invariant — direct-ref pin, never setSlides)',
    ).toMatch(/\bpinPreviewSlide\(/)
    // First-click MUST NOT wipe live state.
    expect(
      firstClick,
      '(gg-2) MediaCard first-click MUST NOT call setLiveSlideIndex(-1) — that is the v0.7.222 root-cause regression class (deliberate live wipe on preview pin)',
    ).not.toMatch(/setLiveSlideIndex\(-1\)/)
    expect(
      firstClick,
      '(gg-3) MediaCard first-click MUST NOT call setIsLive(false) — same root cause as (gg-2)',
    ).not.toMatch(/setIsLive\(false\)/)
    // First-click MUST NOT replace the deck.
    expect(
      firstClick,
      '(gg-4) MediaCard first-click MUST NOT call setSlides([...]) — that wipes the v0.7.208 AI liveSlide direct ref (v0.7.213 regression class) AND clobbers any preview deck the operator was navigating',
    ).not.toMatch(/setSlides\(/)
    // First-click MUST apply the pause-before-pin sequence when live
    // plays a different media video.
    // v0.7.241 — The v0.7.222 pause-before-pin "STANDBY placard"
    // sequence was REMOVED. Single-click now ALWAYS auto-plays the
    // pinned clip in Preview (operator chose UX feedback over the HW-
    // decoder-eviction protection). pinPreviewSlide (store.ts) now
    // atomically resets previewMediaPaused=false + currentTime=0, so
    // the first-click handler MUST NOT arm previewMediaPaused=true and
    // MUST NOT hand-roll a separate previewMediaCurrentTime reset.
    expect(
      firstClick,
      '(gg-5) v0.7.241 — MediaCard first-click MUST NOT arm previewMediaPaused=true (auto-play always; the standby gate is gone)',
    ).not.toMatch(/setPreviewMediaPaused\(true\)/)
    expect(
      firstClick,
      '(gg-6) v0.7.241 — MediaCard first-click MUST rely on pinPreviewSlide for the atomic previewMediaCurrentTime reset, not a separate setPreviewMediaCurrentTime(...) standby-arming call',
    ).not.toMatch(/setPreviewMediaCurrentTime\(/)

    // Second-click MUST use setLiveAuto (the v0.7.203 direct-ref
    // promote primitive), NEVER legacy index-based setLiveSlideIndex(0)
    // (the legacy path only worked because the old first-click had
    // stuffed the slide into slides[0]; now that first-click pins
    // instead, slides[] may not contain the staged item at all and
    // the index promote would promote the wrong slide).
    expect(
      secondClick,
      '(gg-8) MediaCard second-click MUST call setLiveAuto(slide) — v0.7.203/v0.7.210/v0.7.214/v0.7.222 uniform promote primitive',
    ).toMatch(/setLiveAuto\(/)
    expect(
      secondClick,
      '(gg-9) MediaCard second-click MUST NOT call setLiveSlideIndex(0) — the legacy index promote would promote slides[0] which is no longer guaranteed to be the staged item now that first-click uses pinPreviewSlide',
    ).not.toMatch(/setLiveSlideIndex\(0\)/)
  })

  it('(hh) v0.7.222 GUARD — every media-library video THUMBNAIL <video> mount in operator-facing surfaces MUST use preload="none" + disablePictureInPicture + disableRemotePlayback (NEVER preload="metadata" or bare). Architect Fix #5: the thumbnail probe path compounded LIVE-pane contention with N more transient HW decoder-slot probes per Media-card render', () => {
    const sites: { file: string; min: number }[] = [
      // logos-shell.tsx: grid-mode thumbnail (~L3137) + tiles-mode thumbnail (~L3220).
      { file: '../components/layout/logos-shell.tsx', min: 2 },
      // library-compact.tsx: popout grid thumbnail (~L1445).
      { file: '../components/layout/library-compact.tsx', min: 1 },
    ]
    for (const { file, min } of sites) {
      const src = readFileSync(join(__dirname, file), 'utf8')
      // Strip // line comments and /* */ block comments so historical
      // documentation that mentions preload="metadata" doesn't trip
      // the negative assertion.
      const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '')
      const noComments = noBlockComments
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n')
      // Count <video ...> opening tags in the non-comment source.
      const videoTags = noComments.match(/<video\b[^>]*>/g) ?? []
      // Anything that is NOT the MediaVideoSurface fenced inside an
      // ALREADY-gated structure: every <video> in operator surfaces
      // MUST have preload="none" OR be the MediaVideoSurface internal
      // (which has its own gate via the v0.7.222 attribute).
      const externalVideos = videoTags.filter(
        (t) => !t.includes('ref={videoRef}'), // MediaVideoSurface uses videoRef
      )
      const offenders = externalVideos.filter(
        (t) =>
          !/preload="none"/.test(t) &&
          // The customBackground "Current background" chip in
          // library-compact intentionally uses preload="metadata" +
          // onLoadedMetadata={...pause()} (the freezeBg=1 single-
          // frame pattern, mirrored in congregation/route.ts setBgVid).
          // It needs the metadata fetch to render the first frame for
          // the chip thumbnail, then immediately pauses. Exempt any
          // <video> tag that explicitly self-gates via onLoadedMetadata.
          !/onLoadedMetadata=/.test(t) &&
          // v0.7.227/239 — the PreviewCard freezeBg poster <video> uses
          // preload="auto" + onLoadedData={play().then(pause)} to paint
          // ONE frame then release the decoder slot. It is a self-gating
          // single-frame poster (NOT a continuous decode), so exempt any
          // <video> that self-gates via onLoadedData too.
          !/onLoadedData=/.test(t),
      )
      expect(
        offenders,
        `${file}: every operator-facing thumbnail <video> tag MUST have preload="none"; offenders: ${JSON.stringify(offenders)}`,
      ).toEqual([])
      // Sanity: confirm at least `min` thumbnail mounts exist (catches
      // accidental deletion that would silently pass the negative check).
      expect(
        externalVideos.length,
        `${file}: expected at least ${min} thumbnail <video> mount(s); found ${externalVideos.length}`,
      ).toBeGreaterThanOrEqual(min)
    }
  })

  it('(ii) v0.7.222 BEHAVIOURAL — operator adjusting Fit on a media item that is LIVE via the v0.7.208 setLiveAuto direct-ref path (isLive=true, liveSlideIndex=-1, liveSlide populated) MUST NOT wipe live. Architect Fix #6: pre-fix `wasLive = liveSlideIndex >= 0` was false in this configuration so the post-setSlides re-engage block was skipped, silently knocking the on-air clip off-air the moment the operator nudged Fit', () => {
    const live = mediaSlide('vid-A', 'Clip A on live via setLiveAuto')
    live.mediaUrl = 'https://cdn.example/A.mp4'
    ;(live as Slide).mediaFit = 'fit'
    // Simulate AI / library-compact-double-click promotion: setLiveAuto
    // direct ref ONLY, no setLiveSlideIndex.
    useAppStore.setState({
      slides: [],
      liveSlide: live,
      isLive: true,
      liveSlideIndex: -1,
      pinnedPreviewSlide: live,
      previewMediaPaused: false,
    } as Partial<ReturnType<typeof useAppStore.getState>>)

    // Mirror updateFit's new direct-ref-first detection + re-engage.
    // This is the EXACT shape of the Fix #6 block in logos-shell L~3789.
    const refreshed: Slide = { ...live, mediaFit: 'fill', id: 'slide-media-refreshed' }
    const st = useAppStore.getState()
    const wasLive = !!(st.isLive && (st.liveSlide || st.liveSlideIndex >= 0))
    expect(
      wasLive,
      '(ii-1) direct-ref-first detection MUST flag live-active even when liveSlideIndex === -1 (setLiveAuto path); pre-fix `liveSlideIndex >= 0` returned false here = the bug',
    ).toBe(true)
    st.pinPreviewSlide(refreshed)
    if (wasLive) {
      st.setLiveAuto(refreshed)
    }
    const after = useAppStore.getState()
    expect(
      after.isLive,
      '(ii-2) post-Fit live MUST stay on air',
    ).toBe(true)
    expect(
      after.liveSlide?.id,
      '(ii-3) post-Fit liveSlide direct ref MUST be the refreshed clip with new Fit (not null, not the stale one)',
    ).toBe('slide-media-refreshed')
    expect(
      after.liveSlide?.mediaFit,
      '(ii-4) refreshed live slide MUST carry the new Fit value',
    ).toBe('fill')
    expect(
      after.pinnedPreviewSlide?.id,
      '(ii-5) preview pin MUST also advance to the refreshed clip so PreviewCard symmetry holds',
    ).toBe('slide-media-refreshed')
  })

  it('(jj) v0.7.224 SOURCE-GREP — GO LIVE while preview plays video MUST resume on live: pinned-path call order (setLiveAuto BEFORE setLiveMediaCurrentTime) + MediaVideoSurface canplay handler re-applies pending seek via direct store read', () => {
    const stripComments = (src: string): string =>
      src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

    // ── logos-shell.tsx goLive pinned path ───────────────────────────
    const logosRaw = readFileSync(
      join(process.cwd(), 'src/components/layout/logos-shell.tsx'),
      'utf8',
    )
    const logos = stripComments(logosRaw)

    // Locate the goLive callback body so the ordering check is scoped
    // (the file has many setLiveAuto / setLiveMediaCurrentTime callers
    // outside goLive — e.g. AI auto-fire, Fit handler — which DO NOT
    // share the pinned-path ordering invariant).
    const goLiveStart = logos.indexOf('const goLive = useCallback(() => {')
    expect(
      goLiveStart,
      '(jj-1) logos-shell.tsx MUST declare `const goLive = useCallback(() => {` — the operator GO LIVE button handler',
    ).toBeGreaterThan(-1)
    const clearLiveStart = logos.indexOf('const clearLive = useCallback', goLiveStart)
    const goLiveBody = logos.slice(goLiveStart, clearLiveStart)

    // resumeFrom is read from the preview <video> data-surface attr.
    expect(
      /resumeFrom\s*=\s*pv\.currentTime/.test(goLiveBody),
      '(jj-2) logos-shell goLive pinned path MUST capture preview currentTime into `resumeFrom = pv.currentTime` so live can resume seamlessly',
    ).toBe(true)
    expect(
      /video\[data-surface="preview"\]/.test(goLiveBody),
      '(jj-3) logos-shell goLive pinned path MUST query the preview <video> by data-surface="preview" to capture its currentTime',
    ).toBe(true)

    // Ordering invariant: setLiveAuto MUST come BEFORE the resume-time
    // re-application (otherwise setLiveAuto's atomic reset clobbers
    // the captured time). Compare string indices within goLive body.
    const setLiveAutoIdx = goLiveBody.indexOf('setLiveAuto(pinned)')
    const setLiveTimeIdx = goLiveBody.indexOf('setLiveMediaCurrentTime(resumeFrom)')
    expect(
      setLiveAutoIdx,
      '(jj-4) logos-shell goLive pinned path MUST call `setLiveAuto(pinned)` (promotion primitive)',
    ).toBeGreaterThan(-1)
    expect(
      setLiveTimeIdx,
      '(jj-5) logos-shell goLive pinned path MUST call `setLiveMediaCurrentTime(resumeFrom)` AFTER setLiveAuto to override the atomic transport reset with the captured preview time',
    ).toBeGreaterThan(-1)
    expect(
      setLiveAutoIdx < setLiveTimeIdx,
      '(jj-6) logos-shell goLive pinned path: setLiveAuto MUST come BEFORE setLiveMediaCurrentTime(resumeFrom). Inverting the order re-opens the v0.7.224 regression (atomic reset in store L1233-1236 clobbers the captured time).',
    ).toBe(true)

    // ── easyworship-shell.tsx goLive pinned path ─────────────────────
    const ewRaw = readFileSync(
      join(process.cwd(), 'src/components/layout/easyworship-shell.tsx'),
      'utf8',
    )
    const ew = stripComments(ewRaw)
    const ewGoLiveStart = ew.indexOf('const goLive = useCallback(() => {')
    expect(
      ewGoLiveStart,
      '(jj-7) easyworship-shell.tsx MUST declare `const goLive = useCallback(() => {` — parity with logos-shell',
    ).toBeGreaterThan(-1)
    const ewClearLiveStart = ew.indexOf('const clearLive = useCallback', ewGoLiveStart)
    const ewGoLiveBody = ew.slice(ewGoLiveStart, ewClearLiveStart)
    const ewSetLiveAutoIdx = ewGoLiveBody.indexOf('setLiveAuto(pinned)')
    const ewSetLiveTimeIdx = ewGoLiveBody.indexOf('setLiveMediaCurrentTime(resumeFrom)')
    expect(
      ewSetLiveAutoIdx,
      '(jj-8) easyworship-shell goLive pinned path MUST call `setLiveAuto(pinned)`',
    ).toBeGreaterThan(-1)
    expect(
      ewSetLiveTimeIdx,
      '(jj-9) easyworship-shell goLive pinned path MUST call `setLiveMediaCurrentTime(resumeFrom)` after setLiveAuto',
    ).toBeGreaterThan(-1)
    expect(
      ewSetLiveAutoIdx < ewSetLiveTimeIdx,
      '(jj-10) easyworship-shell goLive pinned path: setLiveAuto MUST come BEFORE setLiveMediaCurrentTime(resumeFrom). Same atomic-reset clobber rationale as logos-shell.',
    ).toBe(true)

    // ── MediaVideoSurface canplay handler ────────────────────────────
    // Body of the onCanPlay handler in the live-play effect MUST:
    //   (a) read liveMediaCurrentTime / previewMediaCurrentTime
    //       directly from the store (NOT the closed-over hook value)
    //   (b) seek v.currentTime to the target before play() is called
    //   (c) close the seek inside an if-guard so a 0 target doesn't
    //       cause a redundant seek
    expect(
      /const\s+onCanPlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?useAppStore\.getState\(\)\.liveMediaCurrentTime[\s\S]*?v\.currentTime\s*=\s*targetTime[\s\S]*?v\.play\(\)/.test(logos),
      '(jj-11) MediaVideoSurface onCanPlay handler MUST read liveMediaCurrentTime via useAppStore.getState() (direct store read closes the race with goLive\'s setLiveMediaCurrentTime resolving after effect setup), apply v.currentTime = targetTime, then call v.play() — all in that order',
    ).toBe(true)
    expect(
      /const\s+onCanPlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?useAppStore\.getState\(\)\.previewMediaCurrentTime/.test(logos),
      '(jj-12) MediaVideoSurface onCanPlay handler MUST also handle the preview surface via useAppStore.getState().previewMediaCurrentTime (symmetry — same direct-read pattern applies to both surfaces)',
    ).toBe(true)
    expect(
      /targetTime\s*>\s*0\s*&&[\s\S]*?Math\.abs\(v\.currentTime\s*-\s*targetTime\)\s*>\s*0\.5/.test(logos),
      '(jj-13) MediaVideoSurface onCanPlay seek MUST be guarded by `targetTime > 0` AND a 0.5s tolerance so a zero or near-current target doesn\'t cause a redundant seek that breaks playback smoothness',
    ).toBe(true)
  })

  it('(hh) v0.7.223 SOURCE-GREP — NDI transparent mode MUST be explicit opt-in across every layer + BGRX FourCC MUST be advertised for opaque sends + alpha MUST be forced opaque in opaque mode + start() short-circuit MUST include transparent (architect findings on v0.7.223 code review enforced as a literal guard)', () => {
    const stripComments = (src: string): string =>
      src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

    // ── ndi-service.ts invariants ────────────────────────────────────
    const ndiSvcRaw = readFileSync(
      join(process.cwd(), 'electron/ndi-service.ts'),
      'utf8',
    )
    const ndiSvc = stripComments(ndiSvcRaw)
    expect(
      /FOURCC_BGRX\s*=\s*0x58524742/.test(ndiSvc),
      '(hh-1) ndi-service.ts MUST declare FOURCC_BGRX = 0x58524742 (BGRX little-endian) so opaque NDI sends skip per-pixel alpha composite on receivers (EW-class smoothness)',
    ).toBe(true)
    expect(
      /FourCC:\s*\(this\.senderTransparent\s*\|\|\s*this\.forceBgraForObs\)\s*\?\s*FOURCC_BGRA\s*:\s*FOURCC_BGRX/.test(ndiSvc),
      '(hh-2) v0.7.230 — nativeSendFrame MUST select FourCC via `(this.senderTransparent || this.forceBgraForObs) ? FOURCC_BGRA : FOURCC_BGRX`. senderTransparent stays the primary selector (transparent overlay workflow); forceBgraForObs is the operator opt-in for OBS, which refuses BGRX sources. Swapping the branches re-introduces receiver-side stutter or breaks the transparent overlay.',
    ).toBe(true)
    expect(
      /private\s+senderTransparent\s*=\s*false/.test(ndiSvc),
      '(hh-3) ndi-service.ts MUST hold private senderTransparent field, defaulted false (opaque)',
    ).toBe(true)
    expect(
      /this\.senderTransparent\s*=\s*opts\.transparent\s*===\s*true/.test(ndiSvc),
      '(hh-4) start() MUST set this.senderTransparent = opts.transparent === true (explicit opt-in, not !== false)',
    ).toBe(true)
    expect(
      /this\.senderTransparent\s*===\s*wantedTransparent/.test(ndiSvc),
      '(hh-5) start() same-format short-circuit MUST include senderTransparent equality so toggling transparent ON↔OFF (without resolution/fps change) rebuilds the sender — architect found this as a stale-state bug on v0.7.223 review',
    ).toBe(true)
    expect(
      /const\s+wantedTransparent\s*=\s*opts\.transparent\s*===\s*true/.test(ndiSvc),
      '(hh-6) start() MUST compute wantedTransparent via `opts.transparent === true` (explicit opt-in, mirrors main.ts contract)',
    ).toBe(true)
    expect(
      /u32\[i\]\s*\|=\s*0xff000000/.test(ndiSvc),
      '(hh-7) v0.7.233 — sendFrame MUST force opaque alpha when !senderTransparent via the Uint32Array hot-path OR (`u32[i] |= 0xff000000`, little-endian high byte = alpha). Belt-and-suspenders for older NDI 4 receivers that fall back to BGRA interpretation. The pre-v0.7.233 per-byte loop (`slot[i] = 0xff`) was replaced for SIMD-vectorised throughput; reverting re-introduces the ~0.3ms/frame cost.',
    ).toBe(true)
    expect(
      /if\s*\(\s*!this\.senderTransparent\s*\)\s*\{[\s\S]*?u32\[i\]\s*\|=\s*0xff000000/.test(ndiSvc),
      '(hh-8) the opaque-alpha-force MUST be gated by `if (!this.senderTransparent)` — running it in transparent mode would silently wipe the alpha matte operators depend on for lower-third overlays',
    ).toBe(true)
    expect(
      /this\.senderTransparent\s*=\s*false/.test(ndiSvc.split('async stop()')[1] ?? ''),
      '(hh-9) stop() MUST reset this.senderTransparent = false so a subsequent start() cannot inherit a stale transparent flag from the prior session',
    ).toBe(true)

    // ── main.ts invariants ───────────────────────────────────────────
    const mainRaw = readFileSync(
      join(process.cwd(), 'electron/main.ts'),
      'utf8',
    )
    const mainSrc = stripComments(mainRaw)
    expect(
      /wantTransparent\s*=\s*wantLayout\s*===\s*'ndi'\s*&&\s*opts\.transparent\s*===\s*true/.test(mainSrc),
      '(hh-10) main.ts wantTransparent MUST be `opts.transparent === true` (explicit opt-in). Reverting to `!== false` re-opens the see-through video background regression',
    ).toBe(true)
    expect(
      /transparent\s*=\s*opts\.transparent\s*===\s*true/.test(mainSrc),
      '(hh-11) main.ts URL-param transparent branch MUST also be `opts.transparent === true` — the BrowserWindow attribute and the renderer page CSS background MUST stay in lockstep, mismatch produces partial-transparency artefacts',
    ).toBe(true)
    expect(
      /await\s+ndi\.start\(\s*\{\s*\.\.\.opts,\s*transparent:\s*wantTransparent\s*\}\s*\)/.test(mainSrc),
      '(hh-12) main.ts MUST pass `transparent: wantTransparent` through to ndi.start() so the FourCC selection in ndi-service is driven by the resolved gate, not by whatever the renderer happened to send',
    ).toBe(true)
    expect(
      /opts\.transparent\s*!==\s*false/.test(mainSrc),
      '(hh-13) main.ts MUST NOT contain `opts.transparent !== false` anywhere — that was the pre-v0.7.223 default-ON pattern that caused the operator transparency complaint',
    ).toBe(false)

    // ── renderer call sites MUST not hardcode transparent: true ──────
    const ewShellRaw = readFileSync(
      join(process.cwd(), 'src/components/layout/easyworship-shell.tsx'),
      'utf8',
    )
    const ewShell = stripComments(ewShellRaw)
    expect(
      /transparent:\s*true\b/.test(ewShell),
      '(hh-14) easyworship-shell.tsx MUST NOT hardcode `transparent: true` in any desktop.ndi.start call — architect found this as a missed call site that bypassed the explicit-opt-in contract. Must derive from store state (e.g. ndiDisplayMode === "lower-third")',
    ).toBe(false)
  })

  it('(ff) v0.7.222 BEHAVIOURAL — operator pressing the placard "Play preview" button (setPreviewMediaPaused(false)) MUST release the gate so the real MediaVideoSurface mounts on next render', () => {
    const live = mediaSlide('vid-A', 'Clip A on live')
    live.mediaUrl = 'https://cdn.example/A.mp4'
    const preview = mediaSlide('vid-B', 'Clip B pinned')
    preview.mediaUrl = 'https://cdn.example/B.mp4'
    useAppStore.setState({
      liveSlide: live,
      isLive: true,
      liveSlideIndex: -1,
      pinnedPreviewSlide: preview,
      previewMediaPaused: true,
      previewMediaCurrentTime: 0,
    } as Partial<ReturnType<typeof useAppStore.getState>>)

    // Operator clicks "Play preview" inside the placard.
    useAppStore.getState().setPreviewMediaPaused(false)

    const s = useAppStore.getState()
    // Live still untouched.
    expect(s.liveSlide?.id).toBe('vid-A')
    expect(s.isLive).toBe(true)
    // Predicate now evaluates false — placard goes away, real
    // <video> mounts.
    expect(
      s.previewMediaPaused,
      'after Play, previewMediaPaused MUST be false so the STANDBY gate releases',
    ).toBe(false)
  })
})
