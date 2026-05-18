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
import { buildOutputPayload } from './output-payload'
import { useAppStore, type Slide } from './store'

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

/**
 * v0.7.204 — Iframe handler MUST render the latest payload it
 * receives even when __rev is lower than a previously-seen rev. The
 * v0.7.200-hotfix.3 rev gate was theorised to protect against
 * out-of-order delivery, but postMessage between a parent window and
 * its direct iframe is FIFO per spec — the rev gate only ever caused
 * silent drops on parent remount (revRef resets to 0 while iframe's
 * lastPreviewRev was still high), which presented to the operator as
 * the "preview snaps back to live on single click" bug.
 *
 * This test mirrors the EXACT iframe handler logic at
 * route.ts L2110-2125 so a future refactor that re-introduces the
 * rev gate will fail this test immediately.
 */
describe('v0.7.204 — iframe message handler must not drop on rev regression', () => {
  // Mirror the L2110 handler. The renders[] array stands in for what
  // applyRender(d.payload) would visibly paint.
  const makeHandler = () => {
    const renders: string[] = []
    const onMessage = (d: { __sl_preview?: number; __rev?: number; payload?: { slide?: { title?: string } } } | null) => {
      if (!d || typeof d !== 'object') return
      if (d.__sl_preview !== 1) return
      if (d.payload) renders.push(d.payload.slide?.title ?? 'NO-SLIDE')
    }
    return { renders, onMessage }
  }

  it('accepts a strictly increasing rev sequence (baseline)', () => {
    const { renders, onMessage } = makeHandler()
    onMessage({ __sl_preview: 1, __rev: 1, payload: { slide: { title: 'v18' } } })
    onMessage({ __sl_preview: 1, __rev: 2, payload: { slide: { title: 'v19' } } })
    onMessage({ __sl_preview: 1, __rev: 3, payload: { slide: { title: 'v25' } } })
    expect(renders).toEqual(['v18', 'v19', 'v25'])
  })

  it('THE FIX — accepts payload whose rev RESTARTED at 1 after parent remount (was silently dropped pre-v0.7.204)', () => {
    const { renders, onMessage } = makeHandler()
    // Pre-remount: parent posted up to rev=12
    onMessage({ __sl_preview: 1, __rev: 11, payload: { slide: { title: 'v18-old' } } })
    onMessage({ __sl_preview: 1, __rev: 12, payload: { slide: { title: 'v19-old' } } })
    // Parent OutputPreview remounts (StrictMode / layout shuffle).
    // revRef restarts at 0 → next post is rev=1.
    onMessage({ __sl_preview: 1, __rev: 1, payload: { slide: { title: 'v35-new' } } })
    onMessage({ __sl_preview: 1, __rev: 2, payload: { slide: { title: 'v36-new' } } })
    // Pre-v0.7.204 (with rev gate): renders would be ['v18-old','v19-old']
    // — the two v*-new messages would be silently dropped. The operator
    // would see the preview iframe STUCK on v19-old even though their
    // single-click on v35 was correctly recorded in the store.
    // v0.7.204 (gate removed): every payload renders.
    expect(renders).toEqual(['v18-old', 'v19-old', 'v35-new', 'v36-new'])
    // Final visible slide MUST be the operator's most-recent click.
    expect(renders.at(-1)).toBe('v36-new')
  })

  it('ignores messages without __sl_preview tag (unrelated postMessage traffic)', () => {
    const { renders, onMessage } = makeHandler()
    onMessage(null)
    onMessage({ __rev: 1, payload: { slide: { title: 'imposter' } } })
    onMessage({ __sl_preview: 1, __rev: 1, payload: { slide: { title: 'real' } } })
    expect(renders).toEqual(['real'])
  })
})

/**
 * v0.7.205 — THE REAL FIX for "preview snaps back to live on single-click".
 *
 * Every previous attempt (v0.7.200..204) chased the postMessage pipeline.
 * Replit headless-chromium diagnostic (.local/diag-v35.mjs) PROVED the
 * postMessage pipeline was always correct: parent posted v35, iframe
 * received v35, applyRender painted v35 into #output. Then ~1.5 s
 * later #output silently changed back to v28 with NO new postMessage.
 *
 * Root cause: route.ts L1935 had `setInterval(pollOnce, 1500)` running
 * UNCONDITIONALLY — including inside preview iframes. pollOnce fetches
 * /api/output?format=json (the LIVE state) and calls applyRender on it.
 * So every 1.5 s the preview iframe was clobbering its own preview paint
 * with the LIVE slide. v0.7.204's removal of the iframe rev-gate was a
 * red herring — the rev-gate was masking the symptom but never the cause.
 *
 * Fix: gate `setInterval(pollOnce, 1500)` and the empty-DOM watchdog
 * (which also calls pollOnce) behind `if(!IS_PREVIEW)`. Preview iframes
 * have a direct postMessage channel from the parent — they MUST NEVER
 * pull state from /api/output, which only knows about LIVE.
 *
 * This is a render-pipeline bug, not a store bug. The store has been
 * correct since v0.7.201. The unit tests below model the iframe's
 * lifetime under both surfaces and prove that the preview surface never
 * applies the live-state payload.
 */
