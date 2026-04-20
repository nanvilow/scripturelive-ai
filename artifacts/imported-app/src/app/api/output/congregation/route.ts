import { NextResponse } from 'next/server'

/**
 * GET /api/output/congregation
 *
 * Serves the standalone congregation display page.
 * This page connects to /api/output via SSE to receive real-time slide updates.
 * It can be opened in any browser — on the same machine or across the local network.
 * Use NDI Screen Capture on this window to send to vMix/Wirecast.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ScriptureLive — Congregation Display</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100vw;height:100vh;overflow:hidden;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
/* The output canvas is the inner letterbox honoring displayRatio. The
   stage element fills the whole viewport with the theme background and
   centers the canvas. */
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
#output{position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;transition:opacity .35s ease;overflow:hidden}
#output.hidden{opacity:0}
#output.ratio-16x9{aspect-ratio:16/9;width:min(100vw,calc(100vh*16/9));height:min(100vh,calc(100vw*9/16))}
#output.ratio-4x3{aspect-ratio:4/3;width:min(100vw,calc(100vh*4/3));height:min(100vh,calc(100vw*3/4))}
#output.ratio-21x9{aspect-ratio:21/9;width:min(100vw,calc(100vh*21/9));height:min(100vh,calc(100vw*9/21))}
.bg-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4;pointer-events:none}
.bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);pointer-events:none}
.slide-content{position:relative;z-index:1;text-align:center;width:90%;max-width:90vw;padding:4vh 3vw;display:flex;flex-direction:column;align-items:center;justify-content:center}
.slide-reference{font-size:clamp(.85rem,1.4vw,1.6rem);opacity:.55;margin-bottom:1.4vh;letter-spacing:.06em}
.slide-text{font-weight:500;line-height:1.35;margin:.4vh 0;word-wrap:break-word;overflow-wrap:break-word}
.slide-title{font-weight:700;line-height:1.2}
.slide-subtitle{opacity:.7;margin-top:1.4vh}
.theme-worship{background:linear-gradient(135deg,#1e0a3c,#1e1b4b)}
.theme-sermon{background:linear-gradient(135deg,#3c1a0a,#451a03)}
.theme-easter{background:linear-gradient(135deg,#0a3c2a,#042f2e)}
.theme-christmas{background:linear-gradient(135deg,#3c0a0a,#4c0519)}
.theme-praise{background:linear-gradient(135deg,#3c3a0a,#451a03)}
.theme-minimal{background:linear-gradient(135deg,#0a0a0a,#171717)}
.lower-third{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;padding:1.5rem 3rem}
.lower-third.bottom{bottom:0}.lower-third.top{top:0}
.lt-box{width:100%;max-width:60rem;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);border-radius:.5rem;padding:1.5rem 2.5rem;border:1px solid rgba(255,255,255,.1)}
#status{position:fixed;top:1rem;right:1rem;display:flex;align-items:center;gap:.5rem;z-index:100;font-size:.75rem;color:#999;opacity:0;transition:opacity .3s}
#status.visible{opacity:1}
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

function render(s){
  if(!s){$('output').innerHTML='';$('output').classList.add('hidden');lastRenderKey='';return}
  // When the operator hits "Disconnect secondary screen" the broadcaster
  // sends type:'clear'. Honor it as a true blank (black) frame so the
  // congregation TV goes dark instead of showing the themed background.
  if(s.type==='clear'){
    var ckey='__clear__';
    if(ckey===lastRenderKey)return;
    lastRenderKey=ckey;
    $('output').innerHTML='';
    $('output').style.background='#000';
    $('output').classList.remove('hidden');
    return;
  }
  // Reset any prior forced-black background on normal renders.
  $('output').style.background='';
  // Skip the rebuild entirely if the payload is identical to what's
  // already on screen. Without this guard the secondary display
  // flickered every time we rebroadcast settings or the poll raced
  // an SSE message.
  try{
    var key=JSON.stringify({sl:s.slide,dm:s.displayMode,st:s.settings});
    if(key===lastRenderKey)return;
    lastRenderKey=key;
  }catch(e){}
  var slide=s.slide;
  var dm=s.displayMode||'full';
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
  var scale=Math.min(2,Math.max(.5,(typeof st.textScale==='number'?st.textScale:1)));
  var fs=fitFont(st.fontSize||'lg',scale,totalChars);
  var txt='';
  if(slide.type==='title'){
    txt='<div class="slide-title" style="font-size:'+fs.title+';'+sh+'">'+(slide.title||'')+'</div>'+(slide.subtitle?'<div class="slide-subtitle" style="font-size:'+fs.sub+';'+sh+'">'+slide.subtitle+'</div>':'');
  }else if(slide.content&&slide.content.length){
    txt=slide.content.map(function(l){return '<div class="slide-text" style="font-size:'+fs.text+';'+sh+'">'+l+'</div>'}).join('');
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
    // lower-third-black: hide the custom/themed background so the bar
    // reads like a broadcast caption; plain lower-third keeps it.
    var ltBg=(dm==='lower-third-black')?'':bg;
    var ltStyle='position:absolute;left:0;right:0;height:'+hPct+'%;'+(pos==='top'?'top:0;':'bottom:0;');
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;background:#000;">'+ltBg+'<div class="lower-third '+pos+'" style="'+ltStyle+'"><div class="lt-box">'+ref+txt+'</div></div></div>';
  }else{
    $('output').innerHTML='<div class="'+tc+'" style="width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center;">'+bg+'<div class="slide-content">'+ref+txt+'</div></div>';
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
      render(j.state);
      $('status').classList.add('connected','visible');
      $('status-text').textContent='Connected (poll)';
      setTimeout(function(){$('status').classList.remove('visible')},2000);
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
        render(d);
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
  $('reconnecting').classList.add('active');
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
