'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchBibleVerse } from '@/lib/bible-api'
import { isTranslationBundled, lookupVerse, lookupRange } from '@/lib/bibles/local-bible'
import { parseExplicitReference } from '@/lib/bibles/reference-engine'

/**
 * LiveTranslationSync — instant translation swap on the live output.
 *
 * v0.7.115 — INSTANT swap for bundled translations.
 *
 * Operator complaint: "When a voice command is made to give me some
 * from NIV to KJV version it doesn't switch fast; it delays."
 *
 * Pre-115 we always called `fetchBibleVerse(slide.title, target)`,
 * which resolves through `/api/bible` — even for translations that
 * are bundled into the offline JSON (KJV, NIV, ESV, NLT, NASB, NKJV,
 * MSG, AMP, ...). On the operator's machine that round-trip is
 * usually 80-300 ms, but in flaky church Wi-Fi it can stretch to
 * 2-5 s, which is what the operator perceives as "delays". The fetch
 * also blocks the swap behind a microtask + JSON parse + the await
 * boundary, so even a fast network has a perceptible flicker.
 *
 * v0.7.115 routes through `lookupVerse` / `lookupRange` first when
 * the target translation is bundled, parsing the slide title via the
 * existing reference-engine. Result: zero-network, sub-millisecond
 * swap (synchronous read out of the in-memory translation table).
 * Network fetch only fires when the target translation isn't
 * bundled (rare — only some regional translations like Twi).
 *
 * Race-safety: the same three guards as before still wrap the actual
 * `replaceSlide` call so a stale fetch landing after a newer
 * translation switch can't clobber the live slide.
 *
 * Toasts intentionally removed (v0.7.114 disabled global toasts).
 */
export function LiveTranslationSync() {
  // Track the last (translation, liveIndex, slideId) we attempted so
  // we don't re-fire on every store-tick when nothing relevant moved.
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    const handle = async () => {
      const s = useAppStore.getState()
      // v0.7.208 — AI-detection-aware translation swap.
      //
      // Pre-208 this watcher ONLY rebuilt `slides[liveSlideIndex]`. But
      // AI auto-detect (v0.7.203's `setLiveAuto`) writes to the
      // `liveSlide` DIRECT REF and never touches `liveSlideIndex` (it
      // stays at -1 or some stale operator value). The output payload
      // reads `liveSlide ?? slides[liveSlideIndex]` (see output-payload.ts
      // L22-33) so the AI ref wins on screen; meanwhile the legacy
      // replaceSlide path here was mutating a `slides[idx]` slot that
      // wasn't even being rendered, leaving live frozen at the
      // pre-switch translation while preview/deck showed the new one.
      //
      // v0.7.208 prefers the AI ref when present: rebuild `liveSlide`
      // in place via `setLiveAuto(rebuilt)`. Falls through to the
      // legacy `replaceSlide(slides[liveSlideIndex])` path only when
      // there is no AI ref (i.e. operator-driven manual slide).
      const liveRef = s.liveSlide
      const useLiveRef = liveRef !== null
      const idx = s.liveSlideIndex
      const slide: typeof liveRef = useLiveRef ? liveRef : (idx >= 0 && idx < s.slides.length ? s.slides[idx] : null)
      if (!slide) return
      // We can only swap translations for verse-type slides where
      // the title looks like a Bible reference.
      if (slide.type !== 'verse') return
      if (!slide.title) return

      const target = s.selectedTranslation
      if (!target || slide.subtitle === target) return

      // The cache key distinguishes the two render paths so a switch
      // immediately after AI detection (liveSlide set) doesn't get
      // swallowed by a stale key from a prior slides[]-path attempt.
      const path = useLiveRef ? 'ref' : `idx:${idx}`
      const key = `${path}::${slide.id}::${target}`
      if (lastKeyRef.current === key) return
      lastKeyRef.current = key

      const commit = (textOut: string, subtitle: string) => {
        const after = useAppStore.getState()
        // Re-verify the same target slide is still live before
        // committing — guards against a stale fetch landing after
        // operator swapped verses or after a newer translation switch.
        if (useLiveRef) {
          const cur = after.liveSlide
          if (!cur || cur.id !== slide.id) return
          if (after.selectedTranslation !== target) return
          after.setLiveAuto({
            ...cur,
            content: textOut.split('\n').filter(Boolean),
            subtitle,
          })
        } else {
          if (after.liveSlideIndex !== idx) return
          if (after.slides[idx]?.id !== slide.id) return
          if (after.selectedTranslation !== target) return
          after.replaceSlide(idx, {
            content: textOut.split('\n').filter(Boolean),
            subtitle,
          })
        }
      }

      // ─── FAST PATH: bundled translation, synchronous lookup ───
      if (isTranslationBundled(target)) {
        const ref = parseExplicitReference(slide.title)
        if (ref) {
          let textOut: string | null = null
          const vEnd = ref.verseEnd ?? ref.verseStart
          if (vEnd > ref.verseStart) {
            const r = lookupRange(ref.book, ref.chapter, ref.verseStart, vEnd, target)
            if (r) textOut = r.text
          } else {
            textOut = lookupVerse(ref.book, ref.chapter, ref.verseStart, target)
          }
          if (textOut) {
            // No await between read and commit — instant swap.
            commit(textOut, target)
            return
          }
        }
      }

      // ─── SLOW PATH: non-bundled translation, network fetch ───
      try {
        const verse = await fetchBibleVerse(slide.title, target)
        if (!verse) return
        commit(verse.text, verse.translation)
      } catch {
        // Silent — operator can manually re-search if the network is
        // down or the translation isn't available for this passage.
      }
    }

    void handle()
    const unsub = useAppStore.subscribe(() => { void handle() })

    // v0.7.208 — dev-only bridge for the runtime proof (.local/proof-v208.mjs).
    // Stripped in production by `process.env.NODE_ENV === 'production'` guard,
    // which Next.js dead-code-eliminates at build time.
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      (window as unknown as { __SL_DEV_BRIDGE?: unknown }).__SL_DEV_BRIDGE = {
        setLiveAuto: (slide: Parameters<ReturnType<typeof useAppStore.getState>['setLiveAuto']>[0]) =>
          useAppStore.getState().setLiveAuto(slide),
        pinPreviewSlide: (slide: Parameters<ReturnType<typeof useAppStore.getState>['pinPreviewSlide']>[0]) =>
          useAppStore.getState().pinPreviewSlide(slide),
        setSelectedTranslation: (t: string) =>
          useAppStore.getState().setSelectedTranslation(t),
        clearAll: () => {
          const st = useAppStore.getState()
          st.clearLiveAuto()
          st.clearPinnedPreview()
        },
        snapshot: () => {
          const st = useAppStore.getState()
          return {
            liveSlide: st.liveSlide ? { id: st.liveSlide.id, title: st.liveSlide.title, subtitle: st.liveSlide.subtitle, contentFirst: st.liveSlide.content?.[0]?.slice(0, 60) } : null,
            pinnedPreviewSlide: st.pinnedPreviewSlide ? { id: st.pinnedPreviewSlide.id, title: st.pinnedPreviewSlide.title, subtitle: st.pinnedPreviewSlide.subtitle } : null,
            previewSlideIndex: st.previewSlideIndex,
            liveSlideIndex: st.liveSlideIndex,
            selectedTranslation: st.selectedTranslation,
            slidesLen: st.slides.length,
          }
        },
      }
    }

    return () => { unsub() }
  }, [])

  return null
}
