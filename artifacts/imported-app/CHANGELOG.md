# ScriptureLive AI — Changelog

Detailed per-version architecture notes for older releases. The 3 most recent versions live inline in `replit.md`; everything else is archived here, newest first.

For user-facing release notes shipped to operators, see the GitHub Releases page on `nanvilow/scripturelive-ai`.

---

## v0.7.120 — High-Conf Read-Lock + Famous One-Liners + Pointer-Events Watchdog

Three operator complaints addressed. (a) "A voice command was given, 'Suffer not a witch to live', the verse was detected and sent to Bible Reference Quoted, but on Live Display the Auto Verse Match countered the auto-live displayed from Bible Reference Quoted." Root cause: v0.7.117 read-lock only required `candConf >= liveConf + 0.10`, so an explicit COL 1 hit at 0.95 vs a hand-curated EXACT semantic at 0.85 = 0.10 delta exactly → override allowed. Fix: new `LIVE_HIGH_CONF_LOCK = 0.85` constant in `verse-auto-live.ts`. When the live verse came from a high-confidence source (≥ 0.85 — hand-curated EXACT 0.95, hand-curated FUZZY 0.85, explicit-regex 0.95), block ALL cross-ref auto swaps in the sticky window regardless of incoming candidate confidence; only manual operator click in the Detected Verses card overrides. Below 0.85 the older delta-based logic still applies. (b) "It still cant find Silver and Gold I have none." + general request for accurate paraphrased-quotation matching. Added ~80 famous pulpit one-liners to `RAW_CATALOGUE` covering Acts 3:6 (silver/gold/rise-up-and-walk in 7 phrasings), the full Beatitudes, John 3:16/14:6/11:25/15:5, Romans 8:28/8:31/10:13/12:1, the Ten Commandments (Exod 20:3-17 + 22:18 thou-shalt-not-suffer-a-witch in 4 phrasings), Hebrews 11:1, James 1:19/4:7, I Cor 13 (love chapter), II Cor 5:17, Galatians 5:22-23 (fruit of the spirit), Ephesians 2:8-10/6:11-17 (armour), Philippians 2:10/4:6-13/4:19, Isaiah 40:31/41:10/53:5/54:17, Jeremiah 29:11, Psalm 23 (every verse split), Psalm 46:10/119:105/121:1-2/127:1, Joshua 1:9/24:15, II Chron 7:14, the seven last words from the cross, etc. All hand-curated → dispatched as semantic 0.95 EXACT / 0.85 FUZZY (covered by the new high-conf lock above), so they auto-fire AND stick. (c) "Anytime I tried to click to write something on the app it doesn't work, applies to all the app" — STILL happening after v0.7.119 CSS fix. Root cause: Radix sets `pointer-events: none` as INLINE style on body; inline JS-set values beat stylesheet `!important`. v0.7.119 CSS rule won the cascade in most cases but not when Radix ran the inline mutation post-hydration. Fix: new `PointerEventsWatchdog` client component mounted at the top of layout.tsx. MutationObserver watches body's `style` attribute; any time `pointer-events: none` is set inline, strips it on the next microtask. Initial sweep on mount handles SSR-leftover cases. Scroll-lock still functions via Radix's separate `overflow: hidden` inline value — only the click-blocking portion is neutralised. Belt + suspenders to v0.7.119 CSS.

---

## v0.7.119 — Dead-Input App-Wide Fix + Cross-Source Dedupe

see [`artifacts/imported-app/CHANGELOG.md`](artifacts/imported-app/CHANGELOG.md) for full per-version architecture notes (voice/verse iteration v0.7.109 → v0.7.117, renewed-code re-activation v0.7.118, dead-input app-wide fix v0.7.119, plus all earlier entries).

---

## v0.7.118 — Renewed Codes Are Re-Activatable



---

## v0.7.117 → v0.7.109 — Voice / Verse / Live-Display Iteration

## Product

