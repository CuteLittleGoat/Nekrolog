import * as cheerio from "cheerio";
import { fetchText } from "./fetch.mjs";

const HELENA_GAWIN_PHRASES = ["Helena Gawin"];
const DEFAULT_FLAGS = { requires_detail_fetch: false, requires_ocr: false, requires_pdf: false };
const REQUIRED_SOURCES = [
  { id:"zck_funerals", name:"ZCK Kraków – Porządek pogrzebów", type:"zck_funerals", url:"https://www.zck-krakow.pl/funerals", enabled:true, distance_km:0, list_url:"https://www.zck-krakow.pl/funerals", ...DEFAULT_FLAGS },
  { id:"puk_pozegnalismy", name:"PUK Kraków – Pożegnaliśmy", type:"puk_pozegnalismy", url:"https://www.puk.krakow.pl/pozegnalismy/", enabled:true, distance_km:4.5, list_url:"https://www.puk.krakow.pl/pozegnalismy/", requires_detail_fetch:true, requires_ocr:false, requires_pdf:false },
  { id:"gabriel_nekrologi", name:"Gabriel24 – Nekrologi", type:"gabriel24_nekrologi", url:"https://www.gabriel24.pl/nekrologi/", enabled:true, distance_km:6.5, list_url:"https://www.gabriel24.pl/nekrologi/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  { id:"karawan_nekrologi", name:"Karawan – Nekrologi", type:"karawan_nekrologi", url:"https://karawan.pl/nekrologi/", enabled:true, distance_km:7.5, list_url:"https://karawan.pl/nekrologi/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  { id:"salwator_grobonet", name:"Kraków Salwator – Grobonet", type:"grobonet_nekrologi", url:"https://krakowsalwator.grobonet.com/nekrologi.php", enabled:true, distance_km:5.5, list_url:"https://krakowsalwator.grobonet.com/nekrologi.php", base_url:"https://krakowsalwator.grobonet.com/", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  { id:"debniki_sdb", name:"Parafia św. Stanisława Kostki (Dębniki)", type:"debniki_sdb_pogrzeby", url:"https://debniki.sdb.org.pl/", enabled:true, distance_km:2.5, list_url:"https://debniki.sdb.org.pl/", requires_detail_fetch:true, max_detail_pages:30, requires_ocr:false, requires_pdf:false },
  { id:"podwawelskie_nekrologi", name:"Podwawelskie – Nekrologi", type:"podwawelskie_nekrologi", url:"https://www.podwawelskie.pl/aktualnosci/nekrologi.html", enabled:true, distance_km:2.5, list_url:"https://www.podwawelskie.pl/aktualnosci/nekrologi.html", requires_detail_fetch:true, max_detail_pages:50, requires_ocr:false, requires_pdf:false },
  { id:"sw_jadwiga_pogrzebowe", name:"Parafia św. Jadwigi – Msze święte pogrzebowe", type:"sw_jadwiga_pogrzebowe", url:"https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe", enabled:true, distance_km:6.5, list_url:"https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe", ...DEFAULT_FLAGS },
  { id:"facebook_parafia_debniki", name:"Facebook – Parafia Dębniki", type:"generic_html", url:"https://www.facebook.com/parafiadebniki/?locale=pl_PL", enabled:false, distance_km:2.5 }
];

const TECHNICAL_NOISE = /(googletagmanager|gtm-|clickcease|iframe|display\s*:\s*none|visibility\s*:\s*hidden|document|window\.|function\(|\bcookie\b|cookies|facebook\s+pixel|analytics|href=|src=|<iframe|<\/iframe)/i;
const BAD_NAME_WORDS = /(główna|nekrologi|firma|w\s*służbie|kontakt|oferta|usługi|menu|strona\s*główna|polityka\s*prywatności|regulamin|rodo)/i;
const MONTHS = {
  stycznia:1, styczeń:1, styczniu:1,
  lutego:2, luty:2, lutym:2,
  marca:3, marzec:3, marcu:3,
  kwietnia:4, kwiecień:4, kwietniu:4,
  maja:5, maj:5,
  czerwca:6, czerwiec:6, czerwcu:6,
  lipca:7, lipiec:7, lipcu:7,
  sierpnia:8, sierpień:8, sierpniu:8,
  września:9, wrzesień:9, wrześniu:9,
  października:10, październik:10, październiku:10,
  listopada:11, listopad:11, listopadzie:11,
  grudnia:12, grudzień:12, grudniu:12,
  i:1, ii:2, iii:3, iv:4, v:5, vi:6, vii:7, viii:8, ix:9, x:10, xi:11, xii:12
};
const MONTH_WORD_PATTERN = Object.keys(MONTHS).sort((a,b)=>b.length-a.length).join("|");

const clean = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const nowISO = () => new Date().toISOString();
const todayIso = () => new Date().toISOString().slice(0, 10);
const uniq = (rows, keyFn) => [...new Map(rows.map((row) => [keyFn(row), row])).values()];
const absoluteUrl = (href, base) => {
  try { return new URL(href || "", base || undefined).toString(); }
  catch { return href || base || ""; }
};

function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parsePolishDateToIso(raw) {
  const text = clean(raw).toLowerCase();
  if (!text) return null;

  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return toIsoDate(m[1], m[2], m[3]);

  m = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return toIsoDate(year, m[2], m[1]);
  }

  m = text.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MONTH_WORD_PATTERN})\\s+(\\d{4})\\b`, "iu"));
  if (m) return toIsoDate(m[3], MONTHS[m[2].toLowerCase()], m[1]);

  return null;
}

function removeDateFragments(text) {
  return clean(text)
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}\\.?\\s+(?:${MONTH_WORD_PATTERN})\\s+\\d{4}\\b`, "giu"), " ");
}

function parseTime(raw) {
  const text = removeDateFragments(raw);
  const m = text.match(/(?:^|[^\d])(?:godz(?:ina)?\.?\s*)?(?:o\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b(?![.\d])/i);
  return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : null;
}

function firstDateIn(text) {
  const t = clean(text);
  const patterns = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/u,
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/u,
    new RegExp(`\\b\\d{1,2}\\.?\\s+(?:${MONTH_WORD_PATTERN})\\s+\\d{4}\\b`, "iu")
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) {
      const parsed = parsePolishDateToIso(m[0]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function dateNear(text, keywordRegex, options = {}) {
  const { before = 0, after = 140 } = options;
  const t = clean(text);
  const match = keywordRegex.exec(t);
  if (!match) return null;
  const start = Math.max(0, match.index - before);
  const end = Math.min(t.length, match.index + match[0].length + after);
  return firstDateIn(t.slice(start, end));
}

function dateBeforeKeyword(text, keywordRegex, distance = 90) {
  const t = clean(text);
  const match = keywordRegex.exec(t);
  if (!match) return null;
  return firstDateIn(t.slice(Math.max(0, match.index - distance), match.index));
}

function normalizeName(raw) {
  return clean(raw)
    .replace(/^(?:ś\.?\s*p\.?|sp\.?|†|\+)\s*/i, "")
    .replace(/\b(?:lat|l\.)\s*\d+\b/gi, "")
    .replace(/\bprzeżywszy\s+\d+\s+lat\b/gi, "")
    .replace(/[,:;–-]\s*(?:lat|ur\.|zm\.|zmar[łła]).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function prepareReadableDocument($) {
  $("script,style,iframe,noscript,svg,canvas,form,nav,header,footer,aside").remove();
  $(".cookie,.cookies,.cookiebar,.gdpr,.menu,.nav,.navbar,.breadcrumb,.breadcrumbs,.social,.share,.ad,.ads,.banner,.popup,.modal,.skip-link,[aria-hidden='true']").remove();
  return $;
}

function cleanTechnicalNoise(text) {
  const raw = String(text || "").replace(/\r/g, "\n");
  const kept = raw
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !TECHNICAL_NOISE.test(line))
    .join(" ");
  return clean(kept.replace(/<[^>]+>/g, " "));
}

function extractMainText($, selectors = []) {
  const candidates = [];
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = cleanTechnicalNoise($(element).text());
      if (text) candidates.push(text);
    });
  }
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0];
  return cleanTechnicalNoise($("body").text());
}

function nameFromSlug(url) {
  try {
    let segment = new URL(url).pathname.replace(/\/$/,"").split("/").pop() || "";
    if (/^(nekrolog|pogrzeb|aktualnosci|category|page|kontakt|index|php)$/i.test(segment)) return null;
    segment = segment.replace(/\.(html?|php)$/i, "").replace(/\d+/g, "").replace(/[-_]+/g, " ");
    const words = clean(segment).split(" ").filter(Boolean);
    if (words.length < 2) return null;
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  } catch {
    return null;
  }
}

function isBadNameCandidate(name) {
  const n = normalizeName(name);
  return !n ||
    n.split(/\s+/).length < 2 ||
    n.length > 80 ||
    BAD_NAME_WORDS.test(n) ||
    TECHNICAL_NOISE.test(n) ||
    /<[^>]+>|https?:\/\//i.test(n) ||
    /\b(?:data|pogrzebu|zgonu|cmentarz|kaplica|godz)\b/i.test(n);
}

function extractNameFromContext(text, source, detailUrl, selectorsText = []) {
  const candidates = selectorsText
    .map(normalizeName)
    .filter(Boolean);

  const sourceNameParts = clean(source?.name || "").split(/[–|-]/).map((s) => clean(s)).filter(Boolean);
  for (const part of sourceNameParts) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (let i = 0; i < candidates.length; i += 1) {
      candidates[i] = normalizeName(candidates[i].replace(new RegExp(escaped, "ig"), ""));
    }
  }

  const textCandidates = [
    ...(clean(text).match(/(?:ŚP\.?|Ś\.P\.?|sp\.?|†|\+)\s*([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}'-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}'-]+){1,3})/gu) || []).map((m) => m.replace(/^(?:ŚP\.?|Ś\.P\.?|sp\.?|†|\+)\s*/i, "")),
    ...((clean(text).match(/\b[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}'-]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}'-]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}'-]+)?\b/gu)) || [])
  ].map(normalizeName);

  candidates.push(...textCandidates, nameFromSlug(detailUrl));
  return candidates.find((candidate) => candidate && !isBadNameCandidate(candidate)) || null;
}

function extractPlace(text, fallback = null) {
  const cleanText = cleanTechnicalNoise(text);
  const fragments = cleanText.split(/(?<=[.!?])\s+|\n|;/).map(clean).filter(Boolean);
  const fragment = fragments.find((line) => /\b(cmentarz|kaplica|koś[cś]ci[oó][łl]|parafia|cm\.)\b/i.test(line));
  const value = fragment || (cleanText.match(/(cmentarz[^.\n;]*|kaplica[^.\n;]*|koś[cś]ci[oó][łl][^.\n;]*|parafia[^.\n;]*|cm\.[^.\n;]*)/i) || [])[1] || fallback;
  return value ? cleanTechnicalNoise(String(value).slice(0, 180)) : null;
}

function validateParsedRow(row) {
  if (!row || !clean(row.name) || isBadNameCandidate(row.name)) return false;
  if (!["death", "funeral"].includes(row.kind)) return false;
  if (!row.source_id || !row.source_name || !row.url) return false;
  if (TECHNICAL_NOISE.test(clean(row.note)) || TECHNICAL_NOISE.test(clean(row.place))) return false;
  return true;
}

function buildRow({ source, detailUrl, text, name, dateDeath = null, dateFuneral = null, timeFuneral = null, place = null, kind = null, forceFuneral = false }) {
  const safeText = cleanTechnicalNoise(text);
  const rowKind = forceFuneral ? "funeral" : (kind || (dateDeath ? "death" : "funeral"));
  const row = {
    kind: rowKind,
    name: normalizeName(name),
    date_death: dateDeath || null,
    date_funeral: dateFuneral || null,
    time_funeral: timeFuneral || null,
    place: place ? cleanTechnicalNoise(place) : null,
    source_id: source.id,
    source_name: source.name,
    url: detailUrl || source.url,
    source_url: source.url,
    note: safeText ? safeText.slice(0, 300) : null
  };
  return validateParsedRow(row) ? row : null;
}

