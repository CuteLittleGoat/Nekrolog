const TARGET_PHRASES = [
  "Helena Gawin",
  "Helena Gawin-Dereń",
  "Helena Dereń-Gawin",
  "Helena Gawin Deren",
  "Helena Deren Gawin",
];

const appConfig = window.NEKROLOG_CONFIG || {};
const firebaseConfig = appConfig.firebaseConfig || {};
const FORCE_REFRESH_URL = appConfig.forceRefreshUrl || "/api/refresh";

const SNAPSHOTS_COLLECTION = firebaseConfig.nekrologSnapshotsCollection || "Nekrolog_snapshots";
const SNAPSHOT_DOC_ID = firebaseConfig.nekrologSnapshotDocId || "latest";
const CONFIG_COLLECTION = firebaseConfig.nekrologConfigCollection || "Nekrolog_config";
const CONFIG_DOC_ID = firebaseConfig.nekrologConfigDocId || "sources";
const REFRESH_JOBS_COLLECTION = firebaseConfig.nekrologRefreshJobsCollection || "Nekrolog_refresh_jobs";
const REFRESH_JOB_DOC_ID = firebaseConfig.nekrologRefreshJobDocId || "latest";

let db = null;
let lastGeneratedAt = null;

const norm = (s) => (s || "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\-_]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const matchesPriority = (text) => {
  const tokens = new Set(norm(text).split(" ").filter(Boolean));
  return tokens.has("helena") && tokens.has("gawin");
};

const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
};

function toIsoString(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return null;
}

function normalizeRow(row, fallbackKind) {
  return {
    kind: row.kind || row.category || fallbackKind || "wpis",
    name: row.name || "",
    date_death: row.date_death || (fallbackKind === "death" ? row.date : null),
    date_funeral: row.date_funeral || (fallbackKind === "funeral" ? row.date : null),
    time_funeral: row.time_funeral || null,
    place: row.place || "",
    source_name: row.source_name || "",
    url: row.url || row.source_url || "",
    note: row.note || "",
    priority_hit: !!row.priority_hit,
  };
}

function mapSnapshotToViewModel(snapshotData, sourcesData) {
  const deaths = (snapshotData.deaths || snapshotData.recent_deaths || [])
    .map((row) => normalizeRow(row, "death"));
  const funerals = (snapshotData.funerals || snapshotData.upcoming_funerals || [])
    .map((row) => normalizeRow(row, "funeral"));

  const sourcesFromConfig = sourcesData?.sources || [];
  const fallbackSources = (snapshotData.sources || []).map((src) => ({
    name: src.name || "",
    url: src.url || "",
    distance_km: src.distance_km,
    enabled: src.enabled !== false,
  }));

  return {
    generated_at: toIsoString(snapshotData.generated_at) || toIsoString(snapshotData.updated_at),
    recent_deaths: deaths,
    upcoming_funerals: funerals,
    sources: (sourcesFromConfig.length ? sourcesFromConfig : fallbackSources).filter((src) => src.enabled !== false),
  };
}

function renderItem(container, row) {
  const item = el("article", "item");
  const titleRow = el("div", "title-row");
  const title = el("div", "title", row.name || "Nieznana osoba");
  titleRow.appendChild(title);
  titleRow.appendChild(el("span", "badge", row.kind || "wpis"));
  if (row.priority_hit) titleRow.appendChild(el("span", "badge", "fraza priorytetowa"));
  item.appendChild(titleRow);

  const meta = [];
  if (row.date_death) meta.push(`data śmierci: <b>${row.date_death}</b>`);
  if (row.date_funeral) meta.push(`pogrzeb: <b>${row.date_funeral}</b>`);
  if (row.time_funeral) meta.push(`godzina: <b>${row.time_funeral}</b>`);
  if (row.place) meta.push(`miejsce: ${row.place}`);
  if (row.source_name) meta.push(`źródło: ${row.source_name}`);
  if (row.url) meta.push(`<a href="${row.url}" target="_blank" rel="noreferrer">otwórz źródło</a>`);
  item.appendChild(el("div", "meta", meta.join(" • ")));

  container.appendChild(item);
}

function applyStatus(data) {
  const status = document.getElementById("helenaStatus");
  const rows = [...(data.recent_deaths || []), ...(data.upcoming_funerals || [])];
  const hits = rows.filter((row) => matchesPriority(`${row.name || ""} ${row.note || ""} ${row.place || ""}`));

  if (hits.length) {
    const first = hits[0];
    status.className = "status ok";
    status.innerHTML = [
      `⚠️ WYKRYTO: ${first.name || "Helena Gawin"}${first.place ? ` (${first.place})` : ""}`,
      `Znaleziono ${hits.length} wpis(ów) dotyczących Heleny Gawin (również warianty nazwiska).`,
    ].join("<br>");
    return;
  }

  if (!rows.length) {
    status.className = "status warn";
    status.textContent = "Brak wyników z monitorowanych źródeł.";
    return;
  }

  status.className = "status";
  status.textContent = "Brak wpisów dotyczących Heleny Gawin w aktualnych danych.";
}

