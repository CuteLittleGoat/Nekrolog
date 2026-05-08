import { makePhraseVariants, textMatchesAny } from "./scripts/normalize.mjs";

const HELENA_GAWIN_PHRASES = [
  "Helena Gawin",
  "Gawin Helena",
  "Śp. Helena Gawin",
  "Śp. Gawin Helena",
  "Helena Dereń",
  "Dereń Helena",
  "Śp. Helena Dereń",
  "Śp. Dereń Helena",
  "Helena Gawin-Dereń",
  "Gawin-Dereń Helena",
  "Śp. Helena Gawin-Dereń",
  "Śp. Gawin-Dereń Helena",
  "Helena Dereń-Gawin",
  "Dereń-Gawin Helena",
  "Śp. Helena Dereń-Gawin",
  "Śp. Dereń-Gawin Helena",
  "Helena Gawin Dereń",
  "Gawin Dereń Helena",
  "Śp. Helena Gawin Dereń",
  "Śp. Gawin Dereń Helena",
  "Helena Dereń Gawin",
  "Dereń Gawin Helena",
  "Śp. Helena Dereń Gawin",
  "Śp. Dereń Gawin Helena"
];

function el(id) {
  return document.getElementById(id);
}

async function loadJson(path, fallback) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
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

function externalLink(url, label = "Otwórz źródło") {
  if (!url) return "";
  const safeUrl = esc(url);
  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

function rowMatchesHelena(row, phraseVariants) {
  const haystack = [row?.name, row?.full_name, row?.note, row?.place, row?.source_name].join(" ");
  return textMatchesAny(haystack, phraseVariants);
}

function renderList(id, rows, type, phraseVariants) {
  const container = el(id);
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div class="small">Brak wpisów w oknie czasowym.</div>';
    return;
  }

  const html = rows.map((row) => {
    const name = row?.name || row?.full_name || "(brak nazwiska)";
    const isHit = row?.priority_hit === true || rowMatchesHelena(row, phraseVariants);
    const classes = compact(["item", isHit ? "hit" : ""]);

    const facts = [];
    if (type === "death") {
      if (row?.date_death) facts.push(`<div class="fact"><strong>Zgon:</strong> ${formatDate(row.date_death)}</div>`);
      if (row?.date_funeral || row?.time_funeral) facts.push(`<div class="fact"><strong>Pogrzeb:</strong> ${compact([formatDate(row.date_funeral), row?.time_funeral ? esc(row.time_funeral) : ""]).join(", ")}</div>`);
    } else {
      facts.push(`<div class="fact"><strong>Pogrzeb:</strong> ${compact([formatDate(row?.date_funeral), row?.time_funeral ? esc(row.time_funeral) : ""]).join(", ") || "—"}</div>`);
    }
    if (row?.place) facts.push(`<div class="fact"><strong>Miejsce:</strong> ${esc(row.place)}</div>`);
    if (row?.source_name) facts.push(`<div class="fact"><strong>Źródło:</strong> ${esc(row.source_name)}</div>`);

    return `
      <div class="${classes.join(" ")}">
        <div class="top">
          <div class="name">${esc(name)}</div>
          ${isHit ? '<div class="badge hit">trafienie</div>' : ""}
        </div>
        <div class="facts">${facts.join("")}</div>
        ${row?.note ? `<div class="note">${esc(row.note)}</div>` : ""}
        ${row?.url ? `<div class="source-row">${externalLink(row.url, "Otwórz źródło")}</div>` : ""}
      </div>
    `;
  }).join("");

  container.innerHTML = html;
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

function renderHelenaStatus(snap, deaths, funerals, phraseVariants) {
  const node = el("helenaStatus");
  if (!node) return;

  const fallback = snap?.fallback_summary || snap?.payload?.fallback_summary || snap?.data?.fallback_summary;
  const hits = [...deaths, ...funerals].filter((row) => row?.priority_hit === true || rowMatchesHelena(row, phraseVariants));

  if (hits.length > 0) {
    node.textContent = `Helena Gawin: znaleziono ${hits.length} pasujących wpisów.`;
    return;
  }

  if (fallback?.text) {
    node.textContent = String(fallback.text);
    return;
  }

  node.textContent = "Helena Gawin - brak informacji";
}

function renderStatus(snap, job, errors) {
  const jobStatus = job?.status || "—";
  const snapshotTime = snap?.generated_at || snap?.updated_at || "—";
  const jobTime = job?.updated_at || job?.finished_at || "—";

  const pill = el("statusPill");
  if (pill) {
    pill.classList.remove("ok", "warn", "bad");
    if (jobStatus === "done") pill.classList.add("ok");
    else if (jobStatus === "done_with_errors") pill.classList.add("warn");
    else if (jobStatus === "error") pill.classList.add("bad");
  }

  if (el("jobStatus")) el("jobStatus").textContent = jobStatus;
  if (el("snapshotTime")) el("snapshotTime").textContent = formatTs(snapshotTime);
  if (el("jobTime")) el("jobTime").textContent = formatTs(jobTime);

  const errorsList = [];
  for (const item of errors?.errors || []) errorsList.push(`${item.source_name || item.source_id || "source"}: ${item.error || "błąd"}`);
  for (const item of job?.source_errors || []) errorsList.push(`${item.source_name || item.source_id || "source"}: ${item.error || "błąd"}`);

  const logLines = [
    `latest.json: ${Object.keys(snap || {}).length ? "OK" : "BRAK"}`,
    `job.json: ${Object.keys(job || {}).length ? "OK" : "BRAK"}`,
    `sources.json: ${(snap?.sources || snap?.payload?.sources || snap?.data?.sources || []).length}`,
    `errors.json: ${(errors?.errors || []).length}`
  ];

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

  const phraseVariants = makePhraseVariants(HELENA_GAWIN_PHRASES);
  const deaths = pickRows(snap, "recent_deaths", "deaths");
  const funerals = pickRows(snap, "upcoming_funerals", "funerals");
  const sources = snap?.sources || snap?.payload?.sources || snap?.data?.sources || cfg?.sources || [];

  renderList("deaths", deaths, "death", phraseVariants);
  renderList("funerals", funerals, "funeral", phraseVariants);
  renderSources(sources);
  renderHelenaStatus(snap, deaths, funerals, phraseVariants);
  renderStatus(snap, job, errors);
}

loadAll();