function parseSourceDetail(text, source, detailUrl, options = {}) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const mainText = extractMainText($, options.mainSelectors || ["main", "article", ".entry-content", ".page-content", ".post-content", ".single-content", ".content"]);
  const titleText = cleanTechnicalNoise($("title").text().replace(/\s*[\-|–|—]\s*.*$/u, ""));
  const headingText = cleanTechnicalNoise($(options.headingSelector || "main h1, article h1, h1, h2").first().text());
  const imageText = cleanTechnicalNoise($("img[alt], img[title]").map((_, img) => `${$(img).attr("alt") || ""} ${$(img).attr("title") || ""}`).get().join(" "));

  const name = extractNameFromContext(mainText, source, detailUrl, [headingText, titleText, imageText]);
  if (!name) return null;

  const dateDeath = options.noDeath ? null : (dateNear(mainText, /\b(zmar[łłaey]?|zgon|odesz[łła])\b/iu) || dateBeforeKeyword(mainText, /\b(zmar[łłaey]?|zgon|odesz[łła])\b/iu));
  let dateFuneral = dateNear(mainText, options.funeralRegex || /\b(pogrzeb|uroczystości\s+pogrzebowe|msza\s+(?:św\.?\s*)?pogrzebowa|ceremonia)\b/iu);
  if (!dateFuneral && options.allowFirstDateAsFuneral) dateFuneral = firstDateIn(mainText);
  const timeFuneral = parseTime(mainText);
  const place = extractPlace(mainText, options.placeFallback || null);

  return buildRow({
    source,
    detailUrl,
    text: mainText,
    name,
    dateDeath,
    dateFuneral,
    timeFuneral,
    place,
    kind: options.kind || (dateDeath ? "death" : "funeral"),
    forceFuneral: options.forceFuneral || false
  });
}

function parseGenericList(text, source) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const links = $("a[href]").map((_, anchor) => {
    const url = absoluteUrl($(anchor).attr("href"), source.base_url || source.url);
    const label = cleanTechnicalNoise($(anchor).text());
    return { url, label };
  }).get().filter((item) => {
    if (!item.url || /#|javascript:|mailto:|tel:/i.test(item.url)) return false;
    return /nekrolog|pogrzeb|zmar|klepsydr|obituary|id=|aktualnosci/i.test(`${item.url} ${item.label}`);
  });
  return uniq(links, (item) => item.url);
}

function parseGabriel24NekrologiHtml(text, source) {
  return parseGenericList(text, source).filter((item) => /gabriel24\.pl\/.*nekrolog|\/nekrolog/i.test(item.url));
}

