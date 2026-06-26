'use strict';

// Monitoring: JSON metrics (api-key guarded) + a self-contained HTML dashboard
// with Chart.js charts. The page holds no secrets — it asks for the API key once
// (localStorage) and polls /metrics.

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
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js" integrity="sha384-Sse/HDqcypGpyTDpvZOJNnG0TT3feGQUkF9H+mnRvic+LjR+K1NhTt8f51KIQ3v3" crossorigin="anonymous"></script>
<style>
  :root{--bg:#0b0e14;--panel:#121722;--line:#1f2733;--ink:#e6edf3;--sub:#8b97a7;--ok:#34d399;--bad:#f87171;--accent:#7c9cff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5}
  header h1{font-size:14px;margin:0;font-weight:700;letter-spacing:.02em}
  header .dot{width:8px;height:8px;border-radius:50%;background:var(--ok)}
  header .grow{flex:1}
  header .meta{color:var(--sub);font-size:12px}
  main{padding:20px;max-width:1180px;margin:0 auto}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}
  .card .k{color:var(--sub);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .card .v{font-size:24px;font-weight:700;margin-top:6px}
  .charts{display:grid;grid-template-columns:2fr 2fr 1fr;gap:12px;margin-bottom:18px}
  .chartbox{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;min-height:230px}
  .chartbox h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--sub);font-weight:600}
  @media(max-width:880px){.charts{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,1fr)}}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--sub);margin:22px 0 8px}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
  th{color:var(--sub);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  tr:last-child td{border-bottom:none}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:700}
  .pill.ok{background:rgba(52,211,153,.15);color:var(--ok)}
  .pill.bad{background:rgba(248,113,113,.15);color:var(--bad)}
  .err{color:var(--bad);white-space:normal;max-width:360px}
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
let charts={};
function setup(msg){
  charts={};
  $('#app').innerHTML='<div class="setup"><h2>Enter API key</h2>'+(msg?'<p class="err">'+esc(msg)+'</p>':'')+
    '<input id="k" type="password" placeholder="x-api-key"/><button id="go">Connect</button></div>';
  $('#go').onclick=()=>{KEY=$('#k').value.trim();localStorage.setItem('ba_key',KEY);load();};
  $('#k').addEventListener('keydown',e=>{if(e.key==='Enter')$('#go').click();});
}
function fmtMs(ms){return ms>=1000?(ms/1000).toFixed(1)+'s':ms+'ms';}
function fmtDur(ms){if(ms<1000)return ms+'ms';const s=ms/1000;if(s<60)return s.toFixed(1)+'s';const m=Math.floor(s/60);return m+'m '+Math.round(s%60)+'s';}
function ago(iso){if(!iso)return '—';const s=Math.round((Date.now()-new Date(iso))/1000);
  if(s<60)return s+'s ago';if(s<3600)return Math.round(s/60)+'m ago';return Math.round(s/3600)+'h ago';}
const SHELL='<div class="cards" id="cards"></div>'+
  '<div class="charts">'+
    '<div class="chartbox"><h3>Calls per automation</h3><canvas id="cRuns" height="190"></canvas></div>'+
    '<div class="chartbox"><h3>Total time per automation</h3><canvas id="cTime" height="190"></canvas></div>'+
    '<div class="chartbox"><h3>Success / failure</h3><canvas id="cStatus" height="190"></canvas></div>'+
  '</div>'+
  '<h2>Automations</h2><div id="tblA"></div>'+
  '<h2 id="recH">Recent runs</h2><div id="tblR"></div>'+
  '<h2>Endpoints</h2><div id="endpoints"></div>';
