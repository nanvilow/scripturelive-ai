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
      const idx = s.liveSlideIndex
      if (idx < 0 || idx >= s.slides.length) return
      const slide = s.slides[idx]
      // We can only swap translations for verse-type slides where
      // the title looks like a Bible reference.
      if (slide.type !== 'verse') return
      if (!slide.title) return

      const target = s.selectedTranslation
      if (!target || slide.subtitle === target) return

      const key = `${idx}::${slide.id}::${target}`
      if (lastKeyRef.current === key) return
      lastKeyRef.current = key

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
            s.replaceSlide(idx, {
              content: textOut.split('\n').filter(Boolean),
              subtitle: target,
            })
            return
          }
        }
      }

      // ─── SLOW PATH: non-bundled translation, network fetch ───
      try {
        const verse = await fetchBibleVerse(slide.title, target)
        if (!verse) return
        const after = useAppStore.getState()
        if (after.liveSlideIndex !== idx) return
        if (after.slides[idx]?.id !== slide.id) return
        if (after.selectedTranslation !== target) return
        after.replaceSlide(idx, {
          content: verse.text.split('\n').filter(Boolean),
          subtitle: verse.translation,
        })
      } catch {
        // Silent — operator can manually re-search if the network is
        // down or the translation isn't available for this passage.
      }
    }

    void handle()
    const unsub = useAppStore.subscribe(() => { void handle() })
    return () => { unsub() }
  }, [])

  return null
}
