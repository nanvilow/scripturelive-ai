# Overview

This project is a pnpm workspace monorepo building a Next.js application, "Imported App," for scripture-related services. It supports live congregation output, NDI broadcasting, and advanced speech recognition. The system targets both web and desktop (Electron) environments, offering features like dynamic downloads and real-time slide updates. The core ambition is a streamlined, cloud-powered Whisper transcription service.

## v0.7.4 — Voice/detection polish + Live Output Auto Go-Live quick toggle (Apr 2026)

Picks up the items deferred from v0.7.3. Five user-facing changes,
all in the live-presenting path. Multi-PC license + single-active
enforcement is **deferred again to v0.7.5** — it needs a central
authority that the offline-first desktop build doesn't have today,
and a proper design discussion (see "Deferred to v0.7.5" at the
bottom of this entry).

### 1. New voice command — "next chapter" / "previous chapter"

Operators can now say **"next chapter"** or **"previous chapter"**
(also "prev chapter" / "last chapter") to jump the live output to
chapter ±1 of whatever book is currently live. The provider reads
the live verse-slide title to recover book + chapter, validates
against `bibleStructure` (so "Revelation 22 + next" doesn't try to
load chapter 23 — it shows a polite toast instead), then loads the
**whole** target chapter so the operator can use auto-scroll /
speaker-follow to walk through it.

The new patterns sit BEFORE the bare "next" / "previous" entries in
`PATTERNS` so the longer-trigger match wins. Falls back gracefully
when there's no live verse to anchor against.

Example: "next chapter" with John 3 live → John 4:1-54 cued live.

### 2. New voice command — "the bible says &lt;ref&gt;" → STANDBY only

For mid-sermon cueing without hijacking the screen. Triggers:
**"the bible says"**, "bible says", "scripture says". Same lookup
as `go to`, but the loaded passage routes to the **preview slot
only** — never to Live, even when Auto Go-Live is on. Operator hits
Enter or clicks Go Live to push.

Toast surfaces as `Standby: John 3:16` so the operator can see what
got queued at a glance. The label is generated kind-aware in
`commands.ts` (`bible_says` → `Standby:`, everything else →
`Go to`).

### 3. Live Output header — Auto Go-Live quick toggle

