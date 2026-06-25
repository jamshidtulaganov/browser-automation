'use strict';

// Monitoring: JSON metrics (api-key guarded) + a self-contained HTML dashboard.
// The page holds no secrets — it asks for the API key once (localStorage) and
// polls /metrics.

const { Router } = require('express');
const { verifyApiKey } = require('../middleware/auth');
const metrics = require('../core/metrics');

const router = Router();

router.get('/metrics', verifyApiKey, async (req, res, next) => {
    try {
        res.json({ success: true, ...(await metrics.snapshot()) });
    } catch (e) { next(e); }
});

router.get('/monitor', (req, res) => {
    res.type('html').send(PAGE);
});

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>browser-automation · monitor</title>
<style>
  :root{--bg:#0b0e14;--panel:#121722;--line:#1f2733;--ink:#e6edf3;--sub:#8b97a7;--ok:#34d399;--bad:#f87171;--accent:#7c9cff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg)}
  header h1{font-size:14px;margin:0;font-weight:700;letter-spacing:.02em}
  header .dot{width:8px;height:8px;border-radius:50%;background:var(--ok)}
  header .grow{flex:1}
  header .meta{color:var(--sub);font-size:12px}
  main{padding:20px;max-width:1100px;margin:0 auto}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}
  .card .k{color:var(--sub);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .card .v{font-size:24px;font-weight:700;margin-top:6px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--sub);margin:22px 0 8px}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
  th{color:var(--sub);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  tr:last-child td{border-bottom:none}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:700}
  .pill.ok{background:rgba(52,211,153,.15);color:var(--ok)}
  .pill.bad{background:rgba(248,113,113,.15);color:var(--bad)}
  .err{color:var(--bad);white-space:normal;max-width:380px}
  .sub{color:var(--sub)}
  input,button{font:inherit;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px 10px}
  button{cursor:pointer}
  .setup{max-width:420px;margin:80px auto;text-align:center}
  .setup input{width:100%;margin:12px 0}
</style></head>
<body>
<header>
  <span class="dot" id="dot"></span>
  <h1>browser-automation · monitor</h1>
  <span class="grow"></span>
  <span class="meta" id="meta"></span>
  <button id="refresh" title="refresh now">↻</button>
  <button id="reset" title="change API key">key</button>
</header>
<main id="app"></main>
<script>
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let KEY=localStorage.getItem('ba_key')||'';
function setup(msg){
  $('#app').innerHTML='<div class="setup"><h2>Enter API key</h2>'+(msg?'<p class="err">'+msg+'</p>':'')+
    '<input id="k" type="password" placeholder="x-api-key"/><button id="go">Connect</button></div>';
  $('#go').onclick=()=>{KEY=$('#k').value.trim();localStorage.setItem('ba_key',KEY);load();};
  $('#k').addEventListener('keydown',e=>{if(e.key==='Enter')$('#go').click();});
}
function fmtMs(ms){return ms>=1000?(ms/1000).toFixed(1)+'s':ms+'ms';}
function ago(iso){if(!iso)return '—';const s=Math.round((Date.now()-new Date(iso))/1000);
  if(s<60)return s+'s ago';if(s<3600)return Math.round(s/60)+'m ago';return Math.round(s/3600)+'h ago';}
function render(d){
  const t=d.totals;
  const cards=[['total runs',t.runs],['success',t.success],['failure',t.failure],
    ['uptime',d.uptimeSec>=3600?Math.round(d.uptimeSec/3600)+'h':Math.round(d.uptimeSec/60)+'m']];
  let html='<div class="cards">'+cards.map(c=>'<div class="card"><div class="k">'+c[0]+'</div><div class="v">'+c[1]+'</div></div>').join('')+'</div>';
  html+='<h2>Automations</h2><table><tr><th>name</th><th class="num">runs</th><th class="num">ok</th><th class="num">fail</th><th class="num">avg</th><th class="num">last</th><th>when</th><th>status</th></tr>';
  if(!d.automations.length)html+='<tr><td colspan="8" class="sub">no runs yet</td></tr>';
  d.automations.forEach(a=>{html+='<tr><td>'+esc(a.name)+'</td><td class="num">'+a.runs+'</td><td class="num">'+a.success+'</td><td class="num">'+a.failure+'</td><td class="num">'+fmtMs(a.avgMs)+'</td><td class="num">'+fmtMs(a.lastMs)+'</td><td class="sub">'+ago(a.lastAt)+'</td><td><span class="pill '+(a.lastStatus==='ok'?'ok':'bad')+'">'+esc(a.lastStatus||'—')+'</span></td></tr>';});
  html+='</table>';
  html+='<h2>Recent runs ('+d.recent.length+')</h2><table><tr><th>time</th><th>automation</th><th>status</th><th class="num">dur</th><th>error</th></tr>';
  if(!d.recent.length)html+='<tr><td colspan="5" class="sub">—</td></tr>';
  d.recent.forEach(r=>{html+='<tr><td class="sub">'+esc(new Date(r.ts).toLocaleTimeString())+'</td><td>'+esc(r.name)+'</td><td><span class="pill '+(r.ok?'ok':'bad')+'">'+(r.ok?'ok':'error')+'</span></td><td class="num">'+fmtMs(r.ms)+'</td><td class="err">'+esc(r.error||'')+'</td></tr>';});
  html+='</table>';
  $('#app').innerHTML=html;
  $('#meta').textContent='updated '+new Date(d.now).toLocaleTimeString();
}
async function load(){
  if(!KEY)return setup();
  try{
    const r=await fetch('/metrics',{headers:{'x-api-key':KEY}});
    if(r.status===401){localStorage.removeItem('ba_key');KEY='';return setup('invalid key');}
    if(!r.ok)throw new Error('http '+r.status);
    render(await r.json());$('#dot').style.background='var(--ok)';
  }catch(e){$('#dot').style.background='var(--bad)';$('#meta').textContent='error: '+e.message;}
}
$('#refresh').onclick=load;
$('#reset').onclick=()=>{localStorage.removeItem('ba_key');KEY='';setup();};
load();setInterval(()=>{if(KEY)load();},5000);
</script>
</body></html>`;

module.exports = router;
