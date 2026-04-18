import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/output/ndi
 *
 * Renders the NDI broadcast layer. Unlike /api/output/congregation, this layout
 * is optimised for compositing inside vMix / Wirecast / OBS:
 *   - transparent=1   → fully transparent background (alpha channel preserved
 *                       by Electron's offscreen renderer so the NDI BGRA frames
 *                       carry an alpha matte for keying)
 *   - lowerThird=1    → always render the current slide as a lower-third bar,
 *                       even when the slide's display mode is full-screen
 *   - position=top|bottom (default: bottom)
 *   - branding=<text> → optional small branding label rendered above the bar
 *   - accent=<hex>    → accent bar colour, e.g. accent=22c55e
 *
 * Falls back to the standard congregation layout when no flags are set.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const transparent = searchParams.get('transparent') === '1'
  const lowerThird = searchParams.get('lowerThird') === '1'
  const position = searchParams.get('position') === 'top' ? 'top' : 'bottom'
  const branding = (searchParams.get('branding') || '').slice(0, 80)
  const accentRaw = (searchParams.get('accent') || '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
  const accent = accentRaw.length === 6 ? `#${accentRaw}` : '#22c55e'

  // Serialize config into a non-executable JSON script tag (parsed at runtime).
  // We escape any `</` so the JSON payload cannot break out of the <script> element,
  // which prevents a reflected-XSS vector via the `branding` query param.
  const cfg = JSON.stringify({ transparent, lowerThird, position, branding, accent })
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--')

  const bodyBg = transparent ? 'transparent' : '#000'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ScriptureLive — NDI Layer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:${bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
#stage{position:fixed;inset:0}
.full{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.full .content{text-align:center;max-width:75vw;padding:4rem 2rem;text-shadow:0 4px 24px rgba(0,0,0,.55)}
.full .reference{font-size:1rem;opacity:.75;margin-bottom:.75rem;letter-spacing:.08em;text-transform:uppercase}
.full .text{font-size:2.6rem;font-weight:500;line-height:1.45;margin-bottom:.5rem}
.full .title{font-size:3rem;font-weight:700;line-height:1.25}
.full .subtitle{font-size:1.2rem;opacity:.85;margin-top:.75rem}

.lt{position:absolute;left:0;right:0;padding:1.25rem 2.5rem;display:flex;justify-content:center;pointer-events:none}
.lt.bottom{bottom:0}
.lt.top{top:0}
.lt .branding{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.85);margin-bottom:.4rem;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.lt .bar{position:relative;width:100%;max-width:60rem;background:rgba(8,10,18,.88);backdrop-filter:blur(10px);border-radius:.6rem;padding:1rem 1.5rem 1rem 1.75rem;border:1px solid rgba(255,255,255,.08);box-shadow:0 12px 40px rgba(0,0,0,.55)}
.lt .bar::before{content:'';position:absolute;left:0;top:.85rem;bottom:.85rem;width:4px;border-radius:2px;background:var(--accent,#22c55e)}
.lt .reference{font-size:.78rem;letter-spacing:.05em;color:rgba(255,255,255,.7);margin-bottom:.25rem;text-transform:uppercase}
.lt .text{font-size:1.55rem;font-weight:500;line-height:1.4}
.lt .title{font-size:1.7rem;font-weight:700;line-height:1.25}
.lt .subtitle{font-size:.95rem;opacity:.8;margin-top:.2rem}
.lt .stack > div + div{margin-top:.25rem}

.fade{transition:opacity .35s ease}
.hidden{opacity:0}

#status{position:fixed;top:.6rem;right:.75rem;font-size:.65rem;color:rgba(255,255,255,.55);background:rgba(0,0,0,.4);padding:.2rem .5rem;border-radius:.25rem;opacity:0;transition:opacity .3s}
#status.visible{opacity:1}
</style>
</head>
<body>
<div id="status">connecting…</div>
<div id="stage" class="fade"></div>
<script>
const CFG = ${cfg};
const stage = document.getElementById('stage');
const statusEl = document.getElementById('status');
let es=null,reconnects=0,hideT=null;

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function renderFull(slide, st){
  const ref = (st.showReferenceOnOutput!==false && slide.title)
    ? '<div class="reference">'+esc(slide.title)+(slide.subtitle?' &mdash; '+esc(slide.subtitle):'')+'</div>'
    : '';
  let body='';
  if(slide.type==='title'){
    body = '<div class="title">'+esc(slide.title||'')+'</div>'
      + (slide.subtitle?'<div class="subtitle">'+esc(slide.subtitle)+'</div>':'');
  } else if (Array.isArray(slide.content) && slide.content.length){
    body = slide.content.map(function(l){return '<div class="text">'+esc(l)+'</div>'}).join('');
  } else {
    body = '<div class="text" style="opacity:.4">'+esc(slide.title||'Blank')+'</div>';
  }
  return '<div class="full"><div class="content">'+ref+body+'</div></div>';
}

function renderLowerThird(slide){
  const branding = CFG.branding ? '<div class="branding">'+esc(CFG.branding)+'</div>' : '';
  const ref = slide.title ? '<div class="reference">'+esc(slide.title)+(slide.subtitle?' &mdash; '+esc(slide.subtitle):'')+'</div>' : '';
  let body='';
  if(slide.type==='title'){
    body = '<div class="title">'+esc(slide.title||'')+'</div>';
  } else if (Array.isArray(slide.content) && slide.content.length){
    const lines = slide.content.slice(0,3);
    body = '<div class="stack">'+lines.map(function(l){return '<div class="text">'+esc(l)+'</div>'}).join('')+'</div>';
  } else {
    body = '<div class="text" style="opacity:.6">'+esc(slide.title||'')+'</div>';
  }
  return '<div class="lt '+CFG.position+'">'
    + '<div style="width:100%;max-width:60rem">'
    + branding
    + '<div class="bar" style="--accent:'+CFG.accent+'">'+ref+body+'</div>'
    + '</div></div>';
}

function render(s){
  if(!s||!s.isLive||!s.slide){ stage.classList.add('hidden'); stage.innerHTML=''; return }
  const slide = s.slide;
  const settings = s.settings || {};
  const dm = s.displayMode || 'full';
  const forceLT = !!CFG.lowerThird;
  const isLT = forceLT || (typeof dm==='string' && dm.indexOf('lower-third')===0);

  stage.innerHTML = isLT ? renderLowerThird(slide) : renderFull(slide, settings);
  stage.classList.remove('hidden');
}

function showStatus(msg){
  statusEl.textContent = msg;
  statusEl.classList.add('visible');
  if(hideT) clearTimeout(hideT);
  hideT = setTimeout(function(){ statusEl.classList.remove('visible') }, 2500);
}

function connect(){
  es = new EventSource('/api/output');
  es.onopen = function(){ reconnects=0; showStatus('on air') };
  es.onmessage = function(e){
    try{ const d=JSON.parse(e.data); if(d.type==='state') render(d) }catch(_){}
  };
  es.onerror = function(){
    try{ es.close() }catch(_){}
    showStatus('reconnecting…');
    reconnects++;
    setTimeout(connect, Math.min(800*Math.pow(1.3,reconnects), 5000));
  };
}
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