Added a Zap-icon button to the Live Output panel header right next
to the existing Footprints (Speaker-Follow) toggle. It mirrors the
same `settings.autoGoLiveOnDetection` setting that lives in
Scripture Detection — the operator can flip it without leaving the
Live Presenter view, and the two buttons stay in sync because
they're driving the same store field. Active state uses emerald
(matches the detection panel's accent), inactive is the muted
border treatment.

### 4. Live transcription confidence tiers (≥70 / 30-70 / &lt;30)

Threaded the per-chunk Deepgram confidence (0..1) through the
streaming hook → SpeechProvider so we can gate the auto-fire
pipeline by quality. Three bands, all operator-tunable in
`AppSettings`:

- **`transcriptDropThreshold` (default 0.30):** below this,
  transcript chunk is shown for diagnostics but skipped entirely
  by the command + reference detection pipeline.
- **`transcriptPreviewThreshold` (default 0.60):** visual cutoff
  reserved for future "tentative chunk" rendering.
- **`transcriptLiveThreshold` (default 0.70):** at or above this,
  the chunk runs the full pipeline (commands, v1 + v2 detection,
  AI semantic match).

The hook callback signature became `(text, confidence)`. Whisper
HTTP API doesn't expose chunk-level confidence, so the Whisper hook
always passes 1.0 — the gate is a no-op for Whisper users (matches
prior behaviour). Deepgram passes its real `alt.confidence`,
defaulting to 1.0 only when the field is missing on a special
message type.

Lowered the v2 auto-go-live threshold from 90 → 70 to align with
the new live tier — 90 was an artifact of pre-tier days when
low-confidence chunks reached that code path. The chunk that
produces a v2 detection has now already passed the 0.70 gate, and
v2 keeps its own ≥80 detection floor, so the combined safety is
unchanged in practice.

### 5. Speaker-Follow polish — anti-rewind + tighter delta

Two surgical tweaks to `pickBestVerse` to stop the highlight
flickering between adjacent verses when the preacher is mid-way
through a passage:

- **`minDelta` 0.05 → 0.08**: the new best-verse score now has to
  beat the current verse by 0.08 (was 0.05) before we switch.
  Sticks the highlight harder when adjacent verses share filler
  tokens like "world", "God", "son" (e.g. John 3:16 / 3:17).
- **Anti-rewind window (1500 ms)**: when the new best verse is
  EARLIER than the current one, suppress the switch if it's within
  1.5 s of the previous forward switch. Preachers almost always
  progress forward; a sudden backward jump in that window is
  overwhelmingly noise from filler-word leak. SpeechProvider tracks
  the timestamp in a ref and stamps it only on FORWARD switches.

### Deferred to v0.7.5

- **Multi-PC license + single-active enforcement.** This needs a
  central authority that doesn't exist in the current offline-first
  desktop build. Two design directions in tension:
  1. Add a thin "presence" service the desktop app heartbeats
     against — solves single-active cleanly but breaks the offline
     guarantee.
  2. Sign a JWT into the activation payload that encodes the
     allowed seat-count + a server-rotated nonce — works offline
     but allows transient over-use until the next online check.
  Punted to v0.7.5 so the right call can be made deliberately.

### Files

- `replit.md` (this changelog)
- `artifacts/imported-app/package.json` (0.7.3.1 → 0.7.4)
- `artifacts/imported-app/src/lib/voice/commands.ts` (next/prev
  chapter + bible_says patterns; kind-aware label)
- `artifacts/imported-app/src/lib/voice/speaker-follow.ts`
  (minDelta default 0.08 + antiRewindMs guard)
- `artifacts/imported-app/src/lib/store.ts` (three new
  `transcript*Threshold` settings)
- `artifacts/imported-app/src/hooks/use-deepgram-streaming.ts`
  (callback signature + chunk confidence)
- `artifacts/imported-app/src/hooks/use-whisper-speech-recognition.ts`
  (callback signature; passes 1.0)
- `artifacts/imported-app/src/components/providers/speech-provider.tsx`
  (confidence-tier gate, next/prev chapter + bible_says dispatch,
  v2 threshold 90→70, lastSpeakerSwitchAt anti-rewind)
- `artifacts/imported-app/src/components/views/live-presenter.tsx`
  (Live Output header Auto Go-Live Zap toggle)

## v0.7.3.1 — Hotfix for v0.7.3 (Apr 2026)

Code-review caught two regressions in v0.7.3 that shipped with the
release blob:

1. **NDI default scale was still 2.0× in `defaultSettings`.** The
   v0.7.3 changelog and slider reset were updated to 1.0×, but the
   `defaultSettings.ndiLowerThirdScale` literal in `lib/store.ts` was
   not — fresh installs and any user without persisted state were
   still getting the oversized 2.0× lower-third. Fixed: now `1`.

2. **Geo public-IP fallback could hang activation up to 5 s and
   negative-cache for 24 h on transient ip-api.com failures.**
   Tightened to 1.5 s timeout (was 5 s) and 5-min negative cache
   (was 24 h). Successful lookups still cache for 24 h. The
   activation / status request can no longer be stretched by a slow
   geo enrichment.

**Files changed:**
- `artifacts/imported-app/src/lib/store.ts`             (default scale 2 → 1)
- `artifacts/imported-app/src/lib/licensing/geoip.ts`   (1.5 s timeout + 5 min negative-cache)
- `artifacts/imported-app/package.json`                 (0.7.3 → 0.7.3.1)

## v0.7.3 — Operator bug-blast fixes (Apr 2026)

Field-report fixes from a multi-issue bug report. Triaged into seven
shippable items here; multi-PC license + transcription confidence
tiers + new voice commands deferred to v0.7.4.

**1. Auth — re-prompt for password after change (CRITICAL).** The
operator reported "I changed my admin password but didn't have to
sign in again." Confirmed: `PATCH /api/license/admin/config` accepted
a new `adminPassword` but did not invalidate any of the in-process
sessions, so the existing 12h cookie stayed valid against the NEW
password. Added `revokeAllSessions()` to `lib/licensing/admin-auth.ts`,
called from the config PATCH handler whenever `adminPassword` is
present in the body and the new value differs from the current one.
The same response now also clears the cookie via
`buildClearCookie()` and returns `reauthRequired: true` in the JSON
body so the modal can immediately surface the password gate. Smoke
test: login → PATCH config with new password → next request returns
401, old password is rejected, new password succeeds.

**2. "Codes deleted by themselves" — bin retention 7d → 90d, payment
TTL 15min → 7d.** The operator reported active codes vanishing
"without me touching them." Two timers were responsible:
`BIN_RETENTION_MS` (soft-delete bin auto-purges) was 7 days, and
`PAYMENT_CODE_TTL_MS` (pending-payment expiry) was 15 minutes — both
too aggressive. Bumped to 90 days and 7 days respectively. Bin label
in admin modal now reads "auto-purges 90 days after delete
(recoverable until then)". Soft-delete confirm dialog and tooltip
also updated (7→90).

**3. Admin code-action buttons.** Verified end-to-end via curl with
a real session cookie: `cancel`, `renew`, `restore`, `delete-activation`
all reach the route handler (404 on a fake code, NOT 401). The wiring
was correct; the operator's "all dead" report was almost certainly
the auth-not-reprompting bug above (their cookie was stale).

**4. Geo lookup — public-IP fallback.** The operator's dashboard
showed empty region/country/city for every activation. Root cause:
on the desktop Electron build the buyer's browser hits 127.0.0.1, so
`req.ip` is loopback and `lookupGeo()` skips it. Added
`resolveServerPublicIp()` to `lib/licensing/geoip.ts` — calls
`http://ip-api.com/json/?fields=status,query` with no IP arg so the
service returns the server's outbound public IP. Result is cached
24 h. `captureGeoFromRequest()` now falls back to this whenever the
client IP is missing or RFC1918.

**5. NDI lower-third default 2.0× → 1.0×.** v0.7.0 doubled the
default lower-third scale to 2.0× — the operator's screenshot showed
this was way too large for their actual broadcast frame. Default is
now 1.0× in `lib/store.ts`, the renderer fallback in
`api/output/congregation/route.ts`, and the slider reset label in
`ndi-output-panel.tsx`. The auto-fit (`fitFont` + `ltBand`) still
clamps the band height so the band can never collide with the bottom
edge of the safe area at any scale.

**6. Settings → Output Preview wired to live verse.** The "Stage
Output" and "Congregation Output" preview tiles in Settings were
hardcoded to John 3:16. Both now read `currentVerse` (or `liveVerse`
fallback) from the Zustand store via the `sample` prop, so the
operator sees what's actually about to broadcast. Falls back to
John 3:16 when nothing is queued.

**7. SMS label + phone number swap.**
- `WhatsApp Number` → `SMS Number to Receive Activation Code` in
  `subscription-modal.tsx` (matches reality — the buyer receives an
  SMS, not a WhatsApp message).
- `0530686367` → `0246798526` in `lib/licensing/plans.ts`
  (`NOTIFICATION_WHATSAPP` and `MOMO_RECIPIENT.number`). The operator
  consolidated both MoMo + escalation onto their personal admin line.

**Files changed:**
- `artifacts/imported-app/src/lib/licensing/admin-auth.ts`            (+ revokeAllSessions)
- `artifacts/imported-app/src/app/api/license/admin/config/route.ts`  (revoke + clear cookie on password change)
- `artifacts/imported-app/src/lib/licensing/storage.ts`               (BIN 7d→90d, PAYMENT 15min→7d)
- `artifacts/imported-app/src/lib/licensing/plans.ts`                 (phone swap)
- `artifacts/imported-app/src/lib/licensing/geoip.ts`                 (+ public-IP fallback, 24h cache)
- `artifacts/imported-app/src/components/license/subscription-modal.tsx` (SMS label)
- `artifacts/imported-app/src/lib/store.ts`                           (ndiLowerThirdScale 2→1)
- `artifacts/imported-app/src/components/views/ndi-output-panel.tsx`     (reset label 1.00×)
- `artifacts/imported-app/src/app/api/output/congregation/route.ts`   (renderer fallback 1.0)
- `artifacts/imported-app/src/components/settings/output-preview.tsx` (live verse from store)
- `artifacts/imported-app/src/components/license/admin-modal.tsx`     (bin labels 7→90)
- `artifacts/imported-app/package.json`                               (0.7.2 → 0.7.3)

## v0.7.2 — Extend admin auth to /master, /test-email, /test-sms (Apr 2026)

Code-review follow-up to v0.7.1. The audit found that three more
endpoints — `/api/license/master` (GET+POST), `/api/license/test-email`
(POST), and `/api/license/test-sms` (POST) — were also operator-only
in intent but had been left unguarded. Same gap, same fix:

- `/api/license/master` GET would have leaked the install's permanent
  master activation code (which fully unlocks the app forever);
  POST would have triggered an outbound email + WhatsApp message.
- `/api/license/test-email` and `/api/license/test-sms` were free
  spam vectors — anyone reachable could have triggered SMTP / SMS
  sends from the operator's account.

All three now call `requireAdmin(req)` exactly the same way the
`/admin/*` routes do. The `master` route's pre-existing comment
"safe because access to the dev console = access to the file system
anyway" was true for early-version self-hosted dev builds but not
for the v0.7.0 dashboard model that exposes a real port.

Re-ran the same smoke harness — all 4 new assertions PASS (401
unauth on each, 200 with cookie on `/master` GET).

**Files changed:**
- `artifacts/imported-app/src/app/api/license/master/route.ts`     (+ requireAdmin x2)
- `artifacts/imported-app/src/app/api/license/test-email/route.ts` (+ requireAdmin)
- `artifacts/imported-app/src/app/api/license/test-sms/route.ts`   (+ requireAdmin)
- `artifacts/imported-app/package.json`                            (0.7.1 → 0.7.2)

## v0.7.1 — Server-side admin auth gate (Apr 2026)

Critical security hotfix. v0.7.0 shipped the new activation-code
dashboard (with buyers' phone numbers, emails, and approximate
location), but the admin endpoints had been wide open since the
beginning of the licensing system — the only "gate" was the
Ctrl+Shift+P UI shortcut and a password field in Settings that was
never actually checked. Anyone who could reach the app's port could
GET `/api/license/admin/list` or `/codes` and pull the entire
customer roster.

This release adds a real server-side auth layer:

- New `lib/licensing/admin-auth.ts` — in-memory session store
  (12-hour sliding TTL, 64-byte URL-safe random tokens) +
  constant-time password comparison + HttpOnly `SameSite=Strict`
  cookie helpers.
- New endpoints: `POST /api/license/admin/login`,
  `POST /api/license/admin/logout`, `GET /api/license/admin/whoami`.
- All 14 existing admin routes (cancel, codes, config, confirm,
  delete-activation, delete-notification, delete-payment, generate,
  keys, list, renew, restore, retry — plus the new login/logout/
  whoami) now call `requireAdmin(req)` at the top and return
  401 `{ error, code: 'ADMIN_AUTH_REQUIRED' }` when the cookie is
  missing or expired.
- Password resolution priority: operator-set value in
  Settings → Admin Password (highest), then
  `SCRIPTURELIVE_ADMIN_PASSWORD` env var, then a baked default of
  `admin` (with a one-time console warning so it's noticed).
- Admin modal (`admin-modal.tsx`) probes `/whoami` on every open;
  if 401, shows a password prompt before the tabs render. The
  existing reload-list / reload-codes / load-settings polling
  effects are now gated on `authed === true` so they don't 401-spam
  the server / pollute the audit log before the operator unlocks.
- Cookies are auto-sent on same-origin fetches, so no other admin
  fetch in the modal needed any change.

**Files changed:**
- NEW: `artifacts/imported-app/src/lib/licensing/admin-auth.ts`
- NEW: `artifacts/imported-app/src/app/api/license/admin/login/route.ts`
- NEW: `artifacts/imported-app/src/app/api/license/admin/logout/route.ts`
- NEW: `artifacts/imported-app/src/app/api/license/admin/whoami/route.ts`
- 13 existing `/api/license/admin/*/route.ts` files (added import + guard)
- `artifacts/imported-app/src/components/license/admin-modal.tsx` (auth probe + password gate)
- `artifacts/imported-app/package.json` (0.7.0 → 0.7.1)

## v0.7.0 — NDI default 2.0× lower-third + box auto-fit + email retry + activation-code admin dashboard (Apr 2026)

Five operator-urgent issues bundled into one minor release because
"the project has to go live":

**1. NDI lower-third scale default raised to 2.0×.** Operator
configures every venue at 2.0× and was tired of moving the slider on
each fresh install. `store.ts` default `ndiLowerThirdScale` now `2.0`
and the slider's "Reset" button drops back to 2.0 instead of 1.0.

**2. Lower-third BOX must scale with text (no clipping at 2.0×).**
`/api/output/congregation` was scaling the text font but leaving the
box at the original `hPct` height, so 2.0× verses overflowed past
the bottom edge. Fix moves the `ndiLtScale` calc above `ltStyle` and
recomputes `hPctScaled = min(80, hPct * scale)` so the container
grows with its content (capped at 80% of viewport so the lower-third
never becomes a full screen).

**3. Email broken with "Unexpected socket close" — fixed with
retry-with-backoff.** `notifications.ts` SMTP transport was a single
attempt; transient TCP drops (operator's venue Wi-Fi, ECONNRESET on
some Gmail SMTP edges) silently failed every receipt. Added
`isTransientSmtpError` detector covering ECONNRESET / ETIMEDOUT /
ESOCKET / EPIPE / EAI_AGAIN / "socket close" + retry loop (3
attempts, 1s/2.5s/5s backoff, fresh transport per attempt) plus
tighter connection/socket/greeting timeouts so a hung edge can't
freeze the receipt thread for minutes.

**4. NDI typography compliance.** Verified after #1+#2 that every
`OutputUiSettings` field flowing through the JSON channel is
honoured by both Output Display and NDI; the v0.6.9 sync work
already made this pass — this release just confirms it under the
2.0× default.

**5. NEW: Activation-code admin dashboard.** Operator request:
"Create a place in the admin panel where admins can keep records of
all activation codes... days of purchase, duration remaining,
expiration date, never-used / expired / error status, real-time
location of where users are using each code, buyer phone numbers,
and a way to renew or cancel. Deleted codes go to a bin for 1 week
before permanent purge."
- `storage.ts`: extended `ActivationCodeRecord` with
  `buyerPhone`, `cancelledAt`, `cancelReason`, `lastSeenAt`,
  `lastSeenIp`, `lastSeenLocation`, `softDeletedAt`. Added
  `purgeExpiredBin` (auto-runs on every list), `computeCodeStatus`
  (precedence: deleted > cancelled > master > never-used >
  active/expired), `listAdminCodes`, `cancelActivationByCode`,
  `renewActivationByCode`, `softDeleteActivationByCode`,
  `restoreActivationByCode`, `recordCodeHeartbeat`. `activateCode`
  now takes `ctx?:{ip,location}`, refuses cancelled / soft-deleted
  codes, and mirrors `generatedFor.whatsapp → buyerPhone`.
- `geoip.ts`: free, no-key ip-api.com lookup with 30-min in-memory
  cache and 5 s timeout — never blocks activation if it fails.
- API routes: `POST /api/license/admin/cancel|renew|restore`,
  `GET /api/license/admin/codes?includeDeleted=1`. The existing
  `delete-activation` route now defaults to soft-delete (bin)
  with `permanent:true` for forever-purge.
- `activate` + `status` routes capture client IP via
  `x-forwarded-for` and write geo onto the code; `status` heartbeat
  refreshes liveness on every poll so the dashboard sees who's
  actively using each code right now.
- `admin-modal.tsx`: new "Codes" tab with stat strip, search + status
  filter, color-coded status pills, buyer phone / email / location /
  last-seen / days-remaining columns, per-row Cancel / Renew (prompt
  for days) / Soft-delete actions, plus a Bin view with Restore and
  Delete-forever buttons + days-until-purge countdown.

Files touched:
- `artifacts/imported-app/package.json` (0.6.9 → 0.7.0)
- `artifacts/imported-app/src/lib/store.ts` (default 2.0)
- `artifacts/imported-app/src/components/views/ndi-output-panel.tsx` (slider reset 2.0)
- `artifacts/imported-app/src/app/api/output/congregation/route.ts` (box scales with text)
- `artifacts/imported-app/src/lib/licensing/notifications.ts` (retry-with-backoff)
- `artifacts/imported-app/src/lib/licensing/storage.ts` (admin dashboard schema + helpers)
- `artifacts/imported-app/src/lib/licensing/geoip.ts` (NEW — free geo lookup)
- `artifacts/imported-app/src/app/api/license/activate/route.ts` (geo capture)
- `artifacts/imported-app/src/app/api/license/status/route.ts` (heartbeat)
- `artifacts/imported-app/src/app/api/license/admin/codes/route.ts` (NEW)
- `artifacts/imported-app/src/app/api/license/admin/cancel/route.ts` (NEW)
- `artifacts/imported-app/src/app/api/license/admin/renew/route.ts` (NEW)
- `artifacts/imported-app/src/app/api/license/admin/restore/route.ts` (NEW)
- `artifacts/imported-app/src/app/api/license/admin/delete-activation/route.ts` (soft-delete by default)
- `artifacts/imported-app/src/components/license/admin-modal.tsx` (Codes tab + Bin view)

## v0.6.9 — Typography sync to Output Display + Bible line-height + revert full-screen NDI background-strip (Apr 2026)

Three operator-reported issues from the v0.6.8.1 follow-up video,
plus a new feature request:

**1. Reference typography never reached the secondary screen / NDI feed (root cause)**

The Typography panel's reference-only controls (Reference Font Size,
Reference Font Family, Reference Text Shadow, Reference Text Scale,
Reference Text Alignment) were stored correctly in the operator's
settings, AND the renderer in `route.ts` explicitly read them on every
broadcast tick — but the SSE `settingsBlock` in
`output-broadcaster.tsx` (lines 77-134) never forwarded them.
Consequence: the secondary-screen renderer always saw
`st.referenceFontSize === undefined`, fell through to its body-text
fallback chain, and silently rendered the reference at the operator's
old body settings every time. Operator's verdict: "scripture text and
reference size on second screen display doesn't match the Live display
settings at all — they are not sync." Fix: forward all five reference
fields in the settings broadcast and add them to the
`OutputState.settings` type.

**2. Full-screen NDI lost the themed gradient + custom background**

v0.6.8 made `FORCE_TRANSPARENT` always-on for the NDI feed (so
lower-third NDI could render on a clean alpha matte for vMix/OBS
compositing). But the full-screen NDI branch in `route.ts:912` ALSO
honoured `FORCE_TRANSPARENT` and stripped the theme class + custom
background image, so operators on full-screen NDI saw the verse
floating on a white / alpha frame. Reverted: full-screen NDI now
always paints the theme gradient + custom background, identical to the
secondary screen, so the NDI feed acts as a complete program output.
Lower-third NDI keeps its v0.6.8.1 surrounding-area transparency
(handled in the `isLT` branch — the surrounding ancestors and the box
backdrop class still honour `FORCE_TRANSPARENT` and the operator's
per-box toggle). Operators who specifically want full-screen NDI as
an alpha matte can switch to lower-third mode + flip the per-box
transparent toggle.

**3. New: Bible body line-height in the main Typography panel**

Mirrors the existing NDI panel's "Bible line-height" slider — range
0.9 .. 2.5, default 1.4. New `bibleLineHeight` field on `AppSettings`,
broadcast through the SSE channel, and read by the renderer for BOTH
the secondary screen AND the NDI feed (the NDI-only override
`ndiBibleLineHeight` still wins on the broadcast feed when set). UI is
a slider with Tight / Default / Airy preset buttons + a clarifying
caption. Existing global "Text Scale" slider already covers the
"Bible text scale" half of the operator's request.

**Files**
- `replit.md`                                                                          (this changelog)
- `artifacts/imported-app/package.json`                                                 (0.6.8.1 → 0.6.9)
- `artifacts/imported-app/BUILD.bat`                                                    (banner)
- `artifacts/imported-app/src/app/api/output/congregation/route.ts`                     (revert full-screen fsTheme/fsBg strip; T_LH falls back to st.bibleLineHeight; settingsRenderKey adds blh)
- `artifacts/imported-app/src/components/providers/output-broadcaster.tsx`              (forward referenceFontSize/FontFamily/TextShadow/TextScale/TextAlign + bibleLineHeight)
- `artifacts/imported-app/src/lib/output-broadcast.ts`                                  (OutputState type adds reference* + bibleLineHeight)
- `artifacts/imported-app/src/lib/store.ts`                                             (AppSettings adds bibleLineHeight; defaultSettings seed 1.4)
- `artifacts/imported-app/src/components/views/settings.tsx`                            (Bible Line-Height slider in the Typography card)

## v0.6.8.1 — HOTFIX: lower-third surrounding-area still opaque (Apr 2026)

Code review of v0.6.8 caught a high-severity miss: the v0.6.5
ancestor-background paint at `route.ts:871` (`var __bg = ltTransparent
? 'transparent' : '#000'`) was the ONE place in the lower-third render
path that still gated transparency on the operator's per-box toggle
alone after v0.6.8 decoupled `ltTransparent` from `FORCE_TRANSPARENT`.

Effect on the operator: with the per-box toggle OFF (its default, and
the only state available on a fresh install since the toggle is hidden
unless the operator manually picks lower-third mode), the renderer
still slammed `html / body / #stage / #output` to OPAQUE BLACK on
every NDI broadcast. The BrowserWindow was transparent (v0.6.8 fix)
and the URL had `?transparent=1` (v0.6.8 fix), but the renderer's
inline style won — vMix/OBS still saw a black frame around the bar.

Fix: re-OR `FORCE_TRANSPARENT` into the surrounding-area paint
(`var __bg = (FORCE_TRANSPARENT || ltTransparent) ? 'transparent' : '#000';`)
so the URL flag controls the surrounding ancestors and the operator's
toggle continues to control only the box backdrop class.
`ltTransparentClass` (the CSS class added to `.lt-box`) is unchanged —
it still honours the operator's toggle alone. Two settings, two
effects, no cross-contamination.

**Files**
- `replit.md`                                                                  (this changelog)
- `artifacts/imported-app/package.json`                                         (0.6.8 → 0.6.8.1)
- `artifacts/imported-app/BUILD.bat`                                            (banner)
- `artifacts/imported-app/src/app/api/output/congregation/route.ts`             (re-OR FORCE_TRANSPARENT into ancestor-bg paint)

## v0.6.8 — NDI always-transparent + display-mode actually applies + mNotify circuit-breaker (Apr 2026)

Operator video (streamable.com/4a16uw) showed two distinct NDI failures
on the v0.6.7 build that the v0.6.6 plumbing fix should have addressed:

**T801 — NDI receivers (vMix/OBS/Wirecast) STILL show opaque black
AND the Lower-Third → Full-Screen toggle has zero effect on the
broadcast feed.** Two root causes:

(1) `ndi-output-panel.tsx` and `easyworship-shell.tsx` both passed
`transparent: settings.ndiLowerThirdTransparent === true` to
`desktop.ndi.start()`. That toggle defaults OFF and is HIDDEN in the
panel UI unless the operator has already picked "lower-third" mode —
so on a fresh install the BrowserWindow is always created OPAQUE
(`transparent: false`, `backgroundColor: '#000000'`) and vMix/OBS
receives an opaque black frame with text floating on it instead of an
alpha matte. v0.6.8 always passes `transparent: true` because NDI is
fundamentally an alpha-keyed overlay format intended for compositing
in vMix/OBS/Wirecast — opaque NDI defeats the entire purpose. The
operator's per-box "Transparent lower-third" toggle now controls only
whether the lower-third card keeps its themed gradient backdrop; the
surrounding frame is always alpha.

(2) Both call sites also hardcoded `lowerThird: { enabled: true }`
regardless of `settings.ndiDisplayMode`. So the BrowserWindow URL
always contained `?lowerThird=1`, the renderer's `FORCE_LT` flag was
always true, and the renderer's display-mode resolution at
`route.ts:560` always picked `'lower-third'` — the operator's pick of
Full Screen was silently ignored. v0.6.8 sets
`lowerThird.enabled = ndiDisplayMode === 'lower-third'` so picking
Full mode actually broadcasts the verse full-screen and picking
Lower-Third actually broadcasts the bar.

Supporting changes:
- The `useEffect` restart trigger in `ndi-output-panel.tsx` now
  watches `ndiDisplayMode` (was `ndiLowerThirdTransparent`) so
  flipping Full ↔ Lower-Third while broadcasting tears down the
  BrowserWindow and rebuilds with the new flags. main.ts's
  short-circuit equality check (extended in v0.6.6) already covers
  `frameCaptureFlags.lowerThird`, so the rebuild fires immediately.
- The preview iframe `key` + `src` were updated to mirror the new
  query-string contract (`?ndi=1&transparent=1` always; `?lowerThird=1`
  only when in lower-third mode) so the in-app preview matches what
  vMix/OBS receives across every mode permutation.
- `route.ts:845` `ltTransparent` was DECOUPLED from `FORCE_TRANSPARENT`.
  Pre-v0.6.8 the box-transparent decision was
  `IS_NDI && (FORCE_TRANSPARENT || st.ndiLowerThirdTransparent===true)`
  — and the moment v0.6.8 started always sending `?transparent=1` the
  box would also always go transparent, silently overriding the
  operator's per-box toggle. Now it's
  `IS_NDI && st.ndiLowerThirdTransparent===true` so the URL flag
  controls only the BrowserWindow surrounding-area transparency and
  the store flag controls only the box backdrop — two settings, two
  controls, no cross-contamination.

**T802 — mNotify SMS gateway returns HTTP 419 "Your account has been
tagged as fraudulent" for every send (both customer and admin SMS).**
This is a permanent state on mNotify's side — only an operator phone
call to mNotify support at 0541509394 can clear it. Pre-v0.6.8 we
kept retrying:
  1. attempt #1 hits mNotify, gets 419 fraudulent.
  2. one-second back-off, attempt #2 hits the same dead account, same
     419 fraudulent — log noise + a second strike on the account from
     mNotify's fraud team.
  3. notifySms() returns failed; the next call (admin SMS for the same
     payment ref) repeats the whole pattern → operator sees TWO
     identical "fraudulent" badges per payment ref, plus another two
     every time the customer hits Resend.

v0.6.8 adds a session-level circuit breaker in
`src/lib/licensing/sms.ts`. The moment we see HTTP 419 OR a body
matching `/fraudulent/i` (or the related `/account.*suspend/i`,
`/account.*block/i` patterns) we flip a module-level flag and
short-circuit every subsequent `sendMnotifySms()` call in the same
Node process. The error returned to the audit log carries a clear
admin-facing message: "SMS provider disabled this session — mNotify
account flagged (HTTP 419 / 'fraudulent'). Call mNotify support at
0541509394 or email support@mnotify.com to clear the flag, then
restart ScriptureLive AI." Process restart automatically clears the
flag — no persistent state to corrupt. Other channels (notifyEmail,
notifyWhatsApp) are unaffected; payment-code creation continues
unblocked thanks to the existing try/catch in
`payment-code/route.ts`.

**Files**
- `replit.md`                                                                  (this changelog)
- `artifacts/imported-app/package.json`                                         (0.6.7 → 0.6.8)
- `artifacts/imported-app/BUILD.bat`                                            (banner)
- `artifacts/imported-app/src/components/views/ndi-output-panel.tsx`            (always-transparent + displayMode-aware lowerThird + iframe + restart deps)
- `artifacts/imported-app/src/components/layout/easyworship-shell.tsx`          (header NDI toggle: always-transparent + displayMode-aware)
- `artifacts/imported-app/src/app/api/output/congregation/route.ts`             (decouple ltTransparent from FORCE_TRANSPARENT)
- `artifacts/imported-app/src/lib/licensing/sms.ts`                             (419/fraudulent circuit breaker)

## v0.6.7 — HOTFIX: v0.6.6 Settings page crash (Apr 2026)

**Critical regression in v0.6.6.** Operator reported that opening Settings
showed Chromium's "This page couldn't load — Reload to try again, or go
back" page, with no in-app chrome — the entire BrowserWindow had crashed.
Settings (`src/app/page.tsx` line 64) renders `<SettingsView />`
(`src/components/views/settings.tsx`), which at line 733 mounts
`<NdiOutputPanel />`. The v0.6.6 patch to that panel added a `useRef` and
two new `useEffect` calls but placed them AFTER the existing
`if (!desktop) return <Card>...` early return at line 89. In Electron
the `desktop` bridge is undefined for the very first render (preload IPC
hasn't landed yet) and becomes defined a tick later — so the hook count
jumped from 0 → 3 between two renders, React aborted with
"Rendered more hooks than during the previous render", and the renderer
process crashed. Chromium's default error page took over the whole
window, which is what the operator saw the first time they tried to
open Settings on v0.6.6.

**Fix:** moved the `useRef` + both `useEffect` blocks to BEFORE the
`if (!desktop)` early return so they run unconditionally on every render.
The effect bodies still guard with `if (!isRunningForEffect || !desktop)
return` so the restart-on-toggle behaviour only fires when NDI is
actually broadcasting in Electron — exactly the same runtime semantics
as v0.6.6, just without the hook-order violation. `isRunningForEffect`
(computed from `status?.running`) is now declared above the early
return; the original `isRunning` and `ndiOk` locals below the early
return alias to it so the rest of the file is unchanged.

**Files**
- `replit.md`                                                                  (this changelog)
- `artifacts/imported-app/package.json`                                         (0.6.6 → 0.6.7)
- `artifacts/imported-app/BUILD.bat`                                            (banner)
- `artifacts/imported-app/src/components/views/ndi-output-panel.tsx`            (hooks moved before early return)

## v0.6.6 — NDI transparency root-cause + admin SMS + uninstall-first prompt (Apr 2026)

**T601 — Update dialog: release notes filter + uninstall-first prompt.** `update-dialog.tsx` `summariseReleaseNotes()` now drops lines whose first word is `ADMIN:` (or `[admin]` / `internal:`) so customers don't see internal changelog items. Below the notes block the dialog renders a red "Important — uninstall first" banner explaining that installing on top of the existing version may fail, plus an "Open Windows Apps page (uninstall first)" button. The button calls a new `desktop.app.openUninstall()` preload bridge, which fires an `app:open-uninstall` IPC handler in `electron/main.ts` that runs `shell.openExternal('ms-settings:appsfeatures')` on Windows (no-op on other OSes). Activation, library, and admin-config files in `%USERPROFILE%\.scripturelive\` are preserved across reinstalls so the operator's MoMo configuration survives the round-trip. The auto-uninstall NSIS-hook approach the operator originally requested was rejected because uninstalling the running .exe would trash a freshly-generated MoMo payment ref; manual prompt + one-click Settings open is the safer flow.

**T602 — SMS to admin when payment reference code is generated.** Pre-v0.6.6 the admin only learned about a pending MoMo payment by checking email or opening the admin panel; the operator wanted a phone-buzz so they can keep watch for the matching deposit. New `ADMIN_NOTIFICATION_PHONE = '0246798526'` constant in `lib/licensing/plans.ts` (distinct from `MOMO_RECIPIENT.number = '0530686367'` and `NOTIFICATION_WHATSAPP` which are customer-facing) plus a `getEffectiveAdminPhone()` helper that consults a new `RuntimeConfig.adminPhone` admin override before falling back to the compiled default. `/api/license/payment-code/route.ts` now fires both `notifySms({to: adminPhone, body: …})` (mNotify gateway) AND `notifyEmail({to: adminEmail, …})` immediately after `createPaymentCode()` succeeds. Both calls are wrapped in their own try/catch — gateway failures must NOT block the customer's payment-code creation. Body format: `"ScriptureLive: new payment ref XXX for {planLabel} (GHS {amount}). Customer {email}/{whatsapp}. Confirm in admin panel once MoMo deposit lands."`

**T603 — NDI lower-third actually transparent (CRITICAL ROOT CAUSE).** Wirecast/vMix/OBS receivers showed a full opaque black frame with text floating on it instead of an alpha matte, even after the v0.6.3/v0.6.4/v0.6.5 page-level CSS work. **Root cause:** `ndi-output-panel.tsx` line 120 (and `easyworship-shell.tsx` line 221, the auto-start path) called `desktop.ndi.start({name, width, height, fps})` — they NEVER passed `layout: 'ndi'`, `transparent`, or `lowerThird`. So `electron/main.ts` defaulted to `layout = 'mirror'`, the entire `if (layout === 'ndi')` transparency block (which sets `params.set('transparent','1')` and forwards it to FrameCapture's `transparent: true` BrowserWindow construction) was skipped, and the offscreen Chromium window was always created with `transparent: false, backgroundColor: '#000000'`. Page-level transparent CSS never had a chance — the underlying compositor surface itself was opaque. Fix: both call sites now read `ndiLowerThirdTransparent` and the projector's shared `lowerThirdPosition` from the store and pass the full `{layout: 'ndi', transparent, lowerThird: {enabled:true, position}}` object. `electron/preload.ts` already had the `NdiStartOptions` type extended; the new module-level `frameCaptureFlags` tracker in `main.ts` lets the ndi:start short-circuit detect operator-toggled changes (transparent ON → OFF while broadcasting) and rebuild the BrowserWindow instead of bailing on the source/geometry/fps-only equality check that pre-v0.6.6 silently consumed every restart. New `app:open-uninstall` IPC handler is sibling to this work.

**T603-bis — NDI restart-on-toggle while broadcasting.** Operator complaint that the Transparent toggle "did nothing while NDI was on the air" was the short-circuit above. New `useEffect` in `ndi-output-panel.tsx` watches `[isRunning, desktop, ndiLowerThirdTransparent, lowerThirdPosition]` and calls `desktop.ndi.start(...)` again with the new flags whenever those change while running, guarded by a ref so the initial mount records-then-skips (no spurious restart on the first paint after Start). Combined with the extended main.ts equality check, the rebuild now actually fires, FrameCapture tears down the opaque BrowserWindow, and a new transparent one comes up within a frame.

**T604 — NDI preview ↔ NDI output settings parity.** The in-app live preview iframe in `ndi-output-panel.tsx` loaded `/api/output/congregation?ndi=1` only — it never passed `?transparent=1`, `?lowerThird=1`, or `?position=`. So when the operator flipped the lower-third on, the BrowserWindow rendered the band but the preview iframe kept showing full-screen — the exact "preview ≠ output" mismatch in the operator's video. Fix: iframe `src` now interpolates the same query string the BrowserWindow's capturePath uses (`ndi=1&lowerThird=1[&transparent=1][&position=top]`), and a `key={…}` attribute forces a reload whenever the flags change so the next paint shows the new mode. Operator drags the toggle, both surfaces flip in lockstep.

**Files**
- `replit.md`                                                                  (this changelog)
- `artifacts/imported-app/package.json`                                         (0.6.5 → 0.6.6)
- `artifacts/imported-app/BUILD.bat`                                            (banner)
- `artifacts/imported-app/electron/main.ts`                                     (T603 short-circuit + flags tracker, T601 IPC handler)
- `artifacts/imported-app/electron/preload.ts`                                  (T601 desktop.app.openUninstall)
- `artifacts/imported-app/src/components/providers/update-dialog.tsx`           (T601 admin filter + uninstall banner+button)
- `artifacts/imported-app/src/components/views/ndi-output-panel.tsx`            (T603 ndi.start opts, T603-bis useEffect, T604 iframe parity)
- `artifacts/imported-app/src/components/layout/easyworship-shell.tsx`          (T603 auto-start opts)
- `artifacts/imported-app/src/lib/licensing/plans.ts`                          (T602 ADMIN_NOTIFICATION_PHONE + getEffectiveAdminPhone)
- `artifacts/imported-app/src/lib/licensing/storage.ts`                        (T602 RuntimeConfig.adminPhone)
- `artifacts/imported-app/src/app/api/license/payment-code/route.ts`           (T602 SMS+email notifications)

## v0.6.5 — Six operator-facing fixes (Apr 2026)

Patch release that closes the six follow-on items from operator testing on top of v0.6.4: the legacy MoMo number 0246798526 had to be retired and replaced with 0530686367 baked into the defaults, the subscription-modal NOTE block was the wrong colour and used a hardcoded phone (so admin edits to the MoMo number did not propagate to the WhatsApp escalation line), the two activation boxes (top "Activation Code" + bottom "Generated & Master Code") accepted any code class and silently failed with a generic "code not recognised" when the operator pasted into the wrong one, the Transparent NDI toggle dropped the lower-third card background but left body/#stage/#output opaque so vMix/OBS receivers still saw a black matte, the NDI lower-third was capped at max-width 68rem and rendered as a centered narrow card with broadcast-bar bands either side ("frame A") instead of the full-width band the operator needed ("frame N"), and the Voice Control + Speaker-Follow toggles read as inert because operators were flipping them with the microphone stopped (the toggles only affect transcript-derived behaviour). Cross-install propagation of admin overrides to ALREADY-installed copies still requires a hosted backend and is deferred to v0.6.6.

**T501 — Bake new MoMo default (0246798526 → 0530686367).** `MOMO_RECIPIENT.number` and `NOTIFICATION_WHATSAPP` in `lib/licensing/plans.ts` switched to the new number with a v0.6.5 banner comment. Admin-modal placeholder on line 718 swapped so a fresh install with no overrides shows 0530686367 in every surface. The `RuntimeConfig.momoNumber` admin override pipeline (`/api/license/admin/config` + `getEffectiveMoMo()`) is unchanged — admins can still point at a different number per-install; this fix is just the new factory default.

**T502 — NOTE block restyled red + dynamic phone.** `subscription-modal.tsx` re-themed the NOTE container from emerald (border-emerald-500/30, bg-emerald-950/20, text-emerald-200/90) to red (border-red-500/40, bg-red-950/30, text-red-100). Lines 372–373 had two hardcoded `0246798526` literals on the WhatsApp-escalation sentence that survived the T501 default swap because the modal interpolated them as static strings; they now read `{payment.momoRecipient.number}` so the rendered number tracks both the bake-in default AND any admin override. The "Failure to use it may result in loss of funds" warning was promoted from `text-[10px] text-amber-300/90` to a `text-[12px] text-red-200` line wrapped in `<strong className="font-bold">` and given a red ring container so it can't be missed at the screenshot stage.

**T503 — Code-class cross-rejection.** Pre-v0.6.5 either activation box accepted any valid code, so customers routinely pasted a master/generated code into the top "Activation Code after payment" box (or vice versa) and got a confusing "code not recognised" error indistinguishable from a typo. New `peekActivationSource(code)` helper in `lib/licensing/storage.ts` classifies any stored code as `'master' | 'paid' | 'standalone' | 'unknown'` (paid = `generatedFor.paymentRef` set, standalone = admin-issued generic, master = SL-MASTER-* prefix). The activate route now accepts an optional `expectedType: 'activation' | 'master'` body field; when present it does both a prefix check (catches SL-MASTER-* codes that don't even exist in storage yet) AND a storage classify, and rejects up front with a precise message that names the OTHER box ("This is a master/generated code. Use the bottom box…" / "This is a paid activation code. Use the top box…"). The two `submitActivation()` call-sites in subscription-modal pass `'activation'` and `'master'` respectively; the legacy "code not recognised" fallback fires only for genuine typos so error messages don't lie about which box was wrong.

**T504 — Transparent NDI lower-third actually transparent.** The renderer already dropped the `lt-box` gradient + shadow when `ndiLowerThirdTransparent` was on, but `body`, `<html>`, `#stage`, and `#output` stayed at solid `#000` — so the in-app NDI preview AND any opaque NDI receiver still saw a black bar where the matte should have been alpha. Inside the lower-third render branch the four ancestor backgrounds now flip to `transparent` when `ltTransparent === true` and reset to `#000` when it goes back off, so toggling doesn't permanently bleach the surface. Mirrors the existing FORCE_TRANSPARENT bootstrap block at line 184 but inside the per-render path so admin toggles apply live without a window reload.

**T505 — NDI lower-third full-width ("frame N").** The `.lt-box` rule was `max-width:68rem` which rendered the broadcast band as a centered ≤1088px card with black bands either side at 1920px+ (image 3 "frame A"). Added two CSS rules — `.lower-third.ndi-full{padding:0 2%}` (gutter tightened from the inherited 6%) and `.lt-box.ndi-full{max-width:none;border-radius:.75rem}` — and the render path appends `' ndi-full'` to both classes when `IS_NDI === true`. In-room projector + operator preview keep the centered ≤68rem card because they don't receive the class; only the NDI surface gets the full-width broadcast band so verse text reads at broadcast distance.

**T506 — Voice Control + Speaker-Follow clarity hint.** Operator complaint that the two toggles "don't apply to detection" was actually that both features observe the live transcript stream — with the microphone stopped the transcript is empty so neither voice-command recognition nor speaker-follow ever fires. Toggles ARE wired (speech-provider gates command recognition on `voiceControlEnabled` line 687, speaker-follow effect gates on `speakerFollowEnabled` line 1066); no behavioural change needed. Added an italic amber banner under the section title: "Both features only act while the microphone is running. Start the mic on the Live tab (Start Listening) — the toggles below flip the behaviour, but the mic must be on for either to do anything." Makes the dependency explicit so operators stop assuming the toggles are broken.

## v0.6.4 — Five operator-facing fixes (Apr 2026)

Patch release that closes the next five follow-on items from operator testing on top of v0.6.3: the global theme toggle was still pinned dark by a leftover `dark` class on the new logos shell, the admin "Generate Activation Code" inputs refused clicks/typing, success notifications were rendered with a red "Error:" prefix, the NDI lower-third had no operator-tunable size control (preview/output looked different sizes on small viewport panels), and the smart-Bible voice-detection still required a click on HIGH-confidence semantic matches.

**T401 — Theme actually global (round 2).** The v0.6.3 fix replaced the hardcoded `dark` class on `easyworship-shell.tsx`, but the codebase had since renamed that component to `logos-shell.tsx` and re-introduced the same `bg-[#0a0d14] text-foreground dark` literal on its outermost div. That `dark` class force-pinned dark mode on the whole console regardless of the next-themes html.dark class, so toggling Light in Settings only flipped the Settings panel itself. Replaced with `bg-background text-foreground` on the shell wrapper; the projection containers (preview/live slide canvas) still use `bg-black` because they simulate the actual second-screen output and should stay black in both themes.

**T402 — Admin "Generate Activation Code" inputs accept clicks/typing.** Operators reported every input field in the violet Generate Activation Code section was unclickable — cursor never landed, keypresses went to the parent dialog. Root cause: the section was rendered as a bare `<div>` inside a Radix Dialog with sibling form-styled cards above and below, and the absent `<form>` boundary plus missing `htmlFor`/`id` pairs meant Radix's focus-trap routed every click to the first focusable ancestor (the Dialog's close button). Fix wraps the entire section in `<form onSubmit>`, adds matching `htmlFor`/`id` on every label+input pair (gen-plan, gen-months, gen-days, gen-hours, gen-minutes, gen-note, gen-email, gen-whatsapp), sets explicit `pointerEvents:auto` on the section and `cursor-text` on the inputs, and switches the action button to `type="submit"` so Enter also triggers generation.

**T403 — Stop labeling successful sends as errors.** `admin-modal.tsx` rendered a hard-coded red "Error: {n.error}" line for every notification record that had a non-empty `error` field — but the backend uses that same field to store *success* info ("queue=17284... · SMTP OK · {…}", "mNotify OK · …"). The notification feed was therefore showing every successful test SMS as a red error. Fix inspects `n.status` and labels as "Info:" (emerald) when status is `sent`, "Error:" (rose) only when status is `failed`. The text in the field is the same audit string, just colour-coded correctly.

**T404 — NDI lower-third scale slider.** The NDI Preview iframe in the operator panel always renders at the same URL the Electron capture window loads, so they were already pixel-identical at the source — the perceived "preview ≠ output" was actually that operators wanted the broadcast bar to be a different size from the in-room one (smaller for vMix overlay work, bigger for full-screen NDI). New `ndiLowerThirdScale: number` field on AppSettings (default `undefined` ⇒ effective 1.0× so existing setups don't shift). Wired through store → output-broadcast settings type → output-broadcaster SSE → congregation render route, where the lower-third `ltBand`/`ltCap`/`ltMin` (the band height + clamp() rems that drive verse and reference font sizes) are multiplied by the scale ONLY when `IS_NDI=true` — the in-room projector and operator preview stay at 1× regardless. New range slider (0.5×–2.0×, 0.05 step) appears under the Transparent toggle on the NDI Output panel when display mode is lower-third, with a Reset link and a current-value readout. The settingsRenderKey hash includes the new field so the captured NDI window re-renders the moment the operator drags it.

**T405 — Smart Bible voice-detection auto-display.** The semantic matcher already correctly identified the failing v0.6.3 example ("Since the day of John the Baptist…") as Matthew 11:12 with score 0.81 (HIGH bucket), but `scripture-detection.tsx` always rendered HIGH matches as a click-to-send "suggestion chip" instead of pushing live the way the spec requires. New `aiAutoSendOnHigh: boolean` setting (default true). When the AI suggestion lands with `confidence === 'high'` AND the operator has Auto Go-Live on AND AI Auto-Send on, a guarded effect calls `sendAiSuggestionLive()` automatically with a `lastAutoSentRef` ring so the same reference can't fire twice in a row even if a fresh transcript tick re-surfaces it (ref resets when the operator stops listening). New "AI Auto-Send" pill toggle appears next to Auto Go-Live (only when Auto Go-Live is on, since AutoSend is a child option) — sermon-prep users can switch it off. The MEDIUM threshold also dropped from 0.55 to 0.50 in `semantic-matcher.ts` so more paraphrased verses surface as the suggestion chip; HIGH stays at 0.75 so auto-display only fires on near-verbatim matches. Popular-verses seed is at 335 (≥300 spec target).

## v0.6.3 — Seven operator-facing fixes (Apr 2026)

Patch release that closes seven follow-on items from the v0.6.2 round of operator testing: a sub-day activation-precision bug, a hardcoded dark-shell that defeated the global theme toggle, a missing NDI transparent-lower-third toggle, faded bible references on every surface, the NDI Preview/Output drift, the SMS gateway migration from Arkesel to mNotify, and a deliverability sweep on the customer activation email.

**T301 — Activation-time precision bug.** Sub-day activation codes were getting inflated to 1 day. Root cause: the admin generate route reduced everything to a `days` integer via `partsToDays()` (which rounds UP — necessary for legacy display columns), and `activateCode()` then computed expiry as `days × 86_400_000`, so a 20-minute code minted at 09:00 expired at 09:00 the *next* day instead of 09:20. Fix splits the two concerns: `ActivationCodeRecord` and `ActiveSubscription` gain an optional `durationMs` field carrying the EXACT ms; `/api/license/admin/generate` now computes `totalMs = months×30d + days×24h + hours×1h + minutes×60s` and passes BOTH the rounded `days` (kept for admin lists, CSV exports, legacy display) AND the precise `durationMs` to `generateStandaloneActivation()`. `activateCode()` prefers `durationMs` when present, falls back to `days*86400000` for pre-v0.6.3 records (so historical codes activate identically). Customer-facing email + SMS body now humanise the duration via `formatTotalAsDhmString()`, so a 20-minute code reads "20 minutes" instead of "1 day(s)".

**T302 — Theme actually global.** `easyworship-shell.tsx` (the root container that wraps the entire app shell) had a hardcoded `bg-black text-zinc-100 dark` on its outermost div, forcing dark theme regardless of ThemeProvider state — toggling theme via the toolbar pill flipped the Radix primitives but the shell behind them stayed pitch black. Replaced with `bg-background text-foreground`; the `next-themes` `html.dark` class now drives every surface, persists across restarts via `storageKey: "scripturelive-theme"` (already configured in v0.6.0).

**T303 — NDI lower-third transparent toggle.** vMix / OBS operators consuming the NDI feed were complaining that the lower-third bar shipped with a gradient card + drop shadow they couldn't key out. New `ndiLowerThirdTransparent: boolean` field on `AppSettings` (default `false`); toggle UI on the NDI Output panel, conditionally rendered only when `ndiDisplayMode === 'lower-third'` (avoids confusion when the operator is in full-screen or letterbox mode). When ON, the congregation route emits a `.lt-box.transparent { background: transparent !important; box-shadow: none !important; }` CSS rule and binds the class via `IS_NDI && (FORCE_TRANSPARENT || st.ndiLowerThirdTransparent === true)` — gated by `IS_NDI` so the in-room projector card never goes transparent unintentionally. Forwarded through `OutputState.settings` and the SSE `settingsBlock` so the in-app NDI Live Preview iframe and every downstream NDI receiver flip in lockstep.

**T304 — Bible reference text bold default.** Operator complaint: "the chapter:verse line is so faded I can't read it on the projector during a bright service." The v0.6.2 stylesheet shipped `.slide-reference { font-weight: 500; opacity: 0.55 }` and `.lt-box .slide-reference { opacity: 0.7 }` — too quiet for a bright sanctuary. Both selectors in `app/api/output/congregation/route.ts` now use `font-weight: 700; opacity: 1`. Applies to every surface — live display, lower-third, and NDI — because they all share the single render engine in that route.

**T305 — NDI Preview ≡ NDI Output (pixel-match).** Verified the Electron NDI capture window (`electron/main.ts` line 1447) and the in-app NDI Live Preview iframe (`ndi-output-panel.tsx` line 603) both already load `/api/output/congregation?ndi=1` — same render code path, same render engine, no drift. The new `?transparent=1` URL flag (FORCE_TRANSPARENT) is accepted on both surfaces, so flipping the T303 toggle re-loads the in-app preview with the same transparent flag the capture window receives. No code changes needed for this item.

**T306 — mNotify SMS migration (replaces Arkesel).** Operator clarification: the Ghana SMS gateway is mNotify (`https://developer.mnotify.com/`), NOT Arkesel as the v0.5.x integration assumed. New `src/lib/licensing/sms.ts` targets `POST https://api.mnotify.com/api/sms/quick?key=KEY` with body `{recipient:[E164], sender:'ScriptureAI', message, is_schedule:'false'}`. Sends `?key=` AND `Authorization: Bearer KEY` so whichever auth mode the mNotify account is configured for, the request authenticates. Phone normalisation: leading `0` → `233`, `+`/space-strip; preserves non-Ghana E.164 verbatim (in case the operator runs the same install for an international customer). Retries ONCE on transient failure with a 1s back-off; persistent failure returns a structured error the admin panel surfaces (no silent swallowing). `baked-credentials.ts`: `BAKED_SMS_API_KEY=5ZJmQCAJ05RcLx9EbIZoBhwfm`, `BAKED_SMS_SENDER=ScriptureAI`. The old `sendArkeselSms` export is kept as a back-compat alias so any straggler import keeps compiling and logs a deprecation note the first time it's hit.

**T307 — Email deliverability hardening.** Customer activation emails were occasionally landing in spam at Gmail and Outlook 365. `notifications.ts` `sendEmailViaSmtp()` now sends **multipart text + html** alternatives (the new `plainTextToHtml()` helper produces a minimal escape-and-link HTML — no marketing styling because that triggers another set of filters), adds **Reply-To** (so the customer's reply goes back to the operator's inbox, not the SMTP envelope), **X-Entity-Ref-ID** (per-message UUID prevents Gmail from collapsing repeat sends into a single thread), **List-Unsubscribe + List-Unsubscribe-Post** (RFC 8058 — reduces spam-folder placement at Gmail and O365). The SMTP **queue-id** is plucked from the `response` line and surfaced as a top-level field on the `NotificationRecord` audit string (`"queue=17284... · SMTP OK · {…}"`) so the operator can paste it straight into a Gmail / Outlook delivery-search query without scraping logs. Verified at runtime — startup test email log shows `queueId: 'd2e1a72fcca58'` and `refId: 'slai-moicrgex-n9u4zp'` exactly as expected.

## v0.6.2 — Five operator-facing fixes (Apr 2026)

Patch release that closes five operator-facing fixes shipped together: settings layout, NDI broadcast wiring, admin code-generator UX, real SMTP/SMS delivery, and an actual app-wide dark/light theme.

**T201 — Settings page back to a single column.** The two-column XL layout introduced in v0.6.0 (`xl:grid-cols-2` plus `[&>:first-child]:xl:col-span-2`) was making the right-hand cards (Output, NDI, About) hide off-screen on the operator's laptop. The grid container in `components/views/settings.tsx` now stays at `max-w-4xl` and never splits, so every card stacks one above the other at every breakpoint.

**T202 — NDI settings actually broadcast to the renderer + receivers.** `output-broadcaster.tsx` `buildPayload()` previously only forwarded `ndiDisplayMode` through the SSE settingsBlock, which meant every other NDI-tab control (font, text size, shadow, alignment, scale, aspect ratio, bible color/lineheight, reference style/position/scale, translation, custom background, theme, lower-third positioning, reference-on-output toggle, reference text shadow) was effectively dead — the operator could click anything in the NDI tab and the in-app NDI Live Preview iframe + every downstream NDI receiver kept rendering against the Mirror-Live defaults. The settingsBlock now forwards all 18 `ndi*` fields through a single `sExt` index-signature view onto AppSettings (the underlying store types `ndi*` loosely; we cast once at the top of `buildPayload` to keep TypeScript honest without weakening the strict AppSettings shape elsewhere).

**T203 — Activation-code generator: Months input.** The `/api/license/admin/generate` endpoint already accepted `{days, hours, minutes}` from 1 minute up to 36 500 days, but the admin UI only exposed Days/Hours/Minutes — operators selling a 6-month or 12-month gift code had to compute 180 / 360 by hand. The CUSTOM grid in `admin-modal.tsx` is now four equal cells (Months / Days / Hours / Minutes) with a new `genMonths` state that converts to days client-side (months × 30) and adds to whatever is already in the Days slot before posting. Backend is unchanged — it still receives a single `days` number.

**T204 — Real SMTP + Arkesel SMS delivery.** Three regressions found while reproducing the operator's "customer email never arrives" complaint: (a) `BAKED_MAIL_FROM` was a bare address — Gmail silently dropped any message whose envelope From did not parse as RFC 2822, so `baked-credentials.ts` now ships `MAIL_FROM` as `"ScriptureLive AI" <nanvilow@gmail.com>` and `notifications.ts` adds `normalizeMailFrom()` that wraps any bare value passed in via env. (b) `/api/license/admin/confirm` had no customer-email path at all in v0.6.1 — it sent the owner notification + the customer SMS but the customer email step was simply missing from the route; the route now sends the customer email when `payment.email` is present, with the same `renderActivation()` template used by the public `/confirm` flow. (c) Notification records were collapsing every SMTP / Arkesel failure to `status: 'pending'` with no error context, so the admin "Delivery: live" badge stayed green while real deliveries failed; `notifyEmail`/`notifySms` now stitch the real SMTP envelope (accepted/rejected/messageId/response, plus error.code/response/responseCode on failure) and the raw Arkesel JSON body into the NotificationRecord, and a new `admin/generate` auto-delivery path mints the code and immediately calls `notifyEmail`+`notifySms` with whatever contact details the admin entered.

**T205 — Real app-wide dark/light theme.** ThemeProvider + CSS variables + ThemeToggle were already wired in v0.6.0 but only the Radix UI primitives (button, card, dialog) actually honoured them — the entire shell, library, modals and panels were hardcoded against `bg-zinc-950` / `bg-zinc-900` / `text-zinc-100` / `border-zinc-800` etc., so toggling theme was a no-op for ~95% of the visible surface area. Bulk swap across 15 files (shell + library + 4 license modals + 7 views + `app/page.tsx` + `sidebar-nav`) replaces the hardcoded tokens with semantic equivalents: `bg-zinc-950 → bg-background`, `bg-zinc-900 → bg-card`, `bg-zinc-800/700 → bg-muted`, `text-zinc-100..300 → text-foreground`, `text-zinc-400..600 → text-muted-foreground`, `border-zinc-700..900 → border-border`, `ring-zinc-* → ring-border`, `hover:bg-zinc-* → hover:bg-muted`, `hover:text-white → hover:text-foreground`. Opacity suffixes (`/40`, `/60`, `/80`) are preserved by the regex. Projector-side files (`app/congregation`, `app/stage`, `components/output`, `components/slides`, `components/presenter/slide-renderer`, `components/settings/output-preview`) and the Minimal projector theme preset (`from-zinc-950 to-neutral-950`) are intentionally left alone — the projector background is operator-controlled and must not flip when the app theme changes. The toolbar `ThemeToggle` (already mounted in `easyworship-shell.tsx` at the right edge of the top bar) now actually paints the whole app, and the choice persists across restarts via `next-themes` `storageKey: "scripturelive-theme"`.

## v0.6.1 — Three v0.6.0-deferred polish items + 200 more seed verses (Apr 2026)

Patch release that closes the three image-dependent items the operator could not attach during the v0.6.0 session, plus a substantial expansion of the AI semantic-matcher seed-verse corpus. No new product surfaces — this is purely follow-through on items 3, 7, 9 of the original Case 2 batch and Case 1's "expand to 300+ verses" target.

**Item 3 — STEP 3 activation entry relocated PHASE 2 → PHASE 1.** In `subscription-modal.tsx` the two activation-code slots (regular customer-code slot + master/generated-code slot) used to live in PHASE 2 (post-plan-pick), forcing every customer with an existing code to first pick a plan they did not need. Per the operator's annotated screenshot (red box drawn directly into the empty grid space next to the 1-Year tile), both slots now sit in their own bordered panel below the plan grid in PHASE 1 — visually filling that empty space and bypassing the plan picker for renewal/master/generated codes. PHASE 2 keeps a one-line hint pointing the operator back to PHASE 1 via the "Change" pill if they need to enter a code mid-pay.

**Item 7 — Speaker Notes + Quick Announcement removed.** The "Stage Display Controls" card on the NDI output page (`ndi-output-panel.tsx`) hosted two operator-facing surfaces — a Speaker Notes editor that pushed text via SSE to `/api/output/stage` and a Quick Announcement template picker — that the operator confirmed are not used in their workflow (announcements come from the main Library; speaker notes from the Bible deck). The `<StageDisplayControls />` mount was removed from `ndi-output-panel.tsx`, the source file `src/components/views/stage-display-controls.tsx` was deleted entirely, and the matching `<div class="panel notes">…Speaker Notes…</div>` block was stripped from the stage-output HTML in `src/app/api/output/stage/route.ts` so the live stage preview no longer renders an empty notes panel.

**Item 9 — Toolbar pills recolored to the blue/gold theme.** Per the operator's annotated screenshot, the green "AI Active" pill in the TopToolbar clashed with the rest of the brand (which leans blue + gold). `license-button.tsx` swaps the active-state pill from `bg-emerald-600 / border-emerald-400/40` to `bg-sky-600 / border-sky-300/50` — a calm tech-blue that reads as "active service" without competing with the trial-state amber pill. The NDI ON-AIR button in `easyworship-shell.tsx` (NdiToggleButton) drops its red on-air styling (`bg-red-600/20 / text-red-200 / border-red-600` + red dot + red glow) for an amber-gold equivalent (`bg-amber-500/25 / text-amber-200 / border-amber-500` + amber-400 dot + amber glow), matching the gold accents already used elsewhere. Trial-state pill (gold) and expired-state pill (red, kept for urgency signaling) are unchanged.

**Case 1 — Seed-verse corpus expanded 135 → 335.** The original `src/lib/ai/popular-verses.ts` shipped with 135 hand-picked KJV verses — enough to demo the semantic-matcher at launch but visibly thin in operator testing (preachers consistently quote Old-Testament narrative, the full Beatitudes, all of 1 Corinthians 13, Hebrews 11, etc., none of which were in the seed). v0.6.1 appends a 200-verse expansion block organized by book — Genesis (5), Exodus/Leviticus/Numbers (8), Deuteronomy (3), Sam/Kings/Chron/Nehemiah (8), Job (3), Psalms (28 deeper picks across 8/16/18/19/23/27/30/32/34/37/42/55/56/62/73/84/90/91/100/103/118/119/127/133/139/145/147), Proverbs (10), Ecclesiastes/Song (2), Isaiah (10), Jer/Ezek/Dan (4), Joel/Hab/Zech/Mal (4), Matthew (21 — full Beatitudes + Lord's Prayer expanded + Great Commission), Mark/Luke (9), John (13), Acts (2), Romans (10 — full Romans 8/10/12), 1 Corinthians (5 — full love chapter), 2 Cor/Gal/Eph (11), Phil/Col (6), Thess/Tim/Titus (8), Hebrews/James (9), 1-2 Peter / 1-3 John / Jude (9), Revelation (6). All retain the existing `{ reference, book, chapter, verseStart, text }` shape so `semantic-matcher.ts` consumes them unchanged — the cache simply embeds 335 vectors instead of 135 on the next warm-up. Cold-start embedding cost roughly doubles (still sub-second on `text-embedding-3-small` batched at 100/request) and per-phrase match latency is unchanged because cosine similarity scales linearly with corpus size and 335 vectors is still trivial. Full-KJV embedding (~191 MB raw, ~31k vectors) remains a separate follow-up task — operator-approved as out of scope for v0.6.1.

**Files (this release).** Deleted: `src/components/views/stage-display-controls.tsx`. Modified: `src/components/views/ndi-output-panel.tsx` (drop StageDisplayControls import + mount), `src/app/api/output/stage/route.ts` (drop Speaker Notes panel), `src/components/license/license-button.tsx` (sky pill), `src/components/layout/easyworship-shell.tsx` (amber NDI), `src/components/license/subscription-modal.tsx` (STEP 3 relocated), `src/lib/ai/popular-verses.ts` (135 → 335 verses), `package.json` (0.6.0 → 0.6.1), `BUILD.bat` (banner v0.6.1), `replit.md` (this block).

**Architect-review fixes (folded into the same v0.6.1 tag).** Two regressions were caught during the post-build code review and folded into the same v0.6.1 tag (re-tagged to commit them through the same cloud build). (a) `src/app/api/output/stage/route.ts` — removing the `<div class="panel notes">` block left the inline `render()` JS still calling `$('notes').textContent = …`, which threw on every SSE message and silently skipped the subsequent `meta` / live-dot / live-label updates because the surrounding `try/catch` swallowed the error. The stale write is now removed alongside the now-unused `.notes pre{…}` CSS rule and the comment header was tidied (drop "sermon notes" from the file's purpose blurb). (b) `src/components/license/subscription-modal.tsx` — `submitActivation()`'s catch branch unconditionally set `phase='payment'`, so a failed activation from PHASE 1 (no plan picked) would leave the modal blank because PHASE 2's render is gated by `phase === 'payment' && selected`. The catch now restores the original phase via `selected ? 'payment' : 'plans'`, captured before the `'activating'` transition, so the operator sees their error inline on whichever screen they came from.

---

## v0.6.0 — AI semantic Bible verse matching + 11-item operator polish (Apr 2026)

Major minor-version bump (0.5.x → 0.6.0) reflecting the addition of the **AI semantic verse matcher** (Case 1) on top of an 11-item operator follow-up batch (Case 2). All work consolidated into one release per operator request: *"one big v0.6.0 release."*

**Case 1 — AI Semantic Bible Verse Matching (the headline feature).** The regex matcher in `bible-api.ts` only fires when the operator literally speaks a `Book chap:verse` token (e.g. *"turn to Romans eight twenty-eight"*). Operators consistently miss verses when the preacher PARAPHRASES (*"all things work together for good for those who love God"*) without naming the reference. v0.6.0 adds an OpenAI `text-embedding-3-small` (1536-dim, cheap, batched) semantic matcher that runs alongside the regex path. New module `src/lib/ai/semantic-matcher.ts` lazily embeds a curated set of ~120 popular KJV verses (`src/lib/ai/popular-verses.ts`) on the first warm-up request, caches the vectors in-process for the lifetime of the Next.js worker, then computes cosine similarity between any incoming transcript phrase and every cached vector. Confidence buckets per the operator brief: **>0.75 high** (auto-suggest), **0.55–0.75 medium** (operator-confirm chip), **<0.55 ignore**. New endpoint `src/app/api/scripture/semantic-match/route.ts` exposes `POST { text, topK }` (top-K matches with `{reference, text, score, confidence}`) and `GET` (cache warm-up, paid up-front when the operator hits the detection page). Integration in `src/components/views/scripture-detection.tsx`: a `useEffect` watches `liveTranscript`, takes the LAST sentence, debounces 600 ms, fires the embedding call ONLY if the regex matcher missed it (regex matches are strictly preferred — they carry the operator's translation pick). The top match renders as a violet "AI Match · High/Medium confidence" suggestion chip beneath the Live Transcript card showing the reference + truncated KJV text + score. **Multi-translation mapping**: clicking *Send Live* on the chip re-fetches the verse via the existing `fetchBibleVerse(reference, selectedTranslation)` so a paraphrased KJV match still respects the operator's NIV/ESV/etc. preference (no re-embedding needed — the same verse reference resolves across all installed translations). Cache is process-local; cold-start latency on first phrase is ~250 ms (mitigated by warm-up GET on listening start).

**Case 2 — Eleven operator polish items.**

1. **Lock overlay copy.** All MoMo wording removed from `lock-overlay.tsx`; replaced with a generic *"Your activation has expired. Tap Activate to enter your code"* prompt — the payment instructions live exclusively in the Subscribe modal so the lock screen stays calm.
2. **Subscribe-modal payment NOTE.** Added the full operator-supplied warning paragraph (mention WhatsApp 0246798526) above the MoMo recipient block in `subscription-modal.tsx`. Identical copy block now lives in `notifications.ts` so the customer email + WhatsApp deep link carry the same warning text — no more divergent wording across surfaces.
3. **(Image-dependent — relocate UI element).** Deferred: operator could not attach the Imgur album images during this session. Marked as a v0.6.1 follow-up.
4. **Admin notifications stuck on "pending".** Root cause: `notifyEmail` / `notifySms` swallowed thrown provider errors and left the audit-log row at `pending`. Fix in `notifications.ts` — the catch block now writes `failed` with the trapped `error` string so every row resolves to `sent` or `failed`. The Admin → Notifications panel and the per-row Resend button (shipped v0.5.57) now both work as advertised.
5. **Activation duration display + admin sub-day codes.** New `src/lib/format-duration.ts` module exports `formatDaysHoursMinutes()` ("30 Days 12 Hours 45 Minutes Remaining"), `formatDaysHoursMinutesShort()` ("30d 12h"), and `partsToDays()` (rounds-up combiner). The license top-bar pill (`license-button.tsx`) now shows the compact form and the long form lives in the title tooltip. The Settings → License card replaces the bare integer "Days left" with the full `X Days Y Hours Z Minutes` readout. Admin `admin-modal.tsx` "Generate Code" form gains **Hours** (0–23) and **Minutes** (0–59) inputs alongside Days; the server (`/api/license/admin/generate`) folds all three parts into a single total via `partsToDays()` so codes like *"4 hours for tonight's rehearsal"* and *"3 days 12 hours"* are first-class.
6. **Trial defaults stop overwriting persisted operator settings.** Root cause: the Zustand store's persist hydration layered defaults OVER persisted state on every boot — so any setting the operator left on its default value was reset to the latest default on every install. Fix: `store.ts` `version` bumped 1 → 2 with a no-op preserve migration that layers defaults UNDER the persisted state (defaults reach fields the operator never touched; explicit choices survive). Trial / activation state is unaffected because licensing lives in `license.json` on the main process, not the client store.
7. **NDI panel redesign.** `ndi-output-panel.tsx` rewritten: removed the Advanced disclosure (every NDI control is now visible by default), restructured into a two-column layout — left = ALL controls (always visible), right = sticky 360-px-wide live preview iframe (mirrors what vMix/OBS sees). On narrow widths the columns collapse to a stack with the preview moved BELOW the controls so the operator-first ordering is preserved.
8. **(Image-dependent — remove section).** Deferred to v0.6.1 (operator could not attach Image 7).
9. **(Image-dependent — colour fix).** Deferred to v0.6.1 (operator could not attach Image 9).
10. **Dark / Light theme.** Added `next-themes` provider (`src/components/providers/theme-provider.tsx`), defined LIGHT and DARK token sets in `globals.css` (`.dark` class via `@custom-variant dark`), removed the hard-coded `dark` class from `layout.tsx`. New `theme-toggle.tsx` Sun/Moon button mounts in the TopToolbar next to the License pill. Preference persists via `next-themes` (system / light / dark). NDI preview, panels, buttons, and backgrounds all respond because every surface uses the CSS variables set in `:root` (light) and `.dark` (dark).
11. **Settings page two-column layout.** `settings.tsx` outer wrapper changed from `max-w-4xl space-y-6` to `max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 items-start [&>:first-child]:xl:col-span-2`. The License/Subscription card stays full-width at the top (primary "what's my plan" info above the fold); every subsequent settings card flows into a 2-column grid on `xl` screens, stacks on narrower widths.

**Files (this release).** New: `src/lib/format-duration.ts`, `src/components/providers/theme-provider.tsx`, `src/components/theme-toggle.tsx`, `src/lib/ai/popular-verses.ts`, `src/lib/ai/semantic-matcher.ts`, `src/app/api/scripture/semantic-match/route.ts`. Modified: `src/components/views/ndi-output-panel.tsx` (full rewrite — no Advanced + 2-col), `src/app/globals.css` (`:root` light + `.dark` dark + `@custom-variant dark`), `src/app/layout.tsx` (drop hard-coded `dark`, wrap in `<ThemeProvider>`), `src/components/layout/easyworship-shell.tsx` (mount `<ThemeToggle />`), `src/lib/store.ts` (persist v1→v2 preserve migrate), `src/components/license/license-button.tsx` (use `formatDaysHoursMinutesShort` + long-form title), `src/components/views/settings.tsx` (`formatDaysHoursMinutes` for time-remaining + 2-col grid wrap), `src/components/license/admin-modal.tsx` (Hrs/Min inputs + validation), `src/app/api/license/admin/generate/route.ts` (accept `hours`/`minutes` via `partsToDays`), `src/components/views/scripture-detection.tsx` (semantic-match warm-up GET + 600ms-debounced POST + AI suggestion chip + multi-translation send-live), `src/components/license/lock-overlay.tsx` (generic copy), `src/components/license/subscription-modal.tsx` (long warning + WhatsApp 0246798526), `src/lib/licensing/notifications.ts` (pending → failed), `package.json` (0.5.57 → 0.6.0), `BUILD.bat` (banner v0.6.0), `replit.md` (this block).

**Deferred to v0.6.1.** Items 3, 8, 9 in Case 2 — they reference Imgur album images that the operator could not attach during this session. Will reopen as soon as the operator pastes individual screenshots.

**Architect-review fixes (folded into the same v0.6.0 tag).** Two issues were caught during the post-build code review and folded into the same v0.6.0 tag (re-tagged to commit it through the same cloud build). (a) `scripture-detection.tsx` — the AI suggestion chip was not cleared on regex hits / stop-listening / empty transcript, so a stale chip could linger after the regex matcher took over. The semantic-match `useEffect` now `setAiSuggestion(null)`s in three new code paths: when `!isListening`, when `!liveTranscript`, and when the regex matcher has a match for the current phrase. The phrase-de-dupe ref is reset alongside so the next phrase is not skipped. (b) `ndi-output-panel.tsx` — the right-column wrapper used `order-first lg:order-last`, which on narrow widths placed the preview ABOVE the controls (contradicting the operator-first ordering). Changed to `lg:order-last` so on narrow widths the preview falls back to natural document order BELOW the controls.

## v0.5.57 — Operator follow-up: NDI separation, paywall copy, mic UX, lockdown (Apr 2026)

Seven operator items addressed in a single release. No new product surfaces — just polish, ergonomics, and one substantial separation of NDI from Live Display.

**Item #2 — Chapter navigator does not blank Live.** `library-compact.tsx`'s `previewVerseOnly` now also calls `s.setLiveSlideIndex(0)` whenever `isLive` is true, so the operator's ◀ / ▶ keys (and the on-screen chapter buttons) advance the live deck without the previous "clear → blank → re-stage" flicker.

**Item #3 — Paywall copy.** `lock-overlay.tsx` (the Activate-AI-Detection modal shown when trial expires or never activated) now embeds the new payment instruction directly in the subtitle: *"Send MoMo to Richard Kwesi Attieku · 0246798526"*. `plans.ts` `MOMO_RECIPIENT.number` was updated to match.

**Item #5 + #6 — Trial-end lockdown is now a hard kill.** Added a `licenseLocked` mirror to the Zustand store, written by an effect inside `<LicenseProvider>` that mirrors `isLocked` to the store. `<SpeechProvider>` (mounted ABOVE the license provider in the React tree, so it can't `useLicense()`) subscribes to the mirror; the moment lockdown fires it forcibly tears down BOTH the Deepgram and browser engines, clears interim/final transcripts, drops any pending speechCommand, and zeroes `isListening`. Result: the OS mic indicator goes dark within one render after the trial timer hits zero, no transcription bytes leave the machine after lock, and entering a valid key restores the full UI through normal license-provider re-render.

**Item #7 — Mic toolbar Popover auto-collapses.** `logos-shell.tsx` `LiveBottomAudioControls` gained controlled `micPopoverOpen` state; `startMic` / `stopMic` / `togglePause` now call `setMicPopoverOpen(false)` so the popover dismisses the moment the operator picks an action. Settled the long-standing operator complaint that the popover sat over the live deck after every mic command.

**Item #4 — Admin 401 + email-stuck-on-pending.** Two-part fix:
1. **Test buttons in the admin Settings panel.** New "Send test email" and "Send test SMS" buttons under Cloud Keys hit the existing `/api/license/test-email` and `/api/license/test-sms` endpoints; the failure toast surfaces the underlying provider error (e.g. Arkesel 401) so a stale baked SMS_API_KEY is obvious in seconds. Both attempts are logged to the Notifications panel above for audit.
2. **Per-row "Resend" button on every pending/failed notification.** New `/api/license/admin/retry` endpoint + `getNotificationById` helper on `storage.ts`. The button POSTs the notification id; the endpoint recovers the original channel + recipient + body and re-runs `notifyEmail` / `notifySms` / `notifyWhatsApp` so the operator can retry after fixing credentials without copy-pasting the audit-log row.
3. **No code change needed for the env-vs-baked precedence.** `pick()` in `baked-credentials.ts` already prefers `process.env` over the baked default; the rotated GitHub-Secret SMS_API_KEY is now already winning at runtime — the test buttons make this verifiable.

**Item #1 — NDI Settings: full separation + live preview (largest item).** Eight new NDI-only fields on the store — `ndiAspectRatio`, `ndiBibleColor`, `ndiBibleLineHeight`, `ndiRefSize`, `ndiRefStyle`, `ndiRefPosition`, `ndiRefScale`, `ndiTranslation` — every one optional so undefined still means "mirror Live Display". `congregation/route.ts` honours each one inside its `IS_NDI` block:
- Aspect ratio: new `AR` variable feeds `applyRatio()` so the NDI surface can run 4:3 while the projector stays 16:9.
- Bible body color + line-height: new `bibleExtra` CSS string spliced into `slide-title`, `slide-subtitle`, `slide-paragraph`, and `slide-text` style attributes.
- Reference size + style + scale + position: extends the existing `rfFam` / `rfShCss` chain; new `rfStyle` (italic), `rfPosition` (`top` | `bottom` | `hidden`), `rfHidden` short-circuits the ref render entirely; `refOrderTop` swaps `ref + txt` to `txt + ref` for both the lower-third and full-screen emit sites.
The dependency key in `settingsRenderKey()` was extended with `ndAr / ndBc / ndBlh / ndRfFs / ndRfSt / ndRfPos / ndRfTs / ndTr` so the captured NDI window re-renders the moment the operator nudges any of them. `NdiOutputPanel.tsx` gained a 16:9 `<iframe src="/api/output/congregation?ndi=1" />` mini-preview at the top of `CardContent` (mirrors what vMix / OBS sees) plus three new sub-sections under the Advanced disclosure: "NDI Layout & Bible Body", "NDI Reference Label", and "NDI Translation". The Reset-all button clears all 13 ndi* overrides. Translation is persisted only — the runtime per-surface verse re-fetch is a roadmap item for v0.6 and the helper text says so.

## v0.5.56 — First cloud build with credentials (Apr 2026)

Operator added the 11 bake-time secrets in *Settings → Secrets and variables → Actions* on `nanvilow/scripturelive-ai` (`OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `MAIL_HOST/USER/PASS/FROM/PORT/SECURE`, `SMS_API_KEY/SENDER/SANDBOX`). v0.5.56 is a no-code-change version bump whose only purpose is to trigger the GitHub Actions Windows build now that the secrets are in place — the previous tag v0.5.55 was built before the secrets existed and would have shipped empty constants. The package version bump alone was enough to retag and re-run the workflow; no source files changed. The first installer produced from this run is the first cloud-built `.exe` to ship with all credentials baked.

## v0.5.55 — Production build hotfix (Apr 2026)

GitHub Actions Windows build (`Release ScriptureLive AI Desktop`) failed on `package:win` with two unrelated issues that together meant nobody could actually produce a `.exe` from v0.5.53 or v0.5.54:

1. **Syntax error in `congregation/route.ts`.** Line 20 of that file opens one giant JavaScript template literal (`` const html = ` ``) that closes at line 944. My v0.5.53 comments at lines 268/271/275 included literal backticks around `` `vmin` ``, `` `vw` ``, and `` `text-{2xl,3xl,4xl,5xl}` ``. Inside a template literal those backticks were interpreted as the *closing* delimiter, which made the rest of the file parse as garbage. `next dev` (turbopack dev mode) is lenient about this and the workflow ran fine in dev; `next build` (turbopack production) refuses the file. Fix: stripped the backticks out of those three comment lines so the surrounding `` `<!DOCTYPE html>...</html>` `` template literal stays intact end-to-end.

2. **GitHub Actions never passed the bake-time secrets.** `.github/workflows/release-desktop.yml` only forwarded the Windows code-signing certs (`CSC_LINK`, `CSC_KEY_PASSWORD`) into `package:win`. None of `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `MAIL_HOST/USER/PASS/FROM/PORT/SECURE`, or `SMS_API_KEY/SENDER/SANDBOX` were exposed to the runner, so `prebuild → scripts/inject-keys.mjs` baked all-empty constants into the cloud-built `.exe`. The local `BUILD.bat` flow against the source ZIP was unaffected (the operator's source ZIP ships with the baked files pre-populated). Fix: added explicit `env:` mappings in the `Build & package Windows installer` step so each secret travels into the bake. The operator must add the matching repo secrets in *Settings → Secrets and variables → Actions* for the cloud build to ship working credentials.

## v0.5.54 — SMTP + SMS baked into build (Apr 2026)

Operator field report: "SMTP not configured / SMS not configured" banner appearing on every fresh install of the packaged .exe even though the credentials work fine in dev. Root cause: v0.5.53 only baked the renderer-side cloud keys (OpenAI, Deepgram); the server-side `notifications.ts`, `sms.ts`, `instrumentation.ts`, and `admin/list/route.ts` still read `process.env` directly. The packaged `.exe` runs on operator/customer Windows machines that have no `MAIL_*` / `SMS_*` env vars set, so the activation-email and activation-SMS pipelines silently fell through to "pending" and the admin banner permanently said "missing".

Fix: extended `scripts/inject-keys.mjs` to generate a SECOND baked file `src/lib/baked-credentials.ts` containing literal constants for `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `MAIL_PORT`, `MAIL_SECURE`, `SMS_API_KEY`, `SMS_SENDER`, and `SMS_SANDBOX`, plus `getMailHost()` / `getSmsApiKey()` / etc. resolvers that prefer `process.env` and fall back to the baked literal. Updated `notifications.ts`, `sms.ts`, `instrumentation.ts`, and `admin/list/route.ts` to call those resolvers instead of touching `process.env` directly. Result: the .exe ships with working SMTP + SMS out of the box, no operator setup required, and a deployment that DOES set env vars (Replit/etc.) still wins via the env-first ordering.

`baked-credentials.ts` is `.gitignored` (same secret-scanner protection as `keys.baked.ts`); the source-ZIP packager includes it explicitly. `BUILD.bat` Step 3a now hard-fails if either generated file is missing after the inject step.

## v0.5.53 — Operator follow-up (Apr 2026)

Nine small operator-driven items addressing post-v0.5.52 field feedback. No new product surfaces; just polish, fixes, and trust signals.

**Cloud keys baked deterministically** — `src/lib/keys.baked.ts` is now generated by `scripts/inject-keys.mjs` (runs as `predev` / `prebuild` and as a new Step 3a inside `BUILD.bat`). The renderer imports the literal string constants directly via the rewritten `src/lib/runtime-keys.ts`, eliminating the v0.5.52 `next.config.ts` `env`-block timing bug that occasionally shipped empty keys. The file is `.gitignored` (so GitHub's secret-scanner cannot trigger OpenAI/Deepgram auto-revocation) but is explicitly INCLUDED in the source ZIP so the operator's `BUILD.bat` finds the keys ready to bake.

**Subscription modal UX** — Step-2 MoMo block now shows a NOTE under the recipient number warning the user to verify the recipient name before confirming. Step-3 activation input gains a right-click context-menu paste handler (Electron sometimes swallows the native paste menu). A second activation slot ("Or — Enter your generated and master code in here") sits below the customer-code box so the operator can paste either kind without overwriting a half-typed value.

**Admin panel housekeeping** — Recent Payments, Recent Activations, and Notifications each gain a destructive trash-icon button per row, backed by three new `POST /api/license/admin/delete-{payment,activation,notification}` routes and the matching `deletePaymentByRef` / `deleteActivationByCode` / `deleteNotificationById` helpers in `src/lib/licensing/storage.ts`. A `window.confirm` guard prevents accidental clicks; the active subscription on the install is never touched (rows are audit-log only).

**`Ctrl+Shift+P` purged from user-facing surfaces** — Removed the `Ctrl+Shift+P` Badge from the Admin modal title, the parenthetical from the password-input help text, the entire "Speech engine managed by administrator…" footer in `Settings`, and replaced the cloud-key-missing error messages in `use-whisper-speech-recognition.ts` and `use-deepgram-streaming.ts` with the generic "Cloud transcription is temporarily unavailable. Please contact your administrator." The shortcut still works for the operator; it's simply no longer documented in the UI.

**Secondary-screen typography** — `src/app/api/output/congregation/route.ts` `fitFont()` switches from `vmin` to `vw` and bumps the baseline bands so a 16:9 secondary monitor renders text at the size the operator actually selected (the previous `vmin`-based values looked ~78% too small on a 1920×1080 fullscreen). The shrink-on-long-passage curve was also re-spaced (140 / 220 / 320 / 440 / 600 / 800-char thresholds with -0.4/-0.5 steps) so very long passages still fit without sudden jumps.

## v0.5.52 — Mega-release (Apr 2026)

ONE mega-release covering five operator-requested feature streams plus build-time key baking and offline scripture bundling. Standing rule: BUILD.bat banner string mirrors `package.json` version.

**Build-time scripture bundle** — `scripts/bundle-bibles.mjs` downloads KJV / NIV / ESV from bolls.life into `src/data/bibles/{kjv,niv,esv}.json`. The new `src/lib/bibles/local-bible.ts` exposes synchronous `lookupVerse` / `lookupRange` / `isTranslationBundled` helpers so the speech path resolves text without any network call when the operator's translation is bundled. Operator accepts the NIV/ESV redistribution risk for the in-house desktop deploy.

**Baked cloud keys** — Deepgram + OpenAI keys ship inside the .exe via `next.config.ts` `env` (`SCRIPTURELIVE_DEEPGRAM_KEY`, `SCRIPTURELIVE_OPENAI_KEY`). Runtime helper `runtime-keys.ts` bootstraps from baked defaults and refreshes from `/api/license/admin/keys`, where Admin-panel overrides (`adminOpenAIKey` / `adminDeepgramKey` in `license.json`) win when set. Browser Web Speech engine + the Replit-proxy transcription path are removed end to end. The Settings UI no longer surfaces an API Key field — operators are told the engine is administrator-managed and to use Ctrl+Shift+P for overrides.

**Bible Reference Engine v2** — `src/lib/bibles/reference-engine.ts` is a full rewrite with text normalization, word-to-digit conversion, fuzzy book matching (Levenshtein), `Book C:V` / `Book C V` / `Book C V to W` patterns, structural validation, and a 0-100 confidence score. The speech-provider pre-pass now uses `detectBestReference` and only commits a reference at confidence ≥80, with 30-second duplicate suppression and a `detectionStatus` mood emitted on the Zustand store.

**Voice Commands (T004)** — `src/lib/voice/commands.ts` parses leading-position commands (`next verse`, `previous verse`, `go to <ref>`, `scroll up/down`, `start/pause/stop auto scroll`, `clear/blank screen`). Voice control is opt-in (Settings toggle, default OFF). When matched, the speech provider dispatches via `dispatchVoiceCommand`, suspends speaker-follow for 2 s, suppresses Bible detection on the same transcript, and emits a Sonner toast.

**Speaker-Follow (T005)** — `src/lib/voice/speaker-follow.ts` ranks each verse of the live multi-verse passage against the last ~8 s of speech via token-trigram Jaccard, with hysteresis (switch ≥0.20 AND ≥current+0.05). Toggle lives both in Settings and in the Live Output column header (`Footprints` icon). Defaults OFF.

**Auto-Scroll + Highlight (T006)** — `live-presenter.tsx` now renders multi-verse passages with per-verse highlight (`bg-<color>-500/30 ring-2`) for the active verse and `opacity-50` for the rest, wrapped in a `ScrollArea` with `scrollIntoView({block:'center'})` on every change. Footer controls expose Play/Pause, Stop+Reset, and 6s/4s/2s speed presets. Resets to verse 0 whenever the live slide identity changes. Active-verse colour is operator-pickable.

**Theme Designer (T007)** — Settings → Theme Designer card adds three hard-coded presets (Dark Church / Light Presentation / Classic Worship), an active-verse highlight colour picker, and Save / Apply / Delete custom themes persisted on the Zustand store under `customThemes` (the existing `persist` middleware writes them to localStorage).

# User Preferences

- **After EVERY fix / version bump, build and present a fresh ZIP** of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
- Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

# System Architecture

The project is a pnpm monorepo using Node.js 24 and TypeScript 5.9. It includes an Express 5 API server, PostgreSQL with Drizzle ORM, and Zod for validation. API codegen uses Orval from an OpenAPI spec, and esbuild is used for bundling.

The "Imported App" is a Next.js 16 application with Prisma and SQLite. It handles standard routes, with the monorepo's API server routed to `/__api-server` to avoid conflicts.

Key architectural features include:

-   **NDI Integration:** Supports browser-only NDI output and a native NDI sender via an Electron wrapper using `grandiose` for desktop builds.
-   **Dynamic Downloads:** A `/download` page offers OS-detecting downloads, streaming files from `/api/download/<platform>` based on `public/downloads/manifest.json`. It also includes a file-hashing feature for installer verification.
-   **Speech Recognition:** Utilizes a single cloud-only Whisper path. The `api-server` hosts a `/api/transcribe` route using `gpt-4o-mini-transcribe`. The Next.js `/api/transcribe` acts as a proxy to the `api-server`. The renderer uploads 4500 ms audio chunks (if ≥6 KB).
-   **Persistence:** The Next.js port is fixed to 47330 to maintain `localStorage` origin consistency for Electron builds.
-   **UI/UX:**
    -   Branding uses `public/logo.png`.
    -   `NdiToggleButton` provides simplified NDI control.
    -   Live Display and Preview stages are visually symmetrical.
    -   Redundant UI elements have been removed.
    -   Master volume control is integrated into the Live Output panel.
    -   The "Live Display SIZE" slider has been removed to prevent accidental adjustments.
    -   Output renderer prevents solid black screens by default, displaying a splash watermark until content is broadcast.
    -   Live Transcription is Bible-only by default, with a toggle for "Bible / All" transcription.
    -   Mic icon in the Live-Display footer provides Start / Pause-Resume / Stop transport and a Mic Gain slider.
    -   Installer downloads can be cancelled and automatically handle the quit-and-install process smoothly.
    -   Output / NDI rendering now correctly handles Strong's markup and HTML-escapes content to prevent letter-dropping issues.
    -   Faster verse detection achieved by reducing `CHUNK_MS` and adjusting silence-drop thresholds.
    -   Media autoplay with sound is enabled by default for both Preview and Live stages in Electron builds.
    -   Critical SSE bug fix implemented in `/api/output/congregation` to correctly process `event:'state'` payloads and ensure real-time updates, including `wakeAndPoll()` for visibility/focus/connectivity changes.
    -   v0.5.38 root-cause fix: regex literals containing `</S>` in the inlined kiosk script (`/api/output/congregation`) were escaping closing `</script>` tags. Served JS now uses `<\/S>` (and the source file `<\\/S>`) so the parser keeps the script intact and the kiosk no longer hangs on the splash watermark.
    -   v0.5.39 Deepgram streaming fix: `/api/transcribe-stream/info` now derives `wss://<host>/__api-server/api/transcribe-stream` automatically when running under `REPLIT_DEV_DOMAIN` (no env vars required), and the api-server's WS upgrade handler strips the `/__api-server` path prefix so the Replit workspace-preview proxy can deliver the upgrade to the right service. End-to-end proof: a 5.9 s TTS clip of "For God so loved the world… John three sixteen" was streamed through the proxy and Deepgram returned two final transcripts. The renderer now also surfaces a clear actionable message instead of a bare `1006: ` close code.
    -   v0.5.51 ships **one focused fix from operator screenshot feedback: keep Preview + Live Display bible text perfectly still while dragging column splitters**. Operator complaint: *"While dragging the cursor with the mouse between columns, let the text of the Preview and Live Display stay still without the bible text losing its alignments."* Root cause — both `PreviewCard` and `LiveDisplayCard` rendered their slide composites with CSS container-query units (`cqi` / `cqw` / `cqh`) so font-size scaled with the column width. That works perfectly while a column is RESTING, but during a drag the browser was recomputing font-size on every `pointermove` tick → the bible text jiggled, line-wraps shifted (a word would hop down one line then back up), the reference badge wrapped differently from the body, and vertical/horizontal alignment of the verse drifted in real time. Fix: new `<StableStage>` wrapper component (`src/components/presenter/stable-stage.tsx`) that renders the slide composite into a FIXED 1920×1080 reference canvas and applies a single GPU `transform: scale(...)` to fit it inside whatever column width the operator dragged to. Inside the stage the DOM never changes size → container-queries resolve to identical pixel values forever → font-sizes never recompute → line-wraps are FROZEN at the 1920px reference width → alignment is preserved to the pixel. Dragging is buttery because only the GPU transform matrix is animated (no layout, no reflow). The Live Display "Size" slider's `actualSize` value is multiplied on top of the auto-fit-to-column scale so the slider still works exactly as before. ResizeObserver callback is wrapped in `requestAnimationFrame` to coalesce drag-tick resizes into one layout-aligned write per frame. SSR-safe (uses `useLayoutEffect` only in the browser) so first paint already has the correct transform — no flash of an oversized 1920px stage in a tiny column. **Files (4 modified):** `src/components/presenter/stable-stage.tsx` (new), `src/components/layout/logos-shell.tsx` (PreviewCard wraps DisplayStage; LiveDisplayCard's two `transform: scale(actualSize)` wrappers — full-screen and lower-third — replaced with `<StableStage scale={actualSize}>`), `package.json` (0.5.50 → 0.5.51), `BUILD.bat` (banner). No new packages.
    -   v0.5.50 ships **six concrete fixes pulled directly from the operator's latest screenshot review**. **(A) NDI mirrors the in-app Live Display at 60 fps.** `ndi-output-panel.tsx` `handleToggle` was bumping the off-screen capture at `fps:30` (operator complaint: NDI feed inside vMix / OBS looked visibly less crisp than the in-app Live Display). v0.5.50 raises the requested rate to 60 fps; the existing `FrameCapture.start()` in `electron/frame-capture.ts` already feeds that into `webContents.setFrameRate(opts.fps)` and `beginFrameSubscription`, so 60 fps NDI is now the default for fresh starts. The three optional NDI typography overrides (`ndiFontFamily` / `ndiFontSize` / `ndiTextShadow`) remain `undefined` by default — meaning the NDI feed mirrors the in-app Live Display **exactly** unless the operator opts into per-NDI typography, which was already the design intent. **(B) Whisper VAD loosened from 0.008 → 0.004 + 2-chunk run rule.** v0.5.49's silence floor was empirically too aggressive on low-gain condenser mics (0.008 ≈ -42 dBFS RMS over a 2.5 s chunk dropped soft-spoken pulpit speech). v0.5.50 drops `VAD_RMS_THRESHOLD` to 0.004 (≈ -48 dBFS RMS) AND adds a `silentRunCountRef` that requires ≥2 CONSECUTIVE chunks below the floor before suppression starts (`VAD_SILENT_RUN_TO_DROP = 2`). The first quiet chunk in a run is always uploaded — it might be a soft-spoken word or the trailing silence at the end of a sentence — and a single loud chunk resets the counter. Real sustained silence (room tone, fan noise, AC hum) still gets dropped; transient quiet syllables no longer do. **(C) Whisper hallucination guard.** New `HALLUCINATION_PATTERNS` literal-set in `use-whisper-speech-recognition.ts` matches `Thanks/Thank you for watching`, `Subtitles by …`, `Translated by …`, `Please like/subscribe/share`, lone `[Music]` / `[Applause]` / `[Silence]`, `Captions by …`, and `amara.org` (case-insensitive, anchored where appropriate). Filter runs `isHallucination(cleanedText)` AFTER `cleanTranscriptText()` post-decode in `upload()`; matches are dropped to an empty placeholder (so the in-order drainer doesn't stall) and a `[whisper-hallucination] dropped:` warning is logged to DevTools so the operator can see in real time that the filter fired (rather than wondering why a transcript "disappeared"). **(D) Live ticking trial countdown (mm:ss every 1 s).** `license-button.tsx` was rendering `formatTrial(status.trial.msLeft)` as a static snapshot — operators thought the countdown was frozen because the underlying `msLeft` only refreshed on the 30 s status poll. v0.5.50 adds `useTickingTrialMsLeft(expiresAt, isTrial)` — a 1 s `setInterval`-driven hook that recomputes `(new Date(expiresAt).getTime() - Date.now())` locally on every tick, so the badge text updates each second. `formatTrial` itself was rewritten: under one hour the badge now renders zero-padded `MM:SS` (so the badge width never jitters); over one hour it stays at `Xh Ym` (second precision is irrelevant at that scale). **(E) Smaller, less clumsy Live Transcription action buttons.** All four header buttons (Bible / Clear / Mic / Auto) shrunk one notch: `h-7 → h-6`, `px-2 → px-1.5`, `gap-1 → gap-0.5`, icons `h-3 w-3 → h-2.5 w-2.5`. The mic button label was tightened from `"Detect Verses Now"` → `"Detect"` (and the label is hidden below `sm:` widths so the icon carries the meaning when the toolbar is cramped). Listening label was tightened from `"Listening"` → `"Live"` to fit at the new sizing. Engine + last-error are now surfaced INLINE in the LiveTranscription empty-state body so an operator looking at a "dead" column can immediately tell which engine is live and what (if anything) went wrong, instead of having to hunt for the engine-picker dot in the Card BADGE slot. **(F) Notification delivery banner — surface SMTP / SMS missing creds.** `/api/license/admin/list` now returns `notificationDelivery: { smtpConfigured, smsConfigured }` derived from the same env-var checks used by `lib/licensing/notifications.ts` (`MAIL_HOST/MAIL_USER/MAIL_PASS/MAIL_FROM`) and `lib/licensing/sms.ts` (`SMS_API_KEY`). The admin Notifications panel now renders a coloured banner above the log: emerald "Delivery: live" when both channels are configured, amber "Notifications queued — credentials missing" with the exact env-var names that need to be set when one or both is missing. Replaces the old static "Tip: SMTP is unconfigured by default" line that didn't tell the operator what was actually wrong on their install. The customer-email path was already correctly wired — `payment.email` flows through `createPaymentCode → confirmPaymentAndIssueActivation → notifyEmail` (see `storage.ts:343/395`, `admin/confirm/route.ts:78/85/109`); the failure mode in the wild is purely missing creds, which the new banner now makes obvious. **Files (8 modified):** `src/components/views/ndi-output-panel.tsx` (A: 30 → 60 fps), `src/hooks/use-whisper-speech-recognition.ts` (B: VAD threshold + silent-run rule + C: HALLUCINATION_PATTERNS + isHallucination filter in upload), `src/components/license/license-button.tsx` (D: useTickingTrialMsLeft + mm:ss formatter), `src/components/layout/logos-shell.tsx` (E: button sizing + label tightening + engine/error surface in empty-state body), `src/app/api/license/admin/list/route.ts` (F: notificationDelivery field), `src/components/license/admin-modal.tsx` (F: dynamic banner replacing static tip), `package.json` (0.5.49 → 0.5.50), `BUILD.bat` (banner). No new packages. No api-server changes. Pre-existing TypeScript errors in `activate/route.ts:62`, `use-speech-recognition.ts`, `bible-api.ts` are unchanged and unrelated to this release.
    -   v0.5.49 ships **three operator-requested fixes from a single round of feedback**. **(A) Engine picker + faster fallback + Whisper VAD.** The post-start fallback window in `<SpeechProvider>` was tightened from 8 s → 3 s so a stillborn Deepgram WS no longer leaves the operator staring at a dead mic for eight seconds before Whisper takes over (`use-whisper-speech-recognition.ts` HTTP path is fast enough that an aggressive 3 s ceiling is safe). New persisted store field `preferredEngine: 'auto'|'deepgram'|'whisper'|'browser'` (default `'auto'`) plus non-persisted `activeEngineName` mirror, with setters; `<SpeechProvider>` initializes `activeEngine` from `preferredEngine`, mirrors live `activeEngine` back into the store on every change, and gates the auto-fallback effect on `preferredEngine === 'auto'` so a pinned engine is NEVER demoted by structural errors (operators in venues that block Deepgram WSS but allow Whisper HTTPS get a deterministic outcome instead of silent fallback drift). A second `<SpeechProvider>` effect reacts to mid-session `preferredEngine` changes — if the new preference is a real engine and supported, the provider tears down the live engine and rotates `activeEngine` to the new pin (operator can switch engines without restarting listening). New compact engine picker lives in the LiveTranscription Card BADGE slot (replaces the redundant Listening/Idle pill — the mic Button already conveys live state via colour + icon): one-token label (`AUTO` / `DG` / `WH` / `BR`) preceded by a coloured dot whose hue tells operator which engine is currently active in Auto mode (emerald = Deepgram, amber = Whisper, sky = Browser), and that dot pulses while the mic is hot. `<DropdownMenu>` items list all four options with one-line description and emerald check-mark on the current pick. **(B) Whisper VAD — drop silent chunks before upload.** `use-whisper-speech-recognition.ts` previously uploaded every 2.5 s MediaRecorder chunk regardless of audio content, which caused the well-known Whisper hallucinations during prayer / song breaks ("Thanks for watching", "Subtitles by …", "Translated by …"). Fix: an `AnalyserNode` is now wired in parallel to the gain → recorder pipeline (no signal touches the upload path), a 50 ms `setInterval` samples Float32 time-domain data and updates a rolling `maxRmsInWindowRef`, and at every `ondataavailable` the current peak RMS is snapshotted per chunk-id and the window is reset. In `upload()`, if the snapshot RMS for the chunk being processed is below `0.008` (silence floor calibrated against typical condenser-mic noise), the chunk is dropped without an HTTP round-trip and the in-order drainer is fed an empty placeholder so the slot order doesn't stall. Threshold "fails open" (uploads anyway) when the analyser is unavailable so legacy paths still work. Full cleanup of analyser, sampler interval, and ref maps in `stopListening`. **(C) Lock all Live Transcription action buttons when subscription inactive.** The `<LiveTranscriptionLockOverlay>` covers the card BODY visually, but the action buttons (Bible / Clear / Mic / Auto) sit in the Card HEADER outside that overlay's z-stack and remained clickable — operators on a locked install could still toggle the mic into a useless state. Fix: `<LiveTranscriptionCard>` now reads `isLocked` from `useLicense()` and gates each button's `onClick` to a no-op short-circuit when locked, AND adds `disabled={isLocked} aria-disabled` plus `opacity-50 cursor-not-allowed pointer-events-none` so buttons render visually inert with a Lock icon swap. Tooltips switch to "Activate a subscription to use Live Transcription controls." Engine picker stays interactive deliberately so operators can pre-configure their preferred engine before activating. **(D) NDI default OFF.** `electron/main.ts` previously kicked off `ndi.start({...})` + `frameCapture.start({...})` automatically inside the `app.whenReady()` block — customers complained that fresh installs were unsolicited LAN broadcasters the moment the app launched. Replaced the auto-start block (lines 1788–1817) with a log-only stub `[ndi-startup] auto-start DISABLED — operator must click Start NDI Output (v0.5.49)`. All IPC handlers and the manual Start NDI Output button in `<NdiOutputPanel>` are untouched — operators who want NDI just click Start once. **Files (5 modified):** `src/lib/store.ts` (preferredEngine + activeEngineName + setters), `src/components/providers/speech-provider.tsx` (init from preferredEngine + mirror + gate auto-fallback + 3 s window + mid-session pin reaction), `src/hooks/use-whisper-speech-recognition.ts` (AnalyserNode VAD + per-chunk RMS snapshot + drop in upload), `src/components/layout/logos-shell.tsx` (engine picker badge with coloured dot + isLocked gating on Bible/Clear/Mic/Auto + Lock icon swaps + new tooltips), `electron/main.ts` (NDI auto-start replaced with opt-in log stub). No new packages. Pre-existing TypeScript errors in `activate/route.ts:62`, `use-speech-recognition.ts`, `bible-api.ts` are unchanged and unrelated to this release.
    -   v0.5.48 ships **four operator-requested fixes plus an admin "Generate Activation Code" panel**. **(A) Deepgram WSS info root-cause.** `/api/transcribe-stream/info` previously gated the host-derived `wss://<host>/__api-server/api/transcribe-stream` fallback behind `process.env.REPLIT_DEV_DOMAIN`, which is unset on Replit Autoscale path-routed deployments — so the published app returned HTTP 503 and the renderer surfaced bare `1006:` close codes. Fix: drop the env gate, always derive the WSS URL from the inbound request host (works in dev preview AND deployed Autoscale, since both expose the api-server at `/__api-server`). Electron-explicit overrides (`TRANSCRIBE_STREAM_WSS_URL`, `TRANSCRIBE_PROXY_URL`) untouched. **(B) Speech-provider fallback latch tightening.** v0.5.45 only allowed auto-fallback inside an 8 s post-start window; if a WS died at t=12 s the chain froze on the dead engine. v0.5.48 replaces the time gate with a per-engine `sawTranscriptRef` Set: any structural error advances the engine chain unless THAT engine has already produced at least one transcript in this session. Once an engine has proven it works, transient mid-stream errors are treated as recoverable; engines that never produced anything are demoted on first error regardless of elapsed time. **(C) NDI typography overrides.** New optional `ndiFontFamily` / `ndiFontSize` / `ndiTextShadow` fields in the Zustand store (all `undefined` by default → mirror Live Display, current behavior). When set, `/api/output/congregation` chooses NDI overrides over the shared Live Display values via the `IS_NDI` route param. The `<NdiOutputPanel>` view ships a "Typography" card with three controls + Reset buttons; render key includes the overrides so the captured NDI window updates immediately. **(D) Customer Settings → License row.** `useLicense().status` is extended with `subscription: { planLabel, planCode, days, activatedAt, expiresAt, daysLeft, code, isMaster }` (route + provider + Settings view all updated). New row in `<SettingsView>` shows plan + countdown + masked code with three actions: Copy code (clipboard), Renew (opens the existing Subscription modal at the plan picker), Deactivate (POST `/api/license/deactivate` clears the active subscription server-side so the code can be re-issued / moved to another install). Master code shows "Lifetime" badge instead of countdown. **(E) Admin Settings tab + runtime config.** New `config` block in `~/.scripturelive/license.json` — adminPwd, trialMin, momoName/momoNum, whatsapp, notifyEmail, plus per-plan price overrides. `getConfig()` / `saveConfig()` / `deactivateSubscription()` storage helpers persist atomically. New `/api/license/admin/config` (GET + POST) round-trips the entire config; `getEffectivePlans()` / `getEffectiveMoMo()` / `getEffectiveNotificationTargets()` in `plans.ts` overlay config on top of compiled defaults so changes take effect WITHOUT a redeploy. Admin modal grows a tab bar (Overview / Settings); the Settings tab lazy-loads the config form on first reveal. New public `/api/license/plans` endpoint feeds the customer subscription modal so per-plan price overrides reach the customer flow without exposing admin config. **(F) NEW: Generate Activation Code panel.** Operator request received mid-session: "Add a way to mint codes by hand (free trials, partnerships, cash payments)." New `generateStandaloneActivation()` storage helper + `POST /api/license/admin/generate` route accept `{ planCode, days?, note?, email?, whatsapp? }`. `planCode` accepts any of the 7 published plans OR `'CUSTOM'` (which requires explicit `days`, 1–36500); standard plans accept `days` as an optional override (e.g. give a 1M code 45 days as a goodwill bump). Returns `{ ok, activation: { code, planCode, days, generatedAt, generatedFor } }`. Codes are recorded `isUsed:false` so the recipient still types them into the activation modal on their PC — that's what binds the code to a specific install. New violet-bordered section in the admin Overview tab between "Confirm Payment" and "Recent Payments" exposes Plan select / Days input / Username label / optional Email + WhatsApp / Generate button; result block shows the minted code with one-click Copy. Recent Activations table grows a "For" column (renders `generatedFor.note ?? .email ?? .whatsapp ?? 'ref <ref>'`) plus a per-row Copy button. `ActivationCodeRecord.generatedFor` widened to include optional `note?: string`. Smoke-tested all four cases (1M default, CUSTOM 14d, CUSTOM no-days → 400, BOGUS plan → 400). **Files (12 modified, 4 new):** new `src/app/api/license/admin/config/route.ts`, new `src/app/api/license/admin/generate/route.ts`, new `src/app/api/license/deactivate/route.ts`, new `src/app/api/license/plans/route.ts`, modified `src/lib/licensing/storage.ts` (RuntimeConfig + helpers + generateStandaloneActivation + .note + deactivateSubscription), `src/lib/licensing/plans.ts` (getEffectivePlans/MoMo/NotificationTargets), `src/lib/licensing/payment-code.ts` + `notifications.ts` (consult effective config), `src/app/api/transcribe-stream/info/route.ts` (drop REPLIT_DEV_DOMAIN gate), `src/app/api/license/status/route.ts` (subscription summary), `src/lib/store.ts` (3 NDI override fields), `src/app/api/output/congregation/route.ts` (IS_NDI override branch), `src/components/views/ndi-output-panel.tsx` (Typography card), `src/components/views/settings.tsx` (License row), `src/components/license/license-provider.tsx` (SubscriptionSummary type), `src/components/license/admin-modal.tsx` (Settings tab + Generate Code section + Recent Activations "For" column), `src/components/license/subscription-modal.tsx` (uses /api/license/plans). No new packages. Pre-existing TypeScript errors in `activate/route.ts:62`, `use-speech-recognition.ts`, `bible-api.ts` are NOT introduced by this release and are unrelated to the changes here.
    -   v0.5.47 integrates **Arkesel SMS API for customer activation receipts**. New `src/lib/licensing/sms.ts` ships `sendArkeselSms({ to, message })` — POSTs to `https://sms.arkesel.com/api/v2/sms/send` with `api-key: SMS_API_KEY` header, body `{ sender, message, recipients: [E164] }`. Reads `SMS_API_KEY` (required) + `SMS_SENDER` (default `'ScriptureAI'`, capped to 11 chars per Arkesel rules) + optional `SMS_SANDBOX=1` to hit the charge-free sandbox endpoint. `normalizeGhPhone()` converts `0246798526` / `+233 24 679 8526` / `233246798526` to the wire-required `233246798526`. Arkesel responds 200 even on logical failures (insufficient balance, bad sender, invalid number) so the client inspects `status` field and treats anything other than `'success'` as failure. Every call logs `[arkesel-sms] sending to ... sender = ... bytes = ...` and either `[arkesel-sms] SUCCESS — delivered to ...` or `[arkesel-sms] FAILED — to = ... error = ...`. New `notifySms()` wrapper in `notifications.ts` calls the client and appends a `NotificationRecord` with `channel: 'sms'` (channel union widened in `storage.ts`). The admin/confirm route now sends the customer activation SMS BEFORE the operator email/WhatsApp dispatch (so a slow Gmail SMTP doesn't delay the customer's receipt) using the spec body: *`ScriptureLive AI: Activation successful. Code: SL-1M-83KF92. Enjoy 31 days of seamless live scripture display.`* Recipient is `payment.whatsapp` (the phone collected during subscription). Response payload now includes `notifications.sms: { id, status, error, to }`. New `POST /api/license/test-sms` endpoint (optional `{ to }` body) lets the operator re-trigger anytime — defaults to `NOTIFICATION_WHATSAPP`. SMS errors never block the admin response (try/catch, audit log records the failure as `'pending'`). **Files:** new `src/lib/licensing/sms.ts`, new `src/app/api/license/test-sms/route.ts`, modified `src/lib/licensing/notifications.ts` (notifySms + sendArkeselSms import), `src/lib/licensing/storage.ts` (channel union +'sms'), `src/app/api/license/admin/confirm/route.ts` (customer SMS dispatch + smsNote in response). No new packages.
    -   v0.5.46 adds **automatic SMTP self-test on server startup** plus a manual re-test endpoint, in response to the operator's "Send a test email when app starts" request after the SMTP setup walkthrough. New `src/instrumentation.ts` (Next.js 16 standard hook, fires once per Node cold-start on the `nodejs` runtime only) checks for `MAIL_HOST` + `MAIL_USER` + `MAIL_PASS`; if missing, logs a clear `[startup-test-email] SMTP not configured` warning and exits. If configured, it lazy-imports `notifyEmail` + `NOTIFICATION_EMAIL`, sends a one-shot test email to `nanvilow@gmail.com` whose body explicitly lists `MAIL_HOST` / `MAIL_USER` / `MAIL_FROM` / recipient / server time so the operator can read the email and immediately confirm which secrets are in play (password is never echoed). Outcome is logged to the deployment console as `[startup-test-email] SUCCESS — delivered to ...` or `[startup-test-email] FAILED — status = pending error = ...`. Operator opt-out via `SKIP_STARTUP_TEST_EMAIL=1` once they're satisfied. Companion route `POST /api/license/test-email` (optional `{ to }` body) lets them re-trigger anytime without a redeploy round-trip — returns `{ ok, status, note }`. Wrapped in try/catch so SMTP failure can never crash the boot. **Files:** new `src/instrumentation.ts`, new `src/app/api/license/test-email/route.ts`. No package additions, no other changes.
    -   v0.5.45 inserts **OpenAI Whisper as the middle tier** in the auto-fallback chain, on top of the v0.5.44 dual-engine work. The chain is now `Deepgram → Whisper → Browser`. `SpeechProvider` mounts all three hooks (`useDeepgramStreaming`, `useWhisperSpeechRecognition`, `useSpeechRecognition`) unconditionally — none open the mic / WS / MediaRecorder until `startListening()`. `EngineName` extends to `'deepgram' | 'whisper' | 'browser'` and a single `ENGINE_CHAIN` array drives `nextEngine(cur)`. The auto-fallback effect is rewritten to watch whichever engine is currently active (not just Deepgram): inside the 8 s post-start window, if the live engine's `error` matches its structural-failure regex (Deepgram: WS / 1006 / disconnected; Whisper: 503/502/504/500 / openai / api key / fetch / network / upstream / proxy / `HTTP `), the provider tears that engine down, advances `activeEngine` through the chain (skipping any unsupported next entry), re-arms `startListening` with the same callback after a one-tick defer, and emits a per-handoff sonner toast (`Live transcription switched to OpenAI Whisper` / `Live transcription switched to browser speech engine`). `announcedHandoffsRef` is a `Set<string>` keyed `${from}->${to}` so each handoff toast fires once per session. `fallbackStepsRef` increments per step but the provider never walks back up the chain in the same session. `useWhisperSpeechRecognition` already POSTs MediaRecorder webm/opus chunks to `/api/transcribe`, which uses `OPENAI_API_KEY` directly when set (this Replit env has it) and falls back to `AI_INTEGRATIONS_OPENAI_*` then `TRANSCRIBE_PROXY_URL` (Electron path). The provider boot log is now `[SpeechProvider] triple-engine: deepgramSupported = X whisperSupported = Y browserSupported = Z active = W`. **Files:** `src/components/providers/speech-provider.tsx` (triple-mount + chain helpers + isStructuralError + fallbackToastCopy + rewritten effect). No new packages, no api-server changes, no other component touched.
    -   v0.5.44 follows up v0.5.43 with three operator-requested fixes. **(1) Pill moved to top-left.** The `Activate / Trial / Active` pill that v0.5.43 placed as a `fixed top-2 right-2 z-40` floating element is now rendered INLINE inside the `TopToolbar`, immediately after the logo block (`ml-2`), in the same `h-12` header. The button gains a `variant: 'inline' | 'floating'` prop (default `inline`); the floating mode is preserved for anyone who wants the corner badge back. The labels are also tightened to fit the toolbar (`AI Active — 365d Left`, `Trial — 59 min · Activate`, `Activate AI Detection Now`). **(2) Dual-engine speech with auto-fallback.** v0.5.43 mounted only the Deepgram streaming hook; field testing showed the dev preview throws `1006: WebSocket could not be established` because the Replit iframe proxy's WS upgrade is unreliable for `/api/transcribe-stream`. v0.5.44 mounts BOTH `useDeepgramStreaming` AND `useSpeechRecognition` simultaneously. On `startListening`: Deepgram is tried first; if its error stream within 8 s contains `WebSocket` / `1006` / `connection failed` / `could not be established` / `disconnected`, the provider tears Deepgram down, sets `activeEngine = 'browser'`, restarts with `useSpeechRecognition`, and surfaces a one-shot `sonner` toast: *"Live transcription switched to browser engine — Deepgram streaming is unreachable in this environment, so we automatically fell back to the browser speech engine. Detection and auto-go-live still work."* The fallback latches for the rest of the session so the audio graph isn't thrashed by repeated retries. The provider logs `[SpeechProvider] dual-engine: deepgramSupported = X browserSupported = Y active = Z` at every reconciliation so support tickets are diagnosable from a single DevTools screenshot. **(3) Same verse-detection + auto-go-live downstream.** All transcript routing, verse detection, text-search hits, similarity scoring, and `addToVerseHistory` / `setIsLive` paths run on the active engine's transcript regardless of source — no second code path was added. **Visual proof captured at v0.5.44:** screenshot `screenshots/v0.5.44-pill-top-left.jpg` shows the amber `TRIAL — 59 MIN · ACTIVATE` pill nestled right after the logo at the top of the TopToolbar with comfortable margin; browser console shows `[SpeechProvider] dual-engine: deepgramSupported = true browserSupported = true active = deepgram`. **Files:** `src/components/license/license-button.tsx` (variant prop + inline sizing), `src/components/layout/easyworship-shell.tsx` (LicenseTopBarButton import + inline render after logo), `src/app/page.tsx` (removed floating render), `src/components/providers/speech-provider.tsx` (dual-mount + auto-fallback + lastCallbackRef + startedAtRef + announcedFallbackRef). No package additions. No api-server changes. No transcription pipeline rewrites — pure provider-level orchestration on top of the v0.5.42 hook.
    -   v0.5.43 ships **v1 LICENSING** — a self-hosted MoMo-based subscription gate around Live Transcription / AI Detection. **No third-party payment APIs are used.** Pricing: 1M/200, 2M/350, 3M/550, 4M/750, 5M/900, 6M/1200, 1Y/1800 GHS, payable to Richard Kwesi Attieku 0530686367 (MTN Mobile Money). Customer flow: (1) operator opens the Subscribe modal from the floating top-right pill, picks a plan, enters email + WhatsApp, gets a **3-digit payment code** (15-minute TTL — promoted to 4 digits on collision); (2) operator sends MoMo with that code as the reference; (3) when the owner sees the MoMo SMS, they hit Ctrl+Shift+P to open the Admin panel and one-click "Confirm" the reference, which mints a single-use activation code `SL-{PLAN}-{6 alphanum}` (excluding O/0/1/I/L/U for legibility) valid for the plan's day count; (4) the customer enters the activation code in the Subscribe modal and the entire app flips to **active**, unlocking Live Transcription. **Master code** `SL-MASTER-XXXXXXXX-XXXXXXXX` is generated on first run, never expires, and can be re-emailed to the owner from the Admin panel. **Trial:** every fresh install gets a 1-hour free trial of Live Transcription before the lock overlay appears. **Storage** is a single atomic-write JSON file at `%USERPROFILE%\.scripturelive\license.json` (override via `SCRIPTURELIVE_LICENSE_DIR`); notification audit log is capped at 500 entries. **Notifications:** SMTP (MAIL_HOST / MAIL_USER / MAIL_PASS / MAIL_FROM env vars) is fully optional — if unconfigured, every customer email + the owner's "new subscription activated" alert are queued in the Admin panel as `pending` rows that the owner can copy/paste, and a `wa.me/233246798526` deep link is generated for one-tap WhatsApp delivery to nanvilow@gmail.com / WhatsApp 0246798526. **Backend:** 4 lib files + 6 API routes (`/api/license/{status,master,payment-code,activate,admin/confirm,admin/list}`) all proven end-to-end via curl: fresh→trial(1hr)→master code→customer 1Y plan ref `073` (15min TTL)→admin confirm→`SL-1Y-66CVXV` 365 days→customer activate→state flips to `active 365d`→idempotent re-confirm reuses same code, replay attack rejected with "This activation code has already been used." **Frontend:** `LicenseProvider` (30s status poll + Ctrl+Shift+P listener), `LicenseTopBarButton` (fixed top-right floating pill: emerald when active, amber with countdown during trial, opaque rose when locked), `SubscriptionModal` (4-phase: plan picker → MoMo payment with 15-min countdown + activation entry → activating spinner → green receipt with copy + WhatsApp deep link), `AdminModal` (master code + email helper, confirm-by-ref input, recent payments table with one-click confirm, recent activations table, notification audit log with copy buttons), `LiveTranscriptionLockOverlay` (absolute-positioned curtain inside the Live Transcription Card, only renders when `useLicense().isLocked` is true). Visual proof captured: state #1 active = green "AI DETECTION ACTIVE — 365 DAYS LEFT" pill + Live Transcription unlocked; state #2 trial = amber "FREE TRIAL — 59 MIN LEFT · ACTIVATE NOW" pill + Live Transcription unlocked; state #3 trial_expired = opaque rose "ACTIVATE AI DETECTION NOW" pill + sparkle-icon "Free Trial Ended" overlay covers the entire Live Transcription column with the orange "ACTIVATE AI DETECTION NOW" CTA.
    -   v0.5.42 fixes the **silent-mic regression** that survived v0.5.41. Operator clicked the mic, nothing happened — `/info` was never even hit. **Root cause:** the v0.5.41 SpeechProvider rewrite still mounted the legacy `useSpeechRecognition` hook alongside the new Deepgram one; that hook checks `window.webkitSpeechRecognition`, which is undefined in the Replit preview iframe, so its `isSupported` returned `false` — and `logos-shell.tsx`'s `toggleMic` short-circuited on `if (!speechSupported) return` before ever calling `setSpeechCommand('start')`. **Fix:** (1) `speech-provider.tsx` now imports and mounts ONLY `useDeepgramStreaming` — the legacy hook is gone from the provider entirely. `speechSupported` is forced TRUE in any browser-like environment (mic + WebSocket + AudioContext), the stale `IS_ELECTRON`/`FORCE_BROWSER_SPEECH` branching is removed, and console diagnostics are emitted at every state change. (2) `logos-shell.tsx`'s `toggleMic` no longer guards on `speechSupported` and logs every click to DevTools. (3) `use-deepgram-streaming.ts` emits `[deepgram-hook]` console traces at `/info` fetch, WS open, every WS message, and `startListening` entry (with full env diagnostics if `isSupported` is false). (4) New self-test page `public/transcribe-test.html` exercises the entire pipeline without React: synthetic 16 kHz PCM stream + real-mic mode + live event log + PASS/FAIL verdict. **Proof captured from this workspace at v0.5.42:** `/info` HTTP 200 returning `wss://b20a0695-…kirk.replit.dev/__api-server/api/transcribe-stream` (source `REPLIT_DEV_FALLBACK`), WS OPEN, proxy `{"type":"ready"}`, 96 000 bytes of synthetic PCM streamed, **7 messages back from Deepgram** including `SpeechStarted`, four `Results` frames, and a final `Metadata` frame with request id `019dc7a3-42ee-7af2-979a-31834b3f48aa`. The diagnostic page is reachable at `https://b20a0695-…kirk.replit.dev/transcribe-test.html` for the operator to repeat the test in their own browser with their own mic.
    -   v0.5.41 fixes two bugs reported by the operator after v0.5.40 shipped: (A) **Output / NDI text mangled** (e.g. "things"→"thing", "those"→"tho e", "His"→"Hi", "purpose"→"purpo e"). Root cause: line 657 of `artifacts/imported-app/src/app/api/output/congregation/route.ts` had `.replace(/\s+/g,' ')` inside a TS template literal. JavaScript string-parsing strips unrecognised escape sequences, so the served kiosk JS became `.replace(/s+/g,' ')` — a regex that replaces every lowercase 's' with a space. Fix: `\s+` → `\\s+` in the source so the served regex literal stays `/\s+/g`. Same hazard pattern as the `</S>` escape fix in v0.5.38; comment added at the call site to flag the rule. (B) **Live transcription / verse detection silently inactive in the Replit dev preview**. Root cause: `artifacts/imported-app/src/components/providers/speech-provider.tsx` chose the speech engine via `IS_ELECTRON ? deepgram : browserWebSpeech` — outside Electron the dev preview fell back to the browser's Web Speech API, which silently fails inside the Replit preview iframe sandbox. The Deepgram WS proxy added in v0.5.39 / v0.5.40 was never invoked from the preview. Fix: Deepgram is now the primary engine in BOTH Electron and the dev preview (proxy is reachable via `wss://...kirk.replit.dev/__api-server/api/transcribe-stream` from any origin). `NEXT_PUBLIC_FORCE_BROWSER_SPEECH=1` escape hatch retained for legacy fallback. Server-side WS proof recaptured in v0.5.41: handshake `OPEN 52 ms`, `{"type":"ready"}` received.
    -   v0.5.40 single-deployment topology for the desktop endpoint: a new Next.js custom server (`artifacts/imported-app/server.mjs` + `artifacts/imported-app/server-transcribe-stream.mjs`) replaces `next start` in production and embeds the Deepgram streaming WebSocket handler directly into the same HTTP server that serves the Next.js app. Effect: when the imported-app is published as a **Reserved VM** at `scripturelive.replit.app`, both `https://scripturelive.replit.app/...` (REST/UI) and `wss://scripturelive.replit.app/api/transcribe-stream` (real-time transcription) work at the same origin — no second deployment, no Electron URL change needed. The customer Windows build's existing `DEFAULT_TRANSCRIBE_PROXY_URL` (which the Electron main hands to its embedded Next.js as `TRANSCRIBE_PROXY_URL`) now resolves the correct WSS URL via the existing `/api/transcribe-stream/info` derivation. PROVEN locally: production-built imported-app booted on port 37123 served `HTTP 200` on `/`, accepted a WS upgrade on `/api/transcribe-stream`, opened the Deepgram backend socket, and returned `{"type":"ready"}` to the client. **Publish requirements:** (1) in the Publish UI choose **Reserved VM** (not Autoscale — autoscale terminates long-lived WebSockets); (2) `DEEPGRAM_API_KEY` must be present in the deployment's secrets (the same workspace secret already in use). The shared `pnpm` workspace dependency `ws@^8.18.0` was added to `@workspace/imported-app`.

# External Dependencies

-   **Monorepo tool**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Validation**: Zod (`zod/v4`), `drizzle-zod`
-   **API Codegen**: Orval (from OpenAPI spec)
-   **Build Tool**: esbuild
-   **Frontend Framework**: Next.js 16 (for "Imported App")
-   **Database (Imported App)**: Prisma, SQLite (`artifacts/imported-app/db/custom.db`)
-   **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe` (via Replit AI Integrations proxy and `api-server`), Deepgram Nova-3 (streaming for real-time transcription).
-   **NDI Integration**: `grandiose` binding (for Electron desktop app)
-   **Image Processing**: `sharp` (for icon generation)
-   **Desktop Packaging**: Electron Builder
-   **File Upload Handling**: Multer (for `api-server`'s `/api/transcribe` route)
-   **AI SDK**: OpenAI SDK (in `api-server`)
-   **Hashing**: `hash-wasm` (for incremental SHA-256 in dynamic downloads)