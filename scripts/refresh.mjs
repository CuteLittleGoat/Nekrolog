import admin from "firebase-admin";
import * as cheerio from "cheerio";
import { fetchText } from "./fetch.mjs";
import { todayLocalMidnight, addDays, inWindow } from "./date.mjs";
import { makePhraseVariants, textMatchesAny } from "./normalize.mjs";

const HELENA_GAWIN_PHRASES = [
  "Helena Gawin",
  "Helena Gawin-Dereń",
  "Helena Dereń-Gawin",
  "Helena Gawin Dereń",
  "Helena Dereń Gawin",
  "Helena Dereń",
  "Gawin Helena",
  "Gawin-Dereń Helena",
  "Dereń-Gawin Helena",
  "Gawin Dereń Helena",
  "Dereń Gawin Helena",
  "Dereń Helena",
  "Śp. Helena Gawin",
  "Śp. Helena Gawin-Dereń",
  "Śp. Helena Dereń-Gawin",
  "Śp. Helena Gawin Dereń",
  "Śp. Helena Dereń Gawin",
  "Śp. Helena Dereń",
  "Śp. Gawin Helena",
  "Śp. Gawin-Dereń Helena",
  "Śp. Dereń-Gawin Helena",
  "Śp. Gawin Dereń Helena",
  "Śp. Dereń Gawin Helena",
  "Śp. Dereń Helena"
];

