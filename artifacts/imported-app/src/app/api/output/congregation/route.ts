import { NextResponse } from 'next/server'
import { googleFontsHref, FONT_REGISTRY } from '@/lib/fonts'

/**
 * GET /api/output/congregation
 *
 * Serves the standalone congregation display page.
 * This page connects to /api/output via SSE to receive real-time slide updates.
 * It can be opened in any browser — on the same machine or across the local network.
 * Use NDI Screen Capture on this window to send to vMix/Wirecast.
 */
export async function GET() {
  // Inject the same Google Fonts link the operator UI loads, so any
  // family the operator picks renders identically here. Then expose the
  // full font registry to the page script so render() can resolve a
  // key like "playfair" → its CSS stack without a round-trip.
  const fontMapJson = JSON.stringify(
    Object.fromEntries(FONT_REGISTRY.map((f) => [f.key, f.stack])),
  )
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ScriptureLive — Congregation Display</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${googleFontsHref}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100vw;height:100vh;overflow:hidden;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
/* The output canvas is the inner letterbox honoring displayRatio. The
   stage element fills the whole viewport with the theme background and
   centers the canvas. */
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
#output{position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;--slide-fade-ms:350ms;opacity:1}
#output.hidden{opacity:0;transition:opacity 200ms ease}
/* v0.5.32 — soft cross-fade. The new content is painted FIRST, then
   this animation eases its opacity from 0.25 to 1 over the operator's
   chosen duration. Critically, opacity NEVER reaches 0, so the surface
   never goes black between slides — the most common cause of the
   "blank black screen" report on the projector and the NDI receiver. */
#output.soft-in{animation:softIn var(--slide-fade-ms,350ms) ease-out}
@keyframes softIn{from{opacity:.25}to{opacity:1}}
#output.ratio-16x9{aspect-ratio:16/9;width:min(100vw,calc(100vh*16/9));height:min(100vh,calc(100vw*9/16))}
#output.ratio-4x3{aspect-ratio:4/3;width:min(100vw,calc(100vh*4/3));height:min(100vh,calc(100vw*3/4))}
#output.ratio-21x9{aspect-ratio:21/9;width:min(100vw,calc(100vh*21/9));height:min(100vh,calc(100vw*9/21))}
/* v0.7.221 — Operator escalation: image AND video backgrounds were too
   dark to read on the projector / NDI feed. Effective brightness was
   .4 * (1 - .3) = .28 of source pixel value (bg opacity * (1 - scrim
   alpha)). Operator side-by-side proof approved opacity .4 → .6 +
   scrim .3 → .2, taking effective brightness to .6 * .8 = .48 (~70%
   brighter) while keeping enough contrast for white verse text +
   text-shadow to stay WCAG-AA legible. Same pair applied to .lt-bg
   / .lt-bg-overlay (lower-third surface) so chyron and full-screen
   modes match. The legacy .bg-image class shares the .bg-overlay
   stack so it follows the same axis. */
/* v0.7.227 — Operator brightness slider: both members of the
   v0.7.226 pair-invariant are now driven by CSS variables set by
   applyRender() from s.settings.bgBrightness. Fallback to the
   v0.7.226 baseline (.85 / .05) when the var is unset so first-paint
   before SSE settles AND pre-v0.7.227 persisted state render
   identically to v0.7.226. Pair invariant preserved by SOURCE:
   --bg-opacity = brightness/100, --bg-scrim = (1 - opacity) * 0.333. */
.bg-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:var(--bg-opacity,.85);pointer-events:none}
.bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,var(--bg-scrim,.05));pointer-events:none;z-index:1}
/* v0.7.187 — Persistent BG VIDEO layer (PERFORMANCE FIX). Pre-fix, the
   verse-background <video> was inlined into #output's innerHTML on every
   render. Because the renderer reassigns $('output').innerHTML on every
   SSE/poll tick (see L665-696 lifecycle note), the <video> was destroyed
   and recreated several times per second — restarting from t=0 each time,
   which the operator perceived as constant judder/freezing across all 6
   surfaces (preview iframe, Live Display, secondary screen, NDI, projector,
   OBS browser source). The setVid() cache pattern below (~L1062) protects
   FOREGROUND media but never covered BG.
   Fix: a sibling layer #bgLayer that is NEVER touched by output.innerHTML.
   setBgVid(url) (defined just above render()) rebuilds the cached <video>
   ONLY when the URL changes — same-URL calls are no-op, so successive
   renders leave playback continuous. Sized identically to #output via the
   same ratio classes so the bg fills the same letterboxed inner area
   (no leaking into the black surround when viewport != displayRatio). */
#bgLayer{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden}
#bgLayer.ratio-16x9{aspect-ratio:16/9;width:min(100vw,calc(100vh*16/9));height:min(100vh,calc(100vw*9/16))}
#bgLayer.ratio-4x3{aspect-ratio:4/3;width:min(100vw,calc(100vh*4/3));height:min(100vh,calc(100vw*3/4))}
#bgLayer.ratio-21x9{aspect-ratio:21/9;width:min(100vw,calc(100vh*21/9));height:min(100vh,calc(100vw*9/21))}
/* v0.7.221 — GPU compositing hints for the background <video>/<img>.
   #bgLayer sits at z:0 with #output painting opaque slide content at
   z:1 on top. Without an explicit compositing hint Chromium puts both
   layers on the same paint surface, so every text re-render (slide
   transition, animation, anti-aliasing pass) invalidates the bg
   pixels too and the bg video has to repaint from scratch. That is
   the dominant source of judder operators saw on the Live Display
   pane + Secondary Screen popup, and the dominant source of dropped
   frames on the NDI offscreen capture. translateZ(0) promotes the bg
   to its own GPU layer (independent of #output's paint), will-change
   tells the compositor to keep it on the GPU between frames, and
   backface-visibility:hidden avoids subpixel snap glitches on scaled
   surfaces (Secondary Screen popup at non-integer DPRs). These are
   the same primitives EasyWorship/ProPresenter use for their bg
   video layers. Cheap (1 extra compositor layer) and broadcast-safe. */
/* v0.7.221 — opacity:.4 → .6 (brightness fix, see .bg-image comment
   above). GPU compositing hints unchanged (also v0.7.221). */
/* v0.7.227 — opacity driven by --bg-opacity (set by applyRender from
   settings.bgBrightness). Fallback .85 preserves v0.7.226 baseline. */
#bgLayer > video, #bgLayer > img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:var(--bg-opacity,.85);display:block;transform:translateZ(0);will-change:transform,opacity;backface-visibility:hidden}
#output{position:relative;z-index:1}
.slide-content{position:relative;z-index:1;text-align:center;width:90%;max-width:90vw;height:100%;max-height:100%;min-height:0;box-sizing:border-box;overflow:hidden;padding:4vh 3vw;display:flex;flex-direction:column;align-items:center;justify-content:center}
/* v0.6.3 — Bible reference text: BOLD by default + full opacity. The
   previous .55 opacity + default 500 weight made the chapter / verse
   line whisper-soft on the projector and effectively invisible on the
   NDI feed once the receiver re-encoded. Operators consistently asked
   for the reference to read clearly so the congregation sees what
   chapter is being read. Bound to ALL surfaces (live display,
   secondary screen, NDI lower-third) since they share this engine. */
.slide-reference{font-size:clamp(.85rem,1.4vw,1.6rem);opacity:1;font-weight:700;margin-bottom:1.4vh;letter-spacing:.06em;width:100%;display:block;box-sizing:border-box}
.slide-text{font-weight:500;line-height:1.4;margin:0;padding:0;word-wrap:break-word;overflow-wrap:break-word}
/* When the verse splitter hands us multiple short lines, render them
   as a single flowing paragraph so words wrap on a consistent baseline
   instead of each chunk floating on its own line. */
