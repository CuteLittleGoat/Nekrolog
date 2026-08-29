import * as cheerio from "cheerio";
import { fetchText } from "./fetch.mjs";
import { textMatchesAny } from "./normalize.mjs";
import HELENA_GAWIN_PHRASES_JSON from "../Frazy.json" with { type: "json" };

const HELENA_GAWIN_PHRASES = Array.isArray(HELENA_GAWIN_PHRASES_JSON)
  ? HELENA_GAWIN_PHRASES_JSON
  : [];
const DEFAULT_FLAGS = { requires_detail_fetch: false, requires_ocr: false, requires_pdf: false };
const REQUIRED_SOURCES = [
  { id:"zck_funerals", name:"ZCK Kraków – Porządek pogrzebów", type:"zck_funerals", url:"https://www.zck-krakow.pl/funerals", enabled:true, distance_km:0, list_url:"https://www.zck-krakow.pl/funerals", ...DEFAULT_FLAGS },
  { id:"puk_pozegnalismy", name:"PUK Kraków – Pożegnaliśmy", type:"puk_pozegnalismy", url:"https://www.puk.krakow.pl/pozegnalismy/", enabled:true, distance_km:4.5, list_url:"https://www.puk.krakow.pl/pozegnalismy/", requires_detail_fetch:true, requires_ocr:false, requires_pdf:false },
  { id:"gabriel_nekrologi", name:"Gabriel24 – Nekrologi", type:"gabriel24_nekrologi", url:"https://www.gabriel24.pl/nekrologi/", enabled:true, distance_km:6.5, list_url:"https://www.gabriel24.pl/nekrologi/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  { id:"karawan_nekrologi", name:"Karawan – Nekrologi", type:"karawan_nekrologi", url:"https://karawan.pl/nekrologi/", enabled:true, distance_km:7.5, list_url:"https://karawan.pl/nekrologi/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  // Serwis Salwatora jest wyszukiwarką grobów — strona "Nekrologi" nie zawiera wpisów.
  // known_empty wycisza wykrywanie cichych awarii, żeby nie raportować stałego stanu jako regresji.
  // Strona "Nekrologi" Salwatora jest pusta, ale wyszukiwarka grobów zwraca miejsce
  // pochówku szukanej osoby — i po to źródło zostaje. search_terms to nazwiska
  // odpytywane w bazie; przy zmianie monitorowanej osoby aktualizuj je razem z Frazy.json.
  { id:"salwator_grobonet", name:"Kraków Salwator – Groby (Grobonet)", type:"grobonet_groby", url:"https://krakowsalwator.grobonet.com/grobonet/start.php", enabled:true, distance_km:5.5, list_url:"https://krakowsalwator.grobonet.com/grobonet/start.php", base_url:"https://krakowsalwator.grobonet.com/grobonet/", search_terms:["Gawin","Dereń"], max_detail_pages:50, ...DEFAULT_FLAGS },
  // Wyłączone: w całej zapisanej historii przebiegów źródło nie zwróciło ani jednego
  // rekordu (last_nonempty_run: null), także wtedy, gdy odpowiadało kodem 200 —
  // parser znajduje linki, ale żaden nie przechodzi walidacji. Zakres tematyczny
  // (ogłoszenia parafii Dębniki) pokrywa debniki_intencje. Nie usuwamy definicji,
  // żeby zachować historię i umożliwić powrót po przebudowie parafialnej strony.
  { id:"debniki_sdb", name:"Parafia św. Stanisława Kostki (Dębniki)", type:"debniki_sdb_pogrzeby", url:"https://debniki.sdb.org.pl/", enabled:false, distance_km:2.5, list_url:"https://debniki.sdb.org.pl/", requires_detail_fetch:true, max_detail_pages:30, known_empty:true, requires_ocr:false, requires_pdf:false },
  // Wyłączone decyzją operacyjną. Host stoi za Cloudflare Managed Challenge, który
  // odrzuca ruch z zakresów centrów danych — w tym z runnerów GitHub Actions —
  // a odzyskanie dostępu nie jest realizowane (zabezpieczeń nie obchodzimy).
  // Konsekwencja: kategoria `intention` nie ma dostawcy i sekcja "potrzeby" jest pusta.
  // Definicja i flaga tolerancji zostają, żeby ponowne włączenie było zmianą jednego pola.
  { id:"debniki_intencje", name:"Parafia Dębniki – Intencje mszalne", type:"debniki_intencje", url:"https://debniki.sdb.org.pl/intencje", enabled:false, distance_km:2.5, list_url:"https://debniki.sdb.org.pl/intencje", external_block_tolerated:true, ...DEFAULT_FLAGS },
  { id:"podwawelskie_nekrologi", name:"Podwawelskie – Nekrologi", type:"podwawelskie_nekrologi", url:"https://www.podwawelskie.pl/aktualnosci/nekrologi.html", enabled:true, distance_km:2.5, list_url:"https://www.podwawelskie.pl/aktualnosci/nekrologi.html", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  { id:"sw_jadwiga_pogrzebowe", name:"Parafia św. Jadwigi – Msze święte pogrzebowe", type:"sw_jadwiga_pogrzebowe", url:"https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe", enabled:true, distance_km:6.5, list_url:"https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe", ...DEFAULT_FLAGS },
  { id:"facebook_parafia_debniki", name:"Facebook – Parafia Dębniki", type:"generic_html", url:"https://www.facebook.com/parafiadebniki/?locale=pl_PL", enabled:false, distance_km:2.5 }
];

// TECH_NOISE = ślady kodu i znaczników, które nigdy nie należą do treści nekrologu.
// Trafienie dyskwalifikuje cały rekord.
const TECH_NOISE = /(googletagmanager|gtm-|clickcease|iframe|display\s*:\s*none|visibility\s*:\s*hidden|document\.|window\.|function\s*\(|href=|src=|<[a-z]+[\s>])/i;
// BOILERPLATE_LINE = stopki, bannery i przyciski udostępniania. Usuwamy wyłącznie
// pojedyncze linie — dawniej wspólny filtr NOISE kasował cały nekrolog przez samo
// słowo "Facebook" w widżecie "Udostępnij".
const BOILERPLATE_LINE = /(\bcookies?\b|ciasteczk|facebook|instagram|twitter|udostępnij|skopiuj url|polityka prywatności|newsletter|napędzane przez technologię|pobierz powiadomienie sms)/i;
const BAD_NAME_WORDS = /(główna|nekrologi|firma|w służbie|kontakt|oferta|usługi|menu|strona główna|polityka prywatności|pogrzeby |zasiłek|transmisje|kwiaty|akcesoria|przewozy|ekshumacja|kremacj|poradnik|cennik|regulamin|opinie)/i;
const UNSAFE_URL_SCHEME = /^(javascript|data|vbscript|file):/i;
const BLOCK_TAGS = 'p,div,li,td,tr,h1,h2,h3,h4,h5,h6,section,article,blockquote,dt,dd,pre';

const clean = (s)=>String(s??"").replace(/\s+/g," ").trim();
const isSafeUrl=(u)=>!!u&&!UNSAFE_URL_SCHEME.test(String(u).trim());
const absoluteUrl=(href,base)=>{try{const u=new URL(href,base).toString(); return isSafeUrl(u)?u:null;}catch{return isSafeUrl(href)?(href||base):null;}};
const nowISO=()=>new Date().toISOString();
const todayIso=()=>new Date().toISOString().slice(0,10);
const uniq=(rows,k)=>[...new Map(rows.map(r=>[k(r),r])).values()];
const parseTime=(t)=>{const text=clean(t); const re=/(?:godz\.?\s*|\bo\s*)?([01]?\d|2[0-3])[.:]([0-5]\d)/gi; let m; while((m=re.exec(text))){ const idx=m.index; const full=m[0]; const hour=m[1].padStart(2,'0'); const min=m[2]; const before=text.slice(Math.max(0,idx-6),idx); const after=text.slice(idx+full.length,idx+full.length+6); if(/[.]|[-]|\//.test(full) && /^[./-]\d{2,4}\b/.test(after)) continue; if(/\d{1,2}[./-]$/.test(before) && /^\d{1,2}([./-]\d{2,4})?\b/.test(after)) continue; if(/\d$/.test(before) && /^\d$/.test(after)) continue; return `${hour}:${min}`; } return null;};
const monthMap={stycznia:1,styczeń:1,styczen:1,lutego:2,luty:2,marca:3,marzec:3,kwietnia:4,kwiecień:4,kwiecien:4,maja:5,maj:5,czerwca:6,czerwiec:6,lipca:7,lipiec:7,sierpnia:8,sierpień:8,sierpien:8,września:9,wrzesień:9,wrzesnia:9,wrzesien:9,października:10,październik:10,pazdziernika:10,pazdziernik:10,listopada:11,listopad:11,grudnia:12,grudzień:12,grudzien:12,v:5};

// Odrzuca daty spoza kalendarza zamiast pozwalać, by Date.UTC po cichu przewinęło
// je na inny dzień (np. 31.02 -> 3 marca).
function isoFromParts(year,month,day){
  const y=Number(year), m=Number(month), d=Number(day);
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)) return null;
  if(y<1900||y>2200||m<1||m>12||d<1||d>31) return null;
  const probe=new Date(Date.UTC(y,m-1,d));
  if(probe.getUTCFullYear()!==y||probe.getUTCMonth()!==m-1||probe.getUTCDate()!==d) return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
const parsePolishDateToIso=(raw)=>{
  const t=clean(raw).toLowerCase();
  let m=t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/); if(m) return isoFromParts(m[1],m[2],m[3]);
  m=t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/); if(m){let y=+m[3]; if(y<100) y+=2000; return isoFromParts(y,m[2],m[1]);}
  m=t.match(/\b(\d{1,2})\s+([a-ząćęłńóśźż]+|[ivx]+)\s+(\d{4})\b/u); if(m){const mm=monthMap[m[2]]; if(mm) return isoFromParts(m[3],mm,m[1]);}
  return null;
};
const firstIsoDate=(raw)=>{const m=String(raw??'').match(/\b\d{4}-\d{1,2}-\d{1,2}\b/); return m?parsePolishDateToIso(m[0]):null;};

function prepareReadableDocument($){$('script,style,iframe,noscript,svg,canvas,form,nav,header,footer,aside,.cookie,.cookies,.cookiebar,.gdpr,.menu,.nav,.navbar,.breadcrumb,.breadcrumbs,.social,.share,.ad,.ads,.banner,.popup,.modal').remove(); return $;}

// Cheerio skleja tekst sąsiadujących elementów bez separatora ("2026-08-18Cmentarz"),
// przez co blok treści staje się jedną linią. Wstawiamy granice bloków, żeby
// filtrowanie stopek działało na linijkach, a nie na całym nekrologu naraz.
function extractBlockText($, root){
  const scope = root && root.length ? root : $('body');
  scope.find('br').replaceWith('\n');
  scope.find(BLOCK_TAGS).each((_, el)=>{ $(el).after('\n'); });
  return String(scope.text() ?? '')
    .replace(/\r/g,'')
    .replace(/ /g,' ')
    .replace(/[^\S\n]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/\n{2,}/g,'\n')
    .trim();
}

function extractMainText($, selectors=[]){for(const s of selectors){const node=$(s).first(); if(!node.length) continue; const tx=extractBlockText($,node); if(tx) return tx;} return extractBlockText($,$('body'));}

function cleanTechnicalNoise(text, { keepLines = false } = {}){
  const lines = String(text||'').split(/\n+/).map((l)=>l.trim()).filter(Boolean);
  const kept = lines.filter((l)=>!TECH_NOISE.test(l) && !BOILERPLATE_LINE.test(l));
  const joined = keepLines ? kept.join('\n') : clean(kept.join(' '));
  if (joined) return joined;
  // Tekst bez granic bloków (jedna długa linia) — zostawiamy go, jeśli nie zawiera
  // śladów kodu; inaczej stracilibyśmy całą treść przez jedno słowo ze stopki.
  const technicalOnly = lines.filter((l)=>!TECH_NOISE.test(l));
  return keepLines ? technicalOnly.join('\n') : clean(technicalOnly.join(' '));
}

function nameFromSlug(url){try{let seg=new URL(url).pathname.replace(/\/$/,'').split('/').pop()||''; if(/^(nekrolog|pogrzeb|aktualnosci|category|page|kontakt)$/i.test(seg)) return null; seg=seg.replace(/\(\d+\)/g,'').replace(/\d+/g,'').replace(/-/g,' '); return clean(seg).split(' ').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');}catch{return null;}}

// Wspólna postać nazwiska: bez "Śp.", bez sufiksu "(lat 82)", WERSALIKI sprowadzone
// do formy tytułowej. Bez tego ten sam człowiek z ZCK, PUK i Karawana to trzy rekordy.
function normalizePersonName(raw){
  let n = clean(raw)
    .replace(/^\+{1,2}\s*/,'')
    .replace(/^(?:ś\.?\s*p\.?|śp\.?|s\.?\s*p\.?)\s*/iu,'')
    .replace(/\((?:lat|wiek|ur\.?|zm\.?)[^)]*\)\s*$/iu,'')
    .replace(/\s*[-–]\s*$/,'')
    .trim();
  if(n && n === n.toLocaleUpperCase('pl-PL')){
    n = n.toLocaleLowerCase('pl-PL').replace(/(^|[\s\-'])(\p{L})/gu,(_,sep,ch)=>sep+ch.toLocaleUpperCase('pl-PL'));
  }
  return clean(n);
}

function isBadNameCandidate(name){const n=clean(name); return !n || n.split(' ').length<2 || n.length>80 || BAD_NAME_WORDS.test(n) || TECH_NOISE.test(n) || /<[^>]+>|https?:\/\//i.test(n);}

function validateParsedRow(row){
  if(!row||!clean(row.name)) return false;
  if(!['death','funeral','intention','grave'].includes(row.kind)) return false;
  if(!row.source_id||!row.source_name||!row.url) return false;
  if(!isSafeUrl(row.url)) return false;
  if(TECH_NOISE.test(clean(row.note))||TECH_NOISE.test(clean(row.place))) return false;
  // Intencja bywa opisowa ("Rozalia w 6 r. śm. ze wspomnieniem męża Franciszka"),
  // więc nie stosujemy do niej reguły "imię + nazwisko".
  if(!['intention','grave'].includes(row.kind) && isBadNameCandidate(row.name)) return false;
  if(row.kind==='intention' && clean(row.name).length>200) return false;
  return true;
}

function parseGenericList(text,source){return uniq($links(text,source).filter(u=>/nekrolog|pogrzeb|zmar|klepsydr|id=/.test(u)).map(url=>({url})),r=>r.url);}
function $links(text,source){const $=cheerio.load(text); return uniq($('a[href]').map((_,a)=>absoluteUrl($(a).attr('href'),source.list_url||source.url)).get().filter(Boolean),(u)=>u);}

// Budżet czasowy na pętlę stron szczegółowych jednego źródła. Pętla jest sekwencyjna,
// a max_detail_pages sięga 50 — przy hoście, który przestał odpowiadać, samo to źródło
// przekroczyłoby timeout-minutes: 20 całego workflow. Przebieg ubity limitem nie zapisuje
// ani danych, ani statusu, ani heartbeatu, więc awaria staje się niewidoczna. Rekordy
// zebrane do momentu wyczerpania budżetu są warte więcej niż przebieg przerwany.
const DETAIL_FETCH_BUDGET_MS=120000;

// Wspólna pętla po stronach szczegółowych z kontrolą budżetu. Zwraca też informację,
// czy przerwano ją przed czasem — bez tego pusty wynik po przekroczeniu budżetu
// zostałby zdiagnozowany jako regresja parsera.
// fetcher wstrzykiwany, żeby budżet dało się przetestować bez ruchu sieciowego.
async function fetchDetailRows(source,links,onDetail,fetcher=fetchText){
  const deadline=Date.now()+(Number(source.detail_budget_ms)||DETAIL_FETCH_BUDGET_MS);
  const rows=[];
  let visited=0;
  let truncated=false;
  for(const l of links){
    if(Date.now()>=deadline){truncated=true;break;}
    visited+=1;
    const d=await fetcher(l.url);
    if(!d.ok) continue;
    const row=onDetail(d.text,l.url);
    if(row) rows.push(row);
  }
  return {rows,visited,truncated};
}

async function parseByListAndDetails(source,forceFuneral,listParser,detailParser){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const links=listParser(r.text,source).slice(0,source.max_detail_pages||50);
  if(!links.length) return {rows:[],error:`${source.name}: nie znaleziono linków szczegółów`,diagnostics:{http_status:r.status,candidate_links:0,accepted_rows:0,parser_status:'parser_broken'}};
  const {rows,visited,truncated}=await fetchDetailRows(source,links,(text,url)=>detailParser(text,source,url,forceFuneral));
  const base={http_status:r.status,candidate_links:links.length,visited_links:visited,partial:truncated};
  if(!rows.length){
    // Wyczerpany budżet i zepsuty parser dają ten sam objaw — zero rekordów — ale
    // wymagają innej reakcji, więc nie mogą dzielić komunikatu ani statusu.
    if(truncated) return {rows:[],error:`${source.name}: wyczerpany budżet czasu odczytu po ${visited}/${links.length} stronach, zero rekordów`,diagnostics:{...base,accepted_rows:0,parser_status:'timeout_budget'}};
    return {rows:[],error:`${source.name}: znaleziono ${links.length} linków, ale zero poprawnych rekordów`,diagnostics:{...base,accepted_rows:0,parser_status:'parser_broken'}};
  }
  const deduped=uniq(rows,r=>`${r.kind}|${r.name}|${r.url}`);
  return {rows:deduped,error:null,diagnostics:{...base,accepted_rows:deduped.length,parser_status:'ok'}};
}

// Realne nekrologi Gabriel24 i Karawana leżą wyłącznie pod /nekrolog/<slug>/ (liczba
// pojedyncza). Strony oferty (/pogrzeby-*, /zasilek-*) i paginacja (/nekrologi/page/N/)
// trafiały wcześniej do wyników jako "pogrzeby".
const GABRIEL24_DETAIL=/\/\/(?:www\.)?gabriel24\.pl\/nekrolog\/[^/]+\/?$/i;
const KARAWAN_DETAIL=/\/\/(?:www\.)?karawan\.pl\/nekrolog\/[^/]+\/?$/i;
const parseGabriel24NekrologiHtml=(t,s)=>parseGenericList(t,s).filter(x=>GABRIEL24_DETAIL.test(x.url));
const parseKarawanNekrologiHtml=(t,s)=>parseGenericList(t,s).filter(x=>KARAWAN_DETAIL.test(x.url));

const parsePodwawelskieNekrologiHtml=(t,s)=>{
  const $=prepareReadableDocument(cheerio.load(t));
  return uniq($('a[href]').map((_,a)=>({url:absoluteUrl($(a).attr('href'),s.list_url||s.url),label:clean($(a).text())})).get()
    .filter(x=>x.url&&(/nekrologi--str-\d+\.html/i.test(x.url) || /^\d+$/.test(x.label)))
    .map(x=>({url:x.url})),x=>x.url);
};

// ─────────────────────────── ZCK ───────────────────────────
// Porządek pogrzebów na jeden dzień: <h4><strong>2026-08-18</strong></h4>, potem
// naprzemiennie nagłówek cmentarza i <table class="funerals"> z kolumnami
// funeral-time / funeral-place / funeral-label.
function parseZckFuneralsHtml(text,source){
  const $=cheerio.load(text);
  const headings=$('h4 strong').map((_,e)=>clean($(e).text())).get();
  const pageDate=headings.map(firstIsoDate).find(Boolean)||null;
  const dateFuneral=pageDate||todayIso();
  const dateIsFallback=!pageDate;
  const rows=[];
  let cemetery='';
  $('h4 strong, table.funerals tr').each((_,el)=>{
    const $el=$(el);
    if($el.is('strong')){
      const label=clean($el.text());
      if(!firstIsoDate(label)&&label) cemetery=label;
      return;
    }
    const time=parseTime(clean($el.find('td.funeral-time').text()));
    const label=clean($el.find('td.funeral-label').text());
    if(!time||!label) return;
    const name=normalizePersonName(label);
    const spot=clean($el.find('td.funeral-place').text());
    const row={
      kind:'funeral', name, date_death:null, date_funeral:dateFuneral, time_funeral:time,
      date_is_fallback:dateIsFallback,
      place:[spot,cemetery].filter(Boolean).join(' – '),
      source_id:source.id, source_name:source.name, url:source.url, source_url:source.url,
      note:dateIsFallback?`ZCK (data zastępcza – dzień pobrania); ${cemetery}`:`ZCK ${dateFuneral}; ${cemetery}`
    };
    if(validateParsedRow(row)) rows.push(row);
  });
  return uniq(rows,r=>`${r.name}|${r.date_funeral}|${r.time_funeral}|${r.place}`);
}
// ZCK publikuje porządek pogrzebów na jeden dzień i w dni bez ceremonii (typowo
// weekendy) wypisuje przy każdym cmentarzu "Brak pogrzebów". Zero rekordów jest
// wtedy poprawną odpowiedzią źródła, a nie cichą awarią — struktura strony jest
// nienaruszona. Bez tego rozróżnienia sobota i niedziela dawały cztery puste
// przebiegi z rzędu i heurystyka pustych przebiegów (próg 3) co tydzień zgłaszała
// nieistniejącą regresję parsera.
const ZCK_NO_FUNERALS = /brak\s+pogrzeb/i;

function zckConfirmsNoFunerals(text){
  const $=cheerio.load(text);
  const tables=$('table.funerals');
  // Wymagamy dowodu strukturalnego: tabele muszą istnieć. Jeśli znikną, to jest
  // zmiana strony i ma zostać zgłoszona jako awaria, a nie wyciszona.
  if(!tables.length) return false;
  return tables.toArray().every((t)=>ZCK_NO_FUNERALS.test(clean($(t).text())));
}

async function parseZckFunerals(source){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const rows=parseZckFuneralsHtml(r.text,source);
  const status=rows.length?'ok':(zckConfirmsNoFunerals(r.text)?'empty_confirmed':'empty');
  return {rows,error:null,diagnostics:{http_status:r.status,accepted_rows:rows.length,parser_status:status}};
}

// ─────────────────────────── PUK ───────────────────────────
function parsePukPozegnalismyHtml(text,source){
  const $=cheerio.load(text); const rows=[];
  $('.results-klepsydra .eklepsydra').each((_,c)=>{
    const root=$(c);
    const h=clean(root.find('p').first().text());
    const name=normalizePersonName(root.find('p.fs-28, p.h-80').first().text());
    const f=clean(root.find('p').filter((_,e)=>/data pogrzebu/i.test($(e).text())).first().text());
    const dd=parsePolishDateToIso(h), df=parsePolishDateToIso(f), tf=parseTime(f);
    const url=absoluteUrl(root.find('a.btn.link').attr('href')||source.url, source.url)||source.url;
    const death={kind:'death',name,date_death:dd,date_funeral:df,time_funeral:tf,place:source.name,source_id:source.id,source_name:source.name,url,source_url:source.url,note:clean(`${h} | ${f}`)};
    const funeral={...death,kind:'funeral',note:h};
    if(validateParsedRow(death)) rows.push(death);
    if(df&&validateParsedRow(funeral)) rows.push(funeral);
  });
  return uniq(rows,r=>`${r.kind}|${r.name}|${r.url}|${r.date_death}|${r.date_funeral}`);
}
async function parsePukPozegnalismy(source){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const rows=parsePukPozegnalismyHtml(r.text,source);
  return {rows,error:null,diagnostics:{http_status:r.status,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
}

// ──────────────── Karawan / Gabriel24 (widżet e-Nekrolog) ────────────────
// Oba serwisy używają tego samego widżetu i publikują dane etykietami:
//   Śp. JAN SADZIK zm. 11.08.2026 / Pogrzeb: 18.08.2026 / Msza Święta: … o godz. 13:40 / Cmentarz: …
// Wcześniej cała ta treść ginęła, bo była jedną linią zawierającą słowo "Facebook".
function pickObituaryScope($){
  for(const sel of ['[class*="nekrolog"]','[class*="obituary"]','main','article','.entry-content','.content']){
    const node=$(sel).first();
    if(node.length&&clean(node.text())) return node;
  }
  return $('body');
}
function parseObituaryWidgetDetail(text,source,detailUrl){
  const $=prepareReadableDocument(cheerio.load(text));
  const body=cleanTechnicalNoise(extractBlockText($,pickObituaryScope($)),{keepLines:true});
  const flat=clean(body);
  if(!flat) return null;

  const lifespan=body.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
  const dd=parsePolishDateToIso((body.match(/\bzm\.\s*([\d.\-/]{8,10})/i)||[])[1]||'')
    || (lifespan?parsePolishDateToIso(lifespan[2]):null);
  const funeralLine=(body.match(/^[^\n]*\b(?:data\s+pogrzebu|pogrzeb)\b[^\n]*$/im)||[])[0]||'';
  const massLine=(body.match(/^[^\n]*msza\s+święta[^\n]*$/im)||[])[0]||'';
  const df=parsePolishDateToIso((funeralLine.match(/([\d]{1,2}\.[\d]{1,2}\.\d{4})/)||[])[1]||'')
    || parsePolishDateToIso((massLine.match(/([\d]{1,2}\.[\d]{1,2}\.\d{4})/)||[])[1]||'');
  const tm=parseTime(massLine)||parseTime(funeralLine);

  // Uwaga: \b przed "Ś" nie zachodzi (to znak spoza ASCII) — dlatego bez \b.
  const nameLine=(body.match(/^[^\n]*śp\.[^\n]*$/im)||[])[0]||'';
  const rawName=(nameLine.match(/śp\.\s*(.+?)\s*(?:\bzm\.|\d{1,2}\.\d{1,2}\.\d{4}|$)/iu)||[])[1]||'';
  if(!nameLine && !dd && !df) return null;
  const name=[normalizePersonName(rawName),normalizePersonName(nameFromSlug(detailUrl)||'')].find(n=>n&&!isBadNameCandidate(n));
  if(!name) return null;

  const place=clean((body.match(/^\s*cmentarz\s*:\s*([^\n]{3,90})$/im)||[])[1]||'')
    || clean((body.match(/(cmentarz[^.\n]{2,80})/i)||[])[1]||'')
    || source.name;
  const note=clean([nameLine,funeralLine,massLine].filter(Boolean).join(' | '))||flat.slice(0,260);

  const row={kind:dd?'death':'funeral',name,date_death:dd||null,date_funeral:df||null,time_funeral:tm,place:clean(place).slice(0,120),source_id:source.id,source_name:source.name,url:detailUrl,source_url:source.url,note:note.slice(0,260)};
  return validateParsedRow(row)?row:null;
}
const parseGabriel24DetailHtml=(t,s,u)=>parseObituaryWidgetDetail(t,s,u);
const parseKarawanDetailHtml=(t,s,u)=>parseObituaryWidgetDetail(t,s,u);
const parseGabriel24Nekrologi=(s)=>parseByListAndDetails(s,false,parseGabriel24NekrologiHtml,parseGabriel24DetailHtml);
const parseKarawanNekrologi=(s)=>parseByListAndDetails(s,false,parseKarawanNekrologiHtml,parseKarawanDetailHtml);

// ─────────────────────────── Grobonet: groby ───────────────────────────
// Serwis nie prowadzi listy nekrologów, ale ma przeszukiwalną bazę pochówków.
// Odpytujemy ją nazwiskami z search_terms i zwracamy rekordy rodzaju 'grave'
// — to jedyne źródło podające MIEJSCE POCHÓWKU konkretnej osoby.
function parseGrobonetGrobyHtml(text,source,term=''){
  const $=cheerio.load(text);
  const base=source.base_url||source.list_url||source.url;
  const rows=[];
  $('.results_list li').each((_,el)=>{
    const $el=$(el);
    const name=normalizePersonName($el.find('span.sp span').first().text()||$el.find('span.sp').first().text());
    if(!name) return;
    const greys=$el.find('span.szary').map((_,g)=>clean($(g).text())).get();
    const birth=firstIsoDate(greys.find(g=>/^ur\./i.test(g))||'');
    const death=firstIsoDate(greys.find(g=>/^zm\./i.test(g))||'');
    const cemetery=greys.find(g=>/cmentarz/i.test(g))||source.name;
    const href=$el.find('a[href]').map((_,a)=>$(a).attr('href')).get().find(h=>/id=detale/i.test(h||''));
    const url=absoluteUrl(href||source.url,base)||source.url;
    const row={
      kind:'grave', name, date_death:death||null, date_funeral:null, time_funeral:null,
      date_birth:birth||null,
      place:clean(cemetery).slice(0,120),
      source_id:source.id, source_name:source.name, url, source_url:source.url,
      note:clean(`Grób w bazie Grobonet${term?` (wyszukiwanie: ${term})`:''}${birth?`; ur. ${birth}`:''}${death?`; zm. ${death}`:''}`)
    };
    if(validateParsedRow(row)) rows.push(row);
  });
  return rows;
}
function grobonetSearchUrl(source,term){
  const base=source.list_url||source.url;
  const u=new URL(base);
  u.searchParams.set('id','wyniki');
  u.searchParams.set('name',term);
  return u.toString();
}
async function parseGrobonetGroby(source){
  const terms=(source.search_terms||[]).map((t)=>clean(t)).filter(Boolean);
  if(!terms.length) return {rows:[],error:null,diagnostics:{parser_status:'empty',accepted_rows:0,search_terms:0}};
  const rows=[];
  let lastStatus=0;
  for(const term of terms){
    const r=await fetchText(grobonetSearchUrl(source,term));
    lastStatus=r.status;
    if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
    rows.push(...parseGrobonetGrobyHtml(r.text,source,term).slice(0,source.max_detail_pages||50));
  }
  const deduped=uniq(rows,r=>`${r.name}|${r.date_death||''}|${r.url}`);
  return {rows:deduped,error:null,diagnostics:{http_status:lastStatus,search_terms:terms.length,accepted_rows:deduped.length,parser_status:deduped.length?'ok':'empty'}};
}

// ─────────────────────────── Podwawelskie ───────────────────────────
// Parafia publikuje kafelki: dwa <p><strong> (imię, nazwisko) oraz dwie daty ISO
// oznaczone ikonami — fa-star = urodziny, fa-cross = zgon. Etykiet "ur."/"zm.",
// których szukał poprzedni parser, na stronie nie ma w ogóle.
function parsePodwawelskieRowsFromListHtml(text, source, pageUrl){
  const $=cheerio.load(text);
  const rows=[];
  $('.section__box.necrology .section__box-element').each((_,el)=>{
    const $el=$(el);
    const nameParts=$el.find('p > strong').map((_,s)=>clean($(s).text())).get().filter(Boolean);
    const name=normalizePersonName(nameParts.slice(0,2).join(' '));
    const born=firstIsoDate($el.find('.fa-star').closest('p').text());
    const died=firstIsoDate($el.find('.fa-cross').closest('p').text());
    if(!name||!died) return;
    const row={
      kind:'death', name, date_death:died, date_funeral:null, time_funeral:null,
      place:source.name, source_id:source.id, source_name:source.name, url:pageUrl, source_url:source.url,
      note:clean(`ur.: ${born||'brak'}; zm.: ${died}; Podwawelskie`)
    };
    if(validateParsedRow(row)) rows.push(row);
  });
  return rows;
}
async function parsePodwawelskieNekrologi(source){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`, diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const pages=uniq([source.list_url||source.url,...parsePodwawelskieNekrologiHtml(r.text,source).map(l=>l.url)],u=>u).slice(0,source.max_detail_pages||50);
  const rows=[];
  for(const pageUrl of pages){
    const pr=pageUrl===(source.list_url||source.url) ? r : await fetchText(pageUrl);
    if(!pr.ok) continue;
    rows.push(...parsePodwawelskieRowsFromListHtml(pr.text,source,pageUrl));
  }
  const deduped=uniq(rows,r=>`${r.source_id}|${r.name}|${r.date_death||''}`);
  return {rows:deduped,error:null,diagnostics:{http_status:r.status,candidate_pages:pages.length,accepted_rows:deduped.length,parser_status:deduped.length?'ok':'empty'}};
}

// ─────────────────────────── Dębniki: pogrzeby ───────────────────────────
// Linki zbieramy z surowego dokumentu. prepareReadableDocument usuwa <nav>, a razem
// z nim znikał jedyny link do treści o zmarłych — parser czytał potem aktualności
// innych parafii salezjańskich.
const parseDebnikiSdbPogrzebyHtml=(text,source)=>{
  const $=cheerio.load(text);
  const base=source.list_url||source.url;
  let host=''; try{ host=new URL(base).host; }catch{}
  return uniq($('a[href]').map((_,a)=>({url:absoluteUrl($(a).attr('href'),base),label:clean($(a).text())})).get()
    .filter(x=>x.url)
    .filter(x=>{ try{ return !host||new URL(x.url).host===host; }catch{ return false; } })
    .filter(x=>/pogrzeb|zmar|nekrolog|intenc|pożegnal|pozegnal|aktualn|ogłosz|oglosz/i.test(`${x.url} ${x.label}`))
    .map(x=>({url:x.url})),x=>x.url);
};
function parseDebnikiSdbDetailHtml(text,source,detailUrl){
  const $=prepareReadableDocument(cheerio.load(text));
  const note=cleanTechnicalNoise(extractMainText($,['main','article','.entry-content','.content']));
  const hasFuneral=/(pogrzeb|pogrzebowa|msza\s+święta\s+pogrzebowa|uroczystości\s+pogrzebowe)/i.test(note);
  const hasDeathMention=/(w minionym tygodniu pożegnaliśmy|pożegnaliśmy z naszej wspólnoty|śp\.?|zmarł|zmarła)/i.test(note);
  if(!hasFuneral && !hasDeathMention) return null;
  if(/^\+\s*[A-ZŁŚŻŹĆŃÓ]/u.test(clean(note))) return null;
  const rawName=(note.match(/(?:za\s+śp\.?\s*|śp\.?\s*|pogrzebowa\s+)([A-ZŁŚŻŹĆŃÓ][\p{L}-]+\s+[A-ZŁŚŻŹĆŃÓ][\p{L}-]+)/iu)||[])[1]||nameFromSlug(detailUrl);
  const name=normalizePersonName(rawName||'');
  const df=parsePolishDateToIso((note.match(/([\d]{1,2}[./-][\d]{1,2}[./-][\d]{2,4}|\d{1,2}\s+[a-ząćęłńóśźżivx]+\s+\d{4}|\d{4}-\d{1,2}-\d{1,2})/iu)||[])[1]||'');
  const tm=parseTime(note);
  const row={kind:hasFuneral?'funeral':'death',name,date_death:hasFuneral?null:(parsePolishDateToIso((note.match(/zmar[łłaey]?[^\d]{0,30}([\d./-]{6,10}|\d{1,2}\s+[a-ząćęłńóśźżivx]+\s+\d{4})/iu)||[])[1]||'')||null),date_funeral:hasFuneral?df:null,time_funeral:hasFuneral?tm:null,place:source.name,source_id:source.id,source_name:source.name,url:detailUrl,source_url:source.url,note:note.slice(0,260)};
  return validateParsedRow(row)?row:null;
}
async function parseDebnikiSdbPogrzeby(source){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const links=parseDebnikiSdbPogrzebyHtml(r.text,source).slice(0,source.max_detail_pages||30);
  if(!links.length) return {rows:[],error:'Dębniki SDB: nie znaleziono linków szczegółów',diagnostics:{http_status:r.status,candidate_links:0,accepted_rows:0,parser_status:'parser_broken'}};
  const {rows,visited,truncated}=await fetchDetailRows(source,links,(text,url)=>parseDebnikiSdbDetailHtml(text,source,url));
  const deduped=uniq(rows,r=>`${r.kind}|${r.name}|${r.url}`);
  const base={http_status:r.status,candidate_links:links.length,visited_links:visited,partial:truncated,accepted_rows:deduped.length};
  if(!deduped.length&&truncated) return {rows:[],error:`Dębniki SDB: wyczerpany budżet czasu odczytu po ${visited}/${links.length} stronach, zero rekordów`,diagnostics:{...base,parser_status:'timeout_budget'}};
  return {rows:deduped,error:null,diagnostics:{...base,parser_status:deduped.length?'ok':'empty'}};
}

// ─────────────────────────── Dębniki: intencje ───────────────────────────
// Realizacja wymagania "najbliższe potrzeby". Strona podaje tygodniowy harmonogram:
//   PONIEDZIAŁEK 18 sierpnia
//   07:00 + Tadeusz Leyko
//   18:00 ++ Kazimiera i Julian Czaplińscy
// Znak "+" oznacza zmarłego; normalizeForLooseMatch zamienia go na spację, więc
// dopasowanie fraz działa na tym formacie bez żadnych dodatkowych reguł.
const WEEKDAYS=/(PONIEDZIA[ŁL]EK|WTOREK|[ŚS]RODA|CZWARTEK|PI[ĄA]TEK|SOBOTA|NIEDZIELA)/i;
function resolveIntentionDate(day,monthName,referenceIso){
  const month=monthMap[String(monthName||'').toLowerCase()];
  if(!month) return null;
  const refYear=Number(String(referenceIso||todayIso()).slice(0,4));
  const refMonth=Number(String(referenceIso||todayIso()).slice(5,7));
  // Harmonogram obejmuje najbliższy tydzień, więc grudzień widziany w styczniu
  // należy do roku poprzedniego, a styczeń widziany w grudniu — do następnego.
  let year=refYear;
  if(refMonth===12&&month===1) year=refYear+1;
  else if(refMonth===1&&month===12) year=refYear-1;
  return isoFromParts(year,month,day);
}
function parseDebnikiIntencjeHtml(text,source,referenceIso=todayIso()){
  const $=prepareReadableDocument(cheerio.load(text));
  const lines=extractBlockText($,$('body')).split('\n').map(l=>clean(l)).filter(Boolean);
  const rows=[];
  let currentDate=null;
  let currentDay='';
  for(const line of lines){
    const heading=line.match(new RegExp(`^${WEEKDAYS.source}\\s+(\\d{1,2})\\s+(\\p{L}+)`,'iu'));
    if(heading){
      currentDay=clean(heading[0]);
      currentDate=resolveIntentionDate(heading[2],heading[3],referenceIso);
      continue;
    }
    const entry=line.match(/^(\d{1,2}[:.]\d{2})\s*(\+{1,2})\s*(.+)$/);
    if(!entry) continue;
    const forWhom=clean(entry[3]);
    if(!forWhom) continue;
    const row={
      kind:'intention',
      name:forWhom.slice(0,180),
      date_death:null, date_funeral:null, time_funeral:null,
      date_intention:currentDate, time_intention:parseTime(entry[1]),
      place:source.name,
      source_id:source.id, source_name:source.name, url:source.url, source_url:source.url,
      note:clean(`Intencja mszalna${currentDay?` – ${currentDay}`:''}${currentDate?` (${currentDate})`:''}, godz. ${entry[1]}: ${entry[2]} ${forWhom}`).slice(0,260)
    };
    if(validateParsedRow(row)) rows.push(row);
  }
  return uniq(rows,r=>`${r.date_intention||''}|${r.time_intention||''}|${r.name}`);
}
async function parseDebnikiIntencje(source){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const rows=parseDebnikiIntencjeHtml(r.text,source);
  return {rows,error:null,diagnostics:{http_status:r.status,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
}

// ─────────────────────────── św. Jadwiga ───────────────────────────
// Sekcja "Msze święte pogrzebowe" to lista zgłoszeń zgonu (nazwisko po "+" oraz data
// publikacji), a strony szczegółowe zawierają intencje mszalne — nie termin pogrzebu.
// Dlatego data trafia do date_death, a nigdy do date_funeral.
function parseSwJadwigaPogrzeboweHtml(text,source){
  const $=cheerio.load(text);
  const rows=[];
  $('li.artykul').each((_,el)=>{
    const $el=$(el);
    const name=normalizePersonName($el.find('h2.tytul').first().text());
    if(!name) return;
    const stamp=$el.find('span.data').first();
    const reported=firstIsoDate(`${stamp.attr('title')||''} ${stamp.text()||''}`);
    const href=$el.find('a[href]').map((_,a)=>$(a).attr('href')).get().find(h=>/msze-swiete-pogrzebowe\//i.test(h||''));
    const url=absoluteUrl(href||source.url,source.list_url||source.url)||source.url;
    const row={
      kind:'death', name, date_death:reported, date_funeral:null, time_funeral:null,
      place:source.name, source_id:source.id, source_name:source.name, url, source_url:source.url,
      note:clean(`Zgłoszenie mszy pogrzebowej${reported?` z ${reported}`:''} – parafia św. Jadwigi Królowej`)
    };
    if(validateParsedRow(row)) rows.push(row);
  });
  return uniq(rows,r=>`${r.name}|${r.date_death||''}|${r.url}`);
}
async function parseSwJadwigaPogrzebowe(source){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const rows=parseSwJadwigaPogrzeboweHtml(r.text,source);
  return {rows,error:null,diagnostics:{http_status:r.status,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
}

// ─────────────────────────── Warstwa wspólna ───────────────────────────
function mergeRequiredSources(existing){
  const list=Array.isArray(existing)?existing:[];
  const byId=new Map(list.map(s=>[s.id,s]));
  for(const r of REQUIRED_SOURCES){
    const stored=byId.get(r.id);
    // Zmiana typu parsera oznacza migrację źródła — wtedy adresy i parametry
    // wyszukiwania biorą się z definicji, a nie z zastanej konfiguracji.
    const migrating=stored&&stored.type!==r.type;
    const merged=migrating?{...stored,...r}:{...r,...stored};
    byId.set(r.id,{...merged,type:r.type,known_empty:r.known_empty??false,external_block_tolerated:r.external_block_tolerated===true,requires_ocr:r.requires_ocr??false,requires_pdf:r.requires_pdf??false});
  }
  return [...byId.values()];
}

// Jedna definicja przeszukiwanego tekstu dla wszystkich trzech miejsc: flagi
// priority_hit, alertu Discord i podświetlenia w interfejsie. Wcześniej Discord
// pomijał pole place i nie zgłaszał trafień występujących wyłącznie tam.
const buildMatchHaystack=(row)=>[row?.name,row?.full_name,row?.note,row?.place,row?.source_name].filter(Boolean).join(' ');
const rowMatchesPhrases=(row,phrases=HELENA_GAWIN_PHRASES)=>textMatchesAny(buildMatchHaystack(row),phrases);

const isIntentionLikeSource=(s)=>s?.type==='debniki_intencje'||s?.type==='intencje_plus';
const isIntentionLikeRow=(r)=>r?.kind==='intention';
const isEligibleDeathRow=(r)=>r?.kind==='death';
const isMeaningfulRow=(r)=>!!clean(r?.name||r?.note);

// Scalanie tej samej osoby z różnych źródeł. Po naprawie ekstrakcji Karawana
// i Gabriel24 ten sam pogrzeb pojawia się równolegle w ZCK — bez scalania lista
// puchnie, a alert wysyła się wielokrotnie o tym samym zdarzeniu.
function dedupeKeyForRow(row){
  const name=String(row?.name||'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const date=row?.date_death||row?.date_funeral||row?.date_intention||'';
  return `${row?.kind||''}|${name}|${date}`;
}
function rowCompleteness(row){
  return ['date_death','date_funeral','time_funeral','place','note','url'].reduce((n,k)=>n+(clean(row?.[k])?1:0),0);
}
function mergeDuplicateRows(rows){
  const byKey=new Map();
  for(const row of rows||[]){
    const key=dedupeKeyForRow(row);
    const prev=byKey.get(key);
    if(!prev){ byKey.set(key,{...row}); continue; }
    const better=rowCompleteness(row)>rowCompleteness(prev)?{...row}:{...prev};
    const other=better===prev?row:prev;
    better.priority_hit=!!(prev.priority_hit||row.priority_hit);
    better.also_in_sources=[...new Set([...(prev.also_in_sources||[]),...(row.also_in_sources||[]),other.source_name].filter(Boolean).filter(n=>n!==better.source_name))];
    byKey.set(key,better);
  }
  return [...byKey.values()];
}

// Status zadania opisuje kondycję odczytu, nie liczbę rekordów: tydzień bez
// pogrzebów w oknie to poprawny wynik, a nie awaria.
const resolveJobOutcome=({recentDeaths=0,upcomingFunerals=0,upcomingIntentions=0,refreshErrors=[],sourcesTotal=0,sourcesHealthy=null})=>{
  const errors=(refreshErrors||[]).filter(Boolean);
  const healthy=sourcesHealthy===null?(recentDeaths+upcomingFunerals+upcomingIntentions>0?1:0):sourcesHealthy;
  if(sourcesTotal>0&&healthy<=0){
    return {status:'error',ok:false,errorMessage:errors.join(' | ')||'Żadne źródło nie odpowiedziało poprawnie'};
  }
  if(errors.length) return {status:'done_with_errors',ok:true,errorMessage:errors.join(' | ')};
  return {status:'done',ok:true,errorMessage:null};
};

// Blokada anty-botowa (Cloudflare i podobne) to HTTP 403 z warstwy ochronnej —
// parsery rozpoznają ją jako parser_status: 'blocked'. Odróżnienie jej od awarii
// parsera jest istotne, bo wymaga innej reakcji: zmiany drogi dostępu, nie poprawki
// kodu. Bez tego rozróżnienia każdy przebieg kończył się statusem done_with_errors
// z tego samego, znanego powodu i status przestawał odróżniać regresję od normy.
const isBlockedByAntiBot=(parsed)=>parsed?.diagnostics?.parser_status==='blocked';

// Odczyt udany, w którym źródło wprost stwierdza brak danych na dany dzień.
// To poprawny wynik, a nie cisza po awarii — nie może nabijać licznika pustych
// przebiegów ani degradować statusu.
const isConfirmedEmpty=(parsed)=>parsed?.diagnostics?.parser_status==='empty_confirmed';

// Awaria przejściowa na poziomie sieci: żadna odpowiedź HTTP nie dotarła
// (http_status 0 — przeterminowanie, zerwane połączenie, błąd DNS) albo pętla stron
// szczegółowych wyczerpała budżet czasu. Jedno i drugie jest stanem sieci, nie regresją
// kodu, i bywa jednorazowe — 2026-08-28 gabriel24.pl przeterminował jeden przebieg
// i odpowiadał normalnie w następnym. Odpowiedź serwera z błędnym statusem (404, 500)
// do tej kategorii NIE należy: tam serwer działa i mówi coś konkretnego.
const isTransientNetworkFailure=(parsed)=>{
  const d=parsed?.diagnostics||{};
  if(d.parser_status==='timeout_budget') return true;
  return d.parser_status==='http_error'&&Number(d.http_status||0)===0;
};

const daysBetween=(iso,now=Date.now())=>{
  const t=Date.parse(iso||'');
  if(!Number.isFinite(t)) return 0;
  return Math.max(0,Math.floor((now-t)/86400000));
};

// Zwraca {kind:'error'|'warning'|'ok', entry}. Tolerowana blokada zewnętrzna jest
// ostrzeżeniem tylko dopóki mieści się w progu — trwała utrata źródła musi wrócić
// do rangi błędu, żeby nie chować się bezterminowo za ostrzeżeniem.
function classifySourceOutcome({source={},parsed={},health={},toleranceDays=14,emptyStreakAlert=3,networkFailAlert=2,now=Date.now()}={}){
  const base={source_id:source.id,source_name:source.name,url:source.url};
  const blocked=isBlockedByAntiBot(parsed);

  if(blocked&&source.external_block_tolerated===true){
    const days=daysBetween(health.blocked_since,now);
    const label=`${clean(parsed.error)} — blokada anty-botowa źródła, trwa ${days} ${days===1?'dzień':'dni'}`;
    const entry={...base,blocked_since:health.blocked_since??null,blocked_days:days};
    if(days>=toleranceDays){
      return {kind:'error',entry:{...entry,error:`${label}; przekroczono próg ${toleranceDays} dni — źródło wymaga decyzji (przywrócenie dostępu albo enabled: false)`}};
    }
    return {kind:'warning',entry:{...entry,error:label}};
  }

  if(parsed.error){
    // Pierwsze niepowodzenie sieciowe to ostrzeżenie, nie błąd przebiegu. Bez tego
    // rozróżnienia pojedyncze mrugnięcie sieci degradowało status tak samo jak trwały
    // upadek źródła, a done_with_errors przestawał odróżniać awarię od normy — ten sam
    // problem, który rozwiązano wcześniej dla blokad anty-botowych. Seria niepowodzeń
    // nadal eskaluje: przy dwóch przebiegach na dobę próg 2 daje około pół doby zwłoki.
    if(isTransientNetworkFailure(parsed)){
      // Nieudany odczyt oznacza co najmniej jedno niepowodzenie, nawet gdy licznik
      // kondycji jeszcze go nie zapisał.
      const streak=Math.max(1,Number(health.fail_streak||0));
      const entry={...base,fail_streak:streak};
      if(streak<networkFailAlert){
        return {kind:'warning',entry:{...entry,error:`${clean(parsed.error)} — przejściowe niepowodzenie odczytu (${streak} z ${networkFailAlert} przed eskalacją do błędu)`}};
      }
      return {kind:'error',entry:{...entry,error:`${clean(parsed.error)} — ${streak} nieudane odczyty z rzędu, źródło wymaga sprawdzenia`}};
    }
    return {kind:'error',entry:{...base,error:clean(parsed.error)}};
  }

  if(isConfirmedEmpty(parsed)) return {kind:'ok',entry:null};

  if(health.known_empty!==true&&Number(health.empty_streak||0)>=emptyStreakAlert){
    return {kind:'error',entry:{...base,error:`Brak rekordów w ${health.empty_streak} kolejnych przebiegach — prawdopodobna zmiana struktury strony`}};
  }

  return {kind:'ok',entry:null};
}

// Podsumowanie liczone z realnych rekordów zamiast stałego tekstu.
function buildFallbackSummaryForHelena(recentDeaths=[],upcomingFunerals=[],intentions=[],phrases=HELENA_GAWIN_PHRASES){
  const all=[...(recentDeaths||[]),...(upcomingFunerals||[]),...(intentions||[])];
  const hits=all.filter((r)=>r?.priority_hit===true||rowMatchesPhrases(r,phrases));
  if(!hits.length) return {text:'Helena Gawin - brak informacji',date_death:null,date_funeral:null,urls:[]};
  const dates=(key)=>hits.map(h=>h?.[key]).filter(Boolean).sort();
  return {
    text:`Helena Gawin - znaleziono ${hits.length} ${hits.length===1?'wpis':'wpisów'} w ${new Set(hits.map(h=>h.source_name)).size} źródłach`,
    date_death:dates('date_death')[0]||null,
    date_funeral:dates('date_funeral')[0]||null,
    urls:[...new Set(hits.map(h=>h.url).filter(Boolean))].slice(0,10)
  };
}

async function parseGenericHtml(source){return {rows:[],error:`Brak parsera specyficznego dla source_id=${source.id}`};}
async function parseSource(source){
  switch(source.type){
    case 'zck_funerals':return parseZckFunerals(source);
    case 'puk_pozegnalismy':return parsePukPozegnalismy(source);
    case 'gabriel24_nekrologi':return parseGabriel24Nekrologi(source);
    case 'karawan_nekrologi':return parseKarawanNekrologi(source);
    case 'grobonet_groby':return parseGrobonetGroby(source);
    case 'podwawelskie_nekrologi':return parsePodwawelskieNekrologi(source);
    case 'debniki_sdb_pogrzeby':return parseDebnikiSdbPogrzeby(source);
    case 'debniki_intencje':return parseDebnikiIntencje(source);
    case 'sw_jadwiga_pogrzebowe':return parseSwJadwigaPogrzebowe(source);
    case 'intencje_plus':return {rows:[],error:null};
    case 'generic_html':return parseGenericHtml(source);
    default:return {rows:[],error:`Nieznany parser type=${source.type}`};
  }
}

export {
  HELENA_GAWIN_PHRASES,REQUIRED_SOURCES,clean,nowISO,todayIso,isoFromParts,parsePolishDateToIso,firstIsoDate,parseTime,
  prepareReadableDocument,extractBlockText,extractMainText,cleanTechnicalNoise,nameFromSlug,normalizePersonName,
  isBadNameCandidate,isSafeUrl,validateParsedRow,
  parseZckFunerals,parseZckFuneralsHtml,parsePukPozegnalismy,parsePukPozegnalismyHtml,
  parseGabriel24Nekrologi,parseGabriel24NekrologiHtml,parseGabriel24DetailHtml,
  parseKarawanNekrologi,parseKarawanNekrologiHtml,parseKarawanDetailHtml,parseObituaryWidgetDetail,
  parseGrobonetGroby,parseGrobonetGrobyHtml,grobonetSearchUrl,
  parsePodwawelskieNekrologi,parsePodwawelskieNekrologiHtml,parsePodwawelskieRowsFromListHtml,
  parseDebnikiSdbPogrzeby,parseDebnikiSdbPogrzebyHtml,parseDebnikiSdbDetailHtml,
  parseDebnikiIntencje,parseDebnikiIntencjeHtml,
  parseSwJadwigaPogrzebowe,parseSwJadwigaPogrzeboweHtml,parseGenericHtml,parseSource,
  buildMatchHaystack,rowMatchesPhrases,isIntentionLikeSource,isIntentionLikeRow,isEligibleDeathRow,
  mergeRequiredSources,mergeDuplicateRows,dedupeKeyForRow,resolveJobOutcome,buildFallbackSummaryForHelena,isMeaningfulRow,
  isBlockedByAntiBot,isConfirmedEmpty,isTransientNetworkFailure,daysBetween,classifySourceOutcome,zckConfirmsNoFunerals,
  fetchDetailRows,DETAIL_FETCH_BUDGET_MS
};