const REQUIRED_SOURCES = [
  {
    id: "zck_funerals",
    name: "ZCK Kraków – Porządek pogrzebów",
    type: "zck_funerals",
    url: "https://www.zck-krakow.pl/funerals",
    enabled: true,
    distance_km: 0
  },
  {
    id: "puk_pozegnalismy",
    name: "PUK Kraków – Pożegnaliśmy",
    type: "generic_html",
    url: "https://www.puk.krakow.pl/pozegnalismy/",
    enabled: true,
    distance_km: 4.5
  },
  {
    id: "gabriel_nekrologi",
    name: "Gabriel24 – Nekrologi",
    type: "generic_html",
    url: "https://www.gabriel24.pl/nekrologi/",
    enabled: true,
    distance_km: 6.5
  },
  {
    id: "karawan_nekrologi",
    name: "Karawan – Nekrologi",
    type: "generic_html",
    url: "https://karawan.pl/nekrologi/",
    enabled: true,
    distance_km: 7.5
  },
  {
    id: "salwator_grobonet",
    name: "Kraków Salwator – Grobonet",
    type: "generic_html",
    url: "https://krakowsalwator.grobonet.com/nekrologi.php",
    enabled: true,
    distance_km: 5.5
  },
  {
    id: "debniki_sdb",
    name: "Parafia św. Stanisława Kostki (Dębniki)",
    type: "generic_html",
    url: "https://debniki.sdb.org.pl/",
    enabled: true,
    distance_km: 2.5
  },
  {
    id: "podwawelskie_nekrologi",
    name: "Podwawelskie – Nekrologi",
    type: "generic_html",
    url: "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
    enabled: true,
    distance_km: 2.5
  },
  {
    id: "sw_jadwiga_pogrzebowe",
    name: "Parafia św. Jadwigi – Msze święte pogrzebowe",
    type: "generic_html",
    url: "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
    enabled: true,
    distance_km: 6.5
  },
  {
    id: "facebook_parafia_debniki",
    name: "Facebook – Parafia Dębniki",
    type: "generic_html",
    url: "https://www.facebook.com/parafiadebniki/?locale=pl_PL",
    enabled: true,
    distance_km: 2.5
  }
];

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Brak env: ${name}`);
  return v;
}

function initAdmin() {
  const raw = mustEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
  return admin.firestore();
}

function nowISO() {
  return new Date().toISOString();
}

function clean(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function asDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return [...map.values()];
}

function normalizeSource(source) {
  const normalized = { ...source };
  const sourceId = String(normalized.id || "").toLowerCase();
  const sourceUrl = String(normalized.url || "").toLowerCase();

  if (sourceId === "par_debniki_contact" || sourceUrl.includes("debniki.sdb.org.pl/kontakt")) {
    normalized.enabled = false;
  }

  if (
    sourceId === "podgorki_tynieckie_grobonet"
    && (sourceUrl === "https://klepsydrakrakow.grobonet.com/" || sourceUrl === "https://klepsydrakrakow.grobonet.com")
  ) {
    normalized.url = "https://klepsydrakrakow.grobonet.com/nekrologi.php";
  }

  return normalized;
}

function hasContent(value) {
  return clean(value).length > 0;
}

function resolveJobOutcome({ recentDeaths, upcomingFunerals, refreshErrors }) {
  const validEntries = Number(recentDeaths || 0) + Number(upcomingFunerals || 0);
  const errors = Array.isArray(refreshErrors) ? refreshErrors.filter(hasContent) : [];

  if (validEntries <= 0) {
    return {
      status: "error",
      ok: false,
      errorMessage: errors.join(" | ") || "Brak prawidłowych wpisów w odświeżaniu"
    };
  }

  if (errors.length) {
    return {
      status: "done_with_errors",
      ok: true,
      errorMessage: errors.join(" | ")
    };
  }

  return {
    status: "done",
    ok: true,
    errorMessage: null
  };
}

function isMeaningfulRow(row) {
  return [
    row?.name,
    row?.note,
    row?.date,
    row?.date_death,
    row?.date_funeral,
    row?.time_funeral,
    row?.source_name,
    row?.url
  ].some(hasContent);
}

function mergeRequiredSources(existingSources) {
  const list = Array.isArray(existingSources) ? existingSources.map(normalizeSource) : [];
  const byUrl = new Map(list.map((s) => [String(s.url || "").toLowerCase(), s]));

  for (const required of REQUIRED_SOURCES) {
    const existing = byUrl.get(required.url.toLowerCase());
    if (existing) {
      if (!existing.id) existing.id = required.id;
      if (!existing.name) existing.name = required.name;
      if (!existing.type) existing.type = required.type;
      if (typeof existing.distance_km !== "number") existing.distance_km = required.distance_km;
      if (typeof existing.enabled !== "boolean") existing.enabled = true;
      Object.assign(existing, normalizeSource(existing));
      continue;
    }
    list.push(normalizeSource(required));
  }

  return uniqueBy(list, (s) => String(s.url || "").toLowerCase());
}

/**
 * Parser: ZCK Porządek pogrzebów
 * URL: https://www.zck-krakow.pl/funerals
 * Struktura: dzień -> lista cmentarzy -> wiersze (godzina, miejsce, imię nazwisko + wiek)
 */
function parseZckFuneralsHtml(text, source) {
  const $ = cheerio.load(text);
  const rows = [];

  const dateMatches = clean($.text()).match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const currentDate = dateMatches[0] || null;

  const textNodes = $("body")
    .find("h1,h2,h3,h4,h5,h6,li,p,div,td,span,strong,b")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean);

  let currentCemetery = null;
  for (let i = 0; i < textNodes.length; i += 1) {
    const line = textNodes[i];
    if (/cmentarz/i.test(line)) {
      currentCemetery = line;
      continue;
    }
    if (/brak pogrzeb[oó]w/i.test(line)) continue;

    const time = line.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)?.[0]
      || line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0]
      || null;

    if (!time) continue;

    const placeCandidate = clean(textNodes[i + 1] || "");
    const nameCandidate = clean(textNodes[i + 2] || "");
    if (!nameCandidate || /^(kaplica|cmentarz|brak\b)/i.test(nameCandidate)) continue;

    const name = clean(nameCandidate.replace(/\s*\(.*?\)\s*$/g, "").replace(/^\W+/, ""));
    if (!name) continue;

    const placeParts = [placeCandidate, currentCemetery].filter(Boolean);
    rows.push({
      kind: "funeral",
      name,
      date_funeral: currentDate,
      time_funeral: time,
      place: placeParts.join(" – "),
      source_id: source.id,
      source_name: source.name,
      url: source.url,
      note: null
    });
  }

  return uniqueBy(rows, (r) => `${r.time_funeral}|${r.name}|${r.place}`);
}

async function parseZckFunerals(source) {
  const { ok, status, text, error } = await fetchText(source.url);
  if (!ok) return { rows: [], error: error || `HTTP ${status}` };
  return { rows: parseZckFuneralsHtml(text, source), error: null };
}

/**
 * Parser: Intencje “+ / †” (strona HTML z listą intencji)
 * Wykrywa wpisy, które wyglądają jak: "+ Jan Kowalski", "†† Anna i Piotr ..."
 * NIE gwarantuje, że to pogrzeb – traktujemy jako “death mention”.
 */
function parseIntentionsPlusHtml(text, source) {
  const $ = cheerio.load(text);
  const bodyLines = $("body")
    .find("p,li,div,td,tr,h1,h2,h3,h4,h5,h6")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean);
  const content = bodyLines.length ? bodyLines.join("\n") : $("body").text();

  // Prosta ekstrakcja: linie z + / †
  const lines = content
    .split(/[\n\r]+/)
    .map(clean)
    .filter(Boolean)
    .filter(l => /(^|\s)[+†]{1,2}\s*/.test(l));

  const rows = lines.slice(0, 200).map(l => {
    // wytnij prefiks +/†
    const namePart = clean(l.replace(/^.*?([+†]{1,2})\s*/,"").slice(0, 120));
    return {
      kind: "death",
      name: namePart || "(wzmianka w intencjach)",
      date_death: null,
      date_funeral: null,
      time_funeral: null,
      place: source.name,
      source_id: source.id,
      source_name: source.name,
      url: source.url,
      note: `Wzmianka z intencji: ${l.slice(0, 140)}`
    };
  });

  return rows;
}

async function parseIntentionsPlus(source) {
  const { ok, status, text, error } = await fetchText(source.url);
  if (!ok) return { rows: [], error: error || `HTTP ${status}` };
  return { rows: parseIntentionsPlusHtml(text, source), error: null };
}

/**
 * Parser: Generic HTML “nekrolog/pogrzeb/zmarł”
 * (dla prostych stron domów pogrzebowych/parafii)
 */
async function parseGenericHtml(source) {
  const { ok, status, text, error } = await fetchText(source.url);
  if (!ok) return { rows: [], error: error || `HTTP ${status}` };

  const $ = cheerio.load(text);
  const content = clean($("body").text()).slice(0, 200000);

  // Szukamy zdań z “pogrzeb”, “zmarł”, “śp.” i datą
  const hits = [];
  const sentences = content.split(/[.!?]\s+/);
  for (const s of sentences) {
    const ss = clean(s);
    if (!ss) continue;
    if (!/(pogrzeb|zmarł|zmarła|śp\.)/i.test(ss)) continue;
    if (!/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|(\d{4}-\d{2}-\d{2})/i.test(ss)) continue;
    hits.push(ss.slice(0, 220));
    if (hits.length >= 60) break;
  }

  const rows = hits.map((h, idx) => ({
    kind: "death",
    name: "(wpis tekstowy)",
    date_death: null,
    place: source.name,
    source_id: source.id,
    source_name: source.name,
    url: source.url,
    note: h
  }));

  return { rows, error: null };
}

async function main() {
  const db = initAdmin();

  const cfg = {
    nekrologConfigCollection: "Nekrologi_config",
    nekrologSnapshotsCollection: "Nekrologi_snapshots",
    nekrologRefreshJobsCollection: "Nekrologi_refresh_jobs",
    nekrologSnapshotDocId: "latest",
    nekrologRefreshJobDocId: "latest",
  };

  const back = Number(process.env.NEKROLOG_WINDOW_DAYS_BACK ?? "7");
  const fwd  = Number(process.env.NEKROLOG_WINDOW_DAYS_FORWARD ?? "7");
  const start = addDays(todayLocalMidnight(), -back);
  const end   = addDays(todayLocalMidnight(), fwd);

  const jobRef = db.collection(cfg.nekrologRefreshJobsCollection).doc(cfg.nekrologRefreshJobDocId);
  const snapRef = db.collection(cfg.nekrologSnapshotsCollection).doc(cfg.nekrologSnapshotDocId);
  const srcRef = db.collection(cfg.nekrologConfigCollection).doc("sources");

    await jobRef.set({
      status: "running",
      trigger: "github_actions",
      writer_name: "scripts/refresh.mjs",
      writer_version: "2026-02-16.2",
      started_at: nowISO(),
      updated_at: nowISO(),
      ok: null,
      error_message: null
  }, { merge: true });

  try {
    const srcDoc = await srcRef.get();
    const sourcesRaw = (srcDoc.exists ? (srcDoc.data().sources || []) : []);
    const sources = mergeRequiredSources(sourcesRaw);
    if (sources.length !== (Array.isArray(sourcesRaw) ? sourcesRaw.length : 0)) {
      await srcRef.set({ sources, updated_at: nowISO() }, { merge: true });
    }
    if (!sources.length) throw new Error("Brak źródeł w Nekrologi_config/sources");

    const targetPhrases = HELENA_GAWIN_PHRASES;
    const phraseVariants = makePhraseVariants(targetPhrases);

    const enabled = sources.filter(s => s.enabled !== false);

    const allRows = [];
    const sourceErrors = [];
    const sourceLite = enabled.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      distance_km: s.distance_km ?? null,
      enabled: s.enabled !== false
    }));

    for (const s of enabled) {
      let parsed = { rows: [], error: null };

      if (s.type === "zck_funerals") parsed = await parseZckFunerals(s);
      else if (s.type === "intencje_plus") parsed = await parseIntentionsPlus(s);
      else if (s.type === "generic_html") parsed = await parseGenericHtml(s);
      else parsed = { rows: [], error: `Nieznany parser type=${s.type}` };

      for (const r of parsed.rows) {
        if (!isMeaningfulRow(r)) continue;
        const hit = textMatchesAny([r.name, r.note, r.place, r.source_name].join(" "), phraseVariants);
        allRows.push({ ...r, priority_hit: !!hit });
      }

      if (parsed.error) {
        sourceErrors.push({
          source_id: s.id,
          source_name: s.name,
          url: s.url,
          error: clean(parsed.error)
        });
        allRows.push({
          kind: "meta",
          name: "(błąd źródła)",
          date: null,
          place: s.name,
          source_id: s.id,
          source_name: s.name,
          url: s.url,
          note: `Parser error: ${parsed.error}`,
          priority_hit: false
        });
      }
    }

    // Podział na zgony/pogrzeby + okno czasowe
    const funerals = allRows.filter(r => (r.kind === "funeral"));
    const deaths   = allRows.filter(r => (r.kind === "death"));

    const upcoming_funerals = funerals.filter(r => inWindow(r.date_funeral, start, end));
    const recent_deaths = deaths.filter(r => inWindow(r.date_death, start, end) || (!r.date_death && r.note));

    // Uporządkuj
    upcoming_funerals.sort((a,b) => (a.date_funeral||"").localeCompare(b.date_funeral||"") || (a.time_funeral||"").localeCompare(b.time_funeral||""));
    recent_deaths.sort((a,b) => (b.date_death||"").localeCompare(a.date_death||""));

    const latestDeath = [...recent_deaths]
      .sort((a, b) => (asDateValue(b.date_death)?.getTime() || 0) - (asDateValue(a.date_death)?.getTime() || 0))[0] || null;
    const nearestFuneral = [...upcoming_funerals]
      .sort((a, b) => (asDateValue(a.date_funeral)?.getTime() || Number.MAX_SAFE_INTEGER) - (asDateValue(b.date_funeral)?.getTime() || Number.MAX_SAFE_INTEGER))[0] || null;

    const fallbackSummary = {
      text: "Helena Gawin - brak informacji",
      date_death: latestDeath?.date_death || null,
      date_funeral: nearestFuneral?.date_funeral || null,
      urls: uniqueBy(
        [latestDeath, nearestFuneral].filter(Boolean).map((r) => ({
          url: r.url,
          source_name: r.source_name
        })),
        (r) => `${r.url}|${r.source_name}`
      )
    };

    if (fallbackSummary.date_death || fallbackSummary.date_funeral) {
      fallbackSummary.text = `Helena Gawin zmarła ${fallbackSummary.date_death || "(brak daty)"}, pogrzeb ${fallbackSummary.date_funeral || "(brak daty)"}`;
    }

    const refreshErrors = allRows
      .filter((r) => r.kind === "meta" && hasContent(r.note))
      .map((r) => `${r.source_name}: ${clean(r.note)}`);

    const payload = {
      generated_at: nowISO(),
      updated_at: nowISO(),
      deaths,
      funerals,
      recent_deaths,
      upcoming_funerals,
      fallback_summary: fallbackSummary,
      sources: sourceLite,
      target_phrases: targetPhrases,
      source_errors: sourceErrors,
      refresh_error: refreshErrors.join(" | "),
      writer_name: "scripts/refresh.mjs",
      writer_version: "2026-02-16.2"
    };

    await snapRef.set({
      ...payload,
      payload,
      data: payload
    }, { merge: true });

    const jobOutcome = resolveJobOutcome({
      recentDeaths: recent_deaths.length,
      upcomingFunerals: upcoming_funerals.length,
      refreshErrors
    });

    await jobRef.set({
      status: jobOutcome.status,
      finished_at: nowISO(),
      updated_at: nowISO(),
      ok: jobOutcome.ok,
      error_message: jobOutcome.errorMessage,
      source_errors: sourceErrors
    }, { merge: true });

    console.log("OK. Rows:", allRows.length, "funerals:", upcoming_funerals.length, "deaths:", recent_deaths.length);
  } catch (e) {
    await jobRef.set({
      status: "error",
      finished_at: nowISO(),
      updated_at: nowISO(),
      ok: false,
      error_message: String(e?.message || e),
      writer_name: "scripts/refresh.mjs",
      writer_version: "2026-02-16.2"
    }, { merge: true });
    console.error("ERROR:", e);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  parseZckFunerals,
  parseZckFuneralsHtml,
  parseIntentionsPlus,
  parseIntentionsPlusHtml,
  parseGenericHtml,
  mergeRequiredSources,
  normalizeSource,
  resolveJobOutcome
};