function parseKarawanNekrologiHtml(text, source) {
  return parseGenericList(text, source).filter((item) => /^https?:\/\/(?:www\.)?karawan\.pl\/nekrolog\/[^/?#]+\/?$/i.test(item.url));
}

function parseGrobonetNekrologiHtml(text, source) {
  return parseGenericList(text, source).filter((item) => /grobonet|nekrolog|nekrologi\.php|id=/i.test(item.url));
}

function parsePodwawelskieNekrologiHtml(text, source) {
  return parseGenericList(text, source).filter((item) => /podwawelskie|nekrolog|pogrzeb|zmar|aktualnosci/i.test(`${item.url} ${item.label}`));
}

function parseGabriel24DetailHtml(text, source, detailUrl) {
  return parseSourceDetail(text, source, detailUrl, {
    mainSelectors: ["main", "article", ".entry-content", ".page-content", ".post-content", ".nekrolog", ".obituary", "[class*='nekrolog']", "[class*='obituary']"],
    allowFirstDateAsFuneral: false
  });
}

function parseGrobonetDetailHtml(text, source, detailUrl) {
  return parseSourceDetail(text, source, detailUrl, {
    mainSelectors: ["main", "article", "#content", ".content", ".nekrolog", ".nekrologi", ".card", ".obituary", "[class*='nekrolog']", "[class*='obituary']"],
    allowFirstDateAsFuneral: true
  });
}

function parsePodwawelskieDetailHtml(text, source, detailUrl) {
  return parseSourceDetail(text, source, detailUrl, {
    mainSelectors: ["main", "article", ".entry-content", ".page-content", ".post-content", ".item-page", ".content"],
    funeralRegex: /\b(pogrzeb|uroczystości\s+pogrzebowe|msza\s+(?:św\.?\s*)?pogrzebowa|ceremonia)\b/iu,
    allowFirstDateAsFuneral: false
  });
}

function parseKarawanDetailHtml(text, source, detailUrl) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const mainSelectors = [
    "main", "article", ".entry-content", ".page-content", ".post-content", ".single-content", ".content",
    ".nekrolog", ".nekrolog-content", ".obituary", ".obituary-content", "[class*='nekrolog']", "[class*='obituary']"
  ];
  const mainText = extractMainText($, mainSelectors);
  const headingText = cleanTechnicalNoise($("main h1, article h1, h1, .nekrolog h1, [class*='nekrolog'] h1").first().text());
  const titleText = cleanTechnicalNoise($("title").text().replace(/\s*[\-|–|—]\s*.*$/u, ""));
  const imageText = cleanTechnicalNoise($("img[alt], img[title]").map((_, img) => `${$(img).attr("alt") || ""} ${$(img).attr("title") || ""}`).get().join(" "));

  const name = extractNameFromContext(mainText, source, detailUrl, [headingText, titleText, imageText, nameFromSlug(detailUrl)]);
  if (!name) return null;

  const dateFuneral = dateNear(mainText, /\b(pogrzeb|uroczystości\s+pogrzebowe|ceremonia|pożegnanie|msza\s+(?:św\.?\s*)?pogrzebowa)\b/iu) || firstDateIn(mainText);
  const timeFuneral = parseTime(mainText);
  const place = extractPlace(mainText, source.name);
  return buildRow({
    source,
    detailUrl,
    text: mainText,
    name,
    dateDeath: null,
    dateFuneral,
    timeFuneral,
    place,
    kind: dateFuneral ? "funeral" : "death"
  });
}

async function parseByListAndDetails(source, listParser, detailParser, options = {}) {
  const response = await fetchText(source.list_url || source.url);
  if (!response.ok) return { rows: [], error: response.error || `HTTP ${response.status}` };

  const links = listParser(response.text, source).slice(0, source.max_detail_pages || 50);
  if (!links.length) return { rows: [], error: options.allowEmpty ? null : "Nie znaleziono linków do szczegółów wpisów" };

  const rows = [];
  for (const link of links) {
    const detail = await fetchText(link.url);
    if (!detail.ok) continue;
    const row = detailParser(detail.text, source, link.url);
    if (row) rows.push(row);
  }

  const uniqueRows = uniq(rows, (row) => `${row.kind}|${row.name}|${row.date_death || ""}|${row.date_funeral || ""}|${row.time_funeral || ""}|${row.url}`);
  if (!uniqueRows.length) return { rows: [], error: options.allowEmpty ? null : "Nie znaleziono poprawnych rekordów po pobraniu szczegółów" };
  return { rows: uniqueRows, error: null };
}

const parseGabriel24Nekrologi = (source) => parseByListAndDetails(source, parseGabriel24NekrologiHtml, parseGabriel24DetailHtml);
const parseGrobonetNekrologi = (source) => parseByListAndDetails(source, parseGrobonetNekrologiHtml, parseGrobonetDetailHtml);
const parsePodwawelskieNekrologi = (source) => parseByListAndDetails(source, parsePodwawelskieNekrologiHtml, parsePodwawelskieDetailHtml);
const parseKarawanNekrologi = (source) => parseByListAndDetails(source, parseKarawanNekrologiHtml, parseKarawanDetailHtml);

function extractDebnikiCandidateLinks(text, source) {
  const $ = prepareReadableDocument(cheerio.load(text));
  return uniq($("a[href]").map((_, anchor) => {
    const url = absoluteUrl($(anchor).attr("href"), source.url);
    const label = cleanTechnicalNoise($(anchor).text());
    return { url, label };
  }).get().filter((item) => {
    const haystack = `${item.url} ${item.label}`;
    return /pogrzeb|msza\s+pogrzebowa|zmar[łła]|śp\.?|intenc|aktualn|ogłosz/i.test(haystack);
  }), (item) => item.url);
}

function parseDebnikiSdbDetailHtml(text, source, detailUrl) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const mainText = extractMainText($, ["main", "article", ".entry-content", ".page-content", ".post-content", ".content"]);
  if (!/\b(pogrzeb|msza\s+(?:św\.?\s*)?pogrzebowa|uroczystości\s+pogrzebowe|zmar[łła])\b/iu.test(mainText)) return null;
  if (/^\s*\+\s*[A-ZĄĆĘŁŃÓŚŹŻ]/u.test(mainText) && !/pogrzeb/i.test(mainText)) return null;
  return parseSourceDetail(`<main>${mainText}</main>`, source, detailUrl, {
    mainSelectors: ["main"],
    forceFuneral: /\b(pogrzeb|msza\s+(?:św\.?\s*)?pogrzebowa)\b/iu.test(mainText),
    allowFirstDateAsFuneral: /\b(pogrzeb|msza\s+(?:św\.?\s*)?pogrzebowa)\b/iu.test(mainText),
    placeFallback: source.name
  });
}

