import admin from "firebase-admin";
import cheerio from "cheerio";
import { fetchText } from "./fetch.mjs";
import { todayLocalMidnight, addDays, toISODate, inWindow } from "./date.mjs";
import { makePhraseVariants, textMatchesAny } from "./normalize.mjs";

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

/**
 * Parser: ZCK Porządek pogrzebów
 * URL: https://www.zck-krakow.pl/funerals
 * Struktura: dzień -> lista cmentarzy -> wiersze (godzina, miejsce, imię nazwisko + wiek)
 */
async function parseZckFunerals(source) {
  const { ok, status, text } = await fetchText(source.url);
  if (!ok) return { rows: [], error: `HTTP ${status}` };

  const $ = cheerio.load(text);
  const rows = [];

  // Nagłówek daty (np. 2026-02-15)
  const dateHeader = $("h4, h3").filter((_, el) => /\d{4}-\d{2}-\d{2}/.test($(el).text())).first().text();
  const currentDate = (dateHeader.match(/\d{4}-\d{2}-\d{2}/) || [null])[0];

  // Sekcje cmentarzy
  $("h4").each((_, h) => {
    const cemetery = clean($(h).text());
    if (!cemetery.toLowerCase().includes("cmentarz")) return;

    // Wiersze po nagłówku – różnie renderowane; łapiemy najbliższe listy
    let block = $(h).next();
    // “Brak pogrzebów…”
    if (clean(block.text()).toLowerCase().includes("brak pogrzebów")) return;

    // Szukamy tekstów typu "10:00, Kaplica, Jan Kowalski (lat 80)."
    const blob = [];
    for (let i=0; i<8 && block && block.length; i++) {
      const t = clean(block.text());
      if (t) blob.push(t);
      block = block.next();
      if (block.is("h4")) break;
    }

    const joined = blob.join(" • ");
    const re = /(\d{1,2}:\d{2})\s*,\s*([^,]+)\s*,\s*([^•()]+?)(?:\s*\(.*?\))?(?=•|$)/g;
    let m;
    while ((m = re.exec(joined)) !== null) {
      rows.push({
        kind: "funeral",
        name: clean(m[3]),
        date_funeral: currentDate || null,
        time_funeral: m[1],
        place: `${clean(m[2])} – ${cemetery}`,
        source_id: source.id,
        source_name: source.name,
        url: source.url,
        note: null
      });
    }
  });

  return { rows, error: null };
}

/**
 * Parser: Intencje “+ / †” (strona HTML z listą intencji)
 * Wykrywa wpisy, które wyglądają jak: "+ Jan Kowalski", "†† Anna i Piotr ..."
 * NIE gwarantuje, że to pogrzeb – traktujemy jako “death mention”.
 */
async function parseIntentionsPlus(source) {
  const { ok, status, text } = await fetchText(source.url);
  if (!ok) return { rows: [], error: `HTTP ${status}` };

  const $ = cheerio.load(text);
  const content = clean($("body").text());

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

  return { rows, error: null };
}

/**
 * Parser: Generic HTML “nekrolog/pogrzeb/zmarł”
 * (dla prostych stron domów pogrzebowych/parafii)
 */
async function parseGenericHtml(source) {
  const { ok, status, text } = await fetchText(source.url);
  if (!ok) return { rows: [], error: `HTTP ${status}` };

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
    nekrologConfigCollection: "Nekrolog_config",
    nekrologSnapshotsCollection: "Nekrolog_snapshots",
    nekrologRefreshJobsCollection: "Nekrolog_refresh_jobs",
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
    started_at: nowISO(),
    updated_at: nowISO(),
    ok: null,
    error_message: null
  }, { merge: true });

  try {
    const srcDoc = await srcRef.get();
    const sources = (srcDoc.exists ? (srcDoc.data().sources || []) : []);
    if (!sources.length) throw new Error("Brak źródeł w Nekrolog_config/sources");

    const snapDoc = await snapRef.get();
    const targetPhrases = snapDoc.exists ? (snapDoc.data().target_phrases || []) : [];
    const phraseVariants = makePhraseVariants(targetPhrases);

    const enabled = sources.filter(s => s.enabled !== false);

    const allRows = [];
    const sourceLite = enabled.map(s => ({
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
        const hit = textMatchesAny([r.name, r.note, r.place, r.source_name].join(" "), phraseVariants);
        allRows.push({ ...r, priority_hit: !!hit });
      }

      if (parsed.error) {
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

    const payload = {
      generated_at: nowISO(),
      updated_at: nowISO(),
      deaths,
      funerals,
      recent_deaths,
      upcoming_funerals,
      sources: sourceLite,
      target_phrases: targetPhrases
    };

    await snapRef.set({
      ...payload,
      payload,
      data: payload
    }, { merge: true });

    await jobRef.set({
      status: "done",
      finished_at: nowISO(),
      updated_at: nowISO(),
      ok: true,
      error_message: null
    }, { merge: true });

    console.log("OK. Rows:", allRows.length, "funerals:", upcoming_funerals.length, "deaths:", recent_deaths.length);
  } catch (e) {
    await jobRef.set({
      status: "error",
      finished_at: nowISO(),
      updated_at: nowISO(),
      ok: false,
      error_message: String(e?.message || e)
    }, { merge: true });
    console.error("ERROR:", e);
    process.exitCode = 1;
  }
}

await main();
