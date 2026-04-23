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
#output{position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;transition:opacity var(--slide-fade-ms,350ms) ease;overflow:hidden;--slide-fade-ms:350ms}
#output.hidden{opacity:0}
#output.fading{opacity:0}
#output.ratio-16x9{aspect-ratio:16/9;width:min(100vw,calc(100vh*16/9));height:min(100vh,calc(100vw*9/16))}
#output.ratio-4x3{aspect-ratio:4/3;width:min(100vw,calc(100vh*4/3));height:min(100vh,calc(100vw*3/4))}
#output.ratio-21x9{aspect-ratio:21/9;width:min(100vw,calc(100vh*21/9));height:min(100vh,calc(100vw*9/21))}
.bg-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4;pointer-events:none}
.bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);pointer-events:none}
.slide-content{position:relative;z-index:1;text-align:center;width:90%;max-width:90vw;padding:4vh 3vw;display:flex;flex-direction:column;align-items:center;justify-content:center}
.slide-reference{font-size:clamp(.85rem,1.4vw,1.6rem);opacity:.55;margin-bottom:1.4vh;letter-spacing:.06em}
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
.lt-box.theme-worship{background:linear-gradient(135deg,#1e0a3c,#1e1b4b)}
.lt-box.theme-sermon{background:linear-gradient(135deg,#3c1a0a,#451a03)}
.lt-box.theme-easter{background:linear-gradient(135deg,#0a3c2a,#042f2e)}
.lt-box.theme-christmas{background:linear-gradient(135deg,#3c0a0a,#4c0519)}
.lt-box.theme-praise{background:linear-gradient(135deg,#3c3a0a,#451a03)}
.lt-box.theme-minimal{background:linear-gradient(135deg,#0a0a0a,#171717)}
/* Custom background image — clipped to the rounded box only. */
.lt-box .lt-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4;border-radius:inherit;pointer-events:none}
.lt-box .lt-bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);border-radius:inherit;pointer-events:none}
.lt-box .lt-content{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;width:100%;height:100%}
.lt-box .slide-reference{font-size:clamp(.7rem,min(2cqw,4cqh),1.4rem);opacity:.7;font-weight:500;line-height:1.2;margin-bottom:.6cqh}
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
<div id="stage"><div id="output"></div></div>
<script>
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
var IS_NDI=false;
try{IS_NDI=(new URLSearchParams(location.search).get('ndi')==='1');}catch(e){}
let es=null,reconnects=0;
const $=id=>document.getElementById(id);
// Hash of the last rendered payload — render() bails out if the next
// payload is identical, which prevents the flash that came from rapid
// SSE + poll double-fire and from re-broadcasting the same settings.
let lastRenderKey='';

// Compute clamp() font sizes that scale with the viewport so text is
// always readable but never overflows. fontSize picks the base, and
// textScale multiplies it. Long passages get bumped down further.
function fitFont(base, scale, totalChars){
  // base mid-vmin per fontSize bucket, scaled to viewport with min/max
  var bandTitle={sm:5,md:6,lg:7,xl:8.5}[base]||7;
  var bandText={sm:3.6,md:4.4,lg:5.2,xl:6.4}[base]||5.2;
  if(totalChars>180)bandText-=.6;
  if(totalChars>320)bandText-=.6;
  if(totalChars>480)bandText-=.6;
  if(totalChars>700)bandText-=.6;
  if(bandText<2.2)bandText=2.2;
  bandTitle*=scale;bandText*=scale;
  return {
    title:'clamp(1.2rem,'+bandTitle+'vmin,8rem)',
    text:'clamp(1rem,'+bandText+'vmin,5.5rem)',
    sub:'clamp(.9rem,'+(bandTitle*.55)+'vmin,2.5rem)',
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

// applyRender — wraps render() so slide changes can crossfade.
//
// Reads slideTransitionStyle ('cut' | 'fade') and slideTransitionDuration
// from the broadcast settings, sets the --slide-fade-ms CSS variable
// (so the existing #output opacity transition uses the operator's
// chosen speed), and on a real content change does:
//   fade out → swap DOM → fade in
// For Cut style (or duration<=0, or first paint) we just call render()
// directly so the swap is instant.
//
// We deliberately pass through to render() for the very first paint
// (lastRenderKey === '') so the initial WassMedia splash / first slide
// appears immediately instead of after a fade-in delay.
let pendingFade=null;
function applyRender(s){
  // Cache the operator's "show reconnect overlay" preference so the
  // SSE error handler below can honour it without needing a fresh
  // payload at the moment of disconnect.
  try{ window._showReconnect=!!(s&&s.settings&&s.settings.showReconnectingOverlay); }catch(e){}
  var style=(s&&s.settings&&s.settings.slideTransitionStyle)||'fade';
  var dur=(s&&s.settings&&typeof s.settings.slideTransitionDuration==='number')?s.settings.slideTransitionDuration:500;
  if(dur<0)dur=0;if(dur>4000)dur=4000;
  var el=$('output');
  if(el)el.style.setProperty('--slide-fade-ms',(style==='cut'?0:dur)+'ms');
  // Cut, no duration, or initial paint → swap straight away.
  if(style==='cut'||dur<=0||!lastRenderKey){
    if(pendingFade){clearTimeout(pendingFade);pendingFade=null;el&&el.classList.remove('fading');}
    render(s);
    applyAudio(s);
    return;
  }
  // Already mid-fade — replace the queued swap with the freshest payload.
  if(pendingFade){clearTimeout(pendingFade);}
  if(el)el.classList.add('fading');
  pendingFade=setTimeout(function(){
    pendingFade=null;
    render(s);
    applyAudio(s);
    // Two rAFs so the new DOM has painted before we drop .fading,
    // otherwise the browser skips the fade-in transition.
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var el2=$('output');
        if(el2)el2.classList.remove('fading');
      });
    });
  },dur);
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
    if(s.showStartupLogo){
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
  // Reset any prior forced-black background on normal renders.
  $('output').style.background='';
  // Skip the rebuild entirely if the payload is identical to what's
  // already on screen. Without this guard the secondary display
  // flickered every time we rebroadcast settings or the poll raced
  // an SSE message.
  try{
    // Include IS_NDI in the render key so the NDI surface refreshes
    // whenever ndiDisplayMode flips, even if the projector's
    // displayMode and slide are otherwise unchanged.
    var key=JSON.stringify({sl:s.slide,dm:s.displayMode,st:s.settings,ndi:IS_NDI});
    if(key===lastRenderKey)return;
    lastRenderKey=key;
  }catch(e){}
  var slide=s.slide;
  // NDI surface follows its own independent display mode so the
  // operator can run the projector full-screen while the NDI feed
  // shows a lower-third caption (or vice-versa). Falls back to the
  // projector mode if no NDI mode was chosen yet.
  var dm=(IS_NDI&&s.settings&&s.settings.ndiDisplayMode)
    ?s.settings.ndiDisplayMode
    :(s.displayMode||'full');
  var st=s.settings||{};
  applyRatio(st.displayRatio||'fill');
  if(!slide){
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
  var sh=st.textShadow!==false?'text-shadow:0 2px 12px rgba(0,0,0,.4);':'';
  var bg=st.customBackground?'<img class="bg-image" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="bg-overlay"></div>':'';
  var ref=st.showReferenceOnOutput!==false&&slide.title?'<div class="slide-reference">'+slide.title+(slide.subtitle?' \\u2014 '+slide.subtitle:'')+'</div>':'';
  var totalChars=0;
  if(slide.content&&slide.content.length){for(var i=0;i<slide.content.length;i++)totalChars+=(slide.content[i]||'').length;}
  // Combine the operator's manual textScale with the font-size bucket
  // multiplier so picking Small/Medium/Large/Extra Large visibly steps
  // text on the secondary screen too — matching the operator preview.
  var scale=Math.min(2,Math.max(.5,(typeof st.textScale==='number'?st.textScale:1)))*(FS_MULT[st.fontSize]||1);
  var fs=fitFont(st.fontSize||'lg',scale,totalChars);
  var fontFam=resolveFont(st.fontFamily);
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
      // triggers a real rebuild.
      try{lastRenderKey=JSON.stringify({sl:slide,dm:s.displayMode,st:s.settings});}catch(e){}
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
  if(slide.type==='title'){
    txt='<div class="slide-title" style="font-size:'+fs.title+';'+sh+'">'+(slide.title||'')+'</div>'+(slide.subtitle?'<div class="slide-subtitle" style="font-size:'+fs.sub+';'+sh+'">'+slide.subtitle+'</div>':'');
  }else if(slide.content&&slide.content.length){
    // Flow verse / lyric lines into a single paragraph so all words
    // sit on the same baseline. The verse splitter chunked the text
    // for slide-grouping; the renderer should treat each slide's lines
    // as one paragraph that wraps naturally — otherwise short opening
    // words like "Who" hang on their own line, misaligned vs the rest.
    var joined=slide.content.join(' ').replace(/\s+/g,' ').trim();
    txt='<p class="slide-paragraph" style="font-size:'+fs.text+';'+sh+'">'+joined+'</p>';
  }else{
    txt='<div class="slide-text" style="opacity:.3;font-size:'+fs.text+'">'+(slide.title||'')+'</div>';
  }
  if(isLT){
    var pos=st.lowerThirdPosition==='top'?'top':'bottom';
    // Map the lowerThirdHeight enum ('sm'|'md'|'lg') to the same
    // percentage the operator preview uses so all three surfaces
    // (preview, secondary screen, NDI) render identical bar heights.
    var hMap={sm:22,md:33,lg:45};
    var hPct=hMap[st.lowerThirdHeight]||33;
    // The upper area outside the bar must always be transparent
    // (#000), per spec. Theme colour and custom background image
    // both render *inside* the rounded card only.
    var ltStyle='position:absolute;left:0;right:0;height:'+hPct+'%;'+(pos==='top'?'top:6%;':'bottom:6%;');
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
    var ltFs='clamp('+ltMin+'rem,min('+(ltBand*0.55)+'cqw,'+ltBand+'cqh),'+ltCap+'rem)';
    var ltTxt=txt.replace(/font-size:[^;"]+;?/g,'font-size:'+ltFs+';');
    // lower-third-black forces the bar's background to solid black so
    // it reads like a broadcast caption regardless of theme.
    var boxThemeClass=(dm==='lower-third-black')?'':tc;
    var boxStyleExtra=(dm==='lower-third-black')?'background:#000;':'';
    var ltInnerBg=(dm==='lower-third-black')?'':(st.customBackground?'<img class="lt-bg" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="lt-bg-overlay"></div>':'');
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;background:transparent;'+fontStyle+'"><div class="lower-third '+pos+'" style="'+ltStyle+'"><div class="lt-box '+boxThemeClass+' '+alignClass+'" style="'+boxStyleExtra+fontStyle+'">'+ltInnerBg+'<div class="lt-content '+alignClass+'">'+ref+ltTxt+'</div></div></div></div>';
  }else{
    var ta=st.textAlign||'center';
    var jc=ta==='left'?'flex-start':ta==='right'?'flex-end':'center';
    $('output').innerHTML='<div class="'+tc+'" style="width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:'+jc+';text-align:'+ta+';'+fontStyle+'">'+bg+'<div class="slide-content" style="text-align:'+ta+';'+fontStyle+'">'+ref+txt+'</div></div>';
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

function connect(){
  $('reconnecting').classList.remove('active');
  // Kick off a poll right away so the screen lights up even before SSE
  // negotiates (some proxies hold the first message for a beat).
  pollOnce();
  es=new EventSource('/api/output');
  es.onopen=function(){
    reconnects=0;
    $('status').classList.add('connected','visible');
    $('status-text').textContent='Connected';
    setTimeout(function(){$('status').classList.remove('visible')},3000);
  };
  es.onmessage=function(e){
    try{
      var d=JSON.parse(e.data);
      if(d.type==='state'){
        if(d.timestamp)lastPolled=d.timestamp;
        applyRender(d);
      }
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
