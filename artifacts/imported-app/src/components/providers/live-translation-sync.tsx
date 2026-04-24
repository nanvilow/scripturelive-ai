'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchBibleVerse } from '@/lib/bible-api'
import { toast } from 'sonner'

/**
 * LiveTranslationSync (Bug #6 fix) — instant translation swap on the
 * live output.
 *
 * The previous behaviour: when the operator changed the default Bible
 * translation while a verse was already live, the live slide stayed on
 * the OLD translation until they re-searched the verse and clicked
 * "Send to Live" again. That's because `slides[liveSlideIndex]` is a
 * snapshot — the verse text is baked into `slide.content` at the
 * moment Go Live fires.
 *
 * What this provider does:
 *   - Subscribes to `selectedTranslation` and `liveSlideIndex`.
 *   - When the translation changes AND the current live slide is a
 *     verse-type slide AND its `subtitle` (which we use to store the
 *     translation code) doesn't already match: re-fetch the verse via
 *     `fetchBibleVerse(slide.title, newTranslation)` and patch the
 *     slide in place via the new `replaceSlide` action.
 *
 * Why a non-destructive replaceSlide and not setSlides:
 *   `setSlides` resets `previewSlideIndex` to 0 and `liveSlideIndex`
 *   to -1. Using it here would yank the verse off air mid-service.
 *   `replaceSlide` only swaps the one slide and leaves indices alone,
 *   so the OutputBroadcaster fires a single payload with the new
 *   `content` + `subtitle`, which the secondary screen / NDI feed
 *   crossfade in via the existing slide-change pipeline.
 *
 * Mounted at the same level as OutputBroadcaster so it runs across
 * every view (the Settings overlay used to remount most providers).
 */
export function LiveTranslationSync() {
  // Track the last (translation, liveIndex) we attempted so we don't
  // re-fire on every store-tick when nothing relevant changed.
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    const handle = async () => {
      const s = useAppStore.getState()
      const idx = s.liveSlideIndex
      if (idx < 0 || idx >= s.slides.length) return
      const slide = s.slides[idx]
      // We can only swap translations for verse-type slides where the
      // title looks like a Bible reference (which is how Bible Lookup
      // and the detection pipeline construct them — see bible-lookup
      // and scripture-detection). Lyrics, media, custom, etc. are
      // untouched.
      if (slide.type !== 'verse') return
      if (!slide.title) return

      const target = s.selectedTranslation
      if (!target || slide.subtitle === target) return

      const key = `${idx}::${slide.id}::${target}`
      if (lastKeyRef.current === key) return
      lastKeyRef.current = key

      try {
        const verse = await fetchBibleVerse(slide.title, target)
        if (!verse) return
        const after = useAppStore.getState()
        // Re-validate before mutation in case the operator
        //   - advanced off this slide while the fetch was in flight,
        //   - rapidly switched translations again A→B→C and we are
        //     the stale A→B response landing AFTER the B→C fetch
        //     has already committed (architect race-condition flag),
        //   - manually edited the slide id underneath us.
        // All three checks are cheap and prevent us from clobbering
        // a newer state.
        if (after.liveSlideIndex !== idx) return
        if (after.slides[idx]?.id !== slide.id) return
        if (after.selectedTranslation !== target) return
        after.replaceSlide(idx, {
          content: verse.text.split('\n').filter(Boolean),
          subtitle: verse.translation,
        })
        toast.success(`Live verse switched to ${verse.translation}`)
      } catch {
        // Silent — operator can manually re-search if the network is
        // down or the translation isn't available for this passage.
      }
    }

    // Prime once and on every store change. The handler is internally
    // idempotent via lastKeyRef, so the per-tick cost is one shallow
    // read + a string compare when nothing relevant moved.
    void handle()
    const unsub = useAppStore.subscribe(() => { void handle() })
    return () => { unsub() }
  }, [])

  return null
}