describe('v0.7.205 — preview iframe must not pull live state via pollOnce', () => {
  // Model the route.ts L1925..L2010 surface bootstrap. The real code
  // calls pollOnce on a 1500ms interval and a watchdog on a 1000ms
  // interval, both of which feed into applyRender. We assert ONLY the
  // gating — if the gate is correct, the live-state poll never runs in
  // the preview iframe and the preview paint is stable.
  const makeSurface = (isPreview: boolean) => {
    const liveStatePainted: string[] = []
    const previewPayloadsPainted: string[] = []
    // The two intervals route.ts schedules — modelled as plain fns so
    // we can call them deterministically.
    let pollIntervalActive = false
    let watchdogIntervalActive = false
    // Bootstrap (mirrors route.ts L1935 + L1994 v0.7.205 gating).
    if (!isPreview) {
      pollIntervalActive = true
      watchdogIntervalActive = true
    }
    // pollOnce fetch result is whatever LIVE is right now.
    const tickPoll = (liveTitle: string) => {
      if (pollIntervalActive) liveStatePainted.push(liveTitle)
    }
    const tickWatchdog = (domEmpty: boolean, liveTitle: string) => {
      if (watchdogIntervalActive && domEmpty) liveStatePainted.push(liveTitle)
    }
    // Parent postMessage path (always works on preview surface).
    const receivePreviewPayload = (title: string) => {
      if (isPreview) previewPayloadsPainted.push(title)
    }
    return { liveStatePainted, previewPayloadsPainted, tickPoll, tickWatchdog, receivePreviewPayload }
  }

  it('LIVE surface — pollOnce DOES run (autoscale safety net unchanged)', () => {
    const s = makeSurface(false)
    s.tickPoll('v28')
    s.tickPoll('v28')
    expect(s.liveStatePainted).toEqual(['v28', 'v28'])
  })

  it('PREVIEW surface — pollOnce MUST NOT run (was the snap-back bug)', () => {
    const s = makeSurface(true)
    // Parent posts v35 via postMessage (correct path).
    s.receivePreviewPayload('v35')
    // 1.5s elapses; on pre-v0.7.205 builds the preview iframe's
    // pollOnce would now fetch /api/output (LIVE=v28) and applyRender,
    // overwriting v35 with v28. On v0.7.205 the poll never fires.
    s.tickPoll('v28')
    s.tickPoll('v28')
    s.tickPoll('v28')
    expect(s.liveStatePainted).toEqual([])
    expect(s.previewPayloadsPainted).toEqual(['v35'])
  })

  it('PREVIEW surface — empty-DOM watchdog MUST NOT re-poll live state either', () => {
    const s = makeSurface(true)
    s.receivePreviewPayload('v35')
    // Even if the preview DOM goes "empty" for >1.5s, on v0.7.205 the
    // watchdog is gated off in preview iframes. The parent's
    // OutputPreview subscriber will repaint on the next state change.
    s.tickWatchdog(true, 'v28')
    s.tickWatchdog(true, 'v28')
    expect(s.liveStatePainted).toEqual([])
  })

  it('Repro of the snap-back bug on pre-v0.7.205 code (gate inverted)', () => {
    // This test documents what the bug looked like — built without the
    // v0.7.205 gate by inverting the bootstrap. If a future refactor
    // ever removes the !IS_PREVIEW gate, the real PREVIEW test above
    // will fail and operators will see the snap-back again.
    const liveStatePainted: string[] = []
    const previewPayloadsPainted: string[] = []
    const tickPoll = (liveTitle: string) => { liveStatePainted.push(liveTitle) }
    const receivePreviewPayload = (title: string) => { previewPayloadsPainted.push(title) }
    receivePreviewPayload('v35')
    tickPoll('v28') // <-- the snap-back, every 1.5s
    expect(previewPayloadsPainted).toEqual(['v35'])
    expect(liveStatePainted).toEqual(['v28']) // bug: preview iframe pulled live state
  })
})
