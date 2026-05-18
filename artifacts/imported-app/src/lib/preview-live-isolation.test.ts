/**
 * v0.7.203 — Proof test for the "single-click preview snaps back to
 * live" bug AND the "auto-detect should go straight to LIVE without
 * touching preview" requirement.
 *
 * Exercises the EXACT operator flow at the store + payload layer
 * (which is where the bug lives — every prior attempt to fix this
 * in the UI failed because the bug is a state-machine issue, not a
 * rendering issue):
 *
 *   1. Operator double-clicks v18  →  live = v18, preview = v18
 *   2. Operator single-clicks v19  →  pin = v19, preview = v19,
 *                                     live still = v18 (UNTOUCHED)
 *   3. AI auto-fires v25 via setLiveAuto(slide)
 *                                  →  liveSlide = v25, live = v25,
 *                                     pin STILL = v19, preview STILL = v19
 *   4. AI re-fires v25 (same as live) — handled by same-as-live
 *      short-circuit in logos-shell; modelled here as "no setLiveAuto
 *      call". Pin still survives because nothing mutates it.
 *   5. Operator double-clicks v25  →  setSlides + setLiveSlideIndex
 *                                     clears liveSlide AND pin
 *                                     (operator consciously consumed
 *                                     preview by promoting)
 *
 * The architectural fix being verified: `liveSlide` and
 * `pinnedPreviewSlide` are SEPARATE direct refs in the store. Neither
 * can clobber the other. buildOutputPayload reads liveSlide first.
 * derivePreview (modelled inline here) reads pinnedPreviewSlide first.
 *
 * THIS TEST FAILS ON v0.7.201/v0.7.202 (the broken builds the
 * operator is currently running) and PASSES on v0.7.203 (the fix in
 * this workspace, not yet shipped).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Slide } from './slides'
import { buildOutputPayload } from './output-payload'
import { useAppStore } from './store'

// Minimal localStorage shim — Zustand persist needs *something*
// callable. We don't care about persistence in tests; the in-memory
// store is what we assert against.
const memStorage = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => { m.clear() },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
  }
})()
;(globalThis as unknown as { localStorage: Storage }).localStorage =
  memStorage as unknown as Storage

const mkVerseSlide = (ref: string, text: string): Slide => ({
  id: `slide-${ref.replace(/[: ]/g, '-')}-${Math.random().toString(36).slice(2, 7)}`,
  type: 'verse',
  title: ref,
  subtitle: 'KJV',
  content: [text],
})

// Reset the parts of the store that this test touches so each `it`
// starts from a known baseline.
const resetSliceUnderTest = () => {
  useAppStore.setState({
    slides: [],
    previewSlideIndex: 0,
    liveSlideIndex: -1,
    isLive: false,
    pinnedPreviewSlide: null,
    liveSlide: null,
    schedule: [],
    selectedScheduleItemId: null,
    hasShownContent: false,
    outputEnabled: true,
    outputBlanked: false,
  })
}

// derivePreview is implemented inline inside OutputPreview (a React
// component) so we mirror the EXACT logic here. v0.7.203: pinned
// takes precedence over slides[previewSlideIndex]. The preview iframe
// asserts against this function's output.
const previewSlideForOperator = (): Slide | null => {
  const s = useAppStore.getState()
  return s.pinnedPreviewSlide ?? (s.previewSlideIndex >= 0 ? s.slides[s.previewSlideIndex] ?? null : null)
}

// The Live Display + SSE broadcaster + NDI sender + OBS Browser
// Source all consume buildOutputPayload — its `slide` field is what
// reaches the projector.
const liveSlideForCongregation = (): Slide | null => {
  const payload = buildOutputPayload(useAppStore.getState())
  return payload.type === 'slide' ? (payload.slide as Slide | null) : null
}

beforeEach(resetSliceUnderTest)
afterEach(resetSliceUnderTest)

describe('v0.7.203 — preview/live isolation (operator snap-back bug)', () => {
  it('1. operator double-clicks v18 → live=v18, preview=v18', () => {
    const v18 = mkVerseSlide('John 3:18', 'He that believeth on him is not condemned…')
    const { setSlides, setLiveSlideIndex, setIsLive } = useAppStore.getState()

    setSlides([v18])
    setLiveSlideIndex(0)
    setIsLive(true)

    expect(liveSlideForCongregation()?.title).toBe('John 3:18')
    expect(previewSlideForOperator()?.title).toBe('John 3:18')
    expect(useAppStore.getState().isLive).toBe(true)
    expect(useAppStore.getState().liveSlide).toBeNull() // direct-ref unused; slides[0] wins
  })

  it('2. operator single-clicks v19 (after v18 on live) → pin=v19, preview=v19, live STILL=v18', () => {
    const v18 = mkVerseSlide('John 3:18', 'He that believeth on him…')
    const v19 = mkVerseSlide('John 3:19', 'And this is the condemnation…')
    const { setSlides, setLiveSlideIndex, setIsLive, stageVersePreviewOnly } = useAppStore.getState()

    // Set v18 on air
    setSlides([v18]); setLiveSlideIndex(0); setIsLive(true)
    // Operator single-clicks v19 in any of the 5 columns
    stageVersePreviewOnly(v19)

    // The two surfaces MUST disagree — that's the whole point of preview
    expect(liveSlideForCongregation()?.title).toBe('John 3:18')
    expect(previewSlideForOperator()?.title).toBe('John 3:19')
    expect(useAppStore.getState().pinnedPreviewSlide?.title).toBe('John 3:19')
  })

  it('3. AI auto-fires v25 via setLiveAuto → live=v25, pin STILL=v19, preview STILL=v19  (THE FIX)', () => {
    const v18 = mkVerseSlide('John 3:18', '…')
    const v19 = mkVerseSlide('John 3:19', '…')
    const v25 = mkVerseSlide('Romans 3:25', 'Whom God hath set forth to be a propitiation…')
    const st = useAppStore.getState()

    // Operator stages live=v18 + preview pin=v19
    st.setSlides([v18]); st.setLiveSlideIndex(0); st.setIsLive(true)
    st.stageVersePreviewOnly(v19)

    expect(previewSlideForOperator()?.title).toBe('John 3:19') // sanity

    // AI fires — v0.7.203 path: ONE call, NO slides[] mutation.
    useAppStore.getState().setLiveAuto(v25)

    // THE ASSERTION the operator cares about:
    expect(liveSlideForCongregation()?.title).toBe('Romans 3:25')   // AI hit live ✓
    expect(previewSlideForOperator()?.title).toBe('John 3:19')      // pin SURVIVED ✓
    expect(useAppStore.getState().pinnedPreviewSlide?.title).toBe('John 3:19')
    expect(useAppStore.getState().liveSlide?.title).toBe('Romans 3:25')
    expect(useAppStore.getState().isLive).toBe(true)
  })

  it('4. AI auto-fires repeatedly (10 distinct verses) → pin survives every single one', () => {
    const v18 = mkVerseSlide('John 3:18', '…')
    const v19 = mkVerseSlide('John 3:19', '…')
    const st = useAppStore.getState()
    st.setSlides([v18]); st.setLiveSlideIndex(0); st.setIsLive(true)
    st.stageVersePreviewOnly(v19)

    for (let i = 0; i < 10; i++) {
      const auto = mkVerseSlide(`Romans ${i + 1}:1`, `Auto-detected verse #${i + 1}`)
      useAppStore.getState().setLiveAuto(auto)
      expect(previewSlideForOperator()?.title).toBe('John 3:19') // pin holds across every fire
      expect(liveSlideForCongregation()?.title).toBe(`Romans ${i + 1}:1`)
    }
  })

  it('5. operator double-clicks v25 → setSlides+setLiveSlideIndex clears liveSlide AND pin (consumes preview)', () => {
    const v18 = mkVerseSlide('John 3:18', '…')
    const v19 = mkVerseSlide('John 3:19', '…')
    const v25 = mkVerseSlide('Romans 3:25', '…')
    const st = useAppStore.getState()

    st.setSlides([v18]); st.setLiveSlideIndex(0); st.setIsLive(true)
    st.stageVersePreviewOnly(v19)
    useAppStore.getState().setLiveAuto(v25)
    // (now live=v25 via direct ref, pin=v19)

    // Operator double-clicks v25 (sendDetected('live') / equivalent)
    useAppStore.getState().setSlides([v25])
    useAppStore.getState().setLiveSlideIndex(0)
    useAppStore.getState().setIsLive(true)

    expect(useAppStore.getState().liveSlide).toBeNull()          // released
    expect(useAppStore.getState().pinnedPreviewSlide).toBeNull() // consumed by go-live
    expect(liveSlideForCongregation()?.title).toBe('Romans 3:25')
    expect(previewSlideForOperator()?.title).toBe('Romans 3:25') // both converge on the manual choice
  })

  it('6. setIsLive(false) (operator hits BLACK / kill live) clears liveSlide direct ref', () => {
    const v25 = mkVerseSlide('Romans 3:25', '…')
    useAppStore.getState().setLiveAuto(v25)
    expect(useAppStore.getState().liveSlide?.title).toBe('Romans 3:25')

    useAppStore.getState().setIsLive(false)
    expect(useAppStore.getState().liveSlide).toBeNull()
    expect(useAppStore.getState().isLive).toBe(false)
  })

  it('7. buildOutputPayload uses liveSlide direct ref even when slides[] is empty (auto path bypasses slides[])', () => {
    const v25 = mkVerseSlide('Romans 3:25', '…')
    useAppStore.getState().setLiveAuto(v25)

    expect(useAppStore.getState().slides).toHaveLength(0)         // slides[] untouched
    expect(useAppStore.getState().liveSlideIndex).toBe(-1)        // index untouched
    expect(liveSlideForCongregation()?.title).toBe('Romans 3:25') // payload still has it ✓
  })

  it('8. selectScheduleItem from the operator’s Queue clears BOTH refs (operator regains control)', () => {
    const v25 = mkVerseSlide('Romans 3:25', '…')
    const v19 = mkVerseSlide('John 3:19', '…')
    useAppStore.getState().setLiveAuto(v25)
    useAppStore.getState().pinPreviewSlide(v19)
    expect(useAppStore.getState().liveSlide?.title).toBe('Romans 3:25')
    expect(useAppStore.getState().pinnedPreviewSlide?.title).toBe('John 3:19')

    // Operator picks a schedule item — should reset cleanly
    useAppStore.getState().addScheduleItem({
      type: 'verse',
      title: 'Acts 1:1',
      slides: [mkVerseSlide('Acts 1:1', '…')],
    })
    const id = useAppStore.getState().schedule[0].id
    useAppStore.getState().selectScheduleItem(id)

    expect(useAppStore.getState().liveSlide).toBeNull()
    expect(useAppStore.getState().pinnedPreviewSlide).toBeNull()
  })
})
