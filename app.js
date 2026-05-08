import { makePhraseVariants, textMatchesAny } from "./scripts/normalize.mjs";
const HELENA_GAWIN_PHRASES=["Helena Gawin","Helena Gawin-Dereń","Helena Dereń-Gawin","Helena Gawin Dereń","Helena Dereń Gawin","Helena Dereń","Gawin Helena","Śp. Helena Gawin"];
const el=(id)=>document.getElementById(id);
const log=(...a)=>{const n=el('log'); if(n) n.textContent+=`[${new Date().toISOString()}] ${a.join(' ')}\n`;};
async function loadJson(path,fallback){try{const r=await fetch(`${path}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return fallback;return await r.json();}catch{return fallback;}}
function pickRows(s,p,f){return s?.[p]||s?.[f]||s?.payload?.[p]||s?.payload?.[f]||s?.data?.[p]||s?.data?.[f]||[]}
function esc(s){return String(s??'').replace(/[&<>"']/g,(m)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function renderList(id,rows,type){const c=el(id);c.innerHTML='';if(!rows.length){c.innerHTML='<div class="small">Brak wpisów w oknie czasowym.</div>';return;}for(const r of rows){const name=r.name||r.full_name||'(brak nazwiska)';const date=type==='death'?(r.date_death||r.date||'Brak daty'):(r.date_funeral||r.date||'Brak daty');c.innerHTML+=`<div class="item"><div class="top"><div class="name">${esc(name)}</div></div><div class="small">${esc(date)}</div></div>`;}}
function renderSources(sources){const c=el('sources');c.innerHTML='';for(const s of sources||[]){c.innerHTML+=`<div class="source"><div class="sname">${esc(s.name||s.id)}</div><div class="smeta">${esc(s.url||'')}</div></div>`;}}
function formatTs(v){return v||'—'}
async function loadAll(){el('log').textContent='';const [snap,job,cfg,errors]=await Promise.all([loadJson('data/latest.json',{}),loadJson('data/job.json',{}),loadJson('config/sources.json',{sources:[]}),loadJson('data/errors.json',{errors:[]})]);
const deaths=pickRows(snap,'recent_deaths','deaths'); const funerals=pickRows(snap,'upcoming_funerals','funerals');
renderList('deaths',deaths,'death'); renderList('funerals',funerals,'funeral');
const phrases=makePhraseVariants(HELENA_GAWIN_PHRASES); const hits=[...deaths,...funerals].filter(r=>textMatchesAny([r.name,r.note,r.place].join(' '),phrases));
el('helenaStatus').innerHTML=hits.length?`<strong>Helena Gawin</strong>: znaleziono ${hits.length} pasujących wpisów.`:'<strong>Helena Gawin - brak informacji</strong>';
const src=snap?.sources||snap?.payload?.sources||snap?.data?.sources||cfg?.sources||[]; renderSources(src);
el('snapshotTime').textContent=formatTs(snap.generated_at||snap.updated_at); el('jobStatus').textContent=job.status||'—'; el('jobTime').textContent=formatTs(job.updated_at||job.finished_at);
log(`latest.json: ${Object.keys(snap).length?'OK':'BRAK'}`);log(`job.json: ${Object.keys(job).length?'OK':'BRAK'}`);log(`sources.json: ${(cfg.sources||[]).length}`);log(`errors.json: ${(errors.errors||[]).length}`);
}
loadAll();
