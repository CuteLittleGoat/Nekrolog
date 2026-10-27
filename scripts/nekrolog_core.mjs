import * as cheerio from "cheerio";
import { fetchText, createHttpSession } from "./fetch.mjs";
import { textMatchesAny } from "./normalize.mjs";
import HELENA_GAWIN_PHRASES_JSON from "../Frazy.json" with { type: "json" };

const HELENA_GAWIN_PHRASES = Array.isArray(HELENA_GAWIN_PHRASES_JSON)
  ? HELENA_GAWIN_PHRASES_JSON
  : [];
const DEFAULT_FLAGS = { requires_detail_fetch: false, requires_ocr: false, requires_pdf: false };
const REQUIRED_SOURCES = [
  // Strona pokazuje dzień bieżący; kolejne dni (aż do końca okna pogrzebów, dziś+7)
  // przychodzą z api_url — tym samym zapytaniem, które wysyła kalendarz na stronie.
  { id:"zck_funerals", name:"ZCK Kraków – Porządek pogrzebów", type:"zck_funerals", url:"https://www.zck-krakow.pl/funerals", enabled:true, distance_km:0, list_url:"https://www.zck-krakow.pl/funerals", api_url:"https://www.zck-krakow.pl/funerals/api", days_ahead:7, ...DEFAULT_FLAGS },
  // Lokalizator grobów 12 cmentarzy komunalnych (w tym Rakowickiego). Ewidencja zmienia się
  // co najwyżej raz na dobę, więc ok. 25 zapytań wykonujemy raz na min_interval_hours,
  // a przebieg pośredni korzysta z zapisanego wyniku (data/source_cache.json).
  { id:"zck_lokalizator", name:"ZCK Kraków – Lokalizator grobów", type:"zck_lokalizator", url:"https://www.zck-krakow.pl/locator", enabled:true, distance_km:0, list_url:"https://www.zck-krakow.pl/locator", api_url:"https://www.zck-krakow.pl/locator/api", min_interval_hours:20, ...DEFAULT_FLAGS },
  { id:"puk_pozegnalismy", name:"PUK Kraków – Pożegnaliśmy", type:"puk_pozegnalismy", url:"https://www.puk.krakow.pl/pozegnalismy/", enabled:true, distance_km:4.5, list_url:"https://www.puk.krakow.pl/pozegnalismy/", requires_detail_fetch:true, requires_ocr:false, requires_pdf:false },
  { id:"gabriel_nekrologi", name:"Gabriel24 – Nekrologi", type:"gabriel24_nekrologi", url:"https://www.gabriel24.pl/nekrologi/", enabled:true, distance_km:6.5, list_url:"https://www.gabriel24.pl/nekrologi/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  // Strona listy pokazuje tylko pogrzeby nadchodzące i sprzed 1–2 dni; kanał RSS
  // (feed_url) obejmuje ostatnie 10 nekrologów. Kandydaci z obu dróg są scalani.
  // Gabriel24 tak nie działa: jego robots.txt zabrania */feed.
  { id:"karawan_nekrologi", name:"Karawan – Nekrologi", type:"karawan_nekrologi", url:"https://karawan.pl/nekrologi/", enabled:true, distance_km:7.5, list_url:"https://karawan.pl/nekrologi/", feed_url:"https://karawan.pl/nekrologi/feed/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  // Serwis Salwatora jest wyszukiwarką grobów — strona "Nekrologi" nie zawiera wpisów.
  // known_empty wycisza wykrywanie cichych awarii, żeby nie raportować stałego stanu jako regresji.
  // Strona "Nekrologi" Salwatora jest pusta, ale wyszukiwarka grobów zwraca miejsce
  // pochówku szukanej osoby — i po to źródło zostaje. search_terms to nazwiska
  // odpytywane w bazie; przy zmianie monitorowanej osoby aktualizuj je razem z Frazy.json.
  // Od 2026-10-19 cała strefa grobonet.com (także robots.txt i strona dostawcy) stoi za
  // Cloudflare Managed Challenge — HTTP 403 z każdego toru sieciowego. Blokada dotyczy
  // wszystkich klientów dostawcy, nie tego projektu, i może być przejściowa (szczyt ruchu
  // przed 1 listopada), więc jest tolerowana przez BLOCK_TOLERANCE_DAYS, a potem wraca
  // do rangi błędu i wymaga decyzji: przywrócenie dostępu albo enabled: false.
  { id:"salwator_grobonet", name:"Kraków Salwator – Groby (Grobonet)", type:"grobonet_groby", url:"https://krakowsalwator.grobonet.com/grobonet/start.php", enabled:true, distance_km:5.5, list_url:"https://krakowsalwator.grobonet.com/grobonet/start.php", base_url:"https://krakowsalwator.grobonet.com/grobonet/", search_terms:["Gawin","Dereń"], max_detail_pages:50, external_block_tolerated:true, ...DEFAULT_FLAGS },
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
  // Od 2026-10-02 parafia działa pod jadwiga.eparafia.pl. Stary host swietajadwiga.diecezja.pl
  // przedstawia certyfikat nowej domeny (ERR_TLS_CERT_ALTNAME_INVALID), a po HTTP przekierowuje
  // z powrotem na siebie po HTTPS — nie ma ścieżki, która by do treści doprowadziła.
  // Adres zmieniaj razem z config/sources.json: przy scalaniu wygrywa zapisana konfiguracja.
  { id:"sw_jadwiga_pogrzebowe", name:"Parafia św. Jadwigi – Msze święte pogrzebowe", type:"sw_jadwiga_pogrzebowe", url:"https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe", enabled:true, distance_km:6.5, list_url:"https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe", ...DEFAULT_FLAGS },
  { id:"facebook_parafia_debniki", name:"Facebook – Parafia Dębniki", type:"generic_html", url:"https://www.facebook.com/parafiadebniki/?locale=pl_PL", enabled:false, distance_km:2.5 },
  // ── Parafie do 5 km od ul. Kapelanka ──
  // Listy zmarłych z ogłoszeń parafialnych. Ogłoszenie nie podaje daty zgonu, więc rekord
  // ma tylko datę ogłoszenia (date_reported). Sposób czytania strony: PARISH_PROFILES.
  { id:"podwawelskie_ogloszenia", name:"Parafia MB Fatimskiej (Os. Podwawelskie) – Ogłoszenia", type:"parafia_ogloszenia", url:"https://www.podwawelskie.pl/aktualnosci/ogloszenia-duszpasterskie-1.html", enabled:true, distance_km:0.4, list_url:"https://www.podwawelskie.pl/aktualnosci/ogloszenia-duszpasterskie-1.html", ...DEFAULT_FLAGS },
  { id:"jozef_ogloszenia", name:"Parafia św. Józefa (Podgórze) – Ogłoszenia", type:"parafia_ogloszenia", url:"https://jozef.diecezja.pl/ogloszenia-parafialne/", enabled:true, distance_km:1.8, list_url:"https://jozef.diecezja.pl/ogloszenia-parafialne/", ...DEFAULT_FLAGS },
  { id:"wola_duchacka_ogloszenia", name:"Parafia Zmartwychwstania Pańskiego (Wola Duchacka) – Ogłoszenia", type:"parafia_ogloszenia", url:"https://wola1.xcr.pl/ogloszenia.html", enabled:true, distance_km:3.3, list_url:"https://wola1.xcr.pl/ogloszenia.html", ...DEFAULT_FLAGS },
  { id:"lourdes_ogloszenia", name:"Parafia NMP z Lourdes – Ogłoszenia", type:"parafia_ogloszenia", url:"https://misjonarska.pl/category/ogoszenia/", enabled:true, distance_km:3.7, list_url:"https://misjonarska.pl/category/ogoszenia/", feed_url:"https://misjonarska.pl/category/ogoszenia/feed/", ...DEFAULT_FLAGS },
  // Bieżące ogłoszenia mają co tydzień nowy adres; parser bierze najnowsze linki ze strony głównej.
  { id:"borek_ogloszenia", name:"Parafia MB Zwycięskiej (Borek Fałęcki) – Ogłoszenia", type:"parafia_ogloszenia", url:"https://zwycieska.eparafia.pl/", enabled:true, distance_km:4.6, list_url:"https://zwycieska.eparafia.pl/", ...DEFAULT_FLAGS },
  { id:"kliny_borkowskie_ogloszenia", name:"Parafia św. Jadwigi Królowej (Kliny Borkowskie) – Ogłoszenia i intencje", type:"parafia_ogloszenia", url:"https://kliny.katolicki.eu/index.php/aktualnosci/ogloszenia-i-intencje.html", enabled:true, distance_km:4.6, list_url:"https://kliny.katolicki.eu/index.php/aktualnosci/ogloszenia-i-intencje.html", ...DEFAULT_FLAGS },
  { id:"dabie_odeszli", name:"Parafia św. Stanisława BM (Dąbie) – Odeszli do Pana", type:"parafia_ogloszenia", url:"https://www.parafia.dabiekrakow.pl/biezace/odeszli-do-pana", enabled:true, distance_km:4.8, list_url:"https://www.parafia.dabiekrakow.pl/biezace/odeszli-do-pana", ...DEFAULT_FLAGS },
  { id:"zacisze_ogloszenia", name:"Parafia św. Rafała Kalinowskiego (Kliny Zacisze) – Ogłoszenia", type:"parafia_ogloszenia", url:"https://www.kalinowski.malopolska.pl/2026/03/ogloszenia-parafialne/", enabled:true, distance_km:4.8, list_url:"https://www.kalinowski.malopolska.pl/2026/03/ogloszenia-parafialne/", ...DEFAULT_FLAGS },
  // Intencje mszalne za zmarłych — kategoria „potrzeby”. MB Saletyńskiej (1,4 km) nie ma
  // na liście: runnery GitHub Actions dostają tam Cloudflare Managed Challenge (sonda 2026-10-27).
  { id:"podwawelskie_intencje", name:"Parafia MB Fatimskiej (Os. Podwawelskie) – Intencje tygodnia", type:"parafia_intencje", url:"https://www.podwawelskie.pl/aktualnosci/intencje-mszalne-1.html", enabled:true, distance_km:0.4, list_url:"https://www.podwawelskie.pl/aktualnosci/intencje-mszalne-1.html", ...DEFAULT_FLAGS },
  { id:"kinga_intencje", name:"Parafia św. Kingi – Intencje mszalne", type:"parafia_intencje", url:"https://kinga.diecezja.krakow.pl/ogloszenia/", enabled:true, distance_km:3.4, list_url:"https://kinga.diecezja.krakow.pl/ogloszenia/", ...DEFAULT_FLAGS },
  { id:"plaszow_intencje", name:"Parafia NSPJ (Płaszów) – Intencje mszalne", type:"parafia_intencje", url:"https://www.krakow.sercanie.pl/parafia/intencje-mszy-sw", enabled:true, distance_km:4.2, list_url:"https://www.krakow.sercanie.pl/parafia/intencje-mszy-sw", ...DEFAULT_FLAGS },
  { id:"bronowickie_intencje", name:"Parafia św. Wojciecha (Os. Bronowickie) – Intencje mszalne", type:"parafia_intencje", url:"https://swwojciech.com/category/intencje-mszalne/", enabled:true, distance_km:4.5, list_url:"https://swwojciech.com/category/intencje-mszalne/", feed_url:"https://swwojciech.com/category/intencje-mszalne/feed/", ...DEFAULT_FLAGS },
  { id:"skotniki_intencje", name:"Parafia MB Różańcowej (Skotniki) – Intencje mszalne", type:"parafia_intencje", url:"http://parafiaskotniki.pl/category/intencje-mszy-sw/", enabled:true, distance_km:4.9, list_url:"http://parafiaskotniki.pl/category/intencje-mszy-sw/", feed_url:"http://parafiaskotniki.pl/category/intencje-mszy-sw/feed/", ...DEFAULT_FLAGS },
  { id:"zacisze_intencje", name:"Parafia św. Rafała Kalinowskiego (Kliny Zacisze) – Intencje mszalne", type:"parafia_intencje", url:"https://www.kalinowski.malopolska.pl/ogloszenia-parafialne-2/intencje/", enabled:true, distance_km:4.8, list_url:"https://www.kalinowski.malopolska.pl/ogloszenia-parafialne-2/intencje/", ...DEFAULT_FLAGS },
  // Lista zmarłych parafian z terminami mszy zamówionych po pogrzebie: daje jednocześnie
  // wzmiankę o zgonie i intencje. Podstrona roku jest wybierana ze strony listy.
  { id:"borek_intencje_pogrzebowe", name:"Parafia MB Zwycięskiej (Borek Fałęcki) – Intencje pogrzebowe", type:"eparafia_intencje_pogrzebowe", url:"https://zwycieska.eparafia.pl/intencje-pogrzebowe(3)", enabled:true, distance_km:4.6, list_url:"https://zwycieska.eparafia.pl/intencje-pogrzebowe(3)", ...DEFAULT_FLAGS },
  // Publiczny plik ewidencji grobów cmentarza parafialnego w Borku Fałęckim (ten sam, który
  // pobiera wyszukiwarka „Znajdź grób”). search_terms aktualizuj razem z Frazy.json.
  { id:"borek_ewidencja_grobow", name:"Cmentarz Borek Fałęcki – Ewidencja grobów", type:"eparafia_ewidencja_grobow", url:"https://zwycieska.eparafia.pl/znajdz-grob", enabled:true, distance_km:3.2, list_url:"https://zwycieska.eparafia.pl/znajdz-grob", data_url:"https://zwycieska.eparafia.pl/clients/_krakow_mbzwyciezkiej/_upload/strona_3955/pio_2480.txt", search_terms:["Gawin","Dereń"], ...DEFAULT_FLAGS }
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
// Różnica w dniach między datami ISO (ujemna dla dat przeszłych względem referenceIso).
const daysFromRef=(iso,referenceIso)=>{const a=Date.parse(`${iso}T00:00:00Z`),b=Date.parse(`${referenceIso}T00:00:00Z`); return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/86400000):null;};

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

// extraCandidates: druga, niezależna droga do tych samych stron szczegółowych (kanał RSS).
// Wystarczy, że odpowie jedna z dróg — awaria drugiej trafia tylko do diagnostyki.
async function parseByListAndDetails(source,forceFuneral,listParser,detailParser,{extraCandidates=null,fetcher=fetchText}={}){
  const r=await fetcher(source.list_url||source.url);
  const extra=extraCandidates?await extraCandidates(source,fetcher):null;
  const extraLinks=extra?.links||[];
  if(!r.ok&&!extraLinks.length) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const links=uniq([...(r.ok?listParser(r.text,source):[]),...extraLinks],x=>x.url).slice(0,source.max_detail_pages||50);
  const via=extra?{feed_links:extraLinks.length,...(extra.error?{feed_error:extra.error}:{}),...(!r.ok?{list_error:r.error||`HTTP ${r.status}`}:{})}:{};
  if(!links.length) return {rows:[],error:`${source.name}: nie znaleziono linków szczegółów`,diagnostics:{http_status:r.status,...via,candidate_links:0,accepted_rows:0,parser_status:'parser_broken'}};
  const {rows,visited,truncated}=await fetchDetailRows(source,links,(text,url)=>detailParser(text,source,url,forceFuneral),fetcher);
  const base={http_status:r.status,...via,candidate_links:links.length,visited_links:visited,partial:truncated};
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

// Pozycje kanału RSS 2.0 (WordPress). W trybie HTML <link> jest elementem pustym, więc
// dokument trzeba czytać jako XML. content:encoded niesie pełną treść wpisu.
function parseRssItems(xml){
  const $=cheerio.load(xml,{xml:true});
  return $('item').map((_,it)=>{
    const $it=$(it);
    const child=(name)=>$it.children().filter((_,el)=>el.name===name).first();
    return {
      title:clean(child('title').text()),
      link:clean(child('link').text()),
      pubDate:clean(child('pubDate').text()),
      html:child('content:encoded').text()||child('description').text()||''
    };
  }).get();
}
const parseKarawanFeedXml=(xml)=>uniq(parseRssItems(xml).map(i=>i.link).filter(u=>KARAWAN_DETAIL.test(u)).map(url=>({url})),x=>x.url);
async function karawanFeedCandidates(source,fetcher=fetchText){
  if(!source.feed_url) return null;
  const r=await fetcher(source.feed_url);
  if(!r.ok) return {links:[],error:r.error||`HTTP ${r.status}`};
  return {links:parseKarawanFeedXml(r.text),error:null};
}

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
// fallbackDate: dzień, o który pytano kalendarz. Odpowiedź API zawiera nagłówek z datą
// tak jak strona, ale gdyby go zabrakło, właściwym dniem jest ten z zapytania — nie
// dzień pobrania, który dla jutrzejszego porządku byłby po prostu błędny.
function parseZckFuneralsHtml(text,source,{fallbackDate=null}={}){
  const $=cheerio.load(text);
  const headings=$('h4 strong').map((_,e)=>clean($(e).text())).get();
  const pageDate=headings.map(firstIsoDate).find(Boolean)||fallbackDate||null;
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

// Token CSRF frameworka Yii z nagłówka strony. Serwer wydaje go każdemu odwiedzającemu
// razem z ciasteczkiem _frontendCSRF, a kalendarz i lokalizator na stronie odsyłają oba
// przy każdym zapytaniu — sesja HTTP robi dokładnie to samo.
function zckCsrfToken(html){
  const $=cheerio.load(html);
  return clean($('meta[name="csrf-token"]').attr('content'))||null;
}
const addDaysIso=(iso,days)=>{
  const d=new Date(`${iso}T00:00:00Z`);
  if(Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
};
// Odstęp między kolejnymi zapytaniami do jednego serwisu: ruch ma przypominać
// człowieka przeklikującego kalendarz, a nie serię strzałów.
const ZCK_REQUEST_GAP_MS=400;
const pause=(ms)=>ms>0?new Promise((resolve)=>setTimeout(resolve,ms)):Promise.resolve();
const zckPageDate=(html)=>{const $=cheerio.load(html); return $('h4 strong').map((_,e)=>firstIsoDate(clean($(e).text()))).get().find(Boolean)||null;};
// Seria zapytań do jednego serwisu musi mieć budżet czasu, tak jak pętla stron
// szczegółowych: 26 zapytań lokalizatora × 3 próby × 20 s to ponad 20 minut, a przebieg
// ubity limitem workflow nie zapisuje ani danych, ani statusu. Dwa kolejne zapytania
// bez żadnej odpowiedzi HTTP przerywają serię — kolejne zachowają się tak samo.
function requestSeriesGuard(budgetMs){
  const deadline=Date.now()+budgetMs;
  let networkFailures=0;
  return {
    stopReason(){
      if(Date.now()>=deadline) return 'timeout_budget';
      if(networkFailures>=2) return 'network';
      return null;
    },
    record(status){ networkFailures=status===0?networkFailures+1:0; }
  };
}
const ZCK_API_BUDGET_MS=120000;
function zckApiHeaders(token,referer){
  return {
    accept:'application/json, text/html;q=0.9, */*;q=0.8',
    'content-type':'application/json; charset=utf-8',
    'x-csrf-token':token,
    'x-requested-with':'XMLHttpRequest',
    referer
  };
}

// Dzień bieżący ze strony, kolejne dni (do końca okna pogrzebów) z API kalendarza.
// Pogrzeb na Rakowickim widać dzięki temu w dniu wpisania do grafiku, a nie dopiero
// w dniu ceremonii. Awaria API nie kasuje dnia bieżącego: jego rekordy zostają,
// a błąd jest zgłaszany dopiero, gdy nie udało się pobrać żadnego kolejnego dnia.
async function parseZckFunerals(source,{session=createHttpSession(),gapMs=ZCK_REQUEST_GAP_MS,budgetMs=ZCK_API_BUDGET_MS}={}){
  const pageUrl=source.list_url||source.url;
  const r=await session.request(pageUrl);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const rows=[...parseZckFuneralsHtml(r.text,source)];
  const confirmations=[zckConfirmsNoFunerals(r.text)];
  const daysAhead=Math.max(0,Number(source.days_ahead??0));
  const base={http_status:r.status,days_requested:daysAhead};
  if(!daysAhead||!source.api_url){
    const status=rows.length?'ok':(confirmations[0]?'empty_confirmed':'empty');
    return {rows,error:null,diagnostics:{...base,accepted_rows:rows.length,parser_status:status}};
  }

  const token=zckCsrfToken(r.text);
  const startIso=zckPageDate(r.text)||todayIso();
  const failed=[];
  let lastApiStatus=0;
  let stopped=null;
  if(token){
    const guard=requestSeriesGuard(budgetMs);
    for(let d=1;d<=daysAhead;d+=1){
      const day=addDaysIso(startIso,d);
      stopped=stopped||guard.stopReason();
      if(stopped){ failed.push(`${day}: ${stopped==='timeout_budget'?'wyczerpany budżet czasu':'przerwano po zerwanych połączeniach'}`); continue; }
      await pause(gapMs);
      const a=await session.request(source.api_url,{method:'POST',headers:zckApiHeaders(token,pageUrl),body:JSON.stringify(day)});
      guard.record(a.status);
      lastApiStatus=a.status;
      if(!a.ok){ failed.push(`${day}: ${a.error||`HTTP ${a.status}`}`); continue; }
      rows.push(...parseZckFuneralsHtml(a.text,source,{fallbackDate:day}));
      confirmations.push(zckConfirmsNoFunerals(a.text));
    }
  }
  const deduped=uniq(rows,x=>`${x.name}|${x.date_funeral}|${x.time_funeral}|${x.place}`);
  const diagnostics={...base,days_fetched:confirmations.length-1,days_failed:failed.length,accepted_rows:deduped.length};
  if(!token||failed.length===daysAhead){
    // Kolejne dni są niedostępne, ale dzień bieżący został odczytany — jego rekordy
    // zostają. Brak odpowiedzi HTTP (status 0) zachowuje tolerancję awarii sieciowej.
    const reason=token?`${failed.length}/${daysAhead} dni bez odpowiedzi API (ostatnio: ${failed[failed.length-1]})`:'brak tokenu CSRF na stronie';
    const status=!token?'api_error':stopped==='timeout_budget'?'timeout_budget':lastApiStatus===0?'http_error':'api_error';
    return {rows:deduped,error:`ZCK: porządek pogrzebów na kolejne dni niedostępny — ${reason}`,diagnostics:{...diagnostics,page_http_status:r.status,api_status:lastApiStatus,http_status:token?lastApiStatus:r.status,parser_status:status}};
  }
  const status=deduped.length?'ok':(confirmations.every(Boolean)&&!failed.length?'empty_confirmed':'empty');
  return {rows:deduped,error:null,diagnostics:{...diagnostics,...(failed.length?{days_failed_detail:failed}:{}),parser_status:status}};
}

// ─────────────────────────── ZCK: lokalizator grobów ───────────────────────────
// Lokalizator obejmuje 12 cmentarzy komunalnych, w tym Rakowicki. Przepływ jak
// w przeglądarce: strona z tokenem CSRF, potem POST /locator/api z imieniem, nazwiskiem
// i cmentarzem. HTTP 404 oznacza „brak wyników”. Nazwisko jest dopasowywane jako
// fragment, więc „Gawin” obejmuje też „Gawin-Dereń” i „de Gawin-Niesłowska”.
// Każdy pochowany jest osobnym wpisem; pole extra wymienia pozostałe osoby z grobu.
//
// Dane zależne od monitorowanej osoby — przy jej zmianie aktualizuj je razem z Frazy.json:
// ZCK_LOCATOR_QUERIES (kogo szukać), ZCK_LOCATOR_BASELINE (znane wpisy wyłączone
// z alertów), ZCK_WATCHED_GRAVES (obserwowany grób).
const ZCK_LOCATOR_QUERIES=[{name:'Helena',surname:'Gawin'},{name:'Helena',surname:'Dereń'}];
// 14 = Cmentarz Komunalny w Podgórkach Tynieckich: lokalizator odsyła tam do Grobonetu.
const ZCK_LOCATOR_SKIP_GRAVEYARDS=new Set(['14']);
// Pochówki pasujące do zapytań, znane przed wdrożeniem (przegląd 12 cmentarzy, 2026-10-27).
// Trafienia fraz są liczone bez okien czasowych, więc bez tej listy pierwszy przebieg
// zgłosiłby na Discordzie osoby zmarłe w 1942, 1979, 1994 i 2003 r. Wpis z listy nie trafia
// do rekordów. Drugie zabezpieczenie: ZCK_LOCATOR_HISTORICAL_DAYS niżej.
const ZCK_LOCATOR_BASELINE=[
  {graveyard:'2',name:'HELENA',surname:'GAWIN',birthday:'13.08.1931',date:'20.10.2003',grave:'LXXII/20/14'},
  {graveyard:'2',name:'HELENA',surname:'DE GAWIN-NIESŁOWSKA',birthday:'16.12.1911',date:'11.11.1994',grave:'XXX/4/16'},
  {graveyard:'2',name:'HELENA',surname:'GAWIN',birthday:'17.04.1929',date:'06.09.1979',grave:'LXIII/2/30'},
  {graveyard:'8',name:'HELENA',surname:'GAWIN',birthday:'02.02.1868',date:'20.12.1942',grave:'F/7/13'}
];
// Wpis z datą zgonu sprzed ponad roku nie może dotyczyć monitorowanej (żyjącej) osoby.
// Taki wpis spoza listy bazowej — np. archiwalny pochówek dopisany do ewidencji — jest
// liczony w diagnostyce, ale nie trafia do rekordów, więc nie wywoła alarmu.
const ZCK_LOCATOR_HISTORICAL_DAYS=365;
// Grób Adama Gawina (Rakowicki, kw. LXXIV, rz. 7, m. 11). Nowa osoba wśród
// współpochowanych to najsilniejszy sygnał pochówku w tym grobie, dlatego taki wpis
// jest zgłaszany zawsze (force_match), także gdy nazwisko nie pasuje do fraz.
const ZCK_WATCHED_GRAVES=[
  {graveyard:'2',name:'Adam',surname:'Gawin',birthday:'27.12.1939',date:'26.06.2012',grave:'LXXIV/7/11',
    known_extra:[{name:'HENRYK',surname:'GAWIN',birthday:'28.12.1911',date:'27.06.1962'}]}
];

const zckGraveId=(rec)=>[rec?.grave_quarter,rec?.grave_row,rec?.grave_spot].map(v=>clean(v)).join('/');
const zckPersonKey=(p)=>[p?.name,p?.surname,p?.birthday,p?.date].map(v=>clean(v).toLocaleUpperCase('pl-PL')).join('|');
const zckRecordKey=(graveyard,rec)=>`${graveyard}|${zckPersonKey(rec)}|${zckGraveId(rec)}`;
const ZCK_BASELINE_KEYS=new Set(ZCK_LOCATOR_BASELINE.map(b=>`${b.graveyard}|${zckPersonKey(b)}|${b.grave}`));
const zckPlace=(cemetery,rec)=>`${cemetery}, kw. ${clean(rec.grave_quarter)}, rz. ${clean(rec.grave_row)}, m. ${clean(rec.grave_spot)}`;
const zckPersonName=(p)=>normalizePersonName(`${clean(p?.name)} ${clean(p?.surname)}`);

// Cmentarze z listy wyboru na stronie lokalizatora — nowy cmentarz komunalny zostanie
// objęty bez zmiany kodu.
function parseZckGraveyards(html){
  const $=cheerio.load(html);
  return $('option[value]').map((_,o)=>({id:clean($(o).attr('value')),name:clean($(o).text())})).get()
    .filter(g=>/^\d+$/.test(g.id)&&/cmentarz/i.test(g.name)&&!ZCK_LOCATOR_SKIP_GRAVEYARDS.has(g.id));
}

function zckGraveRow(source,cemetery,rec,{note,force=false,reason=null}={}){
  const row={
    kind:'grave', name:zckPersonName(rec), date_death:parsePolishDateToIso(rec.date||'')||null,
    date_birth:parsePolishDateToIso(rec.birthday||'')||null, date_funeral:null, time_funeral:null,
    place:zckPlace(cemetery,rec), source_id:source.id, source_name:source.name, url:source.url, source_url:source.url,
    note:clean(note).slice(0,260)
  };
  if(force){ row.force_match=true; row.match_reason=reason; }
  return validateParsedRow(row)?row:null;
}

// Zamienia odpowiedzi lokalizatora na rekordy. Wyniki zapytań o osoby trafiają do rekordów
// tylko wtedy, gdy nie ma ich na liście bazowej. Obserwowany grób daje jeden rekord
// informacyjny i osobny, zawsze zgłaszany rekord dla każdej nowej osoby w tym grobie.
function zckLocatorRows(source,results,{baselineKeys=ZCK_BASELINE_KEYS,watched=ZCK_WATCHED_GRAVES,referenceIso=todayIso()}={}){
  const rows=[];
  const problems=[];
  let baselineHits=0,historical=0;
  for(const res of results.filter(r=>!r.watch)){
    for(const rec of res.records){
      if(baselineKeys.has(zckRecordKey(res.graveyard,rec))){ baselineHits+=1; continue; }
      const died=parsePolishDateToIso(rec.date||'');
      const age=died?daysFromRef(died,referenceIso):null;
      if(age!==null&&-age>ZCK_LOCATOR_HISTORICAL_DAYS){ historical+=1; continue; }
      const extras=Array.isArray(rec.extra)?rec.extra.length:0;
      // Współpochowanych liczymy, ale nie wymieniamy: nazwisko z extra (np. historyczna
      // Helena Gawin w cudzym grobie) dawałoby trafienie fraz na rekordzie innej osoby.
      const row=zckGraveRow(source,res.cemetery,rec,{note:`Lokalizator grobów ZCK (zapytanie: ${res.query.name} ${res.query.surname}); ur. ${clean(rec.birthday)||'?'}; zm. ${clean(rec.date)||'?'}; w grobie łącznie osób: ${extras+1}`});
      if(row) rows.push(row);
    }
  }
  for(const w of watched){
    const res=results.find(r=>r.watch===w);
    if(!res) continue;
    const grave=res.records.find(rec=>zckGraveId(rec)===w.grave&&zckPersonKey(rec)===zckPersonKey({name:w.name.toLocaleUpperCase('pl-PL'),surname:w.surname.toLocaleUpperCase('pl-PL'),birthday:w.birthday,date:w.date}));
    if(!grave){ problems.push(`obserwowany grób ${w.name} ${w.surname} (${res.cemetery}, ${w.grave}) nie został znaleziony`); continue; }
    const known=new Set((w.known_extra||[]).map(zckPersonKey));
    const extras=Array.isArray(grave.extra)?grave.extra:[];
    const knownList=extras.filter(e=>known.has(zckPersonKey(e))).map(e=>`${zckPersonName(e)} (${clean(e.birthday)}–${clean(e.date)})`);
    const info=zckGraveRow(source,res.cemetery,grave,{note:`Obserwowany grób; współpochowani: ${knownList.join(', ')||'brak'}`});
    if(info) rows.push(info);
    for(const e of extras.filter(e=>!known.has(zckPersonKey(e)))){
      const reason=`nowa osoba w obserwowanym grobie ${w.name} ${w.surname} (${res.cemetery}, ${w.grave})`;
      const row=zckGraveRow(source,res.cemetery,{...e,grave_quarter:grave.grave_quarter,grave_row:grave.grave_row,grave_spot:grave.grave_spot},
        {note:`Nowa osoba w grobie ${w.name} ${w.surname} — sprawdź, czy to monitorowana osoba; ur. ${clean(e.birthday)||'?'}; zm. ${clean(e.date)||'?'}`,force:true,reason});
      if(row) rows.push(row);
    }
  }
  const deduped=uniq(rows,r=>`${r.place}|${r.name}|${r.date_birth||''}|${r.date_death||''}`);
  return {rows:deduped,baselineHits,historical,problems};
}

async function parseZckLokalizator(source,{session=createHttpSession(),gapMs=ZCK_REQUEST_GAP_MS,budgetMs=ZCK_API_BUDGET_MS,queries=ZCK_LOCATOR_QUERIES,watched=ZCK_WATCHED_GRAVES,referenceIso=todayIso()}={}){
  const pageUrl=source.list_url||source.url;
  const r=await session.request(pageUrl);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const token=zckCsrfToken(r.text);
  const graveyards=parseZckGraveyards(r.text);
  if(!token||!graveyards.length) return {rows:[],error:`${source.name}: ${token?'brak listy cmentarzy':'brak tokenu CSRF'} na stronie lokalizatora`,diagnostics:{http_status:r.status,parser_status:'parser_broken'}};
  const nameOf=(id)=>graveyards.find(g=>g.id===id)?.name||`cmentarz ${id}`;
  const plan=[
    ...queries.flatMap(q=>graveyards.map(g=>({query:q,graveyard:g.id}))),
    ...watched.map(w=>({query:{name:w.name,surname:w.surname},graveyard:w.graveyard,watch:w}))
  ];
  const results=[];
  const failed=[];
  const failedStatuses=[];
  const guard=requestSeriesGuard(budgetMs);
  let stopped=null;
  for(const p of plan){
    stopped=stopped||guard.stopReason();
    if(stopped){ failed.push(`${p.query.name} ${p.query.surname} @ ${p.graveyard}: ${stopped==='timeout_budget'?'wyczerpany budżet czasu':'przerwano po zerwanych połączeniach'}`); failedStatuses.push(0); continue; }
    await pause(gapMs);
    const body=JSON.stringify({name:p.query.name,surname:p.query.surname,birthdate:'',deathdate:'',graveyard:p.graveyard});
    const a=await session.request(source.api_url,{method:'POST',headers:zckApiHeaders(token,pageUrl),body});
    guard.record(a.status);
    if(a.status===404){ results.push({...p,cemetery:nameOf(p.graveyard),records:[]}); continue; }
    let records=null;
    try{ records=a.ok?JSON.parse(a.text):null; }catch{ records=null; }
    if(!Array.isArray(records)){ failed.push(`${p.query.name} ${p.query.surname} @ ${p.graveyard}: ${a.ok?'odpowiedź nie jest listą':a.error||`HTTP ${a.status}`}`); failedStatuses.push(a.status); continue; }
    results.push({...p,cemetery:nameOf(p.graveyard),records});
  }
  const {rows,baselineHits,historical,problems}=zckLocatorRows(source,results,{watched,referenceIso});
  const diagnostics={http_status:r.status,graveyards:graveyards.length,queries:plan.length,queries_failed:failed.length,baseline_matched:baselineHits,historical_skipped:historical,accepted_rows:rows.length};
  if(failed.length){
    // Niepełny przegląd to błąd: brak odpowiedzi dla jednego cmentarza mógłby ukryć
    // właśnie ten pochówek, na który czekamy. Status 0 zachowuje tolerancję sieciową.
    const allNetwork=failedStatuses.every(s=>s===0);
    const status=stopped==='timeout_budget'?'timeout_budget':allNetwork?'http_error':'api_error';
    return {rows,error:`${source.name}: ${failed.length}/${plan.length} zapytań bez poprawnej odpowiedzi (np. ${failed[0]})`,diagnostics:{...diagnostics,http_status:allNetwork?0:failedStatuses.find(s=>s!==0),parser_status:status}};
  }
  if(problems.length) return {rows,error:`${source.name}: ${problems.join('; ')}`,diagnostics:{...diagnostics,parser_status:'parser_broken'}};
  return {rows,error:null,diagnostics:{...diagnostics,parser_status:rows.length?'ok':'empty'}};
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
// Karta PUK podaje tylko datę pogrzebu. Godzinę i cmentarz zawiera strona klepsydry
// (eKlepsydra), do której PUK sam linkuje: blok „Pogrzeb / Data / Godzina / Miejsce”.
function parseEklepsydraEventsHtml(html){
  const $=cheerio.load(html);
  return $('[id^="event_"]').filter((_,e)=>/^event_\d+$/.test($(e).attr('id')||'')).map((_,e)=>{
    const lines=extractBlockText($,$(e)).split('\n').map(clean).filter(Boolean);
    const after=(label)=>{const i=lines.findIndex(l=>l.toLowerCase()===label); return i>=0?lines[i+1]||null:null;};
    return {
      type:lines[0]||'',
      date:parsePolishDateToIso(after('data')||''),
      time:parseTime(after('godzina')||''),
      place:clean(after('miejsce')),
      address:clean($(e).find('a[href*="maps.google"]').text())
    };
  }).get();
}
// Szczegóły pobieramy wyłącznie dla nadchodzących pogrzebów i tylko raz na kartę —
// wynik zostaje w stanie źródła (data/source_cache.json). Bez tego każdy przebieg
// wysyłałby do eKlepsydry kilkadziesiąt żądań o te same karty.
const PUK_DETAILS_PER_RUN=12;
async function enrichPukFromDetails(source,rows,{state=null,fetcher=fetchText,referenceIso=todayIso(),gapMs=ZCK_REQUEST_GAP_MS,budgetMs=Number(source.detail_budget_ms)||DETAIL_FETCH_BUDGET_MS}={}){
  const known=state?.details&&typeof state.details==='object'?state.details:{};
  // Zapisane szczegóły zostają, dopóki karta jest na liście PUK; pobierane są tylko
  // karty z pogrzebem od dziś wzwyż.
  const cards=uniq(rows.filter(r=>r.kind==='funeral'&&r.url!==source.url).map(r=>r.url),u=>u);
  const upcoming=new Set(rows.filter(r=>r.kind==='funeral'&&(r.date_funeral||'')>=referenceIso).map(r=>r.url));
  const details={};
  const guard=requestSeriesGuard(budgetMs);
  let fetched=0;
  for(const url of cards){
    if(known[url]){ details[url]=known[url]; continue; }
    // Szczegóły są uzupełnieniem: wyczerpany budżet przerywa ich pobieranie bez błędu,
    // a pominięte karty zostaną pobrane w kolejnym przebiegu.
    if(!upcoming.has(url)||fetched>=PUK_DETAILS_PER_RUN||guard.stopReason()) continue;
    if(fetched) await pause(gapMs);
    fetched+=1;
    const d=await fetcher(url);
    guard.record(d.status);
    if(!d.ok) continue;
    const ev=parseEklepsydraEventsHtml(d.text).find(e=>/pogrzeb/i.test(e.type))||null;
    details[url]=ev?{place:ev.place||null,address:ev.address||null,time:ev.time||null,date:ev.date||null}:{place:null,address:null,time:null,date:null};
  }
  for(const row of rows){
    const d=details[row.url];
    if(!d) continue;
    if(d.place) row.place=clean(`${d.place}${d.address?` (${d.address})`:''}`).slice(0,120);
    if(row.kind==='funeral'&&!row.time_funeral&&d.time&&(!d.date||d.date===row.date_funeral)) row.time_funeral=d.time;
  }
  return {details,fetched};
}
async function parsePukPozegnalismy(source,{state=null,fetcher=fetchText,referenceIso=todayIso(),gapMs=ZCK_REQUEST_GAP_MS}={}){
  const r=await fetcher(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const rows=parsePukPozegnalismyHtml(r.text,source);
  const {details,fetched}=await enrichPukFromDetails(source,rows,{state,fetcher,referenceIso,gapMs});
  return {rows,state:{details},error:null,diagnostics:{http_status:r.status,detail_pages:fetched,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
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
const parseKarawanNekrologi=(s,{fetcher=fetchText}={})=>parseByListAndDetails(s,false,parseKarawanNekrologiHtml,parseKarawanDetailHtml,{extraCandidates:karawanFeedCandidates,fetcher});

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

// ─────────────────────────── Parafie: ogłoszenia i intencje ───────────────────────────
// Jeden parser dla stron parafii do 5 km od ul. Kapelanka. Witryny działają na różnych
// systemach (WordPress, Joomla, eParafia, własne CMS), więc to, skąd wziąć dokument i gdzie
// stoi data ogłoszenia, opisuje profil źródła (PARISH_PROFILES), a nie osobny kod.
//
// Prywatność: repozytorium i GitHub Pages są publiczne, a listy parafialne zawierają dane
// osób żyjących — adresy („z ul. …”) i zamawiających msze („od …”). Rekord przenosi
// wyłącznie imię i nazwisko zmarłego (w formie z ogłoszenia — bywa to biernik: „Bożenę”;
// Frazy.json ma formy odmienione) albo treść intencji obciętą przed zamawiającym.
// Notatka rekordu jest budowana od zera, nigdy z surowej linii ogłoszenia.
const PARISH_MAX_AGE_DAYS=60;          // starsze ogłoszenia (archiwa) są pomijane
const INTENTION_WINDOW={past:7,ahead:31};

// Rok dla daty bez roku („25.10”, „18 sierpnia”): harmonogram dotyczy najbliższych
// tygodni, więc grudzień widziany w styczniu należy do roku poprzedniego, a styczeń
// widziany w grudniu — do następnego.
function inferYear(month,referenceIso){
  const refYear=Number(String(referenceIso).slice(0,4));
  const refMonth=Number(String(referenceIso).slice(5,7));
  if(refMonth===12&&month===1) return refYear+1;
  if(refMonth===1&&month===12) return refYear-1;
  return refYear;
}
// Daty z nagłówków ogłoszeń i intencji: „25.10.2026”, „1.02.2026”, „2025.11.30”,
// „2026-10-25”, „25 – 31.10. 2026” i „27.09 – 3.10.2026” (tydzień — liczy się pierwszy
// dzień), „8 maja 2026”, a bez roku: „25.10”, „18 sierpnia”.
function parseLooseDate(raw,referenceIso=todayIso()){
  const t=clean(raw).toLowerCase();
  let m=t.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/); if(m) return isoFromParts(m[1],m[2],m[3]);
  m=t.match(/(?<!\d)(\d{4})\.(\d{1,2})\.(\d{1,2})(?!\d)/); if(m) return isoFromParts(m[1],m[2],m[3]);
  m=t.match(/(?<!\d)(\d{1,2})(?:\.(\d{1,2}))?\.?\s*(?:[-–—]|do)\s*(\d{1,2})\.(\d{1,2})\.?\s*(\d{4})/u);
  if(m){
    const endMonth=Number(m[4]);
    const startMonth=m[2]?Number(m[2]):endMonth;
    return isoFromParts(startMonth>endMonth?Number(m[5])-1:m[5],startMonth,m[1]);
  }
  m=t.match(/(?<!\d)(\d{1,2})\.(\d{1,2})\.\s*(\d{4})(?!\d)/); if(m) return isoFromParts(m[3],m[2],m[1]);
  m=t.match(/(?<!\d)(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})(?!\d)/u); if(m&&monthMap[m[2]]) return isoFromParts(m[3],monthMap[m[2]],m[1]);
  m=t.match(/(?<!\d)(\d{1,2})\.(\d{1,2})(?![\d])/); if(m) return isoFromParts(inferYear(Number(m[2]),referenceIso),m[2],m[1]);
  m=t.match(/(?<!\d)(\d{1,2})\s+([a-ząćęłńóśźż]+)/u); if(m&&monthMap[m[2]]) return isoFromParts(inferYear(monthMap[m[2]],referenceIso),monthMap[m[2]],m[1]);
  return null;
}

// ── Listy zmarłych („W minionym tygodniu pożegnaliśmy: …”) ──
const DEATH_LIST_TRIGGER=/(po[żz]egnali[śs]my|po[żz]egnamy|odesz[łl]a|odeszli|odszed[łl]|zmar[łl]a?\s+(?:nasz|nasza)\s+parafian)/iu;
// Znaczniki zmarłego: „śp.”, „Ś.p”, „ś.p.”, „+”, „++”, „†”. Ujednolicane do „†”, które
// rozdziela nazwiska. \b nie zachodzi przy „ś”, stąd jawne granice.
const DEATH_MARKER=/(^|[\s,;:(„"])(?:ś\.?\s?p\.?|s\.?\s?p\.?)(?=[\s\p{Lu}+†]|$)/giu;
// Koniec zdania listy: kropka przed wielką literą, ale nie po skrócie („ul. Ludowej”).
const LIST_SENTENCE_END=/(?<![\s(](?:ul|al|Al|os|pl|św|ks|Ks|bp|o|im|nr|r|ur|zm|godz))\.(?=\s+[\p{Lu}„"])|…|\.\.\./u;
const NAME_TOKEN=/^\p{Lu}[\p{L}'’]*(?:-\p{Lu}[\p{L}'’]*)*$/u;
// Tytuły przed nazwiskiem są pomijane („śp. ks. Jan …”), a nie kończą odczytu.
const NAME_TITLES=new Set(['ks','ksiądz','księdza','biskup','biskupa','bp','o','ojciec','ojca','s','siostra','siostrę','brat','brata','pan','pani','pana','panią','dr','prof','inż']);
// Wyrazy pisane wielką literą, które nie są częścią nazwiska — kończą odczyt.
const NAME_STOP=new Set(['pomódlmy','polecajmy','polećmy','polecamy','wieczny','wieczne','jej','jego','ich','msza','pogrzeb','cmentarz','cmentarzu','parafia','parafii','rok','dobry']);

function leadingName(segment){
  const out=[];
  for(const raw of clean(segment).split(' ')){
    const tok=raw.replace(/^[„"'(]+/,'').replace(/[.,;:!?…"”')]+$/,'');
    const low=tok.toLocaleLowerCase('pl-PL');
    if(!out.length&&NAME_TITLES.has(low)) continue;
    if(!tok||!NAME_TOKEN.test(tok)||NAME_STOP.has(low)) break;
    out.push(tok);
    if(/[.,;:!?…]$/.test(raw)||out.length>=4) break;
  }
  return out.length>=2?out.join(' '):null;
}
// Nazwiska z fragmentu listy. Z każdego segmentu bierzemy tylko początkowy ciąg wyrazów
// pisanych wielką literą — adres („z ul. Ludowej”, „– ul. Widok 14”), wiek i reszta
// zdania zostają za tą granicą i nie trafiają do rekordu.
function extractDeathNames(text){
  const marked=` ${text} `.replace(DEATH_MARKER,'$1 † ').replace(/[+†]+/g,' † ');
  const end=marked.search(LIST_SENTENCE_END);
  const list=end>=0?marked.slice(0,end):marked;
  return uniq(list.split(/\s*†\s*|[,;]|\s+i\s+|\s+oraz\s+/u).map(leadingName).filter(Boolean).map(normalizePersonName),n=>n);
}
const DEATH_ENTRY_START=/^\s*(?:[+†]|ś\.?\s?p\.?\s|śp\.?)/iu;
// Zwraca [{name, line}] — line to indeks linii, z której pochodzi nazwisko (do dat nagłówków).
function findDeathListNames(lines,{stopAt=null}={}){
  const out=[];
  for(let i=0;i<lines.length;i+=1){
    const m=lines[i].match(DEATH_LIST_TRIGGER);
    if(!m) continue;
    const inline=extractDeathNames(lines[i].slice(m.index+m[0].length));
    out.push(...inline.map(name=>({name,line:i})));
    // Lista pionowa: kolejne linie ze znacznikiem zmarłego, a po nagłówku zakończonym
    // dwukropkiem (bez nazwisk w tej samej linii) — także same nazwiska.
    const header=!inline.length&&/:\s*$/.test(lines[i]);
    let j=i+1;
    for(;j<lines.length&&j<=i+200;j+=1){
      const next=lines[j];
      if((stopAt&&stopAt.test(next))||DEATH_LIST_TRIGGER.test(next)) break;
      const entry=DEATH_ENTRY_START.test(next);
      if(!entry&&!header) break;
      const names=extractDeathNames(entry?next:`† ${next}`);
      if(!names.length) break;
      out.push(...names.map(name=>({name,line:j})));
    }
    i=j-1;
  }
  return out;
}

// ── Intencje mszalne („18:00 + Jan Kowalski”) ──
const INTENTION_WEEKDAY=/^(?:\d{1,2}\.\s*|[IVXLC]+\.?\s+)?(?:PONIEDZIA[ŁL]EK|WTOREK|[ŚS]RODA|CZWARTEK|PI[ĄA]TEK|SOBOTA|NIEDZIELA)/iu;
const INTENTION_TIME=/^(\d{1,2})[.:](\d{2})(?:\s*[-–—:]\s*|\s+|$)(.*)$/u;
const DECEASED_INTENTION=/^(?:za\s+)?(?:\+{1,3}\s*|†{1,3}\s*|ś\.?\s?p\.?\s+|śp\.?\s+)/iu;
// Zamawiający i intencje za żyjących są obcinane: to dane osób żyjących.
const INTENTION_ORDERED_BY=/(?:\s*[(\[]\s*|\s*[,;]\s*|\s+[-–—]\s+|\s+)od\s+\S/iu;
const INTENTION_LIVING_TAIL=/\s*[,;]?\s+(?:oraz|i|a\s+także)\s+(?:o\s+(?:zdrowie|błog|łask|opiek|dar|potrzebn|szczęśliw|nawróc)|w\s+int(?:\.|encji)|dziękczynn|z\s+podziękow|dla\s)/iu;
function cleanIntentionText(text){
  let t=clean(text).replace(DECEASED_INTENTION,'');
  for(const re of [INTENTION_ORDERED_BY,INTENTION_LIVING_TAIL]){ const at=t.search(re); if(at>=0) t=t.slice(0,at); }
  // Kropka końcowa znika tylko po pełnym wyrazie — skrót („18 r. śm.”) ją zachowuje.
  return clean(t.replace(/[\s,;:–—-]+$/u,'').replace(/(\p{L}{4,})\.$/u,'$1')).slice(0,180);
}
// Nagłówek dnia: „NIEDZIELA 25.10”, „Niedziela, 25.10:”, „30. NIEDZIELA ZWYKŁA, 25.10.2026 r.”,
// „PONIEDZIAŁEK 18 sierpnia”, sama data „26.10.2026 r.” albo „2026-10-25”. Zwraca
// {date, dateOnly} albo null, gdy linia nie jest nagłówkiem.
function intentionDayHeading(line,referenceIso){
  if(line.length>140) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(line)||/^\d{1,2}\.\d{1,2}\.\d{4}\s*(?:r\.?)?\s*[:.]?$/u.test(line)) return {date:parseLooseDate(line,referenceIso),dateOnly:true};
  const wd=line.match(INTENTION_WEEKDAY);
  return wd?{date:parseLooseDate(line.slice(wd[0].length),referenceIso),dateOnly:false}:null;
}
function extractIntentions(lines,referenceIso){
  const out=[];
  let date=null,time=null,headings=0,justDated=false;
  for(const raw of lines){
    const line=clean(raw);
    if(!line) continue;
    const heading=intentionDayHeading(line,referenceIso);
    if(heading){
      // Sam dzień tygodnia bez daty: po linii z samą datą („2026-10-25” / „niedziela”)
      // należy do niej; w innym miejscu zeruje datę — kolejna linia zwykle ją podaje
      // („PONIEDZIAŁEK” / „26.10.2026 r.”), a wpis nie trafi do poprzedniego dnia.
      if(heading.date||!justDated){ date=heading.date; time=null; }
      if(heading.date) headings+=1;
      justDated=heading.dateOnly&&!!heading.date;
      continue;
    }
    justDated=false;
    let text=line;
    const tm=line.match(INTENTION_TIME);
    if(tm&&Number(tm[1])<24&&Number(tm[2])<60){ time=`${tm[1].padStart(2,'0')}:${tm[2]}`; text=clean(tm[3]); }
    if(!text||/^\d{1,2}\.$/.test(text)||!DECEASED_INTENTION.test(text)||!date) continue;
    const forWhom=cleanIntentionText(text);
    if(forWhom.replace(/[^\p{L}]/gu,'').length<3) continue;
    out.push({date,time,forWhom});
  }
  return {entries:uniq(out,e=>`${e.date}|${e.time||''}|${e.forWhom}`),headings};
}

// Profil: skąd wziąć dokument (fetch) i jak go czytać.
//   fetch 'page'        — sama strona list_url,
//         'latest_link' — strona list_url, z niej najnowsze linki zgodne z `link`,
//         'feed'        — kanał RSS feed_url (pełna treść wpisów w content:encoded);
//   deaths/intentions   — które dane wydobyć;
//   dates 'headings'    — strona z wieloma ogłoszeniami; data z nagłówka `heading`,
//         'document'    — jedno ogłoszenie na dokument; data z `docDate` albo z kanału/linku,
//         'first_seen'  — lista bez dat; datą zgłoszenia jest pierwszy odczyt wpisu.
const PARISH_PROFILES={
  podwawelskie_ogloszenia:{fetch:'page',deaths:true,dates:'headings',heading:/^(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]\s/},
  jozef_ogloszenia:{fetch:'page',deaths:true,dates:'document',docDate:/^Ogłoszenia parafialne\s+(\d.*\d{4})/i},
  wola_duchacka_ogloszenia:{fetch:'page',deaths:true,dates:'headings',heading:/Niedziela[^,]*,\s*(\d{1,2}\.\d{1,2}\.\d{4})/i},
  lourdes_ogloszenia:{fetch:'feed',items:3,deaths:true,dates:'document'},
  borek_ogloszenia:{fetch:'latest_link',link:/\/ogloszenia-[a-z0-9-]*\d{1,2}-\d{1,2}-\d{4}$/i,pages:2,deaths:true,dates:'document',docDate:/^Ogłoszenia\s*[-–]\s*.*?(\d{1,2}\.\d{1,2}\.\d{4})/i},
  kliny_borkowskie_ogloszenia:{fetch:'latest_link',link:/\/ogloszenia-i-intencje\/[^/?#]+\.html$/i,pages:1,deaths:true,intentions:true,dates:'document',docDate:/^Intencje mszalne\s+od\s+(.+)$/i},
  dabie_odeszli:{fetch:'page',deaths:true,dates:'first_seen',stopAt:/^ROK\s+\d{4}\b/i},
  zacisze_ogloszenia:{fetch:'page',deaths:true,dates:'headings',heading:/^Kraków\s+(\d{1,4}[./]\d{1,2}[./]\d{1,4})\s*$/},
  podwawelskie_intencje:{fetch:'page',intentions:true},
  kinga_intencje:{fetch:'page',intentions:true},
  plaszow_intencje:{fetch:'page',intentions:true},
  bronowickie_intencje:{fetch:'feed',items:2,intentions:true},
  skotniki_intencje:{fetch:'feed',items:2,intentions:true},
  zacisze_intencje:{fetch:'page',intentions:true}
};

// Linki z dokumentu zbieramy przed prepareReadableDocument (usuwa nawigację).
function parishLatestLinks(html,source,profile){
  const $=cheerio.load(html);
  const base=source.list_url||source.url;
  const links=uniq($('a[href]').map((_,a)=>absoluteUrl($(a).attr('href'),base)).get().filter(u=>u&&profile.link.test(u.replace(/[?#].*$/,''))),u=>u);
  // Data w adresie („…-25-10-2026”) porządkuje od najnowszego; bez niej — kolejność strony.
  const dated=links.map((u,i)=>{const m=u.match(/(\d{1,2})-(\d{1,2})-(\d{4})$/); return {u,i,d:m?isoFromParts(m[3],m[2],m[1]):null};});
  if(dated.every(x=>x.d)) dated.sort((a,b)=>b.d.localeCompare(a.d));
  return dated.map(x=>x.u).slice(0,profile.pages||1);
}
async function fetchParishDocuments(source,profile,fetcher){
  const listUrl=source.list_url||source.url;
  if(profile.fetch==='feed'){
    const r=await fetcher(source.feed_url);
    if(!r.ok) return {docs:[],status:r.status,error:r.error||`HTTP ${r.status}`};
    const items=parseRssItems(r.text).slice(0,profile.items||3);
    const pub=(s)=>{const t=Date.parse(s||''); return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null;};
    const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return {docs:items.map(i=>({url:i.link||listUrl,html:`<html><body><h1>${esc(i.title)}</h1>${i.html}</body></html>`,date:parseLooseDate(i.title)||pub(i.pubDate)})),status:r.status,error:null};
  }
  const r=await fetcher(listUrl);
  if(!r.ok) return {docs:[],status:r.status,error:r.error||`HTTP ${r.status}`};
  if(profile.fetch!=='latest_link') return {docs:[{url:listUrl,html:r.text,date:null}],status:r.status,error:null};
  const links=parishLatestLinks(r.text,source,profile);
  if(!links.length) return {docs:[],status:r.status,error:`${source.name}: nie znaleziono linku do bieżącego ogłoszenia`,parserBroken:true};
  const docs=[];
  for(const url of links){
    const d=await fetcher(url);
    if(!d.ok) continue;
    const m=url.match(/(\d{1,2})-(\d{1,2})-(\d{4})$/);
    docs.push({url,html:d.text,date:m?isoFromParts(m[3],m[2],m[1]):null});
  }
  if(!docs.length) return {docs:[],status:r.status,error:`${source.name}: bieżące ogłoszenie niedostępne`};
  return {docs,status:r.status,error:null};
}
function documentLines(html){
  const $=prepareReadableDocument(cheerio.load(html));
  return extractBlockText($,$('body')).split('\n').map(l=>clean(l)).filter(Boolean);
}

// Data zgłoszenia dla list bez dat: pierwszy przebieg, w którym wpis był widoczny.
// Wpisy zastane przy pierwszym odczycie źródła dostają znacznik 'baseline' i nie trafiają
// do okna 7 dni — inaczej cała lista sprzed miesięcy wyglądałaby na dzisiejszą.
function applyFirstSeen(rows,state,keyOf,today=todayIso()){
  const prev=state?.first_seen&&typeof state.first_seen==='object'?state.first_seen:null;
  const next={};
  for(const row of rows){
    const key=keyOf(row);
    const seen=next[key]||(prev?(prev[key]||today):'baseline');
    next[key]=seen;
    if(seen!=='baseline') row.date_reported=seen;
  }
  return next;
}
const personKey=(name)=>String(name||'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

function parishRowsFromDocument(doc,source,profile,referenceIso){
  const lines=documentLines(doc.html);
  const deaths=[];
  const intentions=[];
  let structure=0;
  if(profile.deaths){
    let headingDates=null;
    let docDate=doc.date||null;
    if(profile.dates==='headings'){
      let current=null;
      headingDates=lines.map(l=>{const m=l.match(profile.heading); if(m){ const d=parseLooseDate(m[1],referenceIso); if(d){ current=d; structure+=1; } } return current;});
    }else if(profile.dates==='document'){
      const hit=profile.docDate?lines.map(l=>l.match(profile.docDate)).find(Boolean):null;
      docDate=(hit?parseLooseDate(hit[1],referenceIso):null)||docDate;
      if(docDate) structure+=1;
    }
    const found=findDeathListNames(lines,{stopAt:profile.stopAt||null});
    if(profile.dates==='first_seen'&&lines.some(l=>DEATH_LIST_TRIGGER.test(l))) structure+=1;
    for(const {name,line} of found){
      const reported=profile.dates==='headings'?headingDates[line]:profile.dates==='document'?docDate:null;
      if(profile.dates!=='first_seen'){
        // Ogłoszenie bez rozpoznanej daty albo z archiwum: pomijamy, zamiast zgadywać.
        const age=reported?daysFromRef(reported,referenceIso):null;
        if(age===null||-age>PARISH_MAX_AGE_DAYS||age>7) continue;
      }
      const row={
        kind:'death', name, date_death:null, date_funeral:null, time_funeral:null,
        ...(reported?{date_reported:reported}:{}),
        place:source.name, source_id:source.id, source_name:source.name, url:doc.url, source_url:source.url,
        note:profile.dates==='first_seen'?'Wpis na liście zmarłych parafian':`Ogłoszenia parafialne${reported?` z ${reported}`:''} — wzmianka o zgonie parafianina`
      };
      if(validateParsedRow(row)) deaths.push(row);
    }
  }
  if(profile.intentions){
    const {entries,headings}=extractIntentions(lines,referenceIso);
    structure+=headings;
    for(const e of entries){
      const offset=daysFromRef(e.date,referenceIso);
      if(offset===null||offset< -INTENTION_WINDOW.past||offset>INTENTION_WINDOW.ahead) continue;
      const row={
        kind:'intention', name:e.forWhom, date_death:null, date_funeral:null, time_funeral:null,
        date_intention:e.date, time_intention:e.time,
        place:source.name, source_id:source.id, source_name:source.name, url:doc.url, source_url:source.url,
        note:clean(`Intencja mszalna ${e.date}${e.time?`, godz. ${e.time}`:''}: + ${e.forWhom}`).slice(0,260)
      };
      if(validateParsedRow(row)) intentions.push(row);
    }
  }
  return {deaths,intentions,structure};
}

async function parseParishSource(source,{fetcher=fetchText,state=null,referenceIso=todayIso()}={}){
  const profile=PARISH_PROFILES[source.id];
  if(!profile) return {rows:[],error:`${source.name}: brak profilu parafii dla source_id=${source.id}`,diagnostics:{parser_status:'parser_broken'}};
  const fetched=await fetchParishDocuments(source,profile,fetcher);
  if(fetched.error) return {rows:[],error:fetched.error,diagnostics:{http_status:fetched.status,parser_status:fetched.parserBroken?'parser_broken':fetched.status===403?'blocked':'http_error'}};
  let deaths=[],intentions=[],structure=0;
  for(const doc of fetched.docs){
    const part=parishRowsFromDocument(doc,source,profile,referenceIso);
    deaths.push(...part.deaths); intentions.push(...part.intentions); structure+=part.structure;
  }
  deaths=uniq(deaths,r=>`${personKey(r.name)}|${r.date_reported||''}`);
  intentions=uniq(intentions,r=>`${r.date_intention}|${r.time_intention||''}|${r.name}`);
  const result={rows:[...deaths,...intentions]};
  // Pusta lista przy liście bez dat to raczej chwilowo okrojona strona niż wyczyszczony
  // spis zmarłych — stan zostaje, inaczej kolejny przebieg uznałby całą listę za nową.
  if(profile.dates==='first_seen') result.state=deaths.length?{first_seen:applyFirstSeen(deaths,state,r=>personKey(r.name),referenceIso)}:(state??undefined);
  // Tydzień bez zmarłych w ogłoszeniach to częsty, poprawny stan. Pusty wynik przy
  // rozpoznanej strukturze (data ogłoszenia, nagłówki dni) jest potwierdzonym brakiem
  // danych; bez struktury — podejrzeniem zmiany strony, które eskaluje po progu.
  const status=result.rows.length?'ok':(structure>0?'empty_confirmed':'empty');
  return {...result,error:null,diagnostics:{http_status:fetched.status,documents:fetched.docs.length,deaths:deaths.length,intentions:intentions.length,accepted_rows:result.rows.length,parser_status:status}};
}

// ─────────────────────── Borek Fałęcki: intencje pogrzebowe (eParafia) ───────────────────────
// Lista „+ Imię Nazwisko” (najnowsze na górze), pod każdym nazwiskiem terminy mszy
// zamówionych przez uczestników pogrzebu: „01.12.2026 godz. 18:00 – od …”. Zamawiający
// to osoby żyjące — z linii terminu bierzemy wyłącznie datę i godzinę.
const EPARAFIA_FUNERAL_TERM=/^(?:\d{1,2}\.\s+)?(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:r\.?)?\s*(?:godz\.?\s*)?(\d{1,2}[:.]\d{2})?/u;
function parseEparafiaIntencjePogrzeboweHtml(html,source,pageUrl,referenceIso=todayIso()){
  const lines=documentLines(html);
  const deaths=[];
  const intentions=[];
  let current=null;
  for(const line of lines){
    const person=line.match(/^\+\s*(\S.*)$/u);
    if(person){
      const name=normalizePersonName(leadingName(person[1])||'');
      current=name||null;
      if(!current) continue;
      const row={kind:'death',name:current,date_death:null,date_funeral:null,time_funeral:null,place:source.name,source_id:source.id,source_name:source.name,url:pageUrl,source_url:source.url,note:'Intencje pogrzebowe parafii — msze zamówione po pogrzebie'};
      if(validateParsedRow(row)) deaths.push(row);
      continue;
    }
    if(!current) continue;
    const term=line.match(EPARAFIA_FUNERAL_TERM);
    if(!term) continue;
    const date=parsePolishDateToIso(term[1]);
    const offset=date?daysFromRef(date,referenceIso):null;
    if(offset===null||offset< -INTENTION_WINDOW.past||offset>INTENTION_WINDOW.ahead) continue;
    const time=term[2]?parseTime(term[2]):null;
    const row={kind:'intention',name:current,date_death:null,date_funeral:null,time_funeral:null,date_intention:date,time_intention:time,place:source.name,source_id:source.id,source_name:source.name,url:pageUrl,source_url:source.url,note:clean(`Msza za zmarłego (intencja pogrzebowa) ${date}${time?`, godz. ${time}`:''}: + ${current}`)};
    if(validateParsedRow(row)) intentions.push(row);
  }
  return {deaths:uniq(deaths,r=>personKey(r.name)).slice(0,200),intentions:uniq(intentions,r=>`${r.date_intention}|${r.time_intention||''}|${r.name}`)};
}
// Strona listy prowadzi do podstron rocznych („…/intencje-pogrzebowe-2026”); czytamy najnowszą.
function latestYearLink(html,source){
  const $=cheerio.load(html);
  const base=source.list_url||source.url;
  return $('a[href]').map((_,a)=>absoluteUrl($(a).attr('href'),base)).get()
    .map(u=>({u,y:Number((u||'').match(/intencje-pogrzebowe-(\d{4})\/?$/)?.[1]||0)}))
    .filter(x=>x.y>0).sort((a,b)=>b.y-a.y)[0]?.u||null;
}
async function parseEparafiaIntencjePogrzebowe(source,{fetcher=fetchText,state=null,referenceIso=todayIso()}={}){
  const r=await fetcher(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  const pageUrl=latestYearLink(r.text,source);
  if(!pageUrl) return {rows:[],error:`${source.name}: nie znaleziono podstrony roku`,diagnostics:{http_status:r.status,parser_status:'parser_broken'}};
  const p=await fetcher(pageUrl);
  if(!p.ok) return {rows:[],error:p.error||`HTTP ${p.status}`,diagnostics:{http_status:p.status,parser_status:p.status===403?'blocked':'http_error'}};
  const {deaths,intentions}=parseEparafiaIntencjePogrzeboweHtml(p.text,source,pageUrl,referenceIso);
  const nextState=deaths.length?{first_seen:applyFirstSeen(deaths,state,r=>personKey(r.name),referenceIso)}:(state??undefined);
  const rows=[...deaths,...intentions];
  return {rows,state:nextState,error:null,diagnostics:{http_status:p.status,page:pageUrl,deaths:deaths.length,intentions:intentions.length,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
}

// ─────────────────────── Borek Fałęcki: ewidencja grobów (eParafia) ───────────────────────
// Wyszukiwarka „Znajdź grób” pobiera do przeglądarki cały publiczny plik JSON i filtruje
// go lokalnie. Plik ma ok. 1,2 MB i nagłówek Last-Modified, więc pytamy warunkowo
// (If-Modified-Since): bez zmian serwer odpowiada 304 i używamy zapisanych wpisów.
// Plik podaje tylko rok zgonu. Do rekordów trafiają wpisy z nazwiskami z search_terms —
// porównanie po całych członach nazwiska, bo „Derenda” to inne nazwisko niż „Dereń”.
function ewidencjaMatches(nazwisko,terms){
  const tokens=personKey(nazwisko).split(' ').filter(Boolean);
  return terms.some(t=>tokens.includes(personKey(t)));
}
function parseEwidencjaGrobowJson(text,terms){
  const data=JSON.parse(String(text).replace(/^﻿/,''));
  if(!Array.isArray(data)) throw new Error('plik ewidencji nie jest listą');
  return {total:data.length,records:data.filter(r=>ewidencjaMatches(r?.Nazwisko,terms)).map(r=>({
    IdGrobu:clean(r.IdGrobu),Imie:clean(String(r.Imie||'').replace(/\/[^/]*\/?/g,' ')),Nazwisko:clean(r.Nazwisko),
    NrKwatery:clean(r.NrKwatery),NrGrobu:clean(r.NrGrobu),RokZgonu:clean(r.RokZgonu)
  }))};
}
async function parseEparafiaEwidencjaGrobow(source,{session=createHttpSession({timeoutMs:30000}),state=null,referenceIso=todayIso()}={}){
  const terms=(source.search_terms||[]).map(clean).filter(Boolean);
  const cached=Array.isArray(state?.records)?state.records:null;
  const headers={accept:'application/json,text/plain;q=0.9,*/*;q=0.8',...(cached&&state?.last_modified?{'if-modified-since':state.last_modified}:{})};
  const r=await session.request(source.data_url,{headers});
  let records=cached,total=state?.total_records??null,notModified=false;
  if(r.status===304&&cached){ notModified=true; }
  else if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`,diagnostics:{http_status:r.status,parser_status:r.status===403?'blocked':'http_error'}};
  else{
    try{ ({records,total}=parseEwidencjaGrobowJson(r.text,terms)); }
    catch(e){ return {rows:[],error:`${source.name}: ${String(e?.message||e)}`,diagnostics:{http_status:r.status,parser_status:'parser_broken'}}; }
  }
  const refYear=Number(String(referenceIso).slice(0,4));
  let historical=0;
  const rows=records.map(rec=>({
    kind:'grave', name:normalizePersonName(`${rec.Imie} ${rec.Nazwisko}`), date_death:null, date_birth:null, date_funeral:null, time_funeral:null,
    year_death:rec.RokZgonu||null,
    place:`Cmentarz parafialny Borek Fałęcki, kwatera ${rec.NrKwatery}, grób ${rec.NrGrobu}`,
    source_id:source.id, source_name:source.name, url:source.url, source_url:source.url,
    note:`Ewidencja grobów parafii MB Zwycięskiej; grób ${rec.IdGrobu}; rok zgonu: ${rec.RokZgonu||'?'}`
  })).filter(validateParsedRow).filter(row=>{
    // Wpis pasujący do fraz, ale z rokiem zgonu sprzed ponad roku, nie może dotyczyć
    // monitorowanej (żyjącej) osoby — pokazany w sekcji grobów dawałby fałszywy alarm.
    const year=Number(row.year_death||0);
    if(year&&year<refYear-1&&rowMatchesPhrases(row)){ historical+=1; return false; }
    return true;
  });
  const first_seen=applyFirstSeen(rows,state,r=>`${r.place}|${personKey(r.name)}|${r.year_death||''}`,referenceIso);
  for(const row of rows) if(row.date_reported) row.note=`${row.note}; nowy wpis od ${row.date_reported}`;
  const lastModified=(notModified?null:r.header?.('last-modified'))||state?.last_modified||null;
  return {rows,state:{last_modified:lastModified,total_records:total,records,first_seen},error:null,
    diagnostics:{http_status:r.status,not_modified:notModified,total_records:total,historical_skipped:historical,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
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

// Trafienie: dopasowanie fraz albo rekord, który źródło każe zgłosić zawsze (force_match)
// — nowa osoba w obserwowanym grobie nie musi nazywać się tak jak frazy.
const isPriorityHit=(row,phrases=HELENA_GAWIN_PHRASES)=>row?.force_match===true||rowMatchesPhrases(row,phrases);
// Data, po której wzmianka o zgonie wpada do okna [dziś-7, dziś]: data zgonu, a gdy źródło
// jej nie podaje (ogłoszenia parafialne) — data ogłoszenia albo pierwszego odczytu wpisu.
const deathWindowDate=(row)=>row?.date_death||row?.date_reported||null;

// Źródła odpytywane rzadziej niż przebiegi (min_interval_hours): w przebiegu pośrednim
// zamiast nowej serii zapytań używamy wyniku zapisanego po ostatnim udanym odczycie.
function reuseCachedResult(source,entry,now=Date.now()){
  const hours=Number(source?.min_interval_hours||0);
  const at=Date.parse(entry?.fetched_at||'');
  if(!hours||!Number.isFinite(at)||!entry?.result) return null;
  const age=(now-at)/3600000;
  if(age<0||age>=hours) return null;
  return {rows:entry.result.rows||[],error:null,diagnostics:{...(entry.result.diagnostics||{}),cached:true,cached_at:entry.fetched_at}};
}
// Wpis data/source_cache.json po przebiegu. Błąd odczytu nie nadpisuje stanu — przejściowa
// awaria nie może wyzerować pierwszych odczytów wpisów ani zapisanej ewidencji.
function nextSourceCacheEntry(source,previous,parsed,now=new Date()){
  if(parsed?.diagnostics?.cached) return previous||null;
  const entry={...(previous||{})};
  if(!parsed?.error&&parsed?.state!==undefined) entry.state=parsed.state;
  if(!parsed?.error&&Number(source?.min_interval_hours||0)>0){
    entry.fetched_at=now.toISOString();
    entry.result={rows:parsed.rows||[],diagnostics:parsed.diagnostics||{}};
  }
  return Object.keys(entry).length?entry:null;
}

const INTENTION_SOURCE_TYPES=['debniki_intencje','intencje_plus','parafia_intencje','eparafia_intencje_pogrzebowe'];
const isIntentionLikeSource=(s)=>INTENTION_SOURCE_TYPES.includes(s?.type);
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
// context.state: stan zapisany przez parser w poprzednim przebiegu (data/source_cache.json)
// — pierwsze odczyty wpisów list bez dat, Last-Modified ewidencji, szczegóły kart PUK.
async function parseSource(source,context={}){
  const state=context.state??null;
  switch(source.type){
    case 'zck_funerals':return parseZckFunerals(source);
    case 'zck_lokalizator':return parseZckLokalizator(source);
    case 'puk_pozegnalismy':return parsePukPozegnalismy(source,{state});
    case 'gabriel24_nekrologi':return parseGabriel24Nekrologi(source);
    case 'karawan_nekrologi':return parseKarawanNekrologi(source);
    case 'grobonet_groby':return parseGrobonetGroby(source);
    case 'podwawelskie_nekrologi':return parsePodwawelskieNekrologi(source);
    case 'debniki_sdb_pogrzeby':return parseDebnikiSdbPogrzeby(source);
    case 'debniki_intencje':return parseDebnikiIntencje(source);
    case 'sw_jadwiga_pogrzebowe':return parseSwJadwigaPogrzebowe(source);
    case 'parafia_ogloszenia':
    case 'parafia_intencje':return parseParishSource(source,{state});
    case 'eparafia_intencje_pogrzebowe':return parseEparafiaIntencjePogrzebowe(source,{state});
    case 'eparafia_ewidencja_grobow':return parseEparafiaEwidencjaGrobow(source,{state});
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
  fetchDetailRows,DETAIL_FETCH_BUDGET_MS,
  parseRssItems,parseKarawanFeedXml,zckCsrfToken,addDaysIso,
  parseZckLokalizator,parseZckGraveyards,zckLocatorRows,ZCK_LOCATOR_BASELINE,ZCK_WATCHED_GRAVES,
  parseLooseDate,extractDeathNames,findDeathListNames,extractIntentions,cleanIntentionText,applyFirstSeen,
  PARISH_PROFILES,parseParishSource,parishRowsFromDocument,
  parseEparafiaIntencjePogrzebowe,parseEparafiaIntencjePogrzeboweHtml,
  parseEparafiaEwidencjaGrobow,parseEwidencjaGrobowJson,
  parseEklepsydraEventsHtml,enrichPukFromDetails,
  isPriorityHit,deathWindowDate,reuseCachedResult,nextSourceCacheEntry,INTENTION_SOURCE_TYPES
};
