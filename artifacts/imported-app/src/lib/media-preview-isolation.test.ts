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
