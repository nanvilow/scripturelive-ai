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
.bg-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4;pointer-events:none}
.bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);pointer-events:none}
.slide-content{position:relative;z-index:1;text-align:center;width:90%;max-width:90vw;padding:4vh 3vw;display:flex;flex-direction:column;align-items:center;justify-content:center}
/* v0.6.3 — Bible reference text: BOLD by default + full opacity. The
   previous .55 opacity + default 500 weight made the chapter / verse
   line whisper-soft on the projector and effectively invisible on the
   NDI feed once the receiver re-encoded. Operators consistently asked
   for the reference to read clearly so the congregation sees what
   chapter is being read. Bound to ALL surfaces (live display,
   secondary screen, NDI lower-third) since they share this engine. */
.slide-reference{font-size:clamp(.85rem,1.4vw,1.6rem);opacity:1;font-weight:700;margin-bottom:1.4vh;letter-spacing:.06em}
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
.theme-minimal{background:linear-gradient(135deg,#0a0a0a,#171717)}
.lower-third{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;padding:0 6%;container-type:size}
.lower-third.bottom{bottom:6%}.lower-third.top{top:6%}
/* Lower-third is now a rounded "card" that holds the verses. The
   upper area outside it stays transparent (#000) so any background
   change applies only to this rounded box, per spec. */
.lt-box{position:relative;width:100%;max-width:68rem;padding:3% 5%;display:flex;flex-direction:column;justify-content:center;overflow:hidden;height:100%;box-sizing:border-box;border-radius:1.25rem;box-shadow:0 8px 28px rgba(0,0,0,.45);background:linear-gradient(135deg,#0a0a0a,#171717)}
/* v0.7.8 — REVERTED v0.6.5 NDI full-width override. Operators were
   reporting that the lower-third bar in OBS/vMix/Wirecast did NOT
   match what the in-app NDI Output Preview showed — the captured
   feed was significantly wider (max-width:none) and used a smaller
   border-radius (.75rem instead of 1.25rem) and tighter side
   padding (2% instead of 6%), so the bar covered far more of the
   broadcast frame than the operator had set up. The v0.6.5 "fill
   the frame" rationale conflicted with the WYSIWYG contract the
   preview is supposed to provide. The .ndi-full class is now a
   no-op (kept as a defensive empty selector so any persisted SSE
   state that still tries to add it cannot accidentally re-grow the
   card). The captured frame now uses the same .lower-third + .lt-box
   defaults as the preview: max-width 68rem, padding 0 6%, border-
   radius 1.25rem. Pixel-WYSIWYG. */
.lower-third.ndi-full{}
.lt-box.ndi-full{}
.lt-box.theme-worship{background:linear-gradient(135deg,#1e0a3c,#1e1b4b)}
.lt-box.theme-sermon{background:linear-gradient(135deg,#3c1a0a,#451a03)}
.lt-box.theme-easter{background:linear-gradient(135deg,#0a3c2a,#042f2e)}
.lt-box.theme-christmas{background:linear-gradient(135deg,#3c0a0a,#4c0519)}
.lt-box.theme-praise{background:linear-gradient(135deg,#3c3a0a,#451a03)}
.lt-box.theme-minimal{background:linear-gradient(135deg,#0a0a0a,#171717)}
/* v0.6.3 — NDI lower-third transparent matte. When the operator flips
   "Transparent lower-third" on the NDI tab, the rounded card drops
   its gradient + drop-shadow so vMix / OBS receive a clean alpha
   matte (text only, zero fill). The text itself stays opaque so it
   survives keying. The !important flag is intentional — it must beat
   the per-theme background overrides above. */
.lt-box.transparent{background:transparent !important;box-shadow:none !important}
.lt-box.transparent .lt-bg,.lt-box.transparent .lt-bg-overlay{display:none !important}
/* Custom background image — clipped to the rounded box only. */
.lt-box .lt-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4;border-radius:inherit;pointer-events:none}
.lt-box .lt-bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);border-radius:inherit;pointer-events:none}
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
.lt-box .slide-text,.lt-box .slide-title{font-weight:600;line-height:1.25}
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
<div id="stage"><div id="output"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;text-align:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"><div style="font-size:clamp(2rem,7vmin,7rem);font-weight:600;letter-spacing:-.01em;line-height:1.05;opacity:.4">Scripture AI</div><div style="margin-top:1.4vmin;font-size:clamp(.85rem,1.8vmin,1.6rem);opacity:.3;font-weight:500">Powered By WassMedia (+233246798526)</div></div></div></div>
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
  if(!k)return FONT_MAP['sans'];
  if(typeof k==='string'&&k.indexOf('font-')===0)k=k.slice(5);
  return FONT_MAP[k]||FONT_MAP['sans'];
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
try{
  var __qp=new URLSearchParams(location.search);
  IS_NDI=(__qp.get('ndi')==='1');
  FORCE_TRANSPARENT=(__qp.get('transparent')==='1');
  FORCE_LT=(__qp.get('lowerThird')==='1');
  var __p=__qp.get('position');
  if(__p==='top'||__p==='bottom')FORCE_POS=__p;
  var __lh=__qp.get('lh');
  if(__lh==='sm'||__lh==='md'||__lh==='lg')FORCE_LH=__lh;
  var __sc=parseFloat(__qp.get('sc')||'');
  if(isFinite(__sc)&&__sc>=0.5&&__sc<=2)FORCE_SC=__sc;
}catch(e){}
// Drop body / stage / output backgrounds when running as an NDI
// alpha-keyed overlay so vMix/OBS receives a clean matte. Done at
// load time (not in render) so the very first paint already carries
// the transparent fill — preventing a one-frame black flash. The
// stylesheet sets html / body / #stage / #output to solid #000 by
// default (so the projector window is opaque), so all four surfaces
// must be flipped here when transparent mode is requested.
if(FORCE_TRANSPARENT){
  try{
    document.documentElement.style.background='transparent';
    document.body.style.background='transparent';
    var __st=document.getElementById('stage');if(__st)__st.style.background='transparent';
    var __op=document.getElementById('output');if(__op)__op.style.background='transparent';
  }catch(e){}
}
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

function render(s){
  if(!s){$('output').innerHTML='';$('output').classList.add('hidden');lastRenderKey='';dropLiveVideoCache();return}
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
    $('output').innerHTML='';
    $('output').style.background='#000';
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
      $('output').style.background='#000';
      $('output').classList.remove('hidden');
      return;
    }
    var ckey='__clear__';
    if(ckey===lastRenderKey)return;
    lastRenderKey=ckey;
    $('output').innerHTML='';
    $('output').style.background='#000';
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
  if(FORCE_TRANSPARENT){
    $('output').style.background='transparent';
    var __stR=document.getElementById('stage');if(__stR)__stR.style.background='transparent';
  }else{
    $('output').style.background='';
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
    var key=JSON.stringify({sl:s.slide,dm:s.displayMode,st:settingsRenderKey(s.settings),ndi:IS_NDI});
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
  var dm=FORCE_LT
    ?'lower-third'
    :((IS_NDI&&s.settings&&s.settings.ndiDisplayMode)
      ?s.settings.ndiDisplayMode
      :(s.displayMode||'full'));
  var st=s.settings||{};
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
      $('output').innerHTML='';
      $('output').classList.remove('hidden');
      return;
    }
    // Render themed background only — never a black void
    var tkE=(st.congregationScreenTheme||'minimal');
    var tcE=themes[tkE]||'theme-minimal';
    var bgE=st.customBackground?'<img class="bg-image" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="bg-overlay"></div>':'';
    $('output').innerHTML='<div class="'+tcE+'" style="width:100%;height:100%;position:relative;">'+bgE+'</div>';
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
  var T_FF=(IS_NDI && st.ndiFontFamily) ? st.ndiFontFamily : st.fontFamily;
  var T_FS=(IS_NDI && st.ndiFontSize) ? st.ndiFontSize : (st.fontSize||'lg');
  var T_SH_BOOL=(IS_NDI && (typeof st.ndiTextShadow==='boolean')) ? st.ndiTextShadow : (st.textShadow!==false);
  var T_TS=(IS_NDI && (typeof st.ndiTextScale==='number')) ? st.ndiTextScale : (typeof st.textScale==='number'?st.textScale:1);
  var T_TA=(IS_NDI && st.ndiTextAlign) ? st.ndiTextAlign : (st.textAlign||'center');
  // v0.5.57 — NDI-only bible body color + line-height. Both are
  // pure CSS overrides applied to the .slide-text node only when
  // IS_NDI is true; the secondary screen keeps the theme defaults.
  var T_COLOR=(IS_NDI && st.ndiBibleColor) ? st.ndiBibleColor : '';
  // v0.6.9 — Bible line-height now has a Live Display source too.
  // NDI override > Live Display setting > 0 (no override). Previously
  // this only honoured the NDI value, so the new operator-facing
  // bibleLineHeight slider in the Typography panel had no effect
  // on the secondary screen.
  var T_LH=(IS_NDI && typeof st.ndiBibleLineHeight==='number')
    ? Math.min(2.5, Math.max(0.9, st.ndiBibleLineHeight))
    : (typeof st.bibleLineHeight==='number'
      ? Math.min(2.5, Math.max(0.9, st.bibleLineHeight))
      : 0);
  var bibleExtra=(T_COLOR?'color:'+T_COLOR+';':'')+(T_LH?'line-height:'+T_LH+';':'');
  var sh=T_SH_BOOL?'text-shadow:0 2px 12px rgba(0,0,0,.4);':'';
  var bg=st.customBackground?'<img class="bg-image" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="bg-overlay"></div>':'';
  // Reference typography (Bug #5): the operator now has independent
  // controls for the reference label. Each field falls back to the
  // body equivalent when unset so persisted settings keep working.
  // (NDI body fallback is honoured via T_FF / T_FS / T_SH_BOOL etc.)
  var rfFam=resolveFont(st.referenceFontFamily||T_FF);
  var rfShOn=(typeof st.referenceTextShadow==='boolean')?st.referenceTextShadow:T_SH_BOOL;
  var rfShCss=rfShOn?'text-shadow:0 2px 12px rgba(0,0,0,.4);':'';
  // v0.5.57 — NDI-only reference overrides win over the body
  // fallbacks above when IS_NDI is true. Style ('italic'|'normal'),
  // position ('top'|'bottom'|'hidden'), and a dedicated scale +
  // bucket so the broadcast deck can run a tiny italic chyron-style
  // reference while the in-room projector keeps the standard
  // body-aligned label.
  var rfTsRaw=(IS_NDI && typeof st.ndiRefScale==='number')
    ? st.ndiRefScale
    : ((typeof st.referenceTextScale==='number')?st.referenceTextScale:T_TS);
  var rfTs=Math.min(2,Math.max(.5,rfTsRaw));
  var rfBucket=(IS_NDI && st.ndiRefSize) ? st.ndiRefSize : (st.referenceFontSize||T_FS);
  var rfScale=rfTs*(FS_MULT[rfBucket]||1);
  var rfStyle=(IS_NDI && st.ndiRefStyle==='italic') ? 'italic' : 'normal';
  var rfPosition=(IS_NDI && st.ndiRefPosition) ? st.ndiRefPosition : 'top';
  var rfHidden=(IS_NDI && st.ndiRefPosition==='hidden');
  // Reference clamp — same shape as the LT body clamp below, but a
  // narrower band so the reference label stays subordinate to the
  // verse body. Mirrors lowerThirdClamp() in src/lib/fonts.ts so the
  // Settings WYSIWYG preview, the secondary screen, and the NDI
  // capture window all produce the same metrics.
  var rfBand=Math.max(2.5,4*rfScale);
  var rfCap=Math.max(1,1.4*rfScale);
  var rfMin=Math.max(.35,.5*rfScale);
  var rfFs='clamp('+rfMin+'rem,min('+(rfBand*0.5)+'cqw,'+rfBand+'cqh),'+rfCap+'rem)';
  var rfTa=st.referenceTextAlign||T_TA;
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
        // Re-sync to the master clock if drift > 0.4s. This keeps the
        // congregation screen on the same frame as the operator's Live
        // pane after a pause / scrub.
        if(typeof slide.mediaCurrentTime==='number'&&slide.mediaCurrentTime>0){
          var drift=Math.abs((existingVid.currentTime||0)-slide.mediaCurrentTime);
          if(drift>0.4){try{existingVid.currentTime=slide.mediaCurrentTime;}catch(e){}}
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
      try{lastRenderKey=JSON.stringify({sl:slide,dm:s.displayMode,st:settingsRenderKey(s.settings),ndi:IS_NDI});}catch(e){}
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
    var mediaTag=slide.mediaKind==='video'
      ? '<video id="liveVideo" src="'+slide.mediaUrl+'" '+(slide.mediaPaused?'':'autoplay ')+'loop muted playsinline preload="auto" style="'+mediaStyle+'"></video>'
      : '<img src="'+slide.mediaUrl+'" alt="" style="'+mediaStyle+'">';
    var inner=ar
      ? '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#000"><div style="aspect-ratio:'+ar+';max-width:100%;max-height:100%;width:100%">'+mediaTag+'</div></div>'
      : mediaTag;
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
    var hMap={sm:22,md:33,lg:45};
    // v0.7.5.1 — FORCE_LH (URL ?lh=sm|md|lg) wins over SSE state so the
    // captured NDI BrowserWindow paints the operator's exact bucket on
    // its very first frame. Pre-fix it always rendered with the default
    // 'md' bucket until SSE arrived, so vMix grabbed an oversized bar
    // for the first few hundred ms after the operator dragged sm.
    var __lhKey=FORCE_LH||st.lowerThirdHeight;
    var hPct=hMap[__lhKey]||33;
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
    var ndiLtScale = IS_NDI
      ? (FORCE_SC !== null
          ? FORCE_SC
          : (typeof st.ndiLowerThirdScale === 'number'
              ? Math.min(2, Math.max(0.5, st.ndiLowerThirdScale))
              : 1))
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
    var hPctScaled = hPct;
    // The upper area outside the bar must always be transparent
    // (#000), per spec. Theme colour and custom background image
    // both render *inside* the rounded card only.
    var ltStyle='position:absolute;left:0;right:0;height:'+hPctScaled+'%;'+(pos==='top'?'top:6%;':'bottom:6%;');
    var alignClass='align-'+(st.textAlign||'center');
    // Re-size body text inside the bar based on character density so
    // long verses shrink to fit. We also bake in the operator's
    // fontSize bucket and textScale multiplier so Settings → Typography
    // (Small / Medium / Large / Extra Large + the Text Scale slider)
    // visibly steps the lower-third bar text on the secondary screen
    // and NDI feed — previously this path was hardcoded and ignored
    // both controls.
    var ltBand=totalChars>320?5:totalChars>180?7:totalChars>90?9:11;
    ltBand=ltBand*scale;
    var ltCap=Math.max(1.4,2*scale);
    var ltMin=Math.max(.4,.6*scale);
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
    var ltInnerBg=(dm==='lower-third-black')?'':(st.customBackground?'<img class="lt-bg" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="lt-bg-overlay"></div>':'');
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
    var ltTransparent=IS_NDI && st.ndiLowerThirdTransparent===true;
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
    try{
      var __bg=(FORCE_TRANSPARENT||ltTransparent)?'transparent':'#000';
      document.documentElement.style.background=__bg;
      document.body.style.background=__bg;
      var __st2=document.getElementById('stage');if(__st2)__st2.style.background=__bg;
      var __op2=document.getElementById('output');if(__op2)__op2.style.background=__bg;
    }catch(e){}
    var ltOrdered=refOrderTop?(ref+ltTxt):(ltTxt+ref);
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;background:transparent;'+fontStyle+'"><div class="lower-third '+pos+ndiFullClass+'" style="'+ltStyle+'"><div class="lt-box '+boxThemeClass+ltTransparentClass+ndiFullClass+' '+alignClass+'" style="'+boxStyleExtra+fontStyle+'">'+ltInnerBg+'<div class="lt-content '+alignClass+'">'+ltOrdered+'</div></div></div></div>';
  }else{
    var ta=st.textAlign||'center';
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
    var fsTheme=tc;
    var fsBg=bg;
    var fsOrdered=refOrderTop?(ref+txt):(txt+ref);
    $('output').innerHTML='<div class="'+fsTheme+'" style="width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:'+jc+';text-align:'+ta+';'+fontStyle+'">'+fsBg+'<div class="slide-content" style="text-align:'+ta+';'+fontStyle+'">'+fsOrdered+'</div></div>';
  }
  $('output').classList.remove('hidden');
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
setInterval(pollOnce,1500);

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
setInterval(function(){
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
connect();
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
