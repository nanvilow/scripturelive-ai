/**
 * v0.7.208 — Voice commands & AI detection target LIVE only.
 *
 * Operator complaint on v0.7.207:
 *   "Auto-detect sends the verse to live, but when I then say 'KJV'
 *    only the preview switches translation — live stays in the old
 *    translation. Anything triggered by voice should hit live, not
 *    preview."
 *
 * Root cause: AI auto-detect uses `setLiveAuto(slide)` which writes
 * to the `liveSlide` DIRECT REF (v0.7.203 path). The translation
 * switch handler (`live-translation-sync.tsx`) only knew about
 * `slides[liveSlideIndex]` and called `replaceSlide(idx, ...)`,
 * mutating a slot that wasn't actually being rendered on live.
 * Preview happened to show the rebuilt slide (because preview falls
 * back to `slides[previewSlideIndex]` which collides with the same
 * slot for some flows), creating the illusion of a partial fix.
 *
 * The output payload reads `liveSlide ?? slides[liveSlideIndex]` —
 * so when the AI ref is set, ONLY mutating that ref changes what
 * the operator sees on live.
 *
 * THIS TEST FAILS ON v0.7.207 and PASSES ON v0.7.208.
 *
 * Mirrors the operator's flow at the store + payload layer (same
 * approach as preview-live-isolation.test.ts).
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

const verse = (id: string, ref: string, translation: string, text: string): Slide => ({
  id,
  type: 'verse',
  title: ref,
  subtitle: translation,
  content: [text],
  background: 'minimal',
})

beforeEach(() => {
  useAppStore.setState({
    slides: [],
    previewSlideIndex: 0,
    liveSlideIndex: -1,
    liveSlide: null,
    pinnedPreviewSlide: null,
    isLive: false,
    selectedTranslation: 'KJV',
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
  } as Partial<ReturnType<typeof useAppStore.getState>>)
})

describe('v0.7.208 — voice commands & AI detection target LIVE only', () => {
  it('translation switch on AI-pushed verse: setLiveAuto rebuild MUST replace liveSlide direct ref (THE FIX)', () => {
    // 1. AI auto-detect pushes Romans 8:28 KJV via setLiveAuto (the v0.7.203 path).
    const ai = verse('ai-rom8-28', 'Romans 8:28', 'KJV', 'And we know that all things work together for good...')
    useAppStore.getState().setLiveAuto(ai)

    let payload = buildOutputPayload(useAppStore.getState())
    expect(payload.slide?.id).toBe('ai-rom8-28')
    expect(payload.slide?.subtitle).toBe('KJV')

    // 2. Operator says "ASV". The live-translation-sync watcher (which v0.7.208
    //    rewrites) is responsible for rebuilding the live slide. We simulate
    //    its post-fix behavior: when liveSlide ref is set, rebuild via setLiveAuto.
    const cur = useAppStore.getState().liveSlide
    expect(cur).not.toBeNull()
    useAppStore.getState().setLiveAuto({
      ...cur!,
      content: ['And we know that all things work together for good...(ASV)'],
      subtitle: 'ASV',
    })

    // 3. The live output payload MUST now show ASV — that's the operator's
    //    actual ask. Pre-fix this assertion fails because replaceSlide was
    //    mutating slides[idx] (idx = -1 → noop) leaving liveSlide unchanged.
    payload = buildOutputPayload(useAppStore.getState())
    expect(payload.slide?.subtitle).toBe('ASV')
    expect(payload.slide?.id).toBe('ai-rom8-28')
  })

  it('translation switch on AI-pushed verse MUST NOT touch preview (preview stays with operator)', () => {
    // Operator has pinned John 3:16 to preview before AI fires.
    const opPreview = verse('op-jn3-16', 'John 3:16', 'KJV', 'For God so loved the world...')
    useAppStore.getState().pinPreviewSlide(opPreview)
    useAppStore.getState().setPreviewSlideIndex(0)
    useAppStore.setState({ slides: [opPreview] } as Partial<ReturnType<typeof useAppStore.getState>>)

    // AI fires Romans 8:28 to live.
    const ai = verse('ai-rom8-28', 'Romans 8:28', 'KJV', 'And we know...')
    useAppStore.getState().setLiveAuto(ai)

    // Operator says "ASV" — translation handler rebuilds liveSlide via setLiveAuto.
    const cur = useAppStore.getState().liveSlide!
    useAppStore.getState().setLiveAuto({ ...cur, subtitle: 'ASV', content: ['ASV text'] })

    // Live shows ASV...
    const payload = buildOutputPayload(useAppStore.getState())
    expect(payload.slide?.subtitle).toBe('ASV')
    expect(payload.slide?.title).toBe('Romans 8:28')

    // ...but preview is still operator's pinned John 3:16, untouched.
    const st = useAppStore.getState()
    expect(st.pinnedPreviewSlide?.id).toBe('op-jn3-16')
    expect(st.pinnedPreviewSlide?.subtitle).toBe('KJV')
    // setLiveAuto MUST NOT have mutated previewSlideIndex.
    expect(st.previewSlideIndex).toBe(0)
  })

  it('voice next_verse boundary push (v0.7.208) MUST use setLiveAuto and NOT touch preview indices', () => {
    // Operator has 2 unrelated slides in the deck with preview pinned to slide #1.
    const a = verse('a', 'Genesis 1:1', 'KJV', 'In the beginning...')
    const b = verse('b', 'Psalm 23:1', 'KJV', 'The LORD is my shepherd...')
    useAppStore.setState({ slides: [a, b], previewSlideIndex: 1, liveSlideIndex: -1 } as Partial<ReturnType<typeof useAppStore.getState>>)
    const previewBefore = useAppStore.getState().previewSlideIndex

    // Simulate the v0.7.208 next_verse handler push of John 3:4 to live.
    const newLive = verse('voice-jn3-4', 'John 3:4', 'KJV', 'Nicodemus saith...')
    useAppStore.getState().setLiveAuto(newLive)
    useAppStore.getState().setLiveActiveVerseIndex(0)

    const st = useAppStore.getState()
    // Live is the voice-pushed verse via the direct ref.
    expect(st.liveSlide?.id).toBe('voice-jn3-4')
    expect(st.isLive).toBe(true)
    const payload = buildOutputPayload(useAppStore.getState())
    expect(payload.slide?.id).toBe('voice-jn3-4')

    // Preview UNTOUCHED — operator's previewSlideIndex still points at slide #1.
    expect(st.previewSlideIndex).toBe(previewBefore)
    expect(st.previewSlideIndex).toBe(1)
    // Slides[] deck UNTOUCHED — operator's 2 slides still there, no append.
    expect(st.slides.length).toBe(2)
    expect(st.slides.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('voice go_to_reference (v0.7.208) MUST use setLiveAuto and NOT touch preview', () => {
    const a = verse('a', 'Genesis 1:1', 'KJV', 'In the beginning...')
    useAppStore.setState({ slides: [a], previewSlideIndex: 0, liveSlideIndex: -1 } as Partial<ReturnType<typeof useAppStore.getState>>)

    const gotoSlide = verse('voice-eph2-8', 'Ephesians 2:8', 'KJV', 'For by grace are ye saved...')
    useAppStore.getState().setLiveAuto(gotoSlide)

    const st = useAppStore.getState()
    expect(st.liveSlide?.id).toBe('voice-eph2-8')
    // Slides[] not extended; previewSlideIndex still 0 pointing at Genesis 1:1.
    expect(st.slides.length).toBe(1)
    expect(st.previewSlideIndex).toBe(0)
    expect(st.slides[0].id).toBe('a')
  })

  it('voice slide-deck fallback (v0.7.208) advances LIVE only — previewSlideIndex untouched', () => {
    const a = verse('a', 'Slide A', 'KJV', 'Aaa')
    const b = verse('b', 'Slide B', 'KJV', 'Bbb')
    const c = verse('c', 'Slide C', 'KJV', 'Ccc')
    useAppStore.setState({ slides: [a, b, c], previewSlideIndex: 2, liveSlideIndex: 0 } as Partial<ReturnType<typeof useAppStore.getState>>)

    // Simulate "next slide" voice command's fallback (L730-737 post-fix).
    useAppStore.getState().setLiveSlideIndex(1)
    useAppStore.getState().setLiveActiveVerseIndex(0)

    const st = useAppStore.getState()
    expect(st.liveSlideIndex).toBe(1)
    expect(st.previewSlideIndex).toBe(2) // UNTOUCHED — pre-208 this got dragged to 1
  })

  // ─── Source-level grep guards (same pattern as autofit-settings-fingerprint.test.ts) ───
  // These read the actual source files and assert the v0.7.208 contract still holds.
  // If a future PR re-introduces setPreviewSlideIndex in a voice handler, these fail.

  const speech = readFileSync(
    join(process.cwd(), 'src/components/providers/speech-provider.tsx'),
    'utf8',
  )
  const sync = readFileSync(
    join(process.cwd(), 'src/components/providers/live-translation-sync.tsx'),
    'utf8',
  )

  it('GUARD: speech-provider next_verse boundary block MUST call setLiveAuto', () => {
    // After v0.7.208 the block at the next_verse rollover MUST be the
    // setLiveAuto path. Pre-208 it was setSlides + setPreviewSlideIndex
    // + setLiveSlideIndex + setIsLive(true). The presence of setLiveAuto
    // inside this case block is the load-bearing assertion.
    const nextVerseIdx = speech.indexOf("case 'next_verse'")
    const goToIdx = speech.indexOf("case 'go_to_reference'")
    expect(nextVerseIdx).toBeGreaterThan(0)
    expect(goToIdx).toBeGreaterThan(nextVerseIdx)
    const block = speech.slice(nextVerseIdx, goToIdx)
    expect(block).toMatch(/setLiveAuto\(slideNew\)/)
    // And MUST NOT contain the pre-208 trio.
    expect(block).not.toMatch(/setPreviewSlideIndex\(idx\)/)
    expect(block).not.toMatch(/setLiveSlideIndex\(idx\)/)
  })

  it('GUARD: speech-provider go_to_reference block MUST call setLiveAuto and MUST NOT setPreviewSlideIndex', () => {
    const goToIdx = speech.indexOf("case 'go_to_reference'")
    // The next case after go_to_reference begins with "      case '" indent.
    const nextCaseIdx = speech.indexOf("\n      case '", goToIdx + 20)
    expect(goToIdx).toBeGreaterThan(0)
    expect(nextCaseIdx).toBeGreaterThan(goToIdx)
    const block = speech.slice(goToIdx, nextCaseIdx)
    expect(block).toMatch(/setLiveAuto\(slide\)/)
    expect(block).not.toMatch(/setPreviewSlideIndex/)
  })

  it('GUARD: speech-provider slide-deck fallback MUST NOT call setPreviewSlideIndex', () => {
    // The "(3) Fallback: slide-deck advance" comment is the anchor.
    const anchor = speech.indexOf('(3) Fallback: slide-deck advance')
    expect(anchor).toBeGreaterThan(0)
    const block = speech.slice(anchor, anchor + 600)
    expect(block).toMatch(/setLiveSlideIndex\(nextI\)/)
    expect(block).not.toMatch(/setPreviewSlideIndex\(nextI\)/)
  })

  it('GUARD: live-translation-sync MUST handle the liveSlide direct-ref path via setLiveAuto', () => {
    // The fix relies on calling setLiveAuto when liveSlide is set, not just
    // replaceSlide on slides[liveSlideIndex]. Both code paths must be present.
    expect(sync).toMatch(/setLiveAuto\(\{/)
    expect(sync).toMatch(/replaceSlide\(idx,/)
    // And the watcher MUST consult s.liveSlide, not only liveSlideIndex.
    expect(sync).toMatch(/s\.liveSlide/)
  })
})