function parseDebnikiSdbPogrzebyHtml(text, source) {
  const rows = [];
  const links = extractDebnikiCandidateLinks(text, source);
  for (const link of links) {
    if (/^\s*\+\s*[A-ZĄĆĘŁŃÓŚŹŻ]/u.test(link.label) && !/pogrzeb/i.test(link.label)) continue;
    const row = parseDebnikiSdbDetailHtml(`<main>${link.label}</main>`, source, link.url);
    if (row) rows.push(row);
  }
  return uniq(rows, (row) => `${row.name}|${row.date_funeral || ""}|${row.time_funeral || ""}|${row.url}`);
}

async function parseDebnikiSdbPogrzeby(source) {
  const response = await fetchText(source.list_url || source.url);
  if (!response.ok) return { rows: [], error: response.error || `HTTP ${response.status}` };

  const rows = [...parseDebnikiSdbPogrzebyHtml(response.text, source)];
  const links = extractDebnikiCandidateLinks(response.text, source).slice(0, source.max_detail_pages || 30);
  for (const link of links) {
    const detail = await fetchText(link.url);
    if (!detail.ok) continue;
    const row = parseDebnikiSdbDetailHtml(detail.text, source, link.url);
    if (row) rows.push(row);
  }

  return { rows: uniq(rows, (row) => `${row.name}|${row.date_funeral || ""}|${row.time_funeral || ""}|${row.url}`), error: rows.length ? null : "Nie znaleziono jednoznacznych wpisów pogrzebowych w źródle Dębniki SDB" };
}

function parseSwJadwigaPogrzeboweHtml(text, source) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const chunks = [];
  $("tr, li, p, div").each((_, el) => {
    const value = cleanTechnicalNoise($(el).text());
    if (value) chunks.push(value);
  });
  if (!chunks.length) chunks.push(extractMainText($, ["main", "article", ".content"]));

  const rows = [];
  for (const chunk of chunks) {
    if (!/\b(pogrzeb|msza\s+(?:św\.?\s*)?pogrzebowa)\b/iu.test(chunk)) continue;
    const name = extractNameFromContext(chunk, source, source.url, []);
    if (!name) continue;
    const dateFuneral = dateNear(chunk, /\b(pogrzeb|msza\s+(?:św\.?\s*)?pogrzebowa)\b/iu) || firstDateIn(chunk);
    const row = buildRow({
      source,
      detailUrl: source.url,
      text: `Msza święta pogrzebowa: ${chunk}`,
      name,
      dateDeath: null,
      dateFuneral,
      timeFuneral: parseTime(chunk),
      place: extractPlace(chunk, source.name),
      kind: "funeral",
      forceFuneral: true
    });
    if (row) rows.push(row);
  }
  return uniq(rows, (row) => `${row.name}|${row.date_funeral || ""}|${row.time_funeral || ""}`);
}

async function parseSwJadwigaPogrzebowe(source) {
  const response = await fetchText(source.list_url || source.url);
  if (!response.ok) return { rows: [], error: response.error || `HTTP ${response.status}` };
  return { rows: parseSwJadwigaPogrzeboweHtml(response.text, source), error: null };
}

function looksLikeCemeteryLine(line) {
  return /\b(cmentarz|rakowicki|podgórski|salwator|batowice|grębałów|kaplica|sala)\b/i.test(line);
}

