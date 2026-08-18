import { makePhraseVariants, textMatchesAny } from "./scripts/normalize.mjs";

// Lista zapasowa. Właściwym źródłem fraz jest snapshot (target_phrases), który niesie
// pełny zestaw z Frazy.json wraz z formami deklinowanymi — tu zostaje tylko tyle,
// żeby interfejs działał, gdy latest.json jeszcze nie istnieje.
const FALLBACK_PHRASES = [
  "Helena Gawin",
  "Gawin Helena",
  "Helena Dereń",
  "Dereń Helena",
  "Helena Gawin-Dereń",
  "Gawin-Dereń Helena"
];

const STALE_SNAPSHOT_HOURS = 26;
const UNSAFE_URL_SCHEME = /^(javascript|data|vbscript|file):/i;

function el(id) {
  return document.getElementById(id);
}

async function loadJson(path, fallback) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return { ...fallback, __loadError: `HTTP ${response.status}` };
    return await response.json();
  } catch (error) {
    return { ...fallback, __loadError: String(error?.message || error) };
  }
}

function pickRows(snapshot, preferredKey, fallbackKey) {
  return snapshot?.[preferredKey]
    || snapshot?.[fallbackKey]
    || snapshot?.payload?.[preferredKey]
    || snapshot?.payload?.[fallbackKey]
    || snapshot?.data?.[preferredKey]
    || snapshot?.data?.[fallbackKey]
    || [];
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

function formatTs(value) {
  return value ? esc(value) : "—";
}

function formatDate(value) {
  return value ? esc(value) : "—";
}

function compact(parts) {
  return parts.filter((part) => part && String(part).trim().length > 0);
}

// Sam esc() chroni przed wyjściem z atrybutu, ale nie przed schematem javascript:
// w adresie pochodzącym ze źródła.
function externalLink(url, label = "Otwórz źródło") {
  if (!url || UNSAFE_URL_SCHEME.test(String(url).trim())) return "";
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

function rowMatchesHelena(row, phraseVariants) {
  const haystack = [row?.name, row?.full_name, row?.note, row?.place, row?.source_name].filter(Boolean).join(" ");
  return textMatchesAny(haystack, phraseVariants);
}

function isHitRow(row, phraseVariants) {
  return row?.priority_hit === true || rowMatchesHelena(row, phraseVariants);
}

function renderFacts(row, type) {
  const facts = [];
  if (type === "intention") {
    facts.push(`<div class="fact"><strong>Termin:</strong> ${compact([formatDate(row?.date_intention), row?.time_intention ? esc(row.time_intention) : ""]).join(", ") || "—"}</div>`);
  } else if (type === "death") {
    if (row?.date_death) facts.push(`<div class="fact"><strong>Zgon:</strong> ${formatDate(row.date_death)}</div>`);
    if (row?.date_funeral || row?.time_funeral) facts.push(`<div class="fact"><strong>Pogrzeb:</strong> ${compact([formatDate(row.date_funeral), row?.time_funeral ? esc(row.time_funeral) : ""]).join(", ")}</div>`);
  } else if (type === "grave") {
    if (row?.date_birth) facts.push(`<div class="fact"><strong>Urodzony:</strong> ${formatDate(row.date_birth)}</div>`);
    if (row?.date_death) facts.push(`<div class="fact"><strong>Zgon:</strong> ${formatDate(row.date_death)}</div>`);
  } else if (type === "funeral") {
    facts.push(`<div class="fact"><strong>Pogrzeb:</strong> ${compact([formatDate(row?.date_funeral), row?.time_funeral ? esc(row.time_funeral) : ""]).join(", ") || "—"}</div>`);
  } else {
    if (row?.date_death) facts.push(`<div class="fact"><strong>Zgon:</strong> ${formatDate(row.date_death)}</div>`);
    if (row?.date_funeral) facts.push(`<div class="fact"><strong>Pogrzeb:</strong> ${compact([formatDate(row.date_funeral), row?.time_funeral ? esc(row.time_funeral) : ""]).join(", ")}</div>`);
    if (row?.date_intention) facts.push(`<div class="fact"><strong>Intencja:</strong> ${compact([formatDate(row.date_intention), row?.time_intention ? esc(row.time_intention) : ""]).join(", ")}</div>`);
  }
  if (row?.date_is_fallback === true) facts.push('<div class="fact warnText"><strong>Uwaga:</strong> data zastępcza (dzień pobrania)</div>');
  if (row?.place) facts.push(`<div class="fact"><strong>Miejsce:</strong> ${esc(row.place)}</div>`);
  if (row?.source_name) facts.push(`<div class="fact"><strong>Źródło:</strong> ${esc(row.source_name)}</div>`);
  if (Array.isArray(row?.also_in_sources) && row.also_in_sources.length) facts.push(`<div class="fact"><strong>Także w:</strong> ${esc(row.also_in_sources.join(", "))}</div>`);
  return facts.join("");
}

function renderList(id, rows, type, phraseVariants, emptyText = "Brak wpisów w oknie czasowym.") {
  const container = el(id);
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `<div class="small">${esc(emptyText)}</div>`;
    return;
  }

  container.innerHTML = rows.map((row) => {
    const name = row?.name || row?.full_name || "(brak nazwiska)";
    const isHit = isHitRow(row, phraseVariants);
    const classes = compact(["item", isHit ? "hit" : ""]);
    return `
      <div class="${classes.join(" ")}">
        <div class="top">
          <div class="name">${esc(name)}</div>
          ${isHit ? '<div class="badge hit">trafienie</div>' : ""}
        </div>
        <div class="facts">${renderFacts(row, type)}</div>
        ${row?.note ? `<div class="note">${esc(row.note)}</div>` : ""}
        ${row?.url ? `<div class="source-row">${externalLink(row.url, "Otwórz źródło")}</div>` : ""}
      </div>
    `;
  }).join("");
}

function renderSources(sources) {
  const container = el("sources");
  if (!container) return;

  const html = (sources || []).map((source) => {
    const enabled = source?.enabled !== false;
    const classes = compact(["source", enabled ? "" : "disabled"]);
    return `
      <div class="${classes.join(" ")}">
        <div class="top">
          <div class="sname">${esc(source?.name || source?.id || "(brak nazwy)")}</div>
          ${enabled ? "" : '<div class="badge disabled">wyłączone</div>'}
        </div>
        <div class="smeta">Typ: ${esc(source?.type || "—")}</div>
        <div class="smeta">Dystans: ${source?.distance_km ?? "—"} km</div>
        <div class="smeta">Enabled: ${enabled ? "true" : "false"}</div>
        <div class="smeta">${externalLink(source?.url, "Otwórz źródło")}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = html || '<div class="small">Brak skonfigurowanych źródeł.</div>';
}

// Trafienia pokazujemy niezależnie od okien czasowych: wpis o monitorowanej osobie
// sprzed miesiąca (np. Podwawelskie publikuje z opóźnieniem) ma być widoczny tak samo
// jak dzisiejszy.
function renderHelenaStatus(snap, matches, phraseVariants) {
  const node = el("helenaStatus");
  if (!node) return;

  const fallback = snap?.fallback_summary || snap?.payload?.fallback_summary || snap?.data?.fallback_summary;

  if (matches.length > 0) {
    const sources = [...new Set(matches.map((r) => r?.source_name).filter(Boolean))];
    node.textContent = `Helena Gawin: znaleziono ${matches.length} ${matches.length === 1 ? "pasujący wpis" : "pasujących wpisów"} w źródłach: ${sources.join(", ")}.`;
    node.classList.add("hitText");
    return;
  }

  node.classList.remove("hitText");
  node.textContent = fallback?.text ? String(fallback.text) : "Helena Gawin - brak informacji";
}

function hoursSince(value) {
  const ts = Date.parse(value || "");
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / 3_600_000;
}

function renderStatus(snap, job, errors, matches) {
  const jobStatus = job?.status || "—";
  const snapshotTime = snap?.generated_at || snap?.updated_at || "—";
  const jobTime = job?.updated_at || job?.finished_at || "—";
  const age = hoursSince(snap?.generated_at || snap?.updated_at);
  const loadFailed = !!snap?.__loadError || !Object.keys(snap || {}).filter((k) => k !== "__loadError").length;
  const stale = age !== null && age > STALE_SNAPSHOT_HOURS;

  const pill = el("statusPill");
  if (pill) {
    pill.classList.remove("ok", "warn", "bad");
    if (loadFailed || jobStatus === "error") pill.classList.add("bad");
    else if (stale || jobStatus === "done_with_errors") pill.classList.add("warn");
    else if (jobStatus === "done") pill.classList.add("ok");
  }

  if (el("jobStatus")) el("jobStatus").textContent = loadFailed ? "brak danych" : jobStatus;
  if (el("snapshotTime")) el("snapshotTime").textContent = formatTs(snapshotTime);
  if (el("jobTime")) el("jobTime").textContent = formatTs(jobTime);

  // Bez tego pusty interfejs po nieudanym pobraniu wyglądał identycznie jak
  // poprawny przebieg bez wpisów w oknie.
  const banner = el("dataWarning");
  if (banner) {
    if (loadFailed) {
      banner.textContent = `Nie udało się wczytać snapshotu (${snap?.__loadError || "brak pliku"}). Dane poniżej mogą być niekompletne.`;
      banner.className = "banner bad";
    } else if (stale) {
      banner.textContent = `Snapshot ma ${Math.round(age)} h — automatyczne odświeżanie prawdopodobnie nie działa.`;
      banner.className = "banner warn";
    } else {
      banner.textContent = "";
      banner.className = "banner hidden";
    }
  }

  const errorsList = [];
  for (const item of errors?.errors || []) errorsList.push(`${item.source_name || item.source_id || "source"}: ${item.error || "błąd"}`);
  for (const item of job?.source_errors || []) errorsList.push(`${item.source_name || item.source_id || "source"}: ${item.error || "błąd"}`);

  const diagnostics = job?.source_diagnostics || snap?.source_diagnostics || [];
  const logLines = [
    `latest.json: ${loadFailed ? "BRAK" : "OK"}`,
    `job.json: ${Object.keys(job || {}).length ? "OK" : "BRAK"}`,
    `źródła sprawne: ${job?.sources_healthy ?? "?"}/${job?.sources_total ?? (snap?.sources || []).length}`,
    `rekordy: ${job?.rows_total ?? "?"} | trafienia: ${matches.length}`,
    `errors.json: ${(errors?.errors || []).length}`
  ];

  // Bogata diagnostyka istniała w job.json, ale nie była pokazywana nigdzie —
  // ciche awarie parserów były przez to niewidoczne z poziomu interfejsu.
  if (diagnostics.length) {
    logLines.push("", "Diagnostyka źródeł:");
    for (const d of diagnostics) {
      const parts = [
        d.source_name || d.source_id,
        d.http_status ? `HTTP ${d.http_status}` : "",
        d.parser_status ? `status=${d.parser_status}` : "",
        d.candidate_links !== undefined ? `linki=${d.candidate_links}` : "",
        d.candidate_pages !== undefined ? `strony=${d.candidate_pages}` : "",
        d.rows !== undefined ? `rekordy=${d.rows}` : "",
        d.empty_streak ? `pustych z rzędu=${d.empty_streak}` : "",
        d.error ? `BŁĄD: ${d.error}` : ""
      ];
      logLines.push(`- ${compact(parts).join(" | ")}`);
    }
  }

  if (errorsList.length) {
    logLines.push("", "Błędy źródeł:");
    logLines.push(...errorsList.slice(0, 10).map((line) => `- ${line}`));
  }

  const logNode = el("log");
  if (logNode) logNode.textContent = logLines.join("\n");
}

async function loadAll() {
  const [snap, job, cfg, errors] = await Promise.all([
    loadJson("data/latest.json", {}),
    loadJson("data/job.json", {}),
    loadJson("config/sources.json", { sources: [] }),
    loadJson("data/errors.json", { errors: [] })
  ]);

  const phrasesFromSnapshot = snap?.target_phrases || snap?.payload?.target_phrases || snap?.data?.target_phrases;
  const phraseVariants = makePhraseVariants(Array.isArray(phrasesFromSnapshot) && phrasesFromSnapshot.length ? phrasesFromSnapshot : FALLBACK_PHRASES);

  const deaths = pickRows(snap, "recent_deaths", "deaths");
  const funerals = pickRows(snap, "upcoming_funerals", "funerals");
  const intentions = pickRows(snap, "upcoming_intentions", "intentions");
  const graves = pickRows(snap, "graves", "graves");
  const allRows = [...pickRows(snap, "deaths", "deaths"), ...pickRows(snap, "funerals", "funerals"), ...pickRows(snap, "intentions", "intentions"), ...graves];
  const matches = (snap?.matches || snap?.payload?.matches || snap?.data?.matches || allRows.filter((r) => isHitRow(r, phraseVariants)));
  const sources = snap?.sources || snap?.payload?.sources || snap?.data?.sources || cfg?.sources || [];

  renderList("matches", matches, "match", phraseVariants, "Brak wpisów pasujących do monitorowanych fraz.");
  renderList("deaths", deaths, "death", phraseVariants);
  renderList("funerals", funerals, "funeral", phraseVariants);
  renderList("intentions", intentions, "intention", phraseVariants, "Brak intencji w oknie czasowym.");
  renderList("graves", graves, "grave", phraseVariants, "Brak grobów w bazie dla monitorowanych nazwisk.");
  renderSources(sources);
  renderHelenaStatus(snap, matches, phraseVariants);
  renderStatus(snap, job, errors, matches);
}

loadAll();
