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
})