function looksLikePersonLine(line) {
  const normalized = normalizeName(line);
  return !isBadNameCandidate(normalized) && !looksLikeCemeteryLine(normalized) && !parseTime(normalized) && !parsePolishDateToIso(normalized);
}

function parseZckFuneralsHtml(text, source) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const lines = cleanTechnicalNoise($("body").text())
    .split(/(?=\d{1,2}[:.]\d{2})|\n| {2,}/)
    .map(clean)
    .filter(Boolean);

  let currentDate = null;
  let currentCemetery = null;
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineDate = parsePolishDateToIso(line);
    if (lineDate) currentDate = lineDate;
    if (/\bcmentarz\b/i.test(line)) currentCemetery = line;

    const time = parseTime(line);
    if (!time) continue;

    let place = null;
    let name = null;
    const rest = clean(line.replace(/(?:godz(?:ina)?\.?\s*)?(?:o\s+)?\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/i, ""));
    const candidatePieces = [rest, lines[i + 1], lines[i + 2]].map(clean).filter(Boolean);

    for (const piece of candidatePieces) {
      const possibleName = extractNameFromContext(piece, source, source.url, []);
      if (!name && possibleName) name = possibleName;
      const possiblePlace = name ? clean(piece.replace(name, "")) : piece;
      if (!place && looksLikeCemeteryLine(possiblePlace) && !looksLikePersonLine(possiblePlace)) place = possiblePlace;
    }

    if (!name) continue;
    const dateFuneral = currentDate || todayIso();
    const joinedPlace = clean([place, currentCemetery && currentCemetery !== place ? currentCemetery : null].filter(Boolean).join(", "));
    const note = currentDate ? `ZCK: ${joinedPlace || source.name}` : `ZCK: ${joinedPlace || source.name}. Data pogrzebu z fallbacku: dzisiaj.`;
    const row = buildRow({
      source,
      detailUrl: source.url,
      text: note,
      name,
      dateDeath: null,
      dateFuneral,
      timeFuneral: time,
      place: joinedPlace || source.name,
      kind: "funeral",
      forceFuneral: true
    });
    if (row) rows.push(row);
  }

  return uniq(rows, (row) => `${row.name}|${row.date_funeral}|${row.time_funeral}|${row.place}`);
}

async function parseZckFunerals(source) {
  const response = await fetchText(source.list_url || source.url);
  if (!response.ok) return { rows: [], error: response.error || `HTTP ${response.status}` };
  return { rows: parseZckFuneralsHtml(response.text, source), error: null };
}

function parsePukPozegnalismyHtml(text, source) {
  const $ = prepareReadableDocument(cheerio.load(text));
  const containers = $(".eklepsydra, .results-klepsydra, article, .card").toArray();
  const roots = containers.length ? containers : [$("body").get(0)];
  const rows = [];

  for (const root of roots) {
    const node = $(root);
    const body = cleanTechnicalNoise(node.text());
    if (!/zmar|pogrzeb|śp/i.test(body)) continue;

    const heading = cleanTechnicalNoise(node.find(".fs-28, h1, h2, h3, .name").first().text());
    const name = extractNameFromContext(body, source, source.url, [heading]);
    if (!name) continue;

    const dateDeath = dateNear(body, /\b(zmar[łłaey]?|zgon)\b/iu) || dateBeforeKeyword(body, /\b(zmar[łłaey]?|zgon)\b/iu);
    const dateFuneral = dateNear(body, /\b(data\s+pogrzebu|pogrzeb|uroczystości)\b/iu);
    const url = absoluteUrl(node.find("a[href]").filter((_, a) => /nekrolog|eklepsydra|pogrzeb/i.test($(a).attr("href") || "")).first().attr("href") || source.url, source.url);
    const row = buildRow({
      source,
      detailUrl: url,
      text: body,
      name,
      dateDeath,
      dateFuneral,
      timeFuneral: parseTime(body),
      place: extractPlace(body, source.name),
      kind: "death"
    });
    if (row) rows.push(row);
  }

  return uniq(rows, (row) => `${row.name}|${row.date_death || ""}|${row.date_funeral || ""}|${row.url}`);
}

