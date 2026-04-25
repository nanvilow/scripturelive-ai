import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage, ServerResponse } from 'http'

const PORT = 3003

interface OutputState {
  type: 'slide' | 'clear' | 'theme'
  slide?: {
    id: string
    type: string
    title: string
    subtitle: string
    content: string[]
    background: string
  } | null
  isLive?: boolean
  displayMode?: string
  settings?: {
    fontSize: string
    fontFamily: string
    textShadow: boolean
    showReferenceOnOutput: boolean
    lowerThirdHeight: string
    lowerThirdPosition: string
    customBackground: string | null
    congregationScreenTheme: string
  }
  timestamp: number
}

const clients = new Set<WebSocket>()
let currentState: OutputState = {
  type: 'clear',
  isLive: false,
  displayMode: 'full',
  settings: {
    fontSize: 'lg',
    fontFamily: 'sans',
    textShadow: true,
    showReferenceOnOutput: true,
    lowerThirdHeight: 'md',
    lowerThirdPosition: 'bottom',
    customBackground: null,
    congregationScreenTheme: 'minimal',
  },
  timestamp: Date.now(),
}

const CONGREGATION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ScriptureLive — Live Output</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
#output{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .5s ease}
#output.hidden{opacity:0}
.bg-image{position:absolute;inset:0;object-fit:cover;opacity:.4;pointer-events:none}
.bg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);pointer-events:none}
.slide-content{position:relative;z-index:1;text-align:center;max-width:75vw;padding:4rem 2rem}
.slide-reference{font-size:1rem;opacity:.5;margin-bottom:1rem;letter-spacing:.05em}
.slide-text{font-size:2.5rem;font-weight:500;line-height:1.5;text-shadow:0 2px 12px rgba(0,0,0,.3)}
.slide-title{font-size:3rem;font-weight:700;line-height:1.3;text-shadow:0 2px 12px rgba(0,0,0,.3)}
.slide-subtitle{font-size:1.2rem;opacity:.7;margin-top:1rem}
.theme-worship{background:linear-gradient(135deg,#1e0a3c,#1e1b4b)}
.theme-sermon{background:linear-gradient(135deg,#3c1a0a,#451a03)}
.theme-easter{background:linear-gradient(135deg,#0a3c2a,#042f2e)}
.theme-christmas{background:linear-gradient(135deg,#3c0a0a,#4c0519)}
.theme-praise{background:linear-gradient(135deg,#3c3a0a,#451a03)}
.theme-minimal{background:linear-gradient(135deg,#0a0a0a,#171717)}
.lower-third{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;padding:1rem 3rem}
.lower-third.bottom{bottom:0}.lower-third.top{top:0}
.lt-box{width:100%;max-width:60rem;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);border-radius:.5rem;padding:1.5rem 2.5rem;border:1px solid rgba(255,255,255,.1)}
.lower-third .slide-text{font-size:2rem;line-height:1.3}
/* Item #15 — status pill permanently hidden per operator request. */
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
<div id="reconnecting"><div class="spinner"></div><div style="color:#999;font-size:.9rem">Reconnecting...</div></div>
<div id="output"></div>
<script>
const wsUrl='ws://'+location.host+'/';
let ws=null,reconnects=0,maxRe=30;
const $=id=>document.getElementById(id);
const themes={worship:'theme-worship',sermon:'theme-sermon',easter:'theme-easter',christmas:'theme-christmas',praise:'theme-praise',minimal:'theme-minimal'};

function render(s){
  if(!s||!s.isLive||!s.slide){$('output').innerHTML='';$('output').classList.add('hidden');return}
  const{slide,dm=s.displayMode||'full',st=s.settings||{}}=s;
  const tk=slide.background||(st.congregationScreenTheme||'minimal');
  const tc=themes[tk]||'theme-minimal';
  const isLT=dm&&dm.startsWith('lower-third');
  const bg=st.customBackground?'<img class="bg-image" src="'+st.customBackground+'" alt="" crossorigin="anonymous" onerror="this.style.display=\\'none\\'"><div class="bg-overlay"></div>':'';
  // Strip Strong's <S>NNNN</S> markers and HTML-escape every user
  // string before it lands in innerHTML. Bug parity with the main
  // congregation route — Strong's adjacent to body text was making
  // letters disappear ("subjection" → "ubjection") on the legacy mini
  // service. Also flow multi-line content into one paragraph instead
  // of one div per line, matching the operator preview.
  const stripStrong=(t)=>String(t==null?'':t).replace(/<S>[^<]*<\/S>/gi,'').replace(/<[^>]+>/g,'');
  const esc=(t)=>stripStrong(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const ref=st.showReferenceOnOutput!==false&&slide.title?'<div class="slide-reference">'+esc(slide.title)+(slide.subtitle?' — '+esc(slide.subtitle):'')+'</div>':'';
  let txt='';
  if(slide.type==='title'){
    const sz={sm:'2rem',md:'2.5rem',lg:'3rem',xl:'3.5rem'}[st.fontSize]||'2.5rem';
    const sh=st.textShadow!==false?'text-shadow:0 2px 12px rgba(0,0,0,.3);':'';
    txt='<div class="slide-title" style="font-size:'+sz+';'+sh+'">'+esc(slide.title)+'</div>'+(slide.subtitle?'<div class="slide-subtitle" style="'+sh+'">'+esc(slide.subtitle)+'</div>':'');
  }else if(slide.content&&slide.content.length){
    const sz={sm:'1.5rem',md:'2rem',lg:'2.5rem',xl:'3rem'}[st.fontSize]||'2rem';
    const sh=st.textShadow!==false?'text-shadow:0 2px 12px rgba(0,0,0,.3);':'';
    const joined=(slide.content as string[]).map(esc).join(' ').replace(/\s+/g,' ').trim();
    txt='<p class="slide-paragraph" style="font-size:'+sz+';'+sh+';font-weight:500;line-height:1.4;margin:0;padding:0;word-wrap:break-word;overflow-wrap:break-word">'+joined+'</p>';
  }else{
    txt='<div class="slide-text" style="opacity:.3">'+esc(slide.title||'Blank Slide')+'</div>';
  }
  if(isLT){
    const pos=st.lowerThirdPosition==='top'?'top':'bottom';
    $('output').innerHTML='<div style="width:100%;height:100%;position:relative;">'+bg+'<div class="lower-third '+pos+'"><div class="lt-box">'+ref+txt+'</div></div></div>';
  }else{
    $('output').innerHTML='<div class="'+tc+'" style="width:100%;height:100%;position:relative;">'+bg+'<div class="slide-content">'+ref+txt+'</div></div>';
  }
  $('output').classList.remove('hidden');
}

function connect(){
  try{
    ws=new WebSocket(wsUrl);
    ws.onopen=()=>{reconnects=0;$('status').classList.add('connected','visible');$('status-text').textContent='Connected';$('reconnecting').classList.remove('active');setTimeout(()=>$('status').classList.remove('visible'),3000)};
    ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='state')render(m);if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}))}catch{}};
    ws.onclose=()=>{$('status').classList.remove('connected');$('status-text').textContent='Disconnected';$('status').classList.add('visible');reconnect()};
    ws.onerror=()=>{$('status').classList.remove('connected');$('status-text').textContent='Error';$('status').classList.add('visible')};
  }catch{reconnect()}
}
function reconnect(){
  if(reconnects>=maxRe){$('status-text').textContent='Failed';$('reconnecting').classList.remove('active');return}
  $('reconnecting').classList.add('active');
  reconnects++;
  $('status-text').textContent='Reconnecting ('+reconnects+')...';
  setTimeout(connect,Math.min(1000*Math.pow(1.3,reconnects),5000));
}
document.addEventListener('mousemove',()=>{$('status').classList.add('visible');clearTimeout(window._ht);window._ht=setTimeout(()=>$('status').classList.remove('visible'),3000)});
connect();
</script>
</body>
</html>`

// ── HTTP Server ────────────────────────────────────────────────────────
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/' || req.url === '/congregation') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(CONGREGATION_HTML)
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', clients: clients.size, timestamp: Date.now(), state: currentState.type }))
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

// ── WebSocket Server ───────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer })

function broadcast(message: object) {
  const data = JSON.stringify(message)
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

wss.on('connection', (ws, req) => {
  clients.add(ws)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
  console.log(`[Output] Client connected from ${ip}. Total: ${clients.size}`)

  ws.send(JSON.stringify({ type: 'state', ...currentState }))

  const keepalive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }))
    }
  }, 15000)

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      if (message.type === 'update') {
        currentState = { ...message, timestamp: Date.now() }
        broadcast({ type: 'state', ...currentState })
        console.log(`[Output] Updated: ${currentState.type}${currentState.slide ? ' → ' + currentState.slide.title : ''}`)
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch (e) {
      console.error('[Output] Parse error:', e)
    }
  })

  ws.on('close', () => {
    clearInterval(keepalive)
    clients.delete(ws)
    console.log(`[Output] Disconnected. Total: ${clients.size}`)
  })

  ws.on('error', (error) => {
    clearInterval(keepalive)
    clients.delete(ws)
    console.error('[Output] WS error:', error.message)
  })
})

// ── Start ──────────────────────────────────────────────────────────────
httpServer.listen(PORT, '::', () => {
  console.log(`[Output] ScriptureLive Output Service on port ${PORT} (0.0.0.0)`)
  console.log(`[Output]   http://localhost:${PORT}/congregation`)
  console.log(`[Output]   ws://localhost:${PORT}/`)
})
