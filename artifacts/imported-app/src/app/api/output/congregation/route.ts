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
html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
#output{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .5s ease}
#output.hidden{opacity:0}
.bg-image{position:absolute;inset:0;object-fit:cover;opacity:.4;pointer-events:none}
.bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);pointer-events:none}
.slide-content{position:relative;z-index:1;text-align:center;max-width:75vw;padding:4rem 2rem}
.slide-reference{font-size:1rem;opacity:.5;margin-bottom:1rem;letter-spacing:.05em}
.slide-text{font-size:2.5rem;font-weight:500;line-height:1.5}
.slide-title{font-size:3rem;font-weight:700;line-height:1.3}
.slide-subtitle{font-size:1.2rem;opacity:.7;margin-top:1rem}
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
<div id="output"></div>
<script>
const themes={worship:'theme-worship',sermon:'theme-sermon',easter:'theme-easter',christmas:'theme-christmas',praise:'theme-praise',minimal:'theme-minimal'};
let es=null,reconnects=0;
const $=id=>document.getElementById(id);

function render(s){
  // Show whatever slide is currently selected even before "Live" is engaged,
  // so the operator never sees a blank black screen on the secondary display.
  if(!s||!s.slide){$('output').innerHTML='';$('output').classList.add('hidden');return}
  const{slide,dm=(s.displayMode||'full'),st=(s.settings||{})}=s;
  const tk=slide.background||(st.congregationScreenTheme||'minimal');
  const tc=themes[tk]||'theme-minimal';
  const isLT=dm&&dm.startsWith('lower-third');
  const sh=st.textShadow!==false?'text-shadow:0 2px 12px rgba(0,0,0,.3);':'';
  const bg=st.customBackground?'<img class="bg-image" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="bg-overlay"></div>':'';
  const ref=st.showReferenceOnOutput!==false&&slide.title?'<div class="slide-reference">'+slide.title+(slide.subtitle?' \\u2014 '+slide.subtitle:'')+'</div>':'';
  let txt='';
  if(slide.type==='title'){
    const sz={sm:'2rem',md:'2.5rem',lg:'3rem',xl:'3.5rem'}[st.fontSize]||'2.5rem';
    txt='<div class="slide-title" style="font-size:'+sz+';'+sh+'">'+slide.title+'</div>'+(slide.subtitle?'<div class="slide-subtitle" style="'+sh+'">'+slide.subtitle+'</div>':'');
  }else if(slide.content&&slide.content.length){
    const sz={sm:'1.5rem',md:'2rem',lg:'2.5rem',xl:'3rem'}[st.fontSize]||'2rem';
    txt=slide.content.map(function(l){return '<div class="slide-text" style="font-size:'+sz+';'+sh+'">'+l+'</div>'}).join('');
  }else{
    txt='<div class="slide-text" style="opacity:.3">'+(slide.title||'Blank')+'</div>';
  }
  if(isLT){
    var pos=st.lowerThirdPosition==='top'?'top':'bottom';
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;">'+bg+'<div class="lower-third '+pos+'"><div class="lt-box">'+ref+txt+'</div></div></div>';
  }else{
    $('output').innerHTML='<div class="'+tc+'" style="width:100%;height:100%;position:relative;">'+bg+'<div class="slide-content">'+ref+txt+'</div></div>';
  }
  $('output').classList.remove('hidden');
}

function connect(){
  $('reconnecting').classList.remove('active');
  es=new EventSource('/api/output');
  es.onopen=function(){
    reconnects=0;
    $('status').classList.add('connected','visible');
    $('status-text').textContent='Connected';
    setTimeout(function(){$('status').classList.remove('visible')},3000);
  };
  es.onmessage=function(e){
    try{var d=JSON.parse(e.data);if(d.type==='state')render(d)}catch(err){}
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