async function parsePukPozegnalismy(source) {
  const response = await fetchText(source.list_url || source.url);
  if (!response.ok) return { rows: [], error: response.error || `HTTP ${response.status}` };
  return { rows: parsePukPozegnalismyHtml(response.text, source), error: null };
}

async function parseGenericHtml(source) {
  return { rows: [], error: `Brak parsera specyficznego dla source_id=${source?.id || "unknown"} type=${source?.type || "unknown"}` };
}

async function parseSource(source) {
  switch (source.type) {
    case "zck_funerals": return parseZckFunerals(source);
    case "puk_pozegnalismy": return parsePukPozegnalismy(source);
    case "gabriel24_nekrologi": return parseGabriel24Nekrologi(source);
    case "karawan_nekrologi": return parseKarawanNekrologi(source);
    case "grobonet_nekrologi": return parseGrobonetNekrologi(source);
    case "podwawelskie_nekrologi": return parsePodwawelskieNekrologi(source);
    case "debniki_sdb_pogrzeby": return parseDebnikiSdbPogrzeby(source);
    case "sw_jadwiga_pogrzebowe": return parseSwJadwigaPogrzebowe(source);
    case "generic_html": return parseGenericHtml(source);
    default: return { rows: [], error: `Nieznany parser type=${source?.type}` };
  }
}

function mergeRequiredSources(configSources = []) {
  const byId = new Map((configSources || []).map((source) => [source.id, source]));
  const merged = REQUIRED_SOURCES.map((required) => ({ ...required, ...(byId.get(required.id) || {}) }));
  for (const source of configSources || []) {
    if (!merged.some((item) => item.id === source.id)) merged.push(source);
  }
  return merged;
}

function isIntentionLikeSource(source) {
  return /intenc|pogrzebowe|debniki_sdb/i.test(`${source?.id || ""} ${source?.type || ""} ${source?.name || ""}`);
}

function isIntentionLikeRow(row) {
  const text = `${row?.note || ""} ${row?.source_name || ""}`;
  return /intencj/i.test(text) && !/pogrzeb/i.test(text);
}

function isEligibleDeathRow(row) {
  return row?.kind === "death" && isMeaningfulRow(row);
}

function isMeaningfulRow(row) {
  if (!validateParsedRow(row)) return false;
  if (row.kind === "death") return !!(row.date_death || row.date_funeral || row.note);
  if (row.kind === "funeral") return !!(row.date_funeral || row.note);
  return false;
}

function buildFallbackSummaryForHelena(recentDeaths, upcomingFunerals) {
  const hits = [...(recentDeaths || []), ...(upcomingFunerals || [])].filter((row) => row.priority_hit);
  if (!hits.length) return "Brak trafień dla monitorowanych fraz.";
  return `Trafienia dla monitorowanych fraz: ${hits.length}.`;
}

function resolveJobOutcome({ recentDeaths = 0, upcomingFunerals = 0, refreshErrors = [] }) {
  if (refreshErrors?.length) return { status: "done_with_errors", ok: true, errorMessage: refreshErrors.join(" | ") };
  return { status: "done", ok: true, errorMessage: null };
}

export {
  HELENA_GAWIN_PHRASES,
  REQUIRED_SOURCES,
  clean,
  nowISO,
  parsePolishDateToIso,
  parseTime,
  prepareReadableDocument,
  extractMainText,
  cleanTechnicalNoise,
  nameFromSlug,
  isBadNameCandidate,
  validateParsedRow,
  parseZckFuneralsHtml,
  parsePukPozegnalismyHtml,
  parseGabriel24NekrologiHtml,
  parseGabriel24DetailHtml,
  parseKarawanNekrologiHtml,
  parseKarawanDetailHtml,
  parseGrobonetNekrologiHtml,
  parseGrobonetDetailHtml,
  parsePodwawelskieNekrologiHtml,
  parsePodwawelskieDetailHtml,
  parseDebnikiSdbPogrzebyHtml,
  parseDebnikiSdbDetailHtml,
  parseSwJadwigaPogrzeboweHtml,
  parseSource,
  parseGenericHtml,
  isIntentionLikeSource,
  isIntentionLikeRow,
  isEligibleDeathRow,
  mergeRequiredSources,
  resolveJobOutcome,
  buildFallbackSummaryForHelena,
  isMeaningfulRow
};