function ensureShell(){ if(!$('#cards')) $('#app').innerHTML=SHELL; }
const GRID='rgba(255,255,255,.06)', TICK='#8b97a7';
function upsertBar(id,key,labels,data,color,fmt){
  const ctx=$('#'+id);
  if(!charts[key]){
    charts[key]=new Chart(ctx,{type:'bar',data:{labels,datasets:[{data,backgroundColor:color,borderRadius:4,maxBarThickness:46}]},
      options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt?fmt(c.raw):c.raw}}},
        scales:{x:{grid:{display:false},ticks:{color:TICK}},y:{beginAtZero:true,grid:{color:GRID},ticks:{color:TICK}}}}});
  }else{charts[key].data.labels=labels;charts[key].data.datasets[0].data=data;charts[key].update();}
}
function upsertDoughnut(id,key,data){
  const ctx=$('#'+id);
  if(!charts[key]){
    charts[key]=new Chart(ctx,{type:'doughnut',data:{labels:['success','failure'],datasets:[{data,backgroundColor:['#34d399','#f87171'],borderWidth:0}]},
      options:{cutout:'62%',plugins:{legend:{position:'bottom',labels:{color:TICK,boxWidth:10}}}}});
  }else{charts[key].data.datasets[0].data=data;charts[key].update();}
}
function render(d){
  ensureShell();
  const t=d.totals;
  const cards=[['total calls',t.runs],['success',t.success],['failure',t.failure],
    [(d.durable?'durable':'in-memory'),d.uptimeSec>=3600?Math.round(d.uptimeSec/3600)+'h up':Math.round(d.uptimeSec/60)+'m up']];
  $('#cards').innerHTML=cards.map(c=>'<div class="card"><div class="k">'+esc(c[0])+'</div><div class="v">'+esc(c[1])+'</div></div>').join('');
  const names=d.automations.map(a=>a.name);
  upsertBar('cRuns','runs',names,d.automations.map(a=>a.runs),'#7c9cff');
  upsertBar('cTime','time',names,d.automations.map(a=>+( (a.totalMs||0)/1000).toFixed(1)),'#34d399',v=>v+'s');
  upsertDoughnut('cStatus','status',[t.success,t.failure]);
  let a='<table><tr><th>name</th><th class="num">calls</th><th class="num">ok</th><th class="num">fail</th><th class="num">avg</th><th class="num">total time</th><th>last</th><th>status</th></tr>';
  if(!d.automations.length)a+='<tr><td colspan="8" class="sub">no runs yet</td></tr>';
  d.automations.forEach(x=>{a+='<tr><td>'+esc(x.name)+'</td><td class="num">'+x.runs+'</td><td class="num">'+x.success+'</td><td class="num">'+x.failure+'</td><td class="num">'+fmtMs(x.avgMs)+'</td><td class="num">'+fmtDur(x.totalMs||0)+'</td><td class="sub">'+esc(ago(x.lastAt))+'</td><td><span class="pill '+(x.lastStatus==='ok'?'ok':'bad')+'">'+esc(x.lastStatus||'—')+'</span></td></tr>';});
  a+='</table>';$('#tblA').innerHTML=a;
  $('#recH').textContent='Recent runs ('+d.recent.length+')';
  let r='<table><tr><th>time</th><th>automation</th><th>status</th><th class="num">dur</th><th>error</th></tr>';
  if(!d.recent.length)r+='<tr><td colspan="5" class="sub">—</td></tr>';
  d.recent.forEach(x=>{r+='<tr><td class="sub">'+esc(new Date(x.ts).toLocaleTimeString())+'</td><td>'+esc(x.name)+'</td><td><span class="pill '+(x.ok?'ok':'bad')+'">'+(x.ok?'ok':'error')+'</span></td><td class="num">'+fmtMs(x.ms)+'</td><td class="err">'+esc(x.error||'')+'</td></tr>';});
  r+='</table>';$('#tblR').innerHTML=r;
  let e='<table><tr><th>Method</th><th>Path</th><th>Purpose</th></tr>';
  e+='<tr><td>POST</td><td>/wex/boca</td><td>Create BOCA task on WEX application</td></tr>';
  e+='<tr><td>POST</td><td>/wex/report</td><td>Scrape WEX "App Created — Today" report</td></tr>';
  e+='<tr><td>POST</td><td>/wex/apps</td><td>Search WEX app by Company Name/App ID and submit close task</td></tr>';
  e+='<tr><td>POST</td><td>/run/:name</td><td>Run any automation by name</td></tr>';
  e+='</table>';$('#endpoints').innerHTML=e;
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
