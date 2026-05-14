import { NextResponse } from 'next/server'

/**
 * GET /api/output/stage
 *
 * Stage-display window for the speaker: shows the current slide, the
 * next slide, a wall clock and an optional countdown
 * timer. Subscribes to /api/output (SSE) so it updates live with the
 * congregation feed but renders a different layout that's optimized
 * for the speaker's awareness, not the audience's.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ScriptureLive — Stage Display</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100vw;height:100vh;overflow:hidden;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto 1fr 1fr auto;gap:14px;padding:18px;height:100vh}
.bar{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #2a2a2a}
.brand{font-weight:700;font-size:14px;letter-spacing:.08em;color:#fbbf24;text-transform:uppercase}
.clock{font-variant-numeric:tabular-nums;font-size:38px;font-weight:600;letter-spacing:.02em}
.timer{display:flex;align-items:center;gap:14px;font-variant-numeric:tabular-nums}
.timer .v{font-size:32px;font-weight:600}
.timer.warn .v{color:#fbbf24}
.timer.crit .v{color:#ef4444;animation:blink 1s infinite}
@keyframes blink{50%{opacity:.4}}
.panel{background:#141414;border:1px solid #232323;border-radius:14px;padding:18px;overflow:hidden;display:flex;flex-direction:column}
.panel h2{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#8b8b8b;margin-bottom:10px;flex:0 0 auto}
.now{grid-column:1/-1}
.panel.now{padding:24px}
.now .ref{font-size:14px;color:#fbbf24;margin-bottom:10px;letter-spacing:.06em}
.now .text{font-size:38px;line-height:1.3;font-weight:500;overflow:auto}
.next .ref{font-size:12px;color:#8b8b8b;margin-bottom:6px}
.next .text{font-size:18px;line-height:1.4;color:#cfcfcf;overflow:auto}
.foot{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#666}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px;animation:pulse 1.5s infinite}
.dot.live{background:#22c55e;animation:none}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
</style>
</head>
<body>
<div class="grid">
  <div class="bar">
    <div class="brand">ScriptureLive · Stage Display</div>
    <div class="timer" id="timer-wrap" style="display:none">
      <span style="font-size:11px;color:#8b8b8b;letter-spacing:.12em;text-transform:uppercase">Countdown</span>
      <span class="v" id="timer">00:00</span>
    </div>
    <div class="clock" id="clock">--:--</div>
  </div>

  <div class="panel now">
    <h2>Now Showing</h2>
    <div class="ref" id="now-ref">—</div>
    <div class="text" id="now-text">Waiting for content…</div>
  </div>

  <div class="panel next">
    <h2>Up Next</h2>
    <div class="ref" id="next-ref">—</div>
    <div class="text" id="next-text">No upcoming slide</div>
  </div>

  <div class="foot">
    <div><span class="dot" id="conn-dot"></span><span id="conn-label">Connecting…</span></div>
    <div id="meta">—</div>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);

function fmtClock() {
  const d = new Date();
  $('clock').textContent =
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}
setInterval(fmtClock, 500); fmtClock();

let timerEnd = 0;
function tickTimer() {
  const wrap = $('timer-wrap');
  if (!timerEnd) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const ms = Math.max(0, timerEnd - Date.now());
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  $('timer').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  wrap.classList.toggle('warn', total <= 60 && total > 10);
  wrap.classList.toggle('crit', total <= 10);
  if (total === 0) timerEnd = 0;
}
setInterval(tickTimer, 250);

function render(state) {
  if (!state) return;
  const slide = state.slide || {};
  const next = state.nextSlide || {};
  $('now-ref').textContent = slide.title || '';
  $('now-text').textContent = Array.isArray(slide.content) ? slide.content.join(' ') : (slide.content || '');
  $('next-ref').textContent = next.title || '—';
  $('next-text').textContent = Array.isArray(next.content) ? next.content.join(' ') : (next.content || 'No upcoming slide');
  $('meta').textContent = (state.slideIndex != null && state.slideTotal != null)
    ? 'Slide ' + (state.slideIndex + 1) + ' / ' + state.slideTotal
    : '';
  if (state.countdownEndAt) timerEnd = +state.countdownEndAt; else timerEnd = 0;
  $('conn-dot').classList.toggle('live', !!state.isLive);
  $('conn-label').textContent = state.isLive ? 'LIVE' : 'Standby';
}

function connect() {
  const es = new EventSource('/api/output');
  es.onmessage = (e) => {
    try { render(JSON.parse(e.data)); }
    catch (err) { console.error('parse', err); }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connect, 1500);
  };
}
connect();
</script>
</body>
</html>`
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