.slide-paragraph{font-weight:500;line-height:1.4;margin:0;padding:0;word-wrap:break-word;overflow-wrap:break-word}
.slide-title{font-weight:700;line-height:1.2}
.slide-subtitle{opacity:.7;margin-top:1.4vh}
.theme-worship{background:linear-gradient(135deg,#1e0a3c,#1e1b4b)}
.theme-sermon{background:linear-gradient(135deg,#3c1a0a,#451a03)}
.theme-easter{background:linear-gradient(135deg,#0a3c2a,#042f2e)}
.theme-christmas{background:linear-gradient(135deg,#3c0a0a,#4c0519)}
.theme-praise{background:linear-gradient(135deg,#3c3a0a,#451a03)}
/* v0.7.221 — Operator escalation: "I can't see anything when no
   background uploaded". With Minimal as the default theme and no
   customBackground configured, the surface was a near-black void
   (#0a0a0a → #171717). Brightened to a visible slate (#1e1e24 →
   #2a2a35) so the projector / NDI feed reads as an actual surface
   even when the operator has not yet uploaded a custom background.
   Still firmly in the modern dark-UI register — keeps high text
   contrast and reads as intentional design, not a fade-to-black.
   Same value applied to .lt-box.theme-minimal so the lower-third
   chyron card matches the full-screen Minimal surface. */
.theme-minimal{background:linear-gradient(135deg,#1e1e24,#2a2a35)}
/* v0.7.15 — Lower-third stretched to fill ~95% of the frame width.
   Operator screenshot (red box covering near-edge-to-edge of preview)
   showed the v0.7.8-restored 68rem max-width was capping the card at
   ~56% of a 1920px frame — way smaller than the bottom band the
   operator had marked up. We drop the side padding from 6% → 2.5%
   AND remove the absolute max-width cap, so the card now spans
   ~95vw on every surface (preview iframe + secondary screen + NDI
   capture, since they share this renderer). Pixel-WYSIWYG is
   preserved because the same defaults apply everywhere. */
/* v0.7.173 — align-items: stretch (was: center). Operator complaint:
   the lower-third frame on the in-app Live Display, secondary screen
   and OBS browser source was visibly shrinking to hug the verse text
   instead of staying frozen at the height bucket (sm/md/lg =
   22/33/45 percent of the 16:9 frame). Root cause: align-items:center
   on this flex parent let the .lt-box child collapse to its intrinsic
   content height in some layout passes (Chromium recomputes percent
   heights against the cross-axis, and height:100% on a centred flex
   child can resolve to auto when the parent main-axis sizing is in
   flight). Switching to stretch forces the .lt-box to fill the parent
   bucket height on every surface — pixel-identical to the Lower Third
   Settings preview, which already happened to render correctly because
   its tighter aspect made the centred-vs-stretched difference invisible.
   The .lt-box already carries justify-content:center so the verse text
   continues to centre inside the (now properly stretched) frame. */
/* v0.7.176 — Tighten horizontal padding so the .lt-box renders as a
   centred chyron card (matching the operator's target screenshot
   pvktjHxy + the in-app Lower Third Settings preview), not a near
   edge-to-edge bar. Also keeps align-items:stretch from v0.7.173
   Fix D so the box height is driven by the parent bucket and never
   shrinks/expands to hug the verse text. */
.lower-third{position:absolute;left:0;right:0;display:flex;align-items:stretch;justify-content:center;padding:0;container-type:size}
.lower-third.bottom{bottom:6%}.lower-third.top{top:6%}
/* Lower-third is now a rounded "card" that holds the verses. The
   upper area outside it stays transparent (#000) so any background
   change applies only to this rounded box, per spec.
   v0.7.15 — max-width cap removed (was 68rem). Width is now driven
   by the .lower-third side padding above, so the card scales from
   small previews up to full 1920px frames consistently. */
/* v0.7.176 — REVERT v0.7.173 Fix B. The pre-v0.7.173 dark plate
   (linear gradient + drop-shadow) is restored as the .lt-box default
   on every output surface. Operator field-report after v0.7.173:
   "you have destroyed it completely. The main background is
   transparent while the main background frame of the NDI lower
   third and text are visible." The plate IS the lower-third —
   without it the verse text floats unreadably over the video.
   Operators who want a fully-transparent NDI matte continue to
   opt IN via the legacy .lt-box.transparent flag (v0.6.3, NDI tab
   "Transparent lower-third" toggle). Operator-uploaded background
   images via .lt-bg / .lt-bg-overlay still layer on top of the
   plate as before. */
.lt-box{position:relative;width:100%;padding:3% 5%;display:flex;flex-direction:column;justify-content:center;overflow:hidden;height:100%;box-sizing:border-box;border-radius:1.25rem;box-shadow:0 8px 28px rgba(0,0,0,.45);background:linear-gradient(135deg,#0a0a0a,#171717)}
/* v0.7.15 — .ndi-full class kept as a no-op for backwards-compat
   with any persisted SSE state that still tries to add it. The base
   .lower-third + .lt-box now delivers the wide layout, so we no
   longer need a separate "full" variant. */
.lower-third.ndi-full{}
.lt-box.ndi-full{}
/* v0.7.176 — REVERT v0.7.173 theme-* neutraliser. Theme gradients
   apply to the lower-third box again (matching the pre-v0.7.173
   behaviour the operator confirmed correct). The .lt-box.transparent
   opt-in remains the only way to drop the plate. */
.lt-box.theme-worship{background:linear-gradient(135deg,#1e0a3c,#1e1b4b)}
.lt-box.theme-sermon{background:linear-gradient(135deg,#3c1a0a,#451a03)}
.lt-box.theme-easter{background:linear-gradient(135deg,#0a3c2a,#042f2e)}
.lt-box.theme-christmas{background:linear-gradient(135deg,#3c0a0a,#4c0519)}
.lt-box.theme-praise{background:linear-gradient(135deg,#3c3a0a,#451a03)}
/* v0.7.221 — Lower-third Minimal MUST be an explicit compound
   selector .lt-box.theme-minimal (no space, no comment between),
   NOT a descendant selector .lt-box .theme-minimal nor a comment-
   collapsed .lt-box/**/.theme-minimal (architect medium-risk
   caveat: comment-collapsed compound selectors are technically
   valid per CSS tokenizer but rely on cascade ordering and are
   brittle to unrelated reorders). Value MUST match the full-screen
   .theme-minimal slate gradient defined at L132 so the lower-third
   chyron and the full-screen Minimal surface stay pixel-identical
   when the operator toggles Display Mode mid-event. (ASCII quotes
   only — this CSS lives inside a JS template literal and backticks
   in the comment would close the outer string.) */
.lt-box.theme-minimal{background:linear-gradient(135deg,#1e1e24,#2a2a35)}
/* v0.6.3 — NDI lower-third transparent matte. When the operator flips
   "Transparent lower-third" on the NDI tab, the rounded card drops
   its gradient + drop-shadow so vMix / OBS receive a clean alpha
   matte (text only, zero fill). The text itself stays opaque so it
   survives keying. The !important flag is intentional — it must beat
   the per-theme background overrides above. */
.lt-box.transparent{background:transparent !important;box-shadow:none !important}
.lt-box.transparent .lt-bg,.lt-box.transparent .lt-bg-overlay{display:none !important}
/* Custom background image — clipped to the rounded box only. */
/* v0.7.221 — Operator brightness fix (see .bg-image comment at top
   of CSS): opacity .4 → .6, scrim alpha .3 → .2. Lower-third bg
   stack mirrors the full-screen bg stack so chyron and full
   surfaces stay visually consistent. */
/* v0.7.227 — Lower-third bg pair also driven by --bg-opacity /
   --bg-scrim. 3-surface lockstep invariant preserved (v0.7.226). */
.lt-box .lt-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:var(--bg-opacity,.85);border-radius:inherit;pointer-events:none}
.lt-box .lt-bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,var(--bg-scrim,.05));border-radius:inherit;pointer-events:none}
.lt-box .lt-content{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;overflow:hidden;min-height:0}
/* v0.7.5 — Hard clamp the verse text to N lines inside the FIXED
   lower-third frame (T503). Combined with the auto-fit ltFs clamp
   in the renderer, long verses shrink first; if they still don't
   fit they truncate cleanly with an ellipsis instead of bleeding
   past the rounded card edge. Line counts mirror the height bucket
   (sm/md/lg) so the small frame doesn't try to render 8 lines. */
.lt-box .lt-content .slide-text,
.lt-box .lt-content .slide-title{
  display:-webkit-box;-webkit-box-orient:vertical;
  overflow:hidden;text-overflow:ellipsis;
  -webkit-line-clamp:6;line-clamp:6;
  word-break:break-word;overflow-wrap:anywhere;
}
/* v0.6.3 — lower-third reference: same bold default as full-screen so
   broadcast viewers see the chapter clearly even at lower-third sizes. */
.lt-box .slide-reference{font-size:clamp(.7rem,min(2cqw,4cqh),1.4rem);opacity:1;font-weight:700;line-height:1.2;margin-bottom:.6cqh}
.lt-box .slide-text,.lt-box .slide-title{font-weight:700;line-height:1.25}
.align-left{text-align:left;align-items:flex-start}
.align-right{text-align:right;align-items:flex-end}
.align-center{text-align:center;align-items:center}
.align-justify{text-align:justify;align-items:stretch}
/* Item #15 — operator request: hide the "Connected" / "Disconnected"
   status pill on the secondary display and NDI surface entirely. The
   small badge in the top-right was distracting on stage projection
   (and looked like an error to the congregation). Behaviour stays —
   we just never show the chip. The full-screen "Reconnecting…"
   overlay below is still allowed so a real network outage isn't
   silent. */
#status{display:none !important}
#status.visible{display:none !important}
#status-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
#status.connected #status-dot{background:#22c55e;animation:none}
#reconnecting{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.95);z-index:200;flex-direction:column;gap:1rem}
#reconnecting.active{display:flex}
.spinner{width:2rem;height:2rem;border:3px solid #333;border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="status"><div id="status-dot"></div><span id="status-text">Connecting...</span></div>
<div id="reconnecting"><div class="spinner"></div><div style="color:#999;font-size:.9rem">Reconnecting to ScriptureLive...</div></div>
<!-- v0.5.33 — bake the splash watermark into the initial body so the
     surface is NEVER visually blank, even before SSE connects or the
     first poll lands. The renderer replaces this on first state. -->
<div id="stage"><div id="bgLayer"></div><div id="preheatLayer" style="position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0"></div><div id="output"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;text-align:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"><div style="font-size:clamp(2rem,7vmin,7rem);font-weight:600;letter-spacing:-.01em;line-height:1.05;opacity:.4">Scripture AI</div><div style="margin-top:1.4vmin;font-size:clamp(.85rem,1.8vmin,1.6rem);opacity:.3;font-weight:500">Powered By WassMedia (+233246798526)</div></div></div></div>
<script>
// Surface any uncaught script error as a visible red banner instead of
// silently leaving the splash up forever (which is exactly how the
// regex-flag parse error masked itself for so many builds). Cheap
// safety net — fires at the parser level, so it works even if the
// rest of this script has a typo we missed during review.
window.addEventListener('error', function(ev){
  try{
    var el=document.getElementById('output');
    if(el){ el.innerHTML='<div style="position:fixed;inset:0;background:#400;color:#fff;font:14px monospace;padding:12px;white-space:pre-wrap;z-index:99999">[ScriptureLive] Renderer error: '+(ev&&ev.message)+'\\n  at '+(ev&&ev.filename)+':'+(ev&&ev.lineno)+':'+(ev&&ev.colno)+'</div>'; }
  }catch(_e){}
});
const themes={worship:'theme-worship',sermon:'theme-sermon',easter:'theme-easter',christmas:'theme-christmas',praise:'theme-praise',minimal:'theme-minimal'};
// Font registry mirrored from src/lib/fonts.ts so we can resolve
// fontFamily keys (e.g. "playfair") to the same CSS stack the operator
// console uses. Tolerates legacy "font-sans"-style values.
const FONT_MAP=${fontMapJson};
function resolveFont(k){
  // v0.7.17 — FONT_MAP values use double-quoted family names like
  // \"Segoe UI\" (standard CSS). When inlined into an HTML
  // style="..." attribute, those embedded \" terminate the
  // attribute early and silently drop every later declaration
  // (font-size, font-style, text-shadow, …). This bug invisibly
  // disabled the NDI Reference Label SIZE / STYLE / SCALE knobs
  // because the ref div builds its inline style as
  // 'font-family:'+rfFam+';font-size:...;font-style:...;'+rfShCss
  // — once rfFam contained \" the rest was discarded by the parser.
  // Single quotes around font names are equally valid CSS and
  // survive the surrounding double-quoted attribute, so swap them
  // here once and every downstream interpolation stays intact.
  if(!k)return FONT_MAP['sans'].replace(/"/g,"'");
  if(typeof k==='string'&&k.indexOf('font-')===0)k=k.slice(5);
  return (FONT_MAP[k]||FONT_MAP['sans']).replace(/"/g,"'");
}
// Same four-bucket size multiplier the operator preview applies.
const FS_MULT={sm:.85,md:1,lg:1.25,xl:1.5};
// Detect the NDI sender's hidden capture window. When the URL is
// loaded with ?ndi=1 (Electron main appends this for the offscreen
// frame-capture window) the renderer treats this surface as the NDI
// feed: it ignores the operator's projector displayMode and instead
// honours settings.ndiDisplayMode so vMix/OBS can receive a Lower
// Third while the projector stays Full Screen (or vice-versa).
//
// FORCE_TRANSPARENT / FORCE_LT / FORCE_POS are the legacy NDI overlay
// flags that the old /api/output/ndi route used to honour. They now
// flow into this single renderer so Preview, the secondary screen
// AND NDI render the SAME slide.content with the SAME fit logic —
// the NDI route is a thin redirect that just forwards these params.
var IS_NDI=false;
var FORCE_TRANSPARENT=false;
var FORCE_LT=false;
var FORCE_POS=null;
// v0.7.127 — Settings-page Preview iframe mode. When ?preview=1 is
// set, this page does NOT connect to SSE / poll. Instead it listens
// for postMessage from the parent window with payloads built by the
// SAME buildOutputPayload() the broadcaster uses, then hands them to
// the SAME applyRender() the live secondary screen + NDI capture
// use. Result: the preview is the live renderer running off-screen,
// so what the operator sees in Settings is byte-identical to what
// the projector + NDI feed will paint. ?fullScreen=1 forces the
// full-screen layout regardless of operator's displayMode (used by
// the side-by-side "Preview (Full Screen)" + "Preview (Lower Third)"
// cards on Display & Output so both modes render simultaneously
// without the operator having to toggle their actual setting).
var IS_PREVIEW=false;
var FORCE_FULL=false;
var IS_NO_MEDIA=false;
// v0.7.221 — see freezeBg parser block below.
var IS_FROZEN_BG=false;
// v0.7.5.1 — FORCE_LH / FORCE_SC let the Electron NDI capture pin the
// operator's lower-third HEIGHT bucket and SCALE multiplier into the
// URL itself, so the captured BrowserWindow renders the right box
// size on the VERY FIRST paint instead of waiting for the SSE state
// push. Pre-fix, the BrowserWindow rendered with default state (md
// bucket, 1.0x scale) until SSE arrived — long enough that vMix/OBS
// often grabbed a frame mid-transition and the operator saw an OLD
// oversized bar even after they had dragged the slider down. Honoured
// by the renderer below with PRIORITY over st.* so URL wins.
var FORCE_LH=null;
var FORCE_SC=null;
// v0.7.194-hotfix.4 — Per-feed full-screen background override pushed
// from the NDI panel via buildCongregationParams. Default = themed
// (v0.6.9 behaviour: themed gradient + custom bg rendered into NDI,
// identical to the in-room projector). When set to 'transparent' we
// strip both so vMix/OBS/Wirecast receive verse text on a clean alpha
// matte. Lower-third has the equivalent toggle (ndiLowerThirdTransparent
// + ltTransparentClass) for its surrounding area.
var FS_BG_TRANSPARENT=false;
try{
  var __qp=new URLSearchParams(location.search);
  IS_NDI=(__qp.get('ndi')==='1');
  FORCE_TRANSPARENT=(__qp.get('transparent')==='1');
  FS_BG_TRANSPARENT=(__qp.get('fsbg')==='transparent');
  FORCE_LT=(__qp.get('lowerThird')==='1');
  var __p=__qp.get('position');
  if(__p==='top'||__p==='bottom')FORCE_POS=__p;
  var __lh=__qp.get('lh');
  if(__lh==='sm'||__lh==='md'||__lh==='lg')FORCE_LH=__lh;
  var __sc=parseFloat(__qp.get('sc')||'');
  if(isFinite(__sc)&&__sc>=0.5&&__sc<=2)FORCE_SC=__sc;
  IS_PREVIEW=(__qp.get('preview')==='1');
  FORCE_FULL=(__qp.get('fullScreen')==='1');
  // v0.7.198 — When ?noMedia=1 is set, the renderer skips the
  // <video>/<img> branch entirely and falls through to the standard
  // verse/background path. Used by the SETTINGS preview iframes
  // (Display & Output Live Preview, Typography preview, NDI Live
  // Preview inside the NDI panel) where the operator wants to see
  // ONLY the background — not 5 simultaneous video decoders running
  // for what is essentially a typography auditioning UI. The actual
  // outputs (Main Preview/Live columns, secondary screen, offscreen
  // NDI FrameCapture, Browser Source) do NOT pass this flag, so
  // operator + congregation + OBS still see video.
  IS_NO_MEDIA=(__qp.get('noMedia')==='1');
  // v0.7.221 — When ?freezeBg=1 is set, the custom-background <video>
  // in #bgLayer mounts WITHOUT autoplay/loop and is paused on the
  // first frame so the surface shows a still poster instead of a
  // playing clip. Used by every operator-facing PREVIEW surface that
  // is NOT the real broadcast target: Settings PREVIEW (TYPOGRAPHY),
  // Settings Custom Background thumbnail, Settings NDI LIVE PREVIEW,
  // Settings Display & Output LIVE PREVIEW, and the Main Console
  // PREVIEW pane (the middle column in the operator view). Operator
  // escalation: a background video was animating in 5+ places on a
  // single screen, distracting the operator from the actual live
  // pane and chewing decoder slots/CPU. Real broadcast targets do
  // NOT pass this flag and keep playing: Main Console LIVE DISPLAY
  // pane (OutputPreview mirrorLive=true), Secondary Screen popup
  // window (opened with no query params), Offscreen NDI FrameCapture
  // (its own URL builder in electron/, no freezeBg). This is a
  // separate axis from noMedia: noMedia hides media-video SLIDES
  // (foreground content); freezeBg pauses the BACKGROUND layer.
  IS_FROZEN_BG=(__qp.get('freezeBg')==='1');
}catch(e){}
// v0.7.209 — Force the operator-chosen background with !important
// inline so it beats OBS Browser Source default Custom CSS
//   body { background-color: rgba(0,0,0,0); }
// which OBS appends AFTER our page style and which previously won
// the cascade (same specificity, later declaration wins) — silently
// making the OBS feed transparent even when the operator had picked
// themed full-screen mode. v0.7.202 gated the URL transparent=1
// param but the underlying CSS override was untouched, so OBS still
// applied its alpha rule on top of our stylesheet background #000
// (line 31). Inline style + important beats any stylesheet rule,
// important or not, so this is the only fix that consistently wins
// regardless of what OBS / vMix / Wirecast inject into the page.
// FORCE_TRANSPARENT=true  → operator opted in: paint transparent.
// FORCE_TRANSPARENT=false → operator did NOT opt in: paint solid #000
//   so the OBS Browser Source receives the same opaque frame the
//   in-room projector shows. Done at load time (not in render) so the
//   very first paint already carries the right fill — preventing a
//   one-frame flash before render() catches up.
// v0.7.211 — REVISED v0.7.209. The previous block pinned #output to
// the same opaque __bgInit as html/body/#stage, but #output is the
// z-index:1 sibling that sits ON TOP of #bgLayer (z:0, where the
// operator customBackground video/image lives). Inline #000 on
// #output therefore COVERED the customBackground entirely — operator
// reported background image not showing AND OBS/Wirecast not showing
// the themed background. Fix: #output MUST always be inline transparent
// so #bgLayer shows through; the wrapper div emitted into output.innerHTML
// carries the theme gradient itself (L1354, L1516, L1892) when no
// customBg, or stays transparent (L1352, L1514) when a customBg is
// mounted. OBS Custom CSS body background-color rgba 0 0 0 0 only
// targets the body element, so html + body + #stage still need their
// opaque pin to beat that injection; #output is not a target so
// transparent is safe. important still required so a later plain
// style.background empty-string in render() can never clear our intent.
try{
  var __bgInit=FORCE_TRANSPARENT?'transparent':'#000';
  document.documentElement.style.setProperty('background',__bgInit,'important');
  document.body.style.setProperty('background',__bgInit,'important');
  var __st=document.getElementById('stage');if(__st)__st.style.setProperty('background',__bgInit,'important');
  var __op=document.getElementById('output');if(__op)__op.style.setProperty('background','transparent','important');
}catch(e){}
let es=null,reconnects=0;
const $=id=>document.getElementById(id);
// Hash of the last rendered payload — render() bails out if the next
// payload is identical, which prevents the flash that came from rapid
// SSE + poll double-fire and from re-broadcasting the same settings.
let lastRenderKey='';
// Fingerprint of just the visible SLIDE (not settings). applyRender
// uses this to decide whether the operator's change actually swapped
// the slide content (→ fade is appropriate) or just adjusted a knob
// like font size, theme, or NDI display mode (→ instant swap, no
// fade). On the NDI surface this is critical: every setting tweak
// used to fade-to-black for slideTransitionDuration ms = a visible
// strobe on vMix / OBS / Studio Monitor.
let lastSlideFingerprint='';
function slideFingerprint(s){
  if(!s)return '__none__';
  if(s.blanked)return '__blanked__';
  // v0.5.33 — clear state ALWAYS shows the splash watermark unless
  // the operator explicitly disabled it (showStartupLogo===false). The
  // old behaviour painted pure black after the first slide had been
  // broadcast (because hasShownContent flipped showStartupLogo off
  // permanently), which operators reported as "the projector went
  // blank". True black requires the explicit Black button (s.blanked).
  if(s.type==='clear')return (s.showStartupLogo!==false)?'__logo__':'__clear__';
  var sl=s.slide;
  if(!sl)return '__empty__';
  // Only the fields that visibly change the slide. Transport flags
  // (mediaPaused, mediaCurrentTime) are intentionally OUT — toggling
  // play/pause must not refire a fade.
  var contentJoin='';
  if(sl.content&&sl.content.join)contentJoin=sl.content.join('\\u241F');
  return [
    sl.id||'',
    sl.type||'',
    sl.title||'',
    sl.subtitle||'',
    sl.background||'',
    sl.mediaUrl||'',
    sl.mediaKind||'',
    sl.mediaFit||'',
    contentJoin,
    s.displayMode||'',
  ].join('|');
}
// v0.7.155 — Detect whether the operator's customBackground URL points
// at a video file (mp4/webm/mov/mkv/avi/m4v/ogv) or data:video/* URI.
// Mirrors isVideoBackground() in src/lib/utils.ts; duplicated here
// because this script is injected into the standalone congregation
// page and cannot import from the app bundle.
function isVideoBg(u){
  if(!u) return false;
  var s=String(u).toLowerCase();
  if(s.indexOf('data:video/')===0) return true;
  return /\\.(mp4|webm|mov|mkv|avi|m4v|ogv)(?:$|[?#])/.test(s);
}
// v0.7.155 — Escape a string for safe interpolation inside an HTML
// double-quoted attribute. Pre-v0.7.155 the customBackground URL was
// concatenated raw into innerHTML attribute strings; a value
// containing a double-quote (or angle bracket) could break out of
// the src attribute and inject arbitrary markup. /api/output
// state-push is unauthenticated on the local network, so this is the
// correct surface to harden. We also reject anything that does not
// look like a safe scheme/path (allow http(s), data:image/*,
// data:video/*, and root-relative URLs; strip everything else --
// most importantly javascript: URIs).
function escAttr(v){
  return String(v==null?'':v)
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/'/g,'&#39;');
}
function safeBgUrl(u){
  if(!u) return '';
  var s=String(u);
  if(/^https?:\\/\\//i.test(s)) return s;
  if(/^data:(image|video)\\//i.test(s)) return s;
  if(s.charAt(0)==='/') return s;
  return '';
}

// Subset of settings that actually change what render() draws. Used
// in the render-key so the captured page only rebuilds DOM when one
// of these changes — not when an unrelated setting (OpenAI key,
// transcription provider, audio rail toggle, recent-search list, …)
// gets rebroadcast. Keys here MUST mirror the fields render() reads
// off st.X below.
function settingsRenderKey(st){
  if(!st)return '';
  return JSON.stringify({
    th: st.congregationScreenTheme,
    bg: st.customBackground,
    rt: st.displayRatio,
    fs: st.fontSize,
    ff: st.fontFamily,
    sh: st.textShadow,
    ts: st.textScale,
    ta: st.textAlign,
    ref: st.showReferenceOnOutput,
    nd: st.ndiDisplayMode,
    lh: st.lowerThirdHeight,
    lp: st.lowerThirdPosition,
    // Reference typography (Bug #5): re-render when any of the 5
    // reference-only fields change so the operator's edit lands on
    // the secondary screen + NDI feed without waiting for an
    // unrelated setting to also change.
    rfFs: st.referenceFontSize,
    rfFf: st.referenceFontFamily,
    rfSh: st.referenceTextShadow,
    rfTs: st.referenceTextScale,
    rfTa: st.referenceTextAlign,
    // NDI-only typography overrides (v0.5.48). Re-render the captured
    // NDI window when any of them change so vMix/OBS see the new look
    // immediately. They're absent on the secondary-screen render
    // because resolveTypography() below only honours them when
    // IS_NDI=true, but including them in the key for both surfaces is
    // harmless and keeps the key shape stable across windows.
    ndFs: st.ndiFontSize,
    ndFf: st.ndiFontFamily,
    ndSh: st.ndiTextShadow,
    ndTs: st.ndiTextScale,
    ndTa: st.ndiTextAlign,
    // v0.5.57 — Eight new NDI-only fields (aspect, bible color, line
    // height, reference {size, style, position, scale}, translation).
    // Honoured server-side only when IS_NDI=true; included in the
    // key so the captured NDI window re-renders the moment the
    // operator nudges any of them in the NDI Output panel.
    ndAr: st.ndiAspectRatio,
    ndBc: st.ndiBibleColor,
    ndBlh: st.ndiBibleLineHeight,
    ndRfFs: st.ndiRefSize,
    ndRfSt: st.ndiRefStyle,
    ndRfPos: st.ndiRefPosition,
    ndRfTs: st.ndiRefScale,
    ndTr: st.ndiTranslation,
    /* v0.7.167 -- Lower-third typography pile (parallel to ndi-star
       above). Honoured server-side only when USE_LT_OVERRIDES=true
       (non-NDI && dm starts with lower-third), but included in the
       key for every surface so any LT-only edit triggers an
       immediate repaint on the preview/live/secondary/OBS without
       waiting on an unrelated field to change. Without these the
       render bails on key===lastRenderKey and the operator's slider
       drag does nothing until the next slide swap. */
    ltFf: st.lowerThirdFontFamily,
    ltFs: st.lowerThirdFontSize,
    ltSh: st.lowerThirdTextShadow,
    ltTs: st.lowerThirdTextScale,
    ltTa: st.lowerThirdTextAlign,
    ltBc: st.lowerThirdBibleColor,
    ltBlh: st.lowerThirdBibleLineHeight,
    // v0.6.4 — operator's NDI lower-third size multiplier. Re-render
    // the captured NDI window when the operator drags the slider so
    // vMix/OBS see the new bar height + text scale on the next tick.
    ndLtSc: st.ndiLowerThirdScale,
    ndLtTr: st.ndiLowerThirdTransparent,
    // v0.6.9 — operator-controlled Bible line-height that applies to
    // both the secondary screen AND the NDI feed (when no NDI-only
    // override is set). Re-render when the operator drags the new
    // slider in the Typography panel.
    blh: st.bibleLineHeight,
  });
}

// Compute clamp() font sizes that scale with the viewport so text is
// always readable but never overflows. fontSize picks the base, and
// textScale multiplies it. Long passages get bumped down further.
//
// v0.5.53 — Operator request: "sync second-screen text size with the
// Live display." On a 16:9 secondary monitor, the OLD vmin-based
// values rendered noticeably smaller than the same fontSize bucket
// looked in the operator's Live Display preview card. The fix is two
// parts: (1) switch the unit from vmin to vw so the text scales
// with the WIDTH of the screen (matches what the operator sees in
// the Live preview, which is sized by its container width); (2) bump
// the baseline bandText values to mirror the live-presenter Tailwind
// text-{2xl,3xl,4xl,5xl} ramp. The result on a 1920×1080 secondary
// monitor: e.g. md text rises from ~47 px (4.4vmin) to ~88 px
// (4.6vw) — much closer to what the operator picks in the preview.
// Long passages still progressively shrink so they never overflow.
// (v0.5.55: removed embedded backticks from the three comment lines
// above. This whole file is one giant JS template literal opened at
// line 20 (const html = ...) and closed at line 944 (...</html>),
// so any stray backtick inside a comment is interpreted as the
// CLOSING delimiter of that template literal and the rest of the
// file fails to parse. next dev / turbopack-dev was lenient about
// this; next build / turbopack-prod is not. Keep this whole region
// backtick-free.)
function fitFont(base, scale, totalChars){
  var bandTitle={sm:5.6,md:6.6,lg:7.6,xl:9.0}[base]||7.6;
  var bandText={sm:4.0,md:4.6,lg:5.2,xl:6.0}[base]||5.2;
  if(totalChars>140)bandText-=.4;
  if(totalChars>220)bandText-=.5;
  if(totalChars>320)bandText-=.5;
  if(totalChars>440)bandText-=.5;
  if(totalChars>600)bandText-=.5;
  if(totalChars>800)bandText-=.5;
  if(bandText<2.2)bandText=2.2;
  bandTitle*=scale;bandText*=scale;
  return {
    title:'clamp(1.4rem,'+bandTitle+'vw,10rem)',
    text:'clamp(1.1rem,'+bandText+'vw,7rem)',
    sub:'clamp(.9rem,'+(bandTitle*.55)+'vw,3rem)',
  };
}

function applyRatio(r){
  var o=$('output');
  o.classList.remove('ratio-16x9','ratio-4x3','ratio-21x9');
  if(r==='16:9')o.classList.add('ratio-16x9');
  else if(r==='4:3')o.classList.add('ratio-4x3');
  else if(r==='21:9')o.classList.add('ratio-21x9');
  // v0.7.187 — mirror the ratio onto #bgLayer so the persistent BG
  // video/image fills the same letterboxed inner area as #output. If
  // they diverged, a 4:3 projector with a 16:9 viewport would show the
  // bg leaking past the slide content into the black surround.
  var bl=document.getElementById('bgLayer');
  if(bl){
    bl.classList.remove('ratio-16x9','ratio-4x3','ratio-21x9');
    if(r==='16:9')bl.classList.add('ratio-16x9');
    else if(r==='4:3')bl.classList.add('ratio-4x3');
    else if(r==='21:9')bl.classList.add('ratio-21x9');
  }
}

// Drop the cached live <video> reference whenever the renderer is
// about to take a path that does NOT keep the same video on screen
// (clear, non-media slide, or a media slide whose source/kind/fit
// changed). Without this reset, a stale detached node could later
// satisfy the reuse guard and skip a needed DOM rebuild.
function dropLiveVideoCache(){
  window.__liveVideoEl=null;
  window.__liveVideoKey='';
}

// v0.7.187 — Persistent BG video/image cache (PERFORMANCE FIX for
// Bible-verse video backgrounds). See the CSS comment at #bgLayer
// (~L53) for the full rationale. Sibling layer #bgLayer holds a
// long-lived <video> or <img> element that survives every #output
// innerHTML rewrite. setBgVid(url) is keyed by URL: same URL on
// successive renders is a no-op so playback stays continuous.
// Hard-cut on URL change (operator-explicit choice — instant swap, no
// fade). Pass '' to clear the layer (blanked / cleared / no bg).
var __bgUrl='';
// v0.7.189 — Persistent LT (lower-third) bg cache. Mirrors __bgUrl /
// setBgVid for the fullscreen path but kept SEPARATE because the LT bg
// lives INSIDE the chyron card (.lt-box), not behind the whole stage.
// The cached element is MOVED into the freshly-rebuilt .lt-box on every
// render via mountLtBg() so it survives the innerHTML rewrite — fixing
// the t=0 restart-flash on every speech tick that the v0.7.187 #bgLayer
// hoist missed for LT mode.
var __ltBgUrl=''; var __ltBgEl=null; var __ltBgOverlay=null;
// v0.7.194-hotfix.10 — Rewrite legacy /api/upload?file=<uuid> URLs to the
// scripturelive-media:// custom protocol when running inside Electron.
// Mirrors resolveMediaUrl() in src/lib/utils.ts. Bypasses the Next.js
// single-threaded /api/upload route so 5 concurrent <video> decoders
// (Preview, Live, NDI preview, NDI capture, secondary kiosk) read straight
// off disk via the OS file cache. Gates on window.scriptureLive.isDesktop
// so the browser dev-preview pane (no protocol handler) keeps using HTTP.
// v0.7.194-hotfix.10 GR — Detection MUST tolerate BOTH "has scriptureLive
// preload" (mainWindow) AND "Electron UA, no preload" (frame-capture NDI
// offscreen window + createKioskOutput secondary screen). Pre-fix this
// helper only checked window.scriptureLive — the NDI/kiosk windows have
// no preload script (verified electron/frame-capture.ts L66-91 +
// electron/main.ts L2525-2537 — no preload: key), so window.scriptureLive
// was undefined and the rewrite was silently skipped on the two surfaces
// operators care MOST about (NDI to OBS/vMix + projector). UA sniff via
// /Electron/i is the safe additional signal because the global protocol
// handler is registered in main.ts whenReady and is available to every
// BrowserWindow in the app session — not just the ones with preload.
// Browser-based remote OBS Browser Sources (pasted URLs from before this
// hotfix) have neither scriptureLive nor "Electron" in their UA → fall
// through to HTTP, preserving backward compat.
// v0.7.196 — Re-enabled scripturelive-media protocol rewrite using ONLY
// string ops (indexOf/substring). The previous regex-literal version
// (hotfix.10) had its escaped slashes stripped by Next.js/SWC when this
// helper lives inside the outer const-html template literal, producing
// an invalid regex at runtime that threw Unterminated-group at parse
// time and killed the ENTIRE inline render script on every congregation
// BrowserWindow. String operations are immune to template-literal
// escape mangling because there are no escapes to mangle.
//
// Detection MUST tolerate BOTH window.scriptureLive (preload-script flag
// on mainWindow) AND Electron in navigator.userAgent (NDI offscreen
// capture and secondary-screen kiosk BrowserWindows have no preload, so
// scriptureLive is undefined there). Without the UA fallback the rewrite
// silently skips exactly the two surfaces operators care MOST about.
//
// DIAGNOSTIC: first successful rewrite per page logs once to console so
// any future regression where rewrite silently stops happening is
// immediately visible in DevTools.
//
// GUARD-RAIL A: do NOT re-introduce a regex literal inside this
// template-literal-embedded helper. String ops only.
// GUARD-RAIL B: do NOT put backtick characters in comments inside this
// template literal — even inside JS line comments, a stray backtick
// terminates the outer const-html template and breaks TS parsing.
var __scrMediaLogged=false;
function __scrMedia(u){
  if(!u) return u||'';
  try{
    var sl=window.scriptureLive;
    var ua=(typeof navigator!=='undefined')?(navigator.userAgent||''):'';
    var inElectron=(sl&&sl.isDesktop)||(ua.indexOf('Electron')>=0);
    if(!inElectron) return u;
    if(u.indexOf('data:')===0) return u;
    if(u.indexOf('scripturelive-media://')===0) return u;
    var key='/api/upload?file=';
    var idx=u.indexOf(key);
    if(idx<0) return u;
    var rest=u.substring(idx+key.length);
    var amp=rest.indexOf('&');
    var hash=rest.indexOf('#');
    var end=-1;
    if(amp>=0&&hash>=0) end=Math.min(amp,hash);
    else if(amp>=0) end=amp;
    else if(hash>=0) end=hash;
    var fn=(end<0)?rest:rest.substring(0,end);
    if(!fn) return u;
    var out='scripturelive-media://uploads/'+fn;
    if(!__scrMediaLogged){__scrMediaLogged=true;try{console.log('[__scrMedia] first rewrite:',u,'->',out);}catch(e){}}
    return out;
  }catch(e){return u;}
}
function ensureLtBgEl(url){
  var u=url||'';
  if(u===__ltBgUrl && __ltBgEl) return {bg:__ltBgEl,ov:__ltBgOverlay};
  // URL changed (or cleared) — release any prior element.
  if(__ltBgEl){try{if(__ltBgEl.tagName==='VIDEO'){__ltBgEl.pause();__ltBgEl.removeAttribute('src');__ltBgEl.load();}}catch(e){}
    if(__ltBgEl.parentNode) __ltBgEl.parentNode.removeChild(__ltBgEl);
    __ltBgEl=null;}
  if(__ltBgOverlay){if(__ltBgOverlay.parentNode) __ltBgOverlay.parentNode.removeChild(__ltBgOverlay); __ltBgOverlay=null;}
  __ltBgUrl=u;
  if(!u) return null;
  if(isVideoBg(u)){
    var v=document.createElement('video');
    v.className='lt-bg'; v.src=__scrMedia(u);
    v.autoplay=true;v.loop=true;v.muted=true;v.playsInline=true;v.preload='auto';
    try{v.setAttribute('crossorigin','anonymous');}catch(e){}
    v.onerror=function(){try{v.style.display='none';}catch(_e){}};
    __ltBgEl=v;
  } else {
    var im=document.createElement('img');
    im.className='lt-bg'; im.src=__scrMedia(u); im.alt='';
    try{im.setAttribute('crossorigin','anonymous');}catch(e){}
    im.onerror=function(){try{im.style.display='none';}catch(_e){}};
    __ltBgEl=im;
  }
  var ov=document.createElement('div');
  ov.className='lt-bg-overlay';
  __ltBgOverlay=ov;
  return {bg:__ltBgEl,ov:__ltBgOverlay};
}
function mountLtBg(box,url){
  var pair=ensureLtBgEl(url);
  if(!pair||!box) return;
  // Insert bg + overlay at the FRONT of .lt-box (before .lt-content) so
  // z-order matches the legacy inline pattern (bg behind text). insertBefore
  // moves the existing node — does NOT clone — so decoder state is preserved.
  box.insertBefore(pair.ov, box.firstChild);
  box.insertBefore(pair.bg, pair.ov);
  if(pair.bg.tagName==='VIDEO'){var pp=pair.bg.play();if(pp&&pp.catch)pp.catch(function(){});}
}
function setBgVid(url){
  var layer=document.getElementById('bgLayer');
  if(!layer) return;
  var u=url||'';
  if(u===__bgUrl) return; // already mounted with this URL — no-op
  __bgUrl=u;
  // Stop & detach old element (release decoder + network buffer)
  while(layer.firstChild){
    var old=layer.firstChild;
    if(old.tagName==='VIDEO'){try{old.pause();old.removeAttribute('src');old.load();}catch(e){}}
    layer.removeChild(old);
  }
  if(!u) return;
  if(isVideoBg(u)){
    var v=document.createElement('video');
    // v0.7.221 — IS_FROZEN_BG path: settings/preview surfaces mount the
    // bg <video> as a still poster, not a playing clip. We append
    // a "#t=0.1" media-fragment so the browser fetches and paints
    // the frame at 0.1 seconds and sits there (avoids the all-black
    // first-frame poster many codecs ship with). preload="metadata"
    // is the cheapest mode that still produces a visible frame — no
    // decoder slot is held for ongoing playback. Real broadcast
    // surfaces fall through to the historical autoplay/loop path.
    // NOTE: backticks are forbidden anywhere inside this inline JS
    // because the entire script lives inside the outer template
    // literal at L20 (const html = ...), and an un-escaped backtick
    // here would close that template literal mid-string and fail
    // typecheck (TS1005). Use plain ASCII quotes in comments.
    if(IS_FROZEN_BG){
      // v0.7.225 — Operator escalation: bg video in the SETTINGS preview
      // boxes (and every other freezeBg surface) was taking 1-3s to
      // paint its first frame, leaving the box black-with-text until
      // the metadata fetch + first-frame decode finished. Root cause:
      // preload="metadata" only fetches container headers + dimensions;
      // many Chromium builds will NOT decode + paint a frame from that
      // alone until something explicitly triggers a decode pass. The
      // "#t=0.1" media fragment hints AT a target frame but does
      // nothing without a load that actually fetches enough bytes to
      // reach that frame. Fix: preload="auto" so the browser fetches +
      // decodes the first GOP up-front. The pause-on-play /
      // pause-on-loadeddata listeners stay in place AND we add an
      // explicit one-shot play().then(pause) on loadeddata to force
      // the first decoded frame onto the compositor (Chromium will
      // refuse to paint a paused video that has never been told to
      // play, even with preload="auto", on some HW decoder paths).
      // Decoder slot is held only for the brief play→pause window,
      // then released, so this does NOT regress the v0.7.222 finite-
      // HW-decoder invariant (which targets the FOREGROUND Preview/
      // Live <video>, a separate codepath through MediaVideoSurface).
      v.src=__scrMedia(u)+'#t=0.1';
      v.autoplay=false;v.loop=false;v.muted=true;v.playsInline=true;
      v.preload='auto';
      try{v.setAttribute('crossorigin','anonymous');}catch(e){}
      v.onerror=function(){try{v.style.display='none';}catch(_e){}};
      // Defensive: some Electron/Chromium versions still start playing
      // when autoplay=false but the element has been added to the DOM
      // and previously played. Pause on every loadeddata + once
      // immediately so we never animate. The loadeddata handler also
      // kicks the one-shot play→pause to force first-frame paint
      // (v0.7.225 fix above).
      v.addEventListener('loadeddata',function(){
        try{
          var pp=v.play();
          if(pp&&pp.then){pp.then(function(){try{v.pause();}catch(_e){}}).catch(function(){try{v.pause();}catch(_e){}});}
          else {try{v.pause();}catch(_e){}}
        }catch(_e){try{v.pause();}catch(__e){}}
      });
      v.addEventListener('play',function(){
        // Re-pause on EVERY play except the loadeddata-triggered one
        // already handled above. The .then(pause) above resolves
        // AFTER this listener fires, so we'd be racing — instead
        // schedule the pause one tick out so the play() promise
        // resolves cleanly first (avoids AbortError spam).
        setTimeout(function(){try{v.pause();}catch(_e){}},0);
      });
      layer.appendChild(v);
      // Don't pre-pause synchronously here — let loadeddata drive the
      // first-frame paint sequence. Pre-fix this call put the element
      // in a paused state BEFORE preload could begin a decode pass,
      // which was part of why preload="metadata" was so slow.
    } else {
      v.src=__scrMedia(u);
      v.autoplay=true;v.loop=true;v.muted=true;v.playsInline=true;
      v.preload='auto';
      // v0.7.221 — Broadcast-smoothness hardening for the three real
      // output surfaces (Live Display pane, Secondary Screen popup,
      // NDI offscreen FrameCapture). Together these mirror what
      // ProPresenter/EasyWorship do for their bg video layers.
      //
      // (1) disablePictureInPicture + disableRemotePlayback — kill
      //     the Chromium overlay buttons that periodically repaint
      //     the video surface (and silently steal a compositor pass).
      //     The operator never wants PiP on the projector output.
      // (2) playbackRate=1 explicit — guards against the rare case
      //     where a previous element on the same compositor left a
      //     non-1.0 rate cached at the codec layer.
      // (3) controls=false, controlsList=nodownload — defence in
      //     depth; controls were never on, but if Electron flips
      //     them on by default in a future Chromium bump the video
      //     surface would repaint on hover.
      // (4) waiting/stalled/error self-heal — if the network hiccups
      //     and Chromium suspends playback, re-issue play() so the
      //     projector doesn't freeze for the operator. The "loop"
      //     attribute alone doesn't handle the stall case.
      try{v.disablePictureInPicture=true;}catch(_e){}
      try{v.disableRemotePlayback=true;}catch(_e){}
      try{v.controls=false;}catch(_e){}
      try{v.setAttribute('controlslist','nodownload noremoteplayback noplaybackrate');}catch(_e){}
      try{v.setAttribute('crossorigin','anonymous');}catch(e){}
      v.onerror=function(){try{v.style.display='none';}catch(_e){}};
      var __bgResume=function(){try{var p=v.play();if(p&&p.catch)p.catch(function(){});}catch(_e){}};
      v.addEventListener('waiting',__bgResume);
      v.addEventListener('stalled',__bgResume);
      v.addEventListener('pause',function(){
        // Chromium briefly pauses on tab-throttle / decoder reset; only
        // self-heal if the operator-visible looping playback was
        // expected (i.e. we did NOT mount this in IS_FROZEN_BG mode).
        if(!IS_FROZEN_BG)__bgResume();
      });
      layer.appendChild(v);
      try{v.playbackRate=1;}catch(_e){}
      var pp=v.play();if(pp&&pp.catch)pp.catch(function(){});
    }
  } else {
    var img=document.createElement('img');
    img.src=__scrMedia(u);img.alt='';
    try{img.setAttribute('crossorigin','anonymous');}catch(e){}
    img.onerror=function(){try{img.style.display='none';}catch(_e){}};
    layer.appendChild(img);
  }
}

// v0.7.228 — Output / NDI startup-delay fix. Mounts a hidden <video> in
// #preheatLayer for the pinned-preview video URL so HTTP bytes,
// container demux, and first-frame decode all complete BEFORE the
// operator clicks Go Live. When goLive promotes that URL into the
// live slide, the foreground <video id="liveVideo"> mount at L1845
// hits a warm HTTP cache + warm decoder and paints near-instantly on
// the secondary screen AND the NDI offscreen capture (NDI captures
// this same renderer, so any preheat benefit propagates automatically).
//
// Uses the v0.7.225 freezeBg pattern so the decoder slot is held only
// briefly: preload="auto" + play().then(pause) on loadeddata to force
// first-frame paint, then setTimeout(pause, 0) on the play listener
// to release the decoder cleanly without AbortError spam. Steady-state
// decoder cost is ZERO once the first frame is paged in — protects
// the v0.7.222 finite-HW-decoder invariant.
//
// Dedup by URL: same URL = no-op. Empty/null URL = teardown.
var __preheatUrl='';
function setPreheatVid(url){
  var layer=document.getElementById('preheatLayer');
  if(!layer) return;
  var u=url||'';
  if(u===__preheatUrl) return;
  __preheatUrl=u;
  while(layer.firstChild){
    var old=layer.firstChild;
    if(old.tagName==='VIDEO'){try{old.pause();old.removeAttribute('src');old.load();}catch(e){}}
    layer.removeChild(old);
  }
  if(!u) return;
  if(!isVideoBg(u)) return; // images don't need decoder preheat; <link rel=preload> in operator console covers byte cache
  var v=document.createElement('video');
  v.src=__scrMedia(u);
  v.autoplay=false;v.loop=false;v.muted=true;v.playsInline=true;
  v.preload='auto';
  try{v.disablePictureInPicture=true;}catch(_e){}
  try{v.disableRemotePlayback=true;}catch(_e){}
  try{v.setAttribute('crossorigin','anonymous');}catch(e){}
  v.onerror=function(){try{v.style.display='none';}catch(_e){}};
  // v0.7.225 freezeBg pattern: kick play().then(pause) on loadeddata to
  // force the first decoded frame onto the GPU, then release decoder.
  v.addEventListener('loadeddata',function(){
    try{
      var pp=v.play();
      if(pp&&pp.then){pp.then(function(){try{v.pause();}catch(_e){}}).catch(function(){try{v.pause();}catch(_e){}});}
      else {try{v.pause();}catch(_e){}}
    }catch(_e){try{v.pause();}catch(__e){}}
  });
  v.addEventListener('play',function(){
    setTimeout(function(){try{v.pause();}catch(_e){}},0);
  });
  layer.appendChild(v);
}

// applyAudio — pushes the operator's audio toggles down to the live
// <video> element WITHOUT triggering a render rebuild. We deliberately
// keep audio out of the render-key so the operator can drag the
// volume slider, mute, or flip the broadcast speaker without ever
// remounting the video (which would seek back to t=0).
//
// Routing rules (matches user spec for item #11):
//   - NDI hidden window: ALWAYS muted. Audio capture is a separate
//     roadmap item; the hidden window must never make the operator's
//     PC beep.
//   - Visible secondary screen / congregation TV: plays the media
//     audio at master volume unless the operator has hit the speaker
//     toggle on the Live Display audio rail (broadcastEnabled=false)
//     or the master mute (muted=true).
function applyAudio(s){
  var v=window.__liveVideoEl;
  if(!v||v.tagName!=='VIDEO')return;
  var a=(s&&s.audio)||{};
  var vol=typeof a.volume==='number'?Math.max(0,Math.min(1,a.volume)):1;
  var muted=!!a.muted;
  var enabled=a.broadcastEnabled!==false;
  // NDI surface: force-mute. Everywhere else: honour the operator.
  var shouldMute=IS_NDI||muted||!enabled;
  try{v.volume=vol;}catch(e){}
  try{v.muted=shouldMute;}catch(e){}
}

// applyRender — paint-first soft cross-fade (v0.5.32 rewrite).
//
// HISTORY: v0.5.30 used fade-out → swap → fade-in via setTimeout + 2
// rAFs. That approach has a fundamental flaw: between the fade-out
// finishing and the new content painting, the surface is at opacity:0
// — i.e. literally BLACK on the projector and a transparent (black-
// on-receiver) frame on the NDI surface. If the timeout was throttled
// (background tab) or a rAF was skipped (system stall), the surface
// stayed black until a watchdog fired 1.6 s later. Operators reported
// the screen "going black" and "staying blank" — those reports were
// the fade-out blackout window.
//
// NEW APPROACH: paint the new content IMMEDIATELY (cut), then layer
// a CSS animation on top that eases opacity from 0.25 → 1 over the
// operator's chosen duration. The opacity NEVER reaches 0, so there
// is no blackout window — even if the animation is throttled or
// dropped entirely, the worst case is "snap cut" instead of "black
// screen". This is the bullet-proof path.
//
// Reads slideTransitionStyle ('cut' | 'fade') and
// slideTransitionDuration from the broadcast settings. NDI surface
// always cuts hard (no animation) regardless of operator choice —
// vMix/OBS receivers handle their own program transitions and
// animations on the source just add bandwidth.
function applyRender(s){
  // Cache the operator's "show reconnect overlay" preference so the
  // SSE error handler below can honour it without needing a fresh
  // payload at the moment of disconnect.
  try{ window._showReconnect=!!(s&&s.settings&&s.settings.showReconnectingOverlay); }catch(e){}
  var style=(s&&s.settings&&s.settings.slideTransitionStyle)||'fade';
  var dur=(s&&s.settings&&typeof s.settings.slideTransitionDuration==='number')?s.settings.slideTransitionDuration:350;
  if(dur<0)dur=0;if(dur>1000)dur=1000; // cap at 1 s — anything longer felt sluggish to operators
  var el=$('output');
  if(el)el.style.setProperty('--slide-fade-ms',dur+'ms');
  // v0.7.227 — Apply operator brightness slider. Both members of the
  // v0.7.226 pair-invariant (bg opacity + dark scrim alpha) move in
  // lockstep across all three surfaces (.bg-image / #bgLayer / .lt-bg)
  // because they read the same two CSS variables from :root. Mapping
  // chosen so brightness=85 reproduces the v0.7.226 operator pick
  // exactly (op=.85, scrim=.05): scrim = (1 - op) * 0.333.
  try{
    var bb=(s&&s.settings&&typeof s.settings.bgBrightness==='number')?s.settings.bgBrightness:85;
    if(bb<0)bb=0;if(bb>100)bb=100;
    var bbOp=bb/100;
    var bbSc=Math.max(0,(1-bbOp)*0.333);
    var root=document.documentElement;
    root.style.setProperty('--bg-opacity',bbOp.toFixed(3));
    root.style.setProperty('--bg-scrim',bbSc.toFixed(3));
  }catch(e){}
  // v0.7.228 — Honour preheat URL from the operator console's pinned
  // preview. setPreheatVid is URL-dedup'd, so calling it on every
  // applyRender is cheap (no churn when the value is unchanged). Null
  // / undefined / same-as-live URL all tear the hidden element down
  // and release its decoder slot — see output-payload.ts L132-140
  // for the source-side gate.
  try{ setPreheatVid(s && s.preheatMediaUrl ? String(s.preheatMediaUrl) : ''); }catch(e){}
  // Decide whether this update is a true SLIDE change (worth animating)
  // or a settings-only adjustment (must NOT animate). The fingerprint
  // intentionally excludes settings, audio, and transport flags.
  var nextFp=slideFingerprint(s);
  var isSlideChange=(nextFp!==lastSlideFingerprint);
  lastSlideFingerprint=nextFp;
  // ALWAYS paint synchronously. No more setTimeout-gated swap.
  render(s);
  applyAudio(s);
  // Soft fade-in animation only when:
  //   - operator selected fade
  //   - duration > 0
  //   - this is a real slide change (not a settings tweak)
  //   - this is NOT the NDI surface (NDI always cuts)
  //   - this is NOT the very first paint (lastRenderKey was set inside render())
  if(style==='fade' && dur>0 && isSlideChange && !IS_NDI){
    var el2=$('output');
    if(el2){
      el2.classList.remove('soft-in');
      // Force a reflow so the next add restarts the animation cleanly.
      void el2.offsetWidth;
      el2.classList.add('soft-in');
    }
  }
}

// v0.7.182 — Verse-text autofit (operator-spec, REVISED).
//   Goal: keep the user's chosen typography UNCHANGED. Only when a
//   single verse genuinely overflows its frame, scale ONLY that
//   .slide-paragraph element down by the smallest amount that makes
//   it fit. Reset on every render so the previous shrink never
//   carries into the next verse. NO global font-size changes, NO
//   container-wide transforms, NO touching .slide-content/.lt-box/
//   .slide-reference — only the verse paragraph itself.
//
//   Selector: '#output .slide-paragraph' is the verse text element
//   (see line 1016 fullscreen render and line 1188 lower-third
//   render via .lt-content). Both surfaces use the same class so a
//   single function covers Live Display + secondary screen +
//   projector + Settings preview + NDI broadcast + OBS.
//
//   Algorithm: SINGLE-SHOT MATH (no loop, no lag).
//   1. Reset transform so we measure the paragraph's natural size.
//   2. Read parent.clientHeight (visible) + parent.scrollHeight (full).
//   3. If scrollHeight <= clientHeight → no overflow → bail at scale(1).
//   4. Otherwise compute k = (clientHeight / scrollHeight) * 0.98
//      (the 0.98 leaves a 2% safety margin so we don't kiss the edge).
//   5. Clamp to floor 0.60 — operator-explicit: "not even small."
//      Text never shrinks below 60% so it always stays readable on a
//      projector. Pathologically long verses (>1.66× overflow) WILL
//      overflow the bottom of the frame; operator manually adjusts
//      typography or splits the slide for those rare cases.
//   6. Apply ONE transform: scale(k) and we're done.
//
//   Why math, not iteration: transform: scale() is a PAINT-only op —
//   it does NOT change layout, so parent.scrollHeight is identical
//   before and after the transform. An iterative shrink loop would
//   either run forever or never converge. The ratio
//   clientHeight/scrollHeight is exact: a paragraph that's 1.8× too
//   tall fits perfectly at scale(0.555). One read, one write, ~0.3ms
//   on a Raspberry Pi 4 — zero perceptible lag even on the lowest-end
//   projector PCs operators run.
//
//   Why transform-origin: top center — anchors the shrink to the top
//   of the text box so the first line stays where the operator
//   placed it. center-center would float text upward as it shrinks
//   and felt jumpy on slide change in v0.7.182's first cut.
// v0.7.184 — PER-VERSE LOCK with MODULE-LEVEL cache. Once we've fit a
// verse to its frame at a given container size, we DON'T re-measure on
// subsequent renders that re-render the same verse text into the
// same-size frame. Operator reported a flash on every SSE tick (font
// color tweak, bg tweak, etc.) because each render re-ran fitVerseText,
// and tiny scrollHeight rounding flips between paint cycles caused k
// to oscillate by 0.5–2% per tick — visible as a micro-flash on the
// projector.
//
// IMPORTANT lifecycle note (cost-of-doing-business with this renderer):
// every render reassigns the output container's innerHTML which DESTROYS
// and recreates the verse paragraph element. So a data- attribute on the
// element itself can't survive across renders. We therefore keep the
// lock in MODULE-LEVEL closure state (__fitKey + __fitScale) initialised
// once when the renderer script runs.
// (No backticks anywhere in this comment block — the surrounding script
// is itself a tagged template literal; see v0.5.55 note ~L483.)
//
// Key = (verse textContent length + parent W×H). Different verse →
// different length → recompute. Window resize → different W/H →
// recompute. Same verse same frame on a style-only SSE tick → key match
// → REAPPLY the cached scale directly (no measurement, no rounding
// flip, no flash).
//
// Why textContent.length, not the full string: cheap (no allocation),
// good enough as a discriminator (different verses ≠ identical length
// in 99.9% of cases; in the rare collision the worst outcome is the
// new verse renders at the previous verse's scale until the next
// genuine slide change corrects it).
// v0.7.187.1 — autofit now SCALES TO FILL on the NDI lower-third
// surface (operator complaint: "autofit shrinks but text is too small
// to read; let it spread across the whole lower-third frame"). The
// fullscreen branch keeps shrink-only behaviour (no balloon for short
// verses on the main display).
//
// Implementation: binary search on font-size rather than transform-
// scale. Reasons:
//   (1) transform: scale(k>1) doesn't change the layout box, so the
//       wrap width stays at clientWidth and the visual width spills
//       horizontally. Font-size growth re-flows correctly inside
//       clientWidth — which is what we want for "fill the bar".
//   (2) Both height AND width constraints are honoured naturally
//       (search rejects any size where scrollHeight>avail OR
//       scrollWidth>clientWidth) — fullscreen branch already cared
//       about width too (long single-line refs).
//   (3) Cache key includes parent dimensions so a re-render at the
//       same key reapplies the cached pixel size without re-searching.
//
// Bounds:
//   isLT  → [0.60, 2.50]  (grow short verses up to 2.5× the CSS base)
//   else  → [0.60, 1.00]  (shrink-only, identical to v0.7.184.2)
var __fitKey='', __fitScale=1, __fitBase=0, __lastIsLT=null;
// v0.7.207 — Typography-settings fingerprint stamped by render() on
// every paint. Included in __fitKey so any settings change (Display &
// Output Typography, NDI Full Typography, NDI Lower-Third Typography,
// Reference Label fields, line-height, text-scale, aspect-ratio,
// align, drop-shadow, etc.) invalidates the autofit cache. Pre-fix
// the cache key was only text-length + parent.clientWidth/Height —
// so changing a typography setting did NOT invalidate the cache,
// fitVerseText hit the early-return at L963 and reapplied the STALE
// __fitBase*__fitScale pixel value, silently overwriting the operator's
// new clamp() and making every NDI/Display typography knob look dead.
var __renderSettingsFP='';
function fitVerseText(){
  try{
    // v0.7.192-hotfix.2 Fix 3 — Reference autofit (LT only).
    // .slide-reference uses CSS clamp capped at 1.4rem which floors to
    // ~15 px inside the LT bar. Binary-search a larger size up to 2.0×
    // the computed base, with a smaller cap than the body so the verse
    // remains the visual anchor. Use getComputedStyle (NOT el.style.fontSize)
    // per v0.7.190-hotfix.2 GR-A to resolve the clamp() to real pixels.
    // Runs BEFORE the body fit so the body's sibling-height subtraction
    // (L860-862) picks up the ref's new offsetHeight on the same pass.
    try{
      var rEl=document.querySelector('#output .lt-box .slide-reference');
      if(rEl && rEl.parentElement){
        var rPar=rEl.parentElement;
        var rBase=parseFloat(window.getComputedStyle(rEl).fontSize)||14;
        var rAvailW=rPar.clientWidth;
        // v0.7.194-hotfix.11 Item #2 — reference autofit upper bound
        // dropped from 2.0× → 1.10× so the reference cannot eat the LT
        // box and collide with the body text (operator screenshot:
        // "COMP OVE / ASV" fragments behind the verse). The body
        // autofit is capped at 1.00× per hotfix.9; allowing the
        // reference to grow to 2× broke the "verse is the visual
        // anchor" contract. 1.10× = small allowance to recover from
        // the CSS clamp() floor (~14–15px) without ever ballooning.
        var rLo=0.60, rHi=1.10, rBest=1.0;
        rEl.style.transform='';
        for(var ri=0;ri<10;ri++){
          var rMid=(rLo+rHi)/2;
          rEl.style.fontSize=(rBase*rMid).toFixed(2)+'px';
          if(rEl.scrollWidth<=rAvailW){ rBest=rMid; rLo=rMid; } else { rHi=rMid; }
        }
        rEl.style.fontSize=(rBase*rBest).toFixed(2)+'px';
        // Invalidate body cache: parent.clientHeight is unchanged but ref's
        // offsetHeight just grew — body must re-binary-search for the new
        // available height. Without this, cached __fitKey would short-circuit
        // and the body would render at the OLD (smaller-ref) scale.
        __fitKey='';
      }
    }catch(re){}
    var p=document.querySelector('#output .slide-paragraph');
    if(!p)return;
    var parent=p.parentElement;
    if(!parent)return;
    var key=(p.textContent||'').length+'|'+parent.clientWidth+'x'+parent.clientHeight+'|'+__renderSettingsFP;
    if(key===__fitKey && __fitBase>0){
      // LOCKED — same verse + same frame. Reapply cached pixel size
      // directly without re-searching. Must rewrite because the <p>
      // was just recreated by the latest innerHTML assignment.
      p.style.transform='';
      p.style.fontSize=(__fitBase*__fitScale).toFixed(2)+'px';
      return;
    }
    __fitKey=key;
    p.style.transform='';
    // v0.7.190-hotfix.2 — The renderer at L1435 sets font-size to a
    // CSS clamp() expression as an inline style. p.style.fontSize
    // returns the AUTHORED string ("clamp(1rem, min(7cqw,12cqh), 4rem)")
    // which parseFloat cannot read (NaN -> baseSize=16). Use computed
    // style instead — it RESOLVES clamp/cqw/cqh to actual pixels in
    // the iframe's 1920x1080 viewport, which is what we need to seed
    // the binary search. baseSize then properly reflects the operator's
    // bucket pick (Small/Medium/Large/XL) because FS_MULT is baked into
    // ltBand/ltCap upstream of the clamp.
    var baseSize=parseFloat(window.getComputedStyle(p).fontSize)||16;
    __fitBase=baseSize;
    // Available height: parent.clientHeight minus sibling heights
    // (.slide-reference chyron sits above-or-below the verse inside
    // the same flex container; its layout box is fixed even when we
    // grow the verse). Width bound is parent.clientWidth — both LT
    // and fullscreen wrap at parent width.
    var avail=parent.clientHeight;
    for(var i=0;i<parent.children.length;i++){
      if(parent.children[i]!==p) avail-=parent.children[i].offsetHeight;
    }
    var availW=parent.clientWidth;
    if(avail<=0||availW<=0){ __fitScale=1; return; }
    // Detect LT context. The verse <p>'s parent is .lt-content (flex
    // column, overflow:hidden) when rendered through the LT branch in
    // route.ts ~L1359. Fullscreen verses live inside .slide-content.
    // closest() includes self so this catches both .lt-content and
    // any .lt-box ancestor reliably.
    var isLT=!!(parent.closest && (parent.closest('.lt-content')||parent.closest('.lt-box')));
    // v0.7.194-hotfix.6 — Force cache invalidation on layout-context flip.
    // Pre-fix: operator flips NDI Full→Lower-Third in the panel, the
    // SSE state push rebuilds DOM, but the first rAF pass measures the
    // freshly-injected .lt-box BEFORE the Electron offscreen surface
    // has settled the container-query units (.lt-box uses cqw/cqh and
    // has a sibling bg-video <div> that re-flows on mount). The ref
    // binary search at L851-857 then picks rBest=2.0 against an
    // inflated rPar.clientWidth, "NKJV" renders huge, body fit locks
    // against that bad reference height → operator-visible disorganised
    // text until they nudge the LT scale slider (which mutates
    // parent.clientHeight → cache key differs → re-runs full search
    // against the now-settled layout). __lastIsLT tracks the previous
    // pass's context; on flip we force ALL caches clear so the next
    // pass re-measures from scratch instead of trusting stale numbers.
    if(__lastIsLT!==null && __lastIsLT!==isLT){
      __fitKey=''; __fitBase=0; __fitScale=1;
    }
    __lastIsLT=isLT;
    var minK=0.60;
    // v0.7.194-hotfix.9 Item A — Shrink-only autofit. Previous LT
    // branch grew up to 3.5× of baseSize which (a) ignored the
    // operator's Text Size slider and (b) overflowed the LT chyron
    // producing the "garbled fragments behind ASV" visual bug
    // operator reported on 2026-05-17. maxK=1.00 means autofit only
    // intervenes to SHRINK text that would overflow; it never grows
    // past the natural clamp size the operator dialed in. Applies
    // identically to Full and Lower-Third — both surfaces now
    // respect the Typography slider as the upper bound.
    var maxK=1.00;
    // Binary search the largest scale factor where BOTH dimensions
    // fit. 10 iterations gives ~0.001 precision on [0.60, 2.50] which
    // is well below a single-pixel rounding error at typical sizes.
    // Each iteration writes fontSize and reads scrollHeight/Width —
    // forces one layout pass on this <p> only, ~0.05 ms per pass on
    // the secondary screen. Total work per verse change: ~0.5 ms.
    var lo=minK, hi=maxK, best=minK;
    var safety=0.98;
    for(var j=0;j<10;j++){
      var mid=(lo+hi)/2;
      p.style.fontSize=(baseSize*mid).toFixed(2)+'px';
      var h=p.scrollHeight;
      var w=p.scrollWidth;
      if(h<=avail*safety && w<=availW){
        best=mid; lo=mid;
      } else {
        hi=mid;
      }
    }
    __fitScale=best;
    p.style.fontSize=(baseSize*best).toFixed(2)+'px';
  }catch(e){}
}
// Resize is throttled to 16 ms (one frame) — fitVerseText itself is
// O(1) so we don't need the 80 ms debounce v1 had; we just want to
// coalesce within a single rAF tick.
var __fitTimer=0;
function fitVerseTextDebounced(){
  if(__fitTimer)return;
  __fitTimer=setTimeout(function(){__fitTimer=0;fitVerseText();},16);
}
function fitVerseTextForce(){__fitKey='';fitVerseTextDebounced();}
window.addEventListener('resize',fitVerseTextDebounced);
// v0.7.193-hotfix.2 — Settings round-trip text-shrink fix.
//
// Repro: operator on Live with a long verse, opens Settings, comes
// back without touching anything → the same verse renders SMALLER
// than before (image 2 in the report). Cause: the in-app Preview/
// Live iframes remount when Settings is opened/closed (Settings is a
// full-screen overlay that REPLACES the live-console shell). The
// freshly-loaded iframe runs fitVerseText() on the FIRST paint —
// before web fonts have finished loading — using fallback font
// metrics that are wider per character than the eventual web font.
// Autofit picks a smaller scale so the wider fallback fits, caches
// it in __fitKey, then web font loads + reflows narrower → the verse
// has lots of unused space but autofit never re-runs (cached key is
// still valid). End result: persistent smaller text.
//
// Fix (3 belts):
//   (a) Re-fit when web fonts finish loading (document.fonts.ready) —
//       handles the FOIT/FOUT race directly.
//   (b) ResizeObserver on the verse parent: any container-size change
//       (Settings overlay closing, panel resize, dev-tools, etc.)
//       triggers a forced re-fit. Window resize alone misses iframe-
//       internal layout changes that don't bubble a window resize.
//   (c) One extra forced re-fit after 250ms as a belt-and-braces for
//       slow font CDNs / async layout settling on first paint.
try{
  if(document && document.fonts && document.fonts.ready && document.fonts.ready.then){
    document.fonts.ready.then(function(){fitVerseTextForce();});
  }
}catch(fe){}
// v0.7.193-hotfix.3 — ResizeObserver REMOVED. The hotfix.2 RO observed
// the verse parent and called fitVerseTextForce on any size change. In
// practice each SSE-driven render (live slides tick frequently) nudges
// parent.clientHeight by sub-pixels during reflow → RO fires → forced
// re-fit → that re-fit causes another reflow → RO fires again → visible
// "keeps searching" pumping reported by the operator. The two remaining
// belts (document.fonts.ready + 250ms safety) are sufficient for the
// original Settings round-trip text-shrink bug because both are ONE-SHOT
// and fire only on iframe (re)load, not per render.
setTimeout(function(){fitVerseTextForce();},250);

function render(s){
  if(!s){$('output').innerHTML='';$('output').classList.add('hidden');lastRenderKey='';dropLiveVideoCache();setBgVid('');return}
  // BLACK / HIDDEN — operator has hit the "Black" transport button or
  // toggled the Live Display HIDDEN switch. We paint a solid black
  // frame while keeping the NDI connection alive, so vMix/OBS don't
  // lose the source. The current slide stays staged upstream, so the
  // moment "blanked" flips back to false the renderer snaps straight
  // back to whatever was on air — no re-cue required.
  if(s.blanked){
    var bkey='__blanked__';
    if(bkey===lastRenderKey)return;
    lastRenderKey=bkey;
    dropLiveVideoCache();
    setBgVid(''); // v0.7.187 — clear persistent BG layer when blanked
    $('output').innerHTML='';
    // v0.7.211 — see load-time block at ~L367. #output MUST stay
    // transparent so #stage (z:0, paints #000) shows through; setting
    // #output to #000 with plain assignment would also strip the
    // load-time setProperty important pin and re-cover #bgLayer for
    // any subsequent themed render in the same session.
    $('output').style.setProperty('background','transparent','important');
    $('output').classList.remove('hidden');
    return;
  }
  // When the operator hits "Disconnect secondary screen" the broadcaster
  // sends type:'clear'. Honor it as a true blank (black) frame so the
  // congregation TV goes dark instead of showing the themed background.
  if(s.type==='clear'){
    // Until the operator first sends content this session, paint a
    // centred branded splash on a transparent (black) backdrop so the
    // congregation sees the WassMedia mark rather than a dead screen.
    // The flag flips false the first time a slide is broadcast and
    // never comes back.
    dropLiveVideoCache();
    setBgVid(''); // v0.7.187 — clear persistent BG layer on type:'clear'
    // v0.5.33 — same change as the fingerprint above. We now show the
    // splash watermark on every clear state UNLESS the operator
    // explicitly disabled it via showStartupLogo===false.
    if(s.showStartupLogo!==false){
      var lkey='__logo__';
      if(lkey===lastRenderKey)return;
      lastRenderKey=lkey;
      // Pure-white wordmark on a transparent (#000) backdrop —
      // matches the operator's Live Display splash and the spec
      // calling for a logo-less Live Display intro.
      $('output').innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;text-align:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"><div style="font-size:clamp(2rem,7vmin,7rem);font-weight:600;letter-spacing:-.01em;line-height:1.05;opacity:.4">Scripture AI</div><div style="margin-top:1.4vmin;font-size:clamp(.85rem,1.8vmin,1.6rem);opacity:.3;font-weight:500">Powered By WassMedia (+233246798526)</div></div>';
      // v0.7.211 — splash sits on transparent #output so #stage (z:0,
      // #000) shows through. Original comment at L1176 said
      // "transparent (#000) backdrop" — the intent was always
      // transparent; the plain-assignment #000 was a v0.5.33 bug that
      // covered any customBackground operator had configured.
      $('output').style.setProperty('background','transparent','important');
      $('output').classList.remove('hidden');
      return;
    }
    var ckey='__clear__';
    if(ckey===lastRenderKey)return;
    lastRenderKey=ckey;
    $('output').innerHTML='';
    // v0.7.211 — see splash branch comment above for full rationale.
    $('output').style.setProperty('background','transparent','important');
    $('output').classList.remove('hidden');
    return;
  }
  // Anything below here that ISN'T a media-video render path will
  // either rebuild the DOM or replace it; in all those cases the
  // previously cached <video> ref is now stale, so invalidate it
  // pre-emptively. The media-video branch will re-populate the
  // cache if it actually mounts a video.
  if(!(s.slide&&s.slide.type==='media'&&s.slide.mediaKind==='video'&&s.slide.mediaUrl)){
    dropLiveVideoCache();
  }
  // Reset any prior forced-black background on normal renders. In
  // transparent NDI overlay mode we must keep #output transparent
  // (and re-assert #stage transparency) on every render so a
  // subsequent media slide that briefly forced #000 doesn't leave
  // the alpha matte tinted black on the next text slide.
  // v0.7.209 — Re-assert with important on every render so the
  // load-time inline-with-important set above stays inline (a later
  // plain style.background empty-string would clear it and let OBS
  // Custom CSS re-win). FORCE_TRANSPARENT=true: keep transparent
  // matte; else hold #000 so OBS Browser Source never falls back to alpha.
  // v0.7.211 — #output stays TRANSPARENT in both branches so the
  // operator customBackground (mounted in #bgLayer, sibling z:0)
  // shows through #output (z:1). The wrapper div emitted into the
  // output innerHTML carries the theme gradient itself when no
  // customBg, or stays transparent when a customBg is mounted. See
  // load-time block ~L367 for the full rationale. #stage continues
  // to mirror FORCE_TRANSPARENT (opaque #000 for normal, alpha for
  // vMix overlay) because #stage IS the letterbox layer the operator
  // chose to expose.
  if(FORCE_TRANSPARENT){
    $('output').style.setProperty('background','transparent','important');
    var __stR=document.getElementById('stage');if(__stR)__stR.style.setProperty('background','transparent','important');
  }else{
    $('output').style.setProperty('background','transparent','important');
    var __stR2=document.getElementById('stage');if(__stR2)__stR2.style.setProperty('background','#000','important');
  }
  // Skip the rebuild entirely if the payload is identical to what's
  // already on screen. Without this guard the secondary display
  // flickered every time we rebroadcast settings or the poll raced
  // an SSE message.
  //
  // The render-key now narrows the st:* slot to only the SETTINGS THAT
  // RENDER() ACTUALLY READS (see settingsRenderKey above). Including
  // the entire settings blob — as the previous version did — meant
  // every transcription / audio / unrelated tweak fired a full DOM
  // rebuild on the NDI capture window, which is the dominant cause
  // of receiver flicker. IS_NDI stays in the key so the NDI surface
  // refreshes whenever ndiDisplayMode flips, even if the projector's
  // displayMode and slide are otherwise unchanged.
  try{
    // v0.7.198 — nm field tracks IS_NO_MEDIA so settings previews
    // (which pass ?noMedia=1) get their own cache slot. Without this,
    // a single payload would hash identically across the noMedia and
    // playable surfaces; whichever rendered first would block the
    // other rebuild. Also mirrored in the no-media early-bail (L1490)
    // and media-reuse (L1562) branch writes so all three sites
    // produce shape-identical keys. NO BACKTICKS in this comment —
    // see v0.7.196 GUARD-RAIL D (we are inside the outer const-html
    // template literal so any backtick terminates the literal).
    var key=JSON.stringify({sl:s.slide,dm:s.displayMode,st:settingsRenderKey(s.settings),ndi:IS_NDI,nm:IS_NO_MEDIA?1:0});
    // v0.5.32 — bypass the cache-key bailout when the DOM is visually
    // empty. If the previous render left #output with no innerHTML
    // (rare race condition or watchdog-cleared state), the cache
    // would otherwise keep returning early and the surface would
    // stay blank until something genuinely changed. Forcing a rebuild
    // on empty DOM means the very next payload always re-paints.
    var elCk=$('output');
    var domEmpty=elCk && (!elCk.innerHTML || elCk.innerHTML.trim().length===0);
    if(key===lastRenderKey && !domEmpty)return;
    lastRenderKey=key;
    // v0.7.207 — Stamp typography fingerprint for fitVerseText cache
    // invalidation. See __renderSettingsFP declaration comment at L922.
    try{__renderSettingsFP=settingsRenderKey(s.settings)||'';}catch(e){}
  }catch(e){}
  var slide=s.slide;
  // Display mode resolution — single source of truth across all
  // surfaces (Preview, secondary screen, NDI):
  //   1. FORCE_LT (?lowerThird=1) → operator-pinned NDI overlay,
  //      always render lower-third regardless of any setting. Used
  //      by the legacy NDI-as-overlay capture mode.
  //   2. NDI surface (?ndi=1) → independent ndiDisplayMode if set.
  //   3. Projector / secondary screen → operator's main displayMode.
  // Falls back to 'full' when nothing else is set.
  // v0.7.127 — FORCE_FULL wins over FORCE_LT so the side-by-side
  // Settings preview cards can pin the layout per card without the
  // operator's projector displayMode bleeding through.
  // v0.7.192-hotfix.2 Fix 2 — On IS_NDI surfaces (NDI capture, NDI Preview,
  // OBS Browser Source — all three carry ?ndi=1) the live SSE ndiDisplayMode
  // wins over FORCE_LT (URL ?lowerThird=1). Pre-fix the URL param pinned the
  // mode forever, so a stale OBS URL pasted in LT mode would never auto-flip
  // when the operator switched the app to Full Display. Settings PREVIEW
  // cards are unaffected — they use ?lowerThird=1 WITHOUT ?ndi=1, so they
  // fall through to the FORCE_LT branch and stay pinned per card as before.
  var dm=FORCE_FULL
    ?'full'
    :((IS_NDI && s.settings && (s.settings.ndiDisplayMode==='full'||s.settings.ndiDisplayMode==='lower-third'))
      ?s.settings.ndiDisplayMode
      :(FORCE_LT
        ?'lower-third'
        :(s.displayMode||'full')));
  var st=s.settings||{};
  // v0.7.165 — Unified lower-third typography. Operator complaint:
  // the "PREVIEW (LOWER THIRD)" designer card (which sets
  // ?lowerThird=1 only, NOT ?ndi=1) read the standard textAlign /
  // referenceTextAlign / referenceFontSize fields, while the
  // congregation NDI capture, OBS Browser Source, and second-screen
  // surfaces (which set ?ndi=1) read the parallel ndi* override
  // fields. Two different field stores → preview painted one layout,
  // every actual output painted another. Same root cause for the
  // Live Display / Main Preview iframe panes: they don't pass ?ndi=1
  // either, so they tracked the projector's standard fields, not the
  // ndi* overrides that the OBS Browser Source / NDI capture used.
  // Conceptually the lower-third *is* the NDI/OBS chyron output —
  // there's only ONE lower-third look — so when the renderer
  // resolves dm==='lower-third', every surface paints with the same
  // ndi* override pile. Outside of lower-third (full-screen
  // projector, hymn slides, etc.) IS_NDI still gates the overrides
  // on the NDI surface alone, so the projector keeps its branded
  // typography unchanged.
  /* v0.7.167 -- Carved lower-third typography off the NDI overrides.
     Before this version, the v0.7.166 USE_NDI_OVERRIDES predicate
     ORed in dm === lower-third so every lower-third surface (in-app
     preview, live display, secondary screen, OBS Browser Source URL)
     inherited the NDI broadcast typography. Operators wanted the
     in-app lower-third independently controllable from the broadcast
     lower-third. Now NDI keeps its own ndi-star override pile
     (broadcast feed only), and the four non-NDI lower-third surfaces
     read a parallel lowerThird-star pile that the operator controls
     from Settings -> Display and Output -> Lower Third Typography.
     Full-screen mode reads neither (body settings only).
     GUARD-RAIL (replaces v0.7.166 GR-C): any new lower-third-like
     display mode must propagate via dm.indexOf("lower-third")===0
     -- that pattern catches lower-third AND lower-third-black. */
  var USE_NDI_OVERRIDES = IS_NDI;
  var USE_LT_OVERRIDES = !IS_NDI && dm && dm.indexOf('lower-third')===0;
  // v0.7.191 — NDI factory defaults. The NDI broadcast feed must NEVER
  // inherit the operator's in-app typography settings. Pre-v0.7.191 every
  // ndi* knob fell back to the matching app setting when unset
  // ("st.ndiFontSize ? st.ndiFontSize : st.fontSize"), so any tweak in
  // Settings → Typography silently bled through to the NDI capture window
  // — exactly what the operator complained about. Now the chain is:
  //   IS_NDI=true   → ndi* override OR NDI_DEFAULTS (NEVER touches body/LT)
  //   IS_NDI=false  → existing LT-or-body chain (unchanged)
  // To make NDI different from the defaults, the operator sets the
  // parallel ndi* field via the NDI Output panel; an unset ndi* now means
  // "use NDI_DEFAULTS", not "copy from app".
  var NDI_DEFAULTS = {
    fontFamily: 'sans-serif',
    fontSize: 'xl',
    textShadow: true,
    textScale: 1.0,
    textAlign: 'center',
    bibleColor: '#FFFFFF',
    bibleLineHeight: 1.4,
    refSize: 'lg',
    refStyle: 'normal',
    refPosition: 'top',
    refScale: 1.2,
    lowerThirdScale: 1.0
  };
  // v0.5.57 — NDI surface gets its own aspect ratio when set.
  // 'auto' or undefined → fall back to displayRatio (Live Display).
  var AR=(IS_NDI && st.ndiAspectRatio && st.ndiAspectRatio!=='auto')
    ? st.ndiAspectRatio
    : (st.displayRatio||'fill');
  applyRatio(AR);
  if(!slide){
    // Transparent NDI overlay surface: render NOTHING when nothing is
    // on air so vMix/OBS sees a clean alpha frame instead of a themed
    // gradient panel covering its program output.
    if(FORCE_TRANSPARENT){
      setBgVid(''); // v0.7.187 — clear persistent BG layer for NDI alpha-key path
      $('output').innerHTML='';
      $('output').classList.remove('hidden');
      return;
    }
    // Render themed background only — never a black void
    var tkE=(st.congregationScreenTheme||'minimal');
    var tcE=themes[tkE]||'theme-minimal';
    var safeBgE=safeBgUrl(st.customBackground);
    // v0.7.187 — BG video/image now lives in the persistent #bgLayer
    // (sibling of #output). We only emit the dim .bg-overlay inline so
    // the slide content reads against any custom bg. When a bg is set,
    // the theme gradient is forced transparent so the bgLayer beneath
    // shows through; otherwise the theme gradient remains visible.
    var bgOverlayE=safeBgE?'<div class="bg-overlay"></div>':'';
    var themeBgE=safeBgE?'background:transparent;':'';
    setBgVid(safeBgE);
    $('output').innerHTML='<div class="'+tcE+'" style="'+themeBgE+'width:100%;height:100%;position:relative;">'+bgOverlayE+'</div>';
    $('output').classList.remove('hidden');
    return;
  }
  var tk=slide.background||(st.congregationScreenTheme||'minimal');
  var tc=themes[tk]||'theme-minimal';
  var isLT=dm&&dm.indexOf('lower-third')===0;
  // ── NDI-only typography overrides (v0.5.48) ──────────────────────
  // When IS_NDI is true AND the operator has set an ndi* override,
  // use it. Otherwise fall back to the Live Display setting. The
  // reference typography (rf*) keeps its existing fallback chain
  // (rf || body), but the "body" source is now NDI-aware via T_*.
  // v0.7.167 — Each typography slot now resolves through a 3-tier
  // chain: NDI override (broadcast feed only) → LT override (in-app
  // lower-third surfaces only) → body setting (full-screen + base
  // fallback). Exactly one of USE_NDI_OVERRIDES / USE_LT_OVERRIDES
  // can be true at a time, and full-screen mode passes through to
  // body unchanged.
  var T_FF=USE_NDI_OVERRIDES
    ? (st.ndiFontFamily || NDI_DEFAULTS.fontFamily)
    : ((USE_LT_OVERRIDES && st.lowerThirdFontFamily) ? st.lowerThirdFontFamily : st.fontFamily);
  var T_FS=USE_NDI_OVERRIDES
    ? (st.ndiFontSize || NDI_DEFAULTS.fontSize)
    : ((USE_LT_OVERRIDES && st.lowerThirdFontSize) ? st.lowerThirdFontSize : (st.fontSize||'lg'));
  var T_SH_BOOL=USE_NDI_OVERRIDES
    ? (typeof st.ndiTextShadow==='boolean' ? st.ndiTextShadow : NDI_DEFAULTS.textShadow)
    : ((USE_LT_OVERRIDES && (typeof st.lowerThirdTextShadow==='boolean')) ? st.lowerThirdTextShadow : (st.textShadow!==false));
  var T_TS=USE_NDI_OVERRIDES
    ? (typeof st.ndiTextScale==='number' ? st.ndiTextScale : NDI_DEFAULTS.textScale)
    : ((USE_LT_OVERRIDES && (typeof st.lowerThirdTextScale==='number')) ? st.lowerThirdTextScale : (typeof st.textScale==='number'?st.textScale:1));
  var T_TA=USE_NDI_OVERRIDES
    ? (st.ndiTextAlign || NDI_DEFAULTS.textAlign)
    : ((USE_LT_OVERRIDES && st.lowerThirdTextAlign) ? st.lowerThirdTextAlign : (st.textAlign||'center'));
  // v0.5.57 — NDI-only bible body color + line-height. Both are
  // pure CSS overrides applied to the .slide-text node only when
  // IS_NDI is true; the secondary screen keeps the theme defaults.
  // v0.7.167 — LT surfaces get their own color/line-height overrides
  // too, gated on USE_LT_OVERRIDES.
  var T_COLOR=USE_NDI_OVERRIDES
    ? (st.ndiBibleColor || NDI_DEFAULTS.bibleColor)
    : ((USE_LT_OVERRIDES && st.lowerThirdBibleColor) ? st.lowerThirdBibleColor : '');
  // v0.6.9 — Bible line-height now has a Live Display source too.
  // NDI override > LT override > Live Display setting > 0 (no
  // override). Previously this only honoured the NDI value, so the
  // new operator-facing bibleLineHeight slider in the Typography
  // panel had no effect on the secondary screen.
  // v0.7.177 — LT-only line-height floor + default raised to 1.4 so
  // verses on the in-app LT preview / Live Display / secondary screen
  // / OBS browser source get breathing room between lines without
  // touching the frame size (operator-explicit: "adjust only the
  // text, not the frame is ok"). NDI branch (st.ndiBibleLineHeight)
  // is UNCHANGED — broadcast feed keeps 0.9 floor so vMix/OBS-NDI
  // operators can still go tight when their own framing demands it.
  var T_LH=USE_NDI_OVERRIDES
    ? (typeof st.ndiBibleLineHeight==='number'
        ? Math.min(2.5, Math.max(0.9, st.ndiBibleLineHeight))
        : NDI_DEFAULTS.bibleLineHeight)
    : (USE_LT_OVERRIDES
      ? (typeof st.lowerThirdBibleLineHeight==='number'
          ? Math.min(2.5, Math.max(1.2, st.lowerThirdBibleLineHeight))
          : 1.4)
      : (typeof st.bibleLineHeight==='number'
        ? Math.min(2.5, Math.max(0.9, st.bibleLineHeight))
        : 0));
  var bibleExtra=(T_COLOR?'color:'+T_COLOR+';':'')+(T_LH?'line-height:'+T_LH+';':'');
  var sh=T_SH_BOOL?'text-shadow:0 2px 12px rgba(0,0,0,.4);':'';
  var safeBg=safeBgUrl(st.customBackground);
  // v0.7.187 — BG image/video moved to persistent #bgLayer (see ~L562
  // setBgVid). Only the dim overlay is emitted inline so the slide
  // content stays readable against custom backgrounds. setBgVid is
  // invoked at every render exit so the layer always matches the
  // currently-rendered bg URL. The .lt-bg path below (LT branch) keeps
  // its OWN inline tag — it sits inside the chyron card, not behind it,
  // so the persistent-layer architecture does not apply.
  var bg=safeBg?'<div class="bg-overlay"></div>':'';
  var themeBg=safeBg?'background:transparent;':'';
  // Reference typography (Bug #5): the operator now has independent
  // controls for the reference label. Each field falls back to the
  // body equivalent when unset so persisted settings keep working.
  // (NDI body fallback is honoured via T_FF / T_FS / T_SH_BOOL etc.)
  // v0.7.191 — NDI ignores st.referenceFontFamily / st.referenceTextShadow
  // / st.referenceTextScale / st.referenceFontSize / st.referenceTextAlign
  // (those are app-only). NDI reference typography derives entirely from
  // the NDI body chain (T_FF / T_SH_BOOL / T_TS / T_FS / T_TA) plus the
  // dedicated ndiRef* overrides resolved below.
  var rfFam=resolveFont(USE_NDI_OVERRIDES ? T_FF : (st.referenceFontFamily||T_FF));
  var rfShOn=USE_NDI_OVERRIDES ? T_SH_BOOL : ((typeof st.referenceTextShadow==='boolean')?st.referenceTextShadow:T_SH_BOOL);
  var rfShCss=rfShOn?'text-shadow:0 2px 12px rgba(0,0,0,.4);':'';
  // v0.5.57 — NDI-only reference overrides win over the body
  // fallbacks above when IS_NDI is true. Style ('italic'|'normal'),
  // position ('top'|'bottom'|'hidden'), and a dedicated scale +
  // bucket so the broadcast deck can run a tiny italic chyron-style
  // reference while the in-room projector keeps the standard
  // body-aligned label.
  var rfTsRaw=USE_NDI_OVERRIDES
    ? (typeof st.ndiRefScale==='number' ? st.ndiRefScale : NDI_DEFAULTS.refScale)
    : ((typeof st.referenceTextScale==='number')?st.referenceTextScale:T_TS);
  var rfTs=Math.min(2,Math.max(.5,rfTsRaw));
  var rfBucket=USE_NDI_OVERRIDES
    ? (st.ndiRefSize || NDI_DEFAULTS.refSize)
    : (st.referenceFontSize||T_FS);
  var rfScale=rfTs*(FS_MULT[rfBucket]||1);
  var rfStyle=USE_NDI_OVERRIDES
    ? ((st.ndiRefStyle||NDI_DEFAULTS.refStyle)==='italic' ? 'italic' : 'normal')
    : 'normal';
  var rfPosition=USE_NDI_OVERRIDES
    ? (st.ndiRefPosition || NDI_DEFAULTS.refPosition)
    : 'top';
  var rfHidden=(USE_NDI_OVERRIDES && st.ndiRefPosition==='hidden');
  // Reference clamp — same shape as the LT body clamp below, but a
  // narrower band so the reference label stays subordinate to the
  // verse body. Mirrors lowerThirdClamp() in src/lib/fonts.ts so the
  // Settings WYSIWYG preview, the secondary screen, and the NDI
  // capture window all produce the same metrics.
  var rfBand=Math.max(2.5,4*rfScale);
  var rfCap=Math.max(1,1.4*rfScale);
  var rfMin=Math.max(.35,.5*rfScale);
  var rfFs='clamp('+rfMin+'rem,min('+(rfBand*0.5)+'cqw,'+rfBand+'cqh),'+rfCap+'rem)';
  var rfTa=USE_NDI_OVERRIDES ? T_TA : (st.referenceTextAlign||T_TA);
  var refStyle='font-family:'+rfFam+';font-size:'+rfFs+';text-align:'+rfTa+';font-style:'+rfStyle+';'+rfShCss;
  // Same Strong's-strip + HTML-escape used for the body — keeps the
  // reference line ("Galatians 2:5 — KJV") safe even if a translation
  // ever leaks markup into a book name.
  // NOTE: \\\\/ (TS source) -> \\/ (browser JS) so the regex's closing-slash
  // is escaped. Earlier versions used \\/ (TS) -> / (browser), which broke the
  // regex literal at parse time and silently killed the entire <script> tag.
  // That single bug was the root cause of every "kiosk shows splash forever"
  // report — pollOnce() and the SSE handler were never reached because the
  // script never finished parsing.
  function _stripRefStrong(t){return String(t==null?'':t).replace(/<S>[^<]*<\\/S>/gi,'').replace(/<[^>]+>/g,'')}
  function _escRef(t){return _stripRefStrong(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  // v0.5.57 — rfHidden short-circuits the reference render when the
  // operator picks "Hidden" in the NDI Output panel (e.g. vMix is
  // already showing a chyron with the reference so the captured
  // window only carries the verse body).
  var ref=(!rfHidden && st.showReferenceOnOutput!==false && slide.title)
    ? '<div class="slide-reference" style="'+refStyle+'">'+_escRef(slide.title)+(slide.subtitle?' \\u2014 '+_escRef(slide.subtitle):'')+'</div>'
    : '';
  var totalChars=0;
  if(slide.content&&slide.content.length){for(var i=0;i<slide.content.length;i++)totalChars+=(slide.content[i]||'').length;}
  // Combine the operator's manual textScale with the font-size bucket
  // multiplier so picking Small/Medium/Large/Extra Large visibly steps
  // text on the secondary screen too — matching the operator preview.
  var scale=Math.min(2,Math.max(.5,T_TS))*(FS_MULT[T_FS]||1);
  var fs=fitFont(T_FS,scale,totalChars);
  var fontFam=resolveFont(T_FF);
  var fontStyle='font-family:'+fontFam+';';
  var txt='';
  if(slide.type==='media'&&slide.mediaUrl&&IS_NO_MEDIA){
    // v0.7.198 — Settings preview wants background-only on media
    // slides. Without this short-circuit, falling through to the
    // standard text-slide branch would render slide.title (the
    // media filename) as dim text — operator wants pure background.
    // Mirrors the !slide themed-bg path at L1294-1316: paint the
    // operator's customBackground via #bgLayer, lay the theme card
    // + bg-overlay over it, and skip the verse/text DOM entirely.
    var tkM=(st.congregationScreenTheme||'minimal');
    var tcM=themes[tkM]||'theme-minimal';
    var safeBgM=safeBgUrl(st.customBackground);
    var bgOverlayM=safeBgM?'<div class="bg-overlay"></div>':'';
    var themeBgM=safeBgM?'background:transparent;':'';
    setBgVid(safeBgM);
    $('output').innerHTML='<div class="'+tcM+'" style="'+themeBgM+'width:100%;height:100%;position:relative;">'+bgOverlayM+'</div>';
    $('output').classList.remove('hidden');
    window.__liveVideoEl=null;
    window.__liveVideoKey='';
    try{lastRenderKey=JSON.stringify({sl:slide,dm:s.displayMode,st:settingsRenderKey(s.settings),ndi:IS_NDI,nm:IS_NO_MEDIA?1:0});}catch(e){}
    return;
  }
  if(slide.type==='media'&&slide.mediaUrl){
    // Mirror the in-app resolveMediaPresentation() helper so the
    // congregation/NDI feed honours the operator's per-asset Fit /
    // Aspect Ratio choice exactly the same way as the operator
    // preview. Falls back to "fit" (contain) for legacy slides.
    var mf=slide.mediaFit||'fit';
    var of='contain';
    var ar='';
    if(mf==='fill'){of='cover';}
    else if(mf==='stretch'){of='fill';}
    else if(mf==='16:9'){of='contain';ar='16/9';}
    else if(mf==='4:3'){of='contain';ar='4/3';}
    var mediaStyle='width:100%;height:100%;object-fit:'+of+';background:#000;display:block';
    // Reuse path: if the SAME media URL is already mounted, we only
    // toggle play/pause on the live <video> element instead of
    // tearing down the DOM. Rebuilding would seek the video back to
    // t=0 every time the operator paused/resumed, which would
    // desync video / broadcast / preview. We key the cached element
    // by mediaUrl + kind + fit so any one of them changing forces
    // a fresh mount.
    var liveKey='media|'+slide.mediaKind+'|'+slide.mediaUrl+'|'+mf;
    var existingVid=window.__liveVideoEl;
    var existingKey=window.__liveVideoKey;
    // Hard guard: only reuse if the cached node is actually still in
    // the live document AND is a real <video>. Otherwise rebuild.
    var canReuse=!!(existingVid
      && existingKey===liveKey
      && existingVid.tagName==='VIDEO'
      && (typeof existingVid.isConnected==='boolean' ? existingVid.isConnected : document.body.contains(existingVid)));
    if(slide.mediaKind==='video'&&canReuse){
      // Same source — just honour the transport flag, do not rebuild.
      try{
        // v0.7.193-hotfix.2 — Drift tolerance was originally 0.4s, then
        // tightened to 0.20s for frame-accurate sync.
        // v0.7.194-hotfix.2 — NDI surface exempted (software decode on
        // offscreen Windows compositor drifts past tolerance within ~1s
        // and every drift-seek flushes the decode pipeline → keyframe
        // re-decode → 100-300ms freeze).
        //
        // v0.7.216 follow-up #4 — Operator $1600-customer escalation:
        // "Fix the output video freezing for main app output and NDI
        // output make it play smoothly live Easyworship". Same root
        // cause as the NDI exemption, but on the SECONDARY DISPLAY
        // surface too: SSE / IPC jitter between the Live broadcast and
        // the secondary-display BrowserWindow regularly exceeds 0.20s
        // even on healthy machines (Chromium's SSE delivery + the
        // 16ms broadcaster debounce + Electron IPC scheduling stack up
        // to 100-300ms of jitter under load). Every jitter spike past
        // 0.20s forced existingVid.currentTime = mediaCurrentTime → HW
        // decoder pipeline flush → visible freeze. EasyWorship is
        // smooth because it doesn't have a network-based sync loop at
        // all — its outputs share the same decoder. We can't share
        // decoders without a major rewrite, but raising tolerance to
        // 1.5s eliminates the seek thrash entirely: routine SSE jitter
        // never crosses it, while real transport events (operator
        // scrub, GO LIVE promotion with a non-zero start time, jump
        // to chapter) always exceed it by far and still get corrected.
        // Pairs with logos-shell.tsx L420 (writeback throttle 0.10s →
        // 0.50s) which already keeps local→broadcast latency inside
        // 0.50s, well under the new tolerance.
        if(!IS_NDI&&typeof slide.mediaCurrentTime==='number'&&slide.mediaCurrentTime>0){
          var drift=Math.abs((existingVid.currentTime||0)-slide.mediaCurrentTime);
          if(drift>1.5){try{existingVid.currentTime=slide.mediaCurrentTime;}catch(e){}}
        }
        if(slide.mediaPaused){existingVid.pause();}
        else{var p=existingVid.play();if(p&&p.catch)p.catch(function(){});}
      }catch(e){}
      // Keep render-key in sync so the next non-transport change still
      // triggers a real rebuild. MUST mirror the canonical key shape
      // computed at render() entry (narrowed settings via
      // settingsRenderKey + IS_NDI), otherwise the next update sees a
      // shape mismatch, fails the early-bail check, and rebuilds the
      // DOM unnecessarily — costing us the very flicker-avoidance
      // this branch exists to provide.
      try{lastRenderKey=JSON.stringify({sl:slide,dm:s.displayMode,st:settingsRenderKey(s.settings),ndi:IS_NDI,nm:IS_NO_MEDIA?1:0});}catch(e){}
      return;
    }
    // NDI surface stays muted: the NDI sender captures raw frames, not
    // page audio (audio capture is a separate roadmap item), and the
    // hidden electron window MUST never make the operator's machine
    // beep. The visible secondary screen mounts initially muted so
    // browser autoplay policy never blocks the initial play(); the
    // post-render applyAudio() step then honours the operator's
    // broadcast/volume/mute toggles and drops the mute on the next
    // tick once the operator's gesture (Go Live) has flowed through.
    var __slMU=__scrMedia(slide.mediaUrl);
    var mediaTag=slide.mediaKind==='video'
      ? '<video id="liveVideo" src="'+__slMU+'" '+(slide.mediaPaused?'':'autoplay ')+'loop muted playsinline preload="auto" style="'+mediaStyle+'"></video>'
      : '<img src="'+__slMU+'" alt="" style="'+mediaStyle+'">';
    var inner=ar
      ? '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#000"><div style="aspect-ratio:'+ar+';max-width:100%;max-height:100%;width:100%">'+mediaTag+'</div></div>'
      : mediaTag;
    setBgVid(''); // v0.7.187 — foreground media owns the surface; hide BG layer
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;background:#000">'+inner+'</div>';
    $('output').classList.remove('hidden');
    if(slide.mediaKind==='video'){
      window.__liveVideoEl=$('liveVideo');
      window.__liveVideoKey=liveKey;
      // Seed the new <video> with the current master clock so a
      // freshly-opened secondary screen joins on the right frame.
      if(window.__liveVideoEl&&typeof slide.mediaCurrentTime==='number'&&slide.mediaCurrentTime>0){
        var seedSeek=function(){try{window.__liveVideoEl.currentTime=slide.mediaCurrentTime;}catch(e){}};
        if(window.__liveVideoEl.readyState>=1){seedSeek();}
        else{window.__liveVideoEl.addEventListener('loadedmetadata',seedSeek,{once:true});}
      }
      if(slide.mediaPaused&&window.__liveVideoEl){try{window.__liveVideoEl.pause();}catch(e){}}
    }else{
      window.__liveVideoEl=null;window.__liveVideoKey='';
    }
    return;
  }
  // ── HTML-escape user content before it lands in innerHTML. ──────────
  // Bug — the operator's React renderer inserted text as a child node
  // (auto-escaped), but this output path concatenated raw strings into
  // innerHTML. Bible source data sometimes still carries Strong's
  // markup like <S>5293</S> and the browser then dropped the letter
  // adjacent to the tag — e.g. "subjection" rendered as "ubjection",
  // "gospel" as "go pel". Strip Strong's first, then escape the rest
  // so any stray <, >, & in verse text never re-enters the DOM as HTML.
  // Same parse-time-safety fix as _stripRefStrong above. Keep as \\\\/ in TS.
  function stripStrong(t){return String(t==null?'':t).replace(/<S>[^<]*<\\/S>/gi,'').replace(/<[^>]+>/g,'')}
  function esc(t){return stripStrong(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  if(slide.type==='title'){
    txt='<div class="slide-title" style="font-size:'+fs.title+';'+sh+bibleExtra+'">'+esc(slide.title)+'</div>'+(slide.subtitle?'<div class="slide-subtitle" style="font-size:'+fs.sub+';'+sh+bibleExtra+'">'+esc(slide.subtitle)+'</div>':'');
  }else if(slide.content&&slide.content.length){
    // Flow verse / lyric lines into a single paragraph so all words
    // sit on the same baseline. The verse splitter chunked the text
    // for slide-grouping; the renderer should treat each slide's lines
    // as one paragraph that wraps naturally — otherwise short opening
    // words like "Who" hang on their own line, misaligned vs the rest.
    // CRITICAL: \\s+ (double-backslash) — this regex literal lives inside
    // a TS template literal that becomes the served kiosk JS. With a
    // single backslash, JS string-parsing strips the escape and the
    // served regex is /s+/g, which replaces every lowercase 's' with a
    // space ("things"->"thing ", "those"->"tho e", "His"->"Hi ",
    // "purpose"->"purpo e"). Same hazard as the </S> escape on lines
    // 541 / 647. v0.5.41 root-cause fix.
    var joined=slide.content.map(esc).join(' ').replace(/\\s+/g,' ').trim();
    txt='<p class="slide-paragraph" style="font-size:'+fs.text+';'+sh+bibleExtra+'">'+joined+'</p>';
  }else{
    txt='<div class="slide-text" style="opacity:.3;font-size:'+fs.text+';'+bibleExtra+'">'+esc(slide.title)+'</div>';
  }
  // v0.5.57 — Reference position. 'top' (default) renders ref BEFORE
  // the verse body; 'bottom' flips the order so vMix-style chyron
  // setups can put the citation at the foot of the lower-third.
  // 'hidden' was already handled by emptying ref above.
  var refOrderTop=(rfPosition!=='bottom');
  if(isLT){
    // FORCE_POS (?position=top|bottom) wins over the operator's
    // lowerThirdPosition setting so the legacy NDI overlay capture
    // can pin its bar to the top of the frame even while the
    // projector keeps its bar at the bottom.
    var pos=FORCE_POS?FORCE_POS:(st.lowerThirdPosition==='top'?'top':'bottom');
    // Map the lowerThirdHeight enum ('sm'|'md'|'lg') to the same
    // percentage the operator preview uses so all three surfaces
    // (preview, secondary screen, NDI) render identical bar heights.
    var hMap={sm:22,md:33,lg:35};
    // v0.7.5.1 — FORCE_LH (URL ?lh=sm|md|lg) wins over SSE state so the
    // captured NDI BrowserWindow paints the operator's exact bucket on
    // its very first frame. Pre-fix it always rendered with the default
    // 'md' bucket until SSE arrived, so vMix grabbed an oversized bar
    // for the first few hundred ms after the operator dragged sm.
    // v0.7.11 — FLIPPED PRECEDENCE. Pre-fix this was
    // (FORCE_LH || st.lowerThirdHeight), meaning the URL param baked
    // at NDI start time ALWAYS won — even after the operator dragged
    // the height slider and SSE pushed the new bucket. So vMix kept
    // showing the old bucket until the BrowserWindow restarted (which
    // v0.7.11 also disabled for slider drags to stop the receiver
    // flash). The fix: prefer the live SSE state when present, fall
    // back to FORCE_LH only when state has not arrived yet (cold-start
    // first paint). Same change applied to ndiLtScale below.
    // v0.7.176 — Operator's bucket (sm/md/lg) IS respected across every
    // surface served by this route (in-app preview, Live Display,
    // secondary screen, OBS browser source, NDI), so what they pick in
    // Settings → Lower Third is exactly what every receiver gets. The
    // align-items:stretch fix on .lower-third (v0.7.173 Fix D) keeps
    // the rendered height frozen at the chosen bucket on every surface
    // — Chromium will no longer collapse height:100% to intrinsic on
    // any layout pass, so the frame stops shrinking to hug the text.
    // FORCE_LH (URL ?lh=sm|md|lg) is the cold-start fallback for the
    // NDI BrowserWindow's first paint before SSE arrives.
    var __lhKey='sm';
    var hPct=22;
    // v0.7.192-hotfix.1 — Resolve the height bucket from live SSE state
    // (st.lowerThirdHeight) with FORCE_LH (URL ?lh=) as the cold-start
    // fallback. Pre-fix __lhKey/hPct were declared but NEVER reassigned,
    // so hMap was dead code and every LT surface was pinned to sm/22%
    // regardless of the operator's pick. v0.7.11 precedence: live SSE
    // state wins; FORCE_LH only used when SSE has not arrived yet.
    __lhKey=(st.lowerThirdHeight==='sm'||st.lowerThirdHeight==='md'||st.lowerThirdHeight==='lg')
      ? st.lowerThirdHeight
      : (FORCE_LH || 'sm');
    hPct = hMap[__lhKey] || 22;
    // v0.7.0 — Compute the NDI lower-third size multiplier UP FRONT so
    // we can scale the BOX itself in lockstep with the verse text. Pre-
    // v0.7.0 only the font multiplied with ndiLtScale; the box height
    // stayed pinned to hPct, so at 2.0x the bigger text overflowed the
    // bottom of the bar (operator screenshot v0.6.9 — verse text "those
    // who love God, to those..." clipped past the rounded edge).
    // v0.7.3 — Default reverted from 2.0 to 1.0 (store.ts). Operator
    // screenshot showed the 2.0× lower-third covering ~65% of the
    // camera frame; 1.0× sits inside the bottom band the operator
    // marked in red. Persisted profiles missing the field fall back
    // to 1.0 too. Clamp 0.5..2.0 just like the slider.
    // v0.7.5.1 — FORCE_SC (URL ?sc=0.5..2) wins over SSE state for the
    // same first-paint reason as FORCE_LH above. The NDI capture bakes
    // the operator's slider value into the URL so vMix gets the right
    // text size on frame 1, not after SSE catches up.
    // v0.7.11 — FLIPPED PRECEDENCE (see __lhKey above for full
    // rationale). Live SSE state wins; FORCE_SC is now only the
    // first-paint fallback before SSE arrives.
    var ndiLtScale = USE_NDI_OVERRIDES
      ? (typeof st.ndiLowerThirdScale === 'number'
          ? Math.min(2, Math.max(0.5, st.ndiLowerThirdScale))
          : (FORCE_SC !== null ? FORCE_SC : NDI_DEFAULTS.lowerThirdScale))
      : 1;
    // v0.7.5 — Frame is FIXED (T503). Operator screenshot showed the
    // box growing past the bottom band of the camera frame (the
    // operator's red box) any time text or ndiLowerThirdScale grew.
    // Pre-v0.7.5 we multiplied the bar height by ndiLtScale so the
    // BOX scaled in lockstep with the verse text — but the operator
    // wants the OPPOSITE behaviour for NDI broadcast: the bar must
    // stay pinned to the small bottom strip selected via the height
    // bucket (sm 22% / md 33% / lg 45%) and the verse text must
    // shrink to fit INSIDE that fixed frame, never expand it. The
    // text-band auto-fit math (ltFs clamp + line-clamp below) does
    // the shrinking; we just pin the box height here.
    // v0.7.194-hotfix.11 Item #1 — Apply the operator's LT Height
    // slider (ndiLtScale) to the BAR HEIGHT itself, not just the
    // text band below. Pre-fix this line was a plain passthrough
    // (hPctScaled = hPct) so the bar stayed at the bucket default
    // (sm 22% / md 33% / lg 45%) regardless of slider position.
    // Capped at 85% so the bar can never eat the whole frame.
    var hPctScaled = Math.min(85, hPct * ndiLtScale);
    // The upper area outside the bar must always be transparent
    // (#000), per spec. Theme colour and custom background image
    // both render *inside* the rounded card only.
    var ltStyle='position:absolute;left:1%;right:1%;height:'+hPctScaled+'%;border-radius:.5rem;'+(pos==='top'?'top:3%;':'bottom:3%;');
    var alignClass='align-'+(T_TA||'center');
    // Re-size body text inside the bar based on character density so
    // long verses shrink to fit. We also bake in the operator's
    // fontSize bucket and textScale multiplier so Settings → Typography
    // (Small / Medium / Large / Extra Large + the Text Scale slider)
    // visibly steps the lower-third bar text on the secondary screen
    // and NDI feed — previously this path was hardcoded and ignored
    // both controls.
    var ltBand=totalChars>320?7:totalChars>180?9:totalChars>90?12:15;
    ltBand=ltBand*scale;
    var ltCap=Math.max(2.0,3.2*scale);
    var ltMin=Math.max(.5,.8*scale);
    /* v0.6.4 — Apply the operator's NDI lower-third size multiplier
       on the NDI surface only. Stays at 1x for the in-room projector
       and the operator preview, so the broadcast feed can be tuned
       (smaller for vMix overlays, bigger for full-screen NDI) without
       disturbing what the audience sees in the room.
       v0.7.0 — ndiLtScale is computed earlier (above the ltStyle line)
       so the BOX height also scales with it; here we just apply it to
       the text band so font + box grow in lockstep. */
    ltBand = ltBand * ndiLtScale;
    ltCap  = ltCap  * ndiLtScale;
    ltMin  = ltMin  * ndiLtScale;
    var ltFs='clamp('+ltMin+'rem,min('+(ltBand*0.55)+'cqw,'+ltBand+'cqh),'+ltCap+'rem)';
    var ltTxt=txt.replace(/font-size:[^;"]+;?/g,'font-size:'+ltFs+';');
    // lower-third-black forces the bar's background to solid black so
    // it reads like a broadcast caption regardless of theme.
    var boxThemeClass=(dm==='lower-third-black')?'':tc;
    var boxStyleExtra=(dm==='lower-third-black')?'background:#000;':'';
    var safeLtBg=safeBgUrl(st.customBackground);
    // v0.7.189 — LT bg is no longer inlined. The cached <video>/<img>
    // element is moved into the freshly-built .lt-box AFTER innerHTML
    // via mountLtBg() so the decoder survives the rewrite — no more
    // t=0 restart-flash on every speech tick / SSE poll.
    var ltInnerBg='';
    // v0.6.3 — Transparent NDI lower-third matte. When the operator
    // flips ndiLowerThirdTransparent ON the rounded card drops its
    // gradient + drop shadow so vMix/OBS receive a clean alpha matte
    // through the BOX itself. We only do this on the NDI surface
    // (IS_NDI) so the in-room projector keeps its branded card.
    // The CSS class .transparent is gated by !important rules so it
    // beats the per-theme background overrides.
    //
    // v0.6.8 — DECOUPLED from FORCE_TRANSPARENT (the URL flag now
    // controls only the BrowserWindow surrounding-area transparency,
    // which v0.6.8 makes always-on for NDI). Pre-v0.6.8 we OR'd
    // FORCE_TRANSPARENT into this expression — that meant the moment
    // the v0.6.8 panel started always sending ?transparent=1 the BOX
    // would also always go transparent, silently overriding the
    // operator's per-box toggle. Splitting the two settings restores
    // the operator's control: the surrounding frame is always alpha
    // (NDI as designed) but the lower-third card keeps or drops its
    // themed gradient backdrop based on the operator's preference.
    var ltTransparent=IS_NDI && st.ndiLowerThirdTransparent===true; // intentionally IS_NDI-only: only the actual NDI capture surface drops the themed backdrop for vMix/OBS keying.
    var ltTransparentClass=ltTransparent?' transparent':'';
    // v0.7.8 — REVERTED v0.6.5. The .ndi-full class (which removed
    // the max-width cap and shrank side padding from 6% → 2%) was the
    // root cause of the operator's "OBS/vMix lower-third doesn't
    // match the in-app preview" complaint. NDI now uses the same
    // geometry as the preview — same max-width:68rem, same padding
    // 0 6%, same border-radius 1.25rem — so what the operator sees
    // in the NDI Output Preview is exactly what vMix/OBS/Wirecast
    // receive. Variable kept (always empty) so we don't have to
    // touch the innerHTML template below.
    var ndiFullClass='';
    // v0.6.5 — When transparent matte is on, ALSO drop the body /
    // stage / output backgrounds (the lt-box.transparent rule already
    // drops the card itself, but those four ancestors stay solid #000
    // by default — leaving the in-app NDI preview AND any opaque NDI
    // receiver with a black bar where the matte should be alpha). We
    // restore them to #000 when transparent goes back off so toggling
    // doesn't permanently bleach the surface.
    //
    // v0.6.8.1 — CRITICAL FIX. The v0.6.8 decoupling of ltTransparent
    // from FORCE_TRANSPARENT meant this background-paint condition only
    // checked the operator's per-box toggle. With the toggle defaulting
    // OFF (and hidden in non-lower-third mode), the surrounding ancestors
    // were forced to OPAQUE BLACK (#000) on every NDI broadcast — so vMix/
    // OBS still saw a black frame around the bar even though the
    // BrowserWindow itself was transparent and ?transparent=1 was on the
    // URL. Re-OR FORCE_TRANSPARENT here so the surrounding-area paint
    // honours the URL flag (always-on for v0.6.8 NDI) while the BOX class
    // (ltTransparentClass class on lt-box) continues to honour only the operator's
    // toggle. Two settings, two effects, no cross-contamination.
    // v0.7.209 — setProperty background important so this
    // surrounding-area paint beats OBS Browser Source Custom CSS
    // (body background-color rgba 0 0 0 0) the same way the load-
    // time block and render-time reset above do. Without important
    // OBS would re-introduce alpha here on every lower-third repaint.
    try{
      var __bg=(FORCE_TRANSPARENT||ltTransparent)?'transparent':'#000';
      document.documentElement.style.setProperty('background',__bg,'important');
      document.body.style.setProperty('background',__bg,'important');
      var __st2=document.getElementById('stage');if(__st2)__st2.style.setProperty('background',__bg,'important');
      var __op2=document.getElementById('output');if(__op2)__op2.style.setProperty('background',__bg,'important');
    }catch(e){}
    var ltOrdered=refOrderTop?(ref+ltTxt):(ltTxt+ref);
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;background:transparent;'+fontStyle+'"><div class="lower-third '+pos+ndiFullClass+'" style="'+ltStyle+'"><div class="lt-box '+boxThemeClass+ltTransparentClass+ndiFullClass+' '+alignClass+'" style="'+boxStyleExtra+fontStyle+'">'+ltInnerBg+'<div class="lt-content '+alignClass+'">'+ltOrdered+'</div></div></div></div>';
    // v0.7.189 — Mount the persistent LT bg into the freshly-built .lt-box.
    // Same URL as last render = element is MOVED (not recreated) so video
    // decoder keeps running uninterrupted. URL change = old released, new
    // built. lower-third-black or no bg = release any cached element.
    setBgVid(''); // fullscreen #bgLayer is irrelevant in LT mode
    var __ltBox=document.querySelector('#output .lt-box');
    if(__ltBox && dm!=='lower-third-black' && safeLtBg){ mountLtBg(__ltBox, safeLtBg); }
    else { ensureLtBgEl(''); }
  }else{
    var ta=T_TA||'center';
    var jc=ta==='left'?'flex-start':ta==='right'?'flex-end':'center';
    // v0.6.9 — REVERT v0.6.8 background-stripping in full-screen NDI.
    // Operator video showed full-screen NDI broadcasting the verse on
    // a WHITE / alpha frame because v0.6.8 made FORCE_TRANSPARENT
    // always-on for NDI and the previous code blanked fsTheme + fsBg
    // any time FORCE_TRANSPARENT was set. The intent of that strip
    // was the legacy "NDI as overlay" capture (vMix would composite
    // it over a camera feed), but operators on the new build want
    // full-screen NDI to render IDENTICALLY to the secondary screen
    // — themed gradient + custom background visible — so the NDI
    // feed can act as a complete program output, not a key-fill alpha
    // matte. Lower-third NDI keeps its surrounding-area transparency
    // (handled in the isLT branch above with the v0.6.8.1 fix); only
    // the FULL-SCREEN branch was over-zealously stripping. The legacy
    // overlay use case is still served by lower-third mode + the
    // operator's per-box ndiLowerThirdTransparent toggle.
    // v0.7.194-hotfix.4 — Per-feed full-screen background gate. When
    // the operator picked "Transparent" in the NDI Output panel
    // (fsbg=transparent on the URL), strip the theme class AND the
    // background-image string so vMix/OBS/Wirecast receive verse text
    // on a clean alpha matte. Default ('themed') keeps the v0.6.9
    // behaviour — themed gradient + custom bg render identical to the
    // in-room projector. The themeBg inline style is also nulled when
    // transparent so the gradient doesn't leak through.
    var fsTheme=FS_BG_TRANSPARENT?'':tc;
    var fsBg=FS_BG_TRANSPARENT?'':bg;
    var fsThemeBg=FS_BG_TRANSPARENT?'':themeBg;
    var fsOrdered=refOrderTop?(ref+txt):(txt+ref);
    setBgVid(FS_BG_TRANSPARENT?'':safeBg);
    $('output').innerHTML='<div class="'+fsTheme+'" style="'+fsThemeBg+'width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:'+jc+';text-align:'+ta+';'+fontStyle+'">'+fsBg+'<div class="slide-content" style="text-align:'+ta+';'+fontStyle+'">'+fsOrdered+'</div></div>';
  }
  $('output').classList.remove('hidden');
  // v0.7.182 — fire autofit AFTER layout settles. rAF guarantees the
  // browser has run layout for the freshly-injected innerHTML before
  // we measure scrollHeight. Fallback to setTimeout(0) keeps the
  // call ordering identical when rAF is unavailable (extremely old
  // Electron / SSR test).
  // v0.7.194-hotfix.4 — Triple-pass autofit. Pre-fix a single rAF
  // measured scrollHeight too early when the injected HTML contained
  // (a) custom web-font (Playfair/Merriweather/etc still loading),
  // (b) a background <video> element changing the layout context, or
  // (c) the new .slide-reference{width:100%} chyron that re-flows
  // text wrap on second paint. Operators saw verses occasionally clip
  // at the bottom or run off-screen on first show, then "snap" to the
  // correct size on the next slide. Now: rAF #1 lets layout settle,
  // rAF #2 covers post-font-swap re-measure, and a 120ms setTimeout
  // catches video-decoder ready + Chromium offscreen compositor pass
  // (the NDI capture surface in particular needs that extra beat).
  // fitVerseText itself is idempotent so triple-firing is safe.
  // v0.7.194-hotfix.6 — Added 4th pass at 350ms specifically for the
  // Full↔Lower-Third mode flip case on the Electron offscreen NDI
  // surface. The .lt-box container-query units (cqw/cqh) and its
  // sibling bg-video <div> can take ~250-300ms to settle their
  // measured dimensions on the offscreen compositor (longer than the
  // 120ms 3rd pass covers). The __lastIsLT cache-invalidator in
  // fitVerseText (L926-928) ensures this final pass re-measures from
  // scratch against the now-stable layout. fitVerseText is idempotent
  // so the 4th firing is free if the layout had already settled by
  // the 120ms pass on faster machines.
  if(typeof requestAnimationFrame==='function'){
    requestAnimationFrame(function(){
      requestAnimationFrame(fitVerseText);
      setTimeout(fitVerseText,120);
      setTimeout(fitVerseText,350);
    });
  }else{
    setTimeout(fitVerseText,0);
    setTimeout(fitVerseText,120);
    setTimeout(fitVerseText,350);
  }
}

// Polling fallback. Server-Sent Events break when the deployment is
// horizontally scaled (autoscale): the GET that opens the SSE stream
// can land on a different instance from the POSTs that mutate state,
// so the secondary screen stays black even though the operator is
// pushing slides. Polling /api/output?format=json works regardless of
// which instance answers, because every instance returns whatever it
// most recently saw. We still prefer the SSE push (zero latency) but
// keep a 1.5s poll running underneath so output is never stuck.
let lastPolled=0;
function pollOnce(){
  fetch('/api/output?format=json',{cache:'no-store'})
    .then(function(r){return r.ok?r.json():null})
    .then(function(j){
      if(!j||!j.state)return;
      if(j.state.timestamp&&j.state.timestamp<=lastPolled)return;
      lastPolled=j.state.timestamp||Date.now();
      applyRender(j.state);
      // Silent: SSE already showed the "Connected" badge. Re-toasting
      // every poll cycle was distracting the operator (item #8).
    })
    .catch(function(){});
}
// SSE handles the realtime push; this poll is a 1.5s safety net for
// autoscale deployments where SSE can land on a different replica.
// v0.7.205 — GATED behind !IS_PREVIEW. Preview iframes receive their
// payload via parent postMessage (see IS_PREVIEW handler below) and
// MUST NOT pull live state from /api/output — doing so was painting
// the LIVE slide over the preview every 1.5 s, which is the true
// "preview snaps back to live on single-click" bug operators have
// been reporting since v0.7.158. Every previous fix (v0.7.200..204)
// chased the postMessage pipeline; the postMessage was always
// correct — the poll fallback was silently clobbering it.
if(!IS_PREVIEW) setInterval(pollOnce,1500);

// v0.5.37 -- Chromium background-throttling defence. The kiosk window
// is fullscreen on a secondary display and is NOT the focused window
// (the operator main console is). Modern Chromium aggressively
// throttles setInterval / setTimeout in unfocused windows -- the rate
// can drop to 1 Hz or less, and after a few minutes can pause
// entirely. That is exactly how the operator would see "black
// screen, never updates" even when SSE is also failing. We keep a
// page-visibility listener that force-polls the moment the surface
// becomes visible OR comes back into focus, so any missed update
// catches up immediately. This is in ADDITION to the 1.5 s interval.
function wakeAndPoll(){
  // v0.7.205 — Wake/poll path MUST short-circuit in preview iframes.
  // pollOnce fetches /api/output (LIVE state) and applyRenders it —
  // doing that in a preview iframe would clobber the preview slide
  // with live whenever the operator's tab regains focus, the OS goes
  // online, or the browser fires pageshow. Preview iframes are
  // repainted by the parent OutputPreview's Zustand subscriber, which
  // posts a fresh payload (with lastRenderKey='' reset) on every
  // store change — that is the ONLY repaint path preview surfaces
  // need. See the IS_PREVIEW gate on setInterval(pollOnce,1500) at
  // L1935 and the empty-DOM watchdog at L1994 for the same rationale.
  if(IS_PREVIEW)return;
  // Reset cache keys so the next payload always paints, even if
  // it's byte-identical to whatever we last drew before throttle.
  lastRenderKey='';
  lastSlideFingerprint='';
  pollOnce();
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible')wakeAndPoll();
});
window.addEventListener('focus',wakeAndPoll);
window.addEventListener('pageshow',wakeAndPoll);
// Also re-poll whenever the OS reports we are back online -- proxy
// drops or VPN reconnects on the operator PC used to leave the
// projector frozen on the last frame.
window.addEventListener('online',wakeAndPoll);

// v0.5.32 — Watchdog #1: recover from a stuck soft-in animation.
// The new soft-fade-in approach (paint-first, animate opacity 0.25→1)
// can't go to opacity:0 like the old fade-out did, so a stuck animation
// is no longer a "blank screen" emergency — it just means the next
// slide change won't re-trigger the keyframe. We still scrub the class
// every 2 s so a fresh slide change always gets a clean re-animation,
// and the operator never sees a stale .soft-in on a settled slide.
setInterval(function(){
  var el=$('output');
  if(!el)return;
  if(el.classList.contains('soft-in')){
    // Strip after 2 s — the animation duration caps at 1 s.
    el.classList.remove('soft-in');
  }
},2000);

// v0.5.30 — Watchdog #2: empty-DOM recovery.
// Once we've seen at least one payload (lastPolled > 0), the surface
// should never be visually empty. If a renderer bug, a CSS race, or a
// transient connection blip ever leaves #output's innerHTML empty for
// > 1.5 s, drop the cache keys and re-poll so the next payload always
// repaints. This is the operator's safety net for the "I see black"
// report — the surface self-heals to the latest broadcast state.
let emptySince=0;
// v0.7.205 — Watchdog also gated behind !IS_PREVIEW. Preview iframes
// must never re-pull live state via pollOnce (would clobber the
// preview slide with live). If a preview iframe's DOM goes empty,
// the next parent postMessage will repaint it — the parent's
// subscriber fires on every store change and the lastRenderKey=''
// reset on every preview payload guarantees a re-paint.
if(!IS_PREVIEW) setInterval(function(){
  if(!lastPolled)return; // never received state — splash is acceptable
  var el=$('output');
  if(!el)return;
  var isEmpty=!el.innerHTML||el.innerHTML.trim().length===0;
  if(isEmpty){
    if(!emptySince) emptySince=Date.now();
    if(Date.now()-emptySince>1500){
      lastRenderKey='';
      lastSlideFingerprint='';
      emptySince=0;
      pollOnce();
    }
  }else{
    emptySince=0;
  }
},1000);

function connect(){
  $('reconnecting').classList.remove('active');
  // v0.5.30 — Bug-fix for "blank black screen" reports.
  // On every (re)connect, drop the render-cache keys so the very next
  // payload is GUARANTEED to repaint the surface even if its content
  // is byte-identical to the cached one. Previously a transient
  // connection drop could leave the surface holding a stale cache
  // key while the DOM had been replaced by an empty themed div, and
  // because the next payload matched the cached key the render()
  // early-bail kicked in and the screen stayed black until something
  // genuinely new arrived. We also force-clear any in-flight fade.
  lastRenderKey='';
  lastSlideFingerprint='';
  var elc=$('output');if(elc)elc.classList.remove('soft-in');
  // Kick off a poll right away so the screen lights up even before SSE
  // negotiates (some proxies hold the first message for a beat).
  pollOnce();
  es=new EventSource('/api/output');
  es.onopen=function(){
    reconnects=0;
    $('status').classList.add('connected','visible');
    $('status-text').textContent='Connected';
    setTimeout(function(){$('status').classList.remove('visible')},3000);
    // After the SSE channel negotiates, immediately re-poll so any
    // payload that arrived between the cache-reset above and the
    // first 'state' event lands on screen. Belt + braces against
    // the "I see black" report.
    setTimeout(pollOnce,50);
  };
  es.onmessage=function(e){
    // v0.5.37 -- CRITICAL bug fix. The SSE broadcast payload is
    //   {type:slide|clear, ..., event:state, timestamp:N}
    // The previous handler matched on d.type==="state", but
    // d.type is "slide" or "clear" -- the "state" marker lives
    // in d.event. So every SSE delivery has been silently
    // dropped since this route shipped, and the secondary screen
    // / NDI feed have only been receiving updates from the 1.5 s
    // polling fallback. On a kiosk window that Chromium aggressively
    // background-throttles, that polling can stretch to multi-second
    // gaps or stall for tens of seconds -- the operator verse change
    // never appears, the screen looks "stuck black", and the only
    // recovery path was a manual reload. We now accept any payload
    // that looks like state (slide/clear type plus a timestamp) and
    // call applyRender unconditionally.
    try{
      var d=JSON.parse(e.data);
      if(!d || typeof d!=='object')return;
      // Accept both the legacy "type:state" shape and the actual
      // "event:state" shape produced by output-broadcast.ts.
      var looksLikeState =
        d.event==='state' ||
        d.type==='state' ||
        d.type==='slide' ||
        d.type==='clear';
      if(!looksLikeState)return;
      if(typeof d.timestamp==='number')lastPolled=d.timestamp;
      applyRender(d);
    }catch(err){}
  };
  es.onerror=function(){
    es.close();
    $('status').classList.remove('connected');
    $('status-text').textContent='Disconnected';
    $('status').classList.add('visible');
    reconnect();
  };
}
function reconnect(){
  if(reconnects>=20){$('status-text').textContent='Connection failed';$('reconnecting').classList.remove('active');return}
  // Only paint the full-screen "Reconnecting…" overlay if the
  // operator opted in via Settings. Default behaviour is silent
  // recovery — the secondary screen freezes on the last frame
  // until SSE comes back, which is far less jarring on a stage
  // projector than a black overlay popping in.
  if(window._showReconnect){ $('reconnecting').classList.add('active'); }
  reconnects++;
  $('status-text').textContent='Reconnecting ('+reconnects+')...';
  setTimeout(connect,Math.min(1000*Math.pow(1.3,reconnects),5000));
}
document.addEventListener('mousemove',function(){
  $('status').classList.add('visible');
  clearTimeout(window._ht);
  window._ht=setTimeout(function(){$('status').classList.remove('visible')},3000);
});
// v0.7.127 — Preview iframe mode. Skip SSE / poll entirely. Listen
// for {__sl_preview:1, payload} messages from the parent Settings
// page, then hand the payload to the SAME applyRender() the live
// secondary screen + NDI capture use. The handshake ping tells the
// parent we are ready so it can flush its first snapshot — without
// it the very first paint after the iframe loads would be the
// splash watermark until the operator next mutated a setting.
if(IS_PREVIEW){
  // v0.7.204 — Rev gate REMOVED. The v0.7.200-hotfix.3 rev gate
  // (drop messages with __rev <= lastPreviewRev) was theorised to
  // protect against out-of-order delivery, but postMessage between
  // a parent window and its direct iframe is FIFO per spec — there
  // is no real reordering source. Meanwhile the rev gate created a
  // silent-drop failure mode: any time the parent OutputPreview
  // component remounted (React StrictMode dev double-mount, layout
  // -driven re-render that preserves the iframe DOM node, hot
  // reload), its useRef-backed revRef restarted at 0 while the
  // iframe's lastPreviewRev was still at some high value from the
  // old session — every subsequent post was silently dropped and
  // the iframe stayed on whatever it last rendered (typically the
  // live slide), which is the operator-visible "preview snaps back
  // to live on single click" bug.
  //
  // v0.7.204 trusts the parent: it only posts when state actually
  // changed (rAF-coalesced) and postMessage delivers FIFO, so the
  // iframe simply renders every payload it receives. The
  // lastRenderKey='' force-reset (the part that ACTUALLY fixed the
  // shape-equivalent cache collision) is preserved.
  window.addEventListener('message',function(ev){
    try{
      var d=ev&&ev.data;
      if(!d||typeof d!=='object')return;
      if(d.__sl_preview!==1)return;
      if(d.payload){
        // Force-bypass the render cache for every preview payload —
        // the parent only sends when state actually changed, so
        // re-rendering unconditionally is safe and prevents any
        // shape-equivalent cache collisions.
        lastRenderKey='';
        try{ applyRender(d.payload); }catch(_err){}
      }
    }catch(e){}
  });
  try{
    if(window.parent&&window.parent!==window){
      window.parent.postMessage({__sl_preview_ready:1},'*');
    }
  }catch(e){}
} else {
  connect();
}
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
