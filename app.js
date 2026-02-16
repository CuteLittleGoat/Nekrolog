const TARGET_PHRASES = [
  "Helena Gawin",
  "Helena Dereń",
  "Helena Dereń-Gawin",
  "Helena Dereń Gawin",
  "Helena Gawin-Dereń",
  "Helena Gawin Dereń",
];

const DATA_URL = "./data/latest.json";
const FORCE_REFRESH_URL = "/api/refresh";

const norm = (s) => (s || "")
  .toLowerCase()
  .normalize("NFKC")
  .replace(/\s+/g, " ")
  .trim();

const matchesPriority = (text) => {
  const t = norm(text);
  return TARGET_PHRASES.some((phrase) => t.includes(norm(phrase)));
};

const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
};

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

  if (!rows.length) {
    status.className = "status warn";
    status.textContent = "Brak wyników z monitorowanych źródeł.";
  } else if (!hits.length) {
    status.className = "status warn";
    status.textContent = "Brak trafień dla priorytetowych fraz Helena* w aktualnych danych.";
  } else {
    status.className = "status ok";
    status.textContent = `Znaleziono ${hits.length} potencjalnych trafień dla Helena*.`;
  }
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
    li.innerHTML = `<b>${src.name}</b> (${(src.distance_km ?? 0).toFixed(2)} km) — <a href="${src.url}" target="_blank" rel="noreferrer">${src.url}</a>`;
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

async function refresh() {
  const status = document.getElementById("helenaStatus");
  status.className = "status";
  status.textContent = "Ładowanie danych…";

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    render(data);
  } catch (error) {
    status.className = "status err";
    status.textContent = "Błąd odczytu data/latest.json. Aktualizacja danych wymaga uruchomienia collector.py (np. w CI), ten przycisk tylko odświeża widok.";
    console.error(error);
  }
}

async function forceRefresh() {
  const status = document.getElementById("helenaStatus");
  const button = document.getElementById("forceRefreshBtn");

  button.disabled = true;
  status.className = "status";
  status.textContent = "Trwa wymuszona aktualizacja monitorowanych źródeł…";

  try {
    let response = await fetch(FORCE_REFRESH_URL, { method: "POST" });
    if (response.status === 405) {
      response = await fetch(FORCE_REFRESH_URL, { method: "GET" });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    await refresh();
  } catch (error) {
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
refresh();