function render(data) {
  const query = norm(document.getElementById("q").value);
  const rowsFilter = (row) => {
    if (!query) return true;
    return norm(`${row.name || ""} ${row.place || ""} ${row.source_name || ""}`).includes(query);
  };

  const deaths = (data.recent_deaths || []).filter(rowsFilter);
  const funerals = (data.upcoming_funerals || []).filter(rowsFilter);

  const deathsBox = document.getElementById("recentDeaths");
  deathsBox.innerHTML = "";
  deaths.forEach((row) => renderItem(deathsBox, row));

  const funeralsBox = document.getElementById("upcomingFunerals");
  funeralsBox.innerHTML = "";
  funerals.forEach((row) => renderItem(funeralsBox, row));

  const sources = document.getElementById("sources");
  sources.innerHTML = "";
  (data.sources || []).forEach((src) => {
    const li = document.createElement("li");
    const km = Number.isFinite(src.distance_km) ? ` (${src.distance_km.toFixed(2)} km)` : "";
    li.innerHTML = `<b>${src.name}</b>${km}${src.url ? ` — <a href="${src.url}" target="_blank" rel="noreferrer">${src.url}</a>` : ""}`;
    sources.appendChild(li);
  });

  document.getElementById("deathCount").textContent = deaths.length;
  document.getElementById("funeralCount").textContent = funerals.length;
  document.getElementById("sourceCount").textContent = (data.sources || []).length;
  document.getElementById("generatedAt").textContent = data.generated_at
    ? `Aktualizacja: ${new Date(data.generated_at).toLocaleString("pl-PL")}`
    : "";

  applyStatus(data);
}

function initFirebase() {
  if (!window.firebase || !firebaseConfig.apiKey) {
    throw new Error("Brak konfiguracji Firebase (window.NEKROLOG_CONFIG.firebaseConfig).");
  }

  const app = window.firebase.apps.length
    ? window.firebase.app()
    : window.firebase.initializeApp(firebaseConfig);
  db = window.firebase.firestore(app);
}

async function loadFromFirestore() {
  const snapshotRef = db.collection(SNAPSHOTS_COLLECTION).doc(SNAPSHOT_DOC_ID);
  const configRef = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID);

  const [snapshotDoc, configDoc] = await Promise.all([snapshotRef.get(), configRef.get()]);
  if (!snapshotDoc.exists) {
    throw new Error(`Brak dokumentu ${SNAPSHOTS_COLLECTION}/${SNAPSHOT_DOC_ID}`);
  }

  const snapshotData = snapshotDoc.data() || {};
  const sourcesData = configDoc.exists ? configDoc.data() : null;

  return mapSnapshotToViewModel(snapshotData, sourcesData);
}

async function refresh() {
  const status = document.getElementById("helenaStatus");
  status.className = "status";
  status.textContent = "Ładowanie danych z Firebase…";

  try {
    const data = await loadFromFirestore();
    lastGeneratedAt = data.generated_at || null;
    render(data);
  } catch (error) {
    status.className = "status err";
    status.textContent = "Błąd odczytu danych z Firestore.";
    console.error(error);
  }
}

async function writeRefreshJob(status, extra = {}) {
  const payload = {
    status,
    trigger: "button",
    updated_at: new Date(),
    ...extra,
  };
  await db.collection(REFRESH_JOBS_COLLECTION).doc(REFRESH_JOB_DOC_ID).set(payload, { merge: true });
}

async function forceRefresh() {
  const status = document.getElementById("helenaStatus");
  const button = document.getElementById("forceRefreshBtn");

  button.disabled = true;
  status.className = "status";
  status.textContent = "Trwa wymuszona aktualizacja monitorowanych źródeł…";

  try {
    await writeRefreshJob("running", { started_at: new Date(), ok: null, error_message: "" });

    let response = await fetch(FORCE_REFRESH_URL, { method: "POST" });
    if (response.status === 405) {
      response = await fetch(FORCE_REFRESH_URL, { method: "GET" });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    await writeRefreshJob("done", {
      finished_at: new Date(),
      ok: true,
      error_message: "",
    });

    await refresh();

    status.className = "status ok";
    status.textContent = "Aktualizacja danych zakończona.";
  } catch (error) {
    await writeRefreshJob("error", {
      finished_at: new Date(),
      ok: false,
      error_message: error.message,
    }).catch((writeError) => console.error(writeError));

    status.className = "status err";
    status.textContent = `Nie udało się wymusić aktualizacji: ${error.message}`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", refresh);
document.getElementById("forceRefreshBtn").addEventListener("click", forceRefresh);
document.getElementById("q").addEventListener("input", refresh);

initFirebase();
refresh();
