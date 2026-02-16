const TARGET_PHRASES = [
  "Helena Gawin",
  "Helena Dereń",
  "Helena Dereń-Gawin",
  "Helena Dereń Gawin",
  "Helena Gawin-Dereń",
  "Helena Gawin Dereń",
];

const DATA_URL = "./data/latest.json";
const appConfig = window.NEKROLOG_CONFIG || {};
const FORCE_REFRESH_URL = appConfig.forceRefreshUrl || "/api/refresh";
const githubRefreshConfig = appConfig.githubRefresh || detectGithubPagesRefreshConfig();
let lastGeneratedAt = null;

function detectGithubPagesRefreshConfig() {
  const host = window.location.hostname || "";
  if (!host.endsWith("github.io")) return null;

  const [owner] = host.split(".");
  const [repo] = (window.location.pathname || "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);

  if (!owner || !repo) return null;

  return {
    owner,
    repo,
    workflowId: "refresh-data.yml",
    ref: "main",
    token: "",
  };
}

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isGithubDispatchConfigured() {
  return Boolean(
    githubRefreshConfig
    && githubRefreshConfig.owner
    && githubRefreshConfig.repo
    && githubRefreshConfig.workflowId
  );
}

function getGithubToken() {
  const configToken = (githubRefreshConfig && githubRefreshConfig.token) || "";
  if (configToken) return configToken.trim();

  const cachedToken = sessionStorage.getItem("nekrolog_github_token") || "";
  if (cachedToken) return cachedToken.trim();

  const promptMessage = "Brak tokenu GitHub do uruchomienia aktualizacji. Wklej PAT z uprawnieniem Actions: Read and write (token zostanie zapamiętany tylko w tej sesji karty).";
  const providedToken = window.prompt(promptMessage, "");
  if (!providedToken) return "";

  const normalizedToken = providedToken.trim();
  sessionStorage.setItem("nekrolog_github_token", normalizedToken);
  return normalizedToken;
}

async function dispatchGithubRefresh() {
  const token = getGithubToken();
  if (!token) {
    throw new Error("Brak tokenu GitHub (PAT) do uruchomienia workflow");
  }

  const owner = githubRefreshConfig.owner;
  const repo = githubRefreshConfig.repo;
  const workflowId = githubRefreshConfig.workflowId;
  const ref = githubRefreshConfig.ref || "main";
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem("nekrolog_github_token");
    }
    throw new Error(payload.message || `GitHub API HTTP ${response.status}`);
  }
}

async function waitForFreshData(previousGeneratedAt, maxWaitMs = 120000, pollMs = 6000) {
  const start = Date.now();

  while (Date.now() - start <= maxWaitMs) {
    await refresh();
    if (lastGeneratedAt && lastGeneratedAt !== previousGeneratedAt) {
      return true;
    }
    await sleep(pollMs);
  }

  return false;
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
    const cacheBustedDataUrl = `${DATA_URL}${DATA_URL.includes("?") ? "&" : "?"}_=${Date.now()}`;
    const response = await fetch(cacheBustedDataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    lastGeneratedAt = data.generated_at || null;
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
    const generatedAtBeforeRefresh = lastGeneratedAt;

    if (isGithubDispatchConfigured()) {
      await dispatchGithubRefresh();
      const updated = await waitForFreshData(generatedAtBeforeRefresh);
      if (!updated) {
        status.className = "status warn";
        status.textContent = "Workflow został uruchomiony, ale nowa wersja danych nie pojawiła się jeszcze na GitHub Pages. Odśwież stronę za chwilę.";
      }
      return;
    }

    let response = await fetch(FORCE_REFRESH_URL, { method: "POST" });
    if (response.status === 405) {
      response = await fetch(FORCE_REFRESH_URL, { method: "GET" });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    await refresh();

    const backendGeneratedAt = payload.generated_at || null;
    if (backendGeneratedAt && generatedAtBeforeRefresh && backendGeneratedAt === generatedAtBeforeRefresh) {
      await sleep(1200);
      await refresh();
    }
  } catch (error) {
    status.className = "status err";
    status.textContent = `Nie udało się wymusić aktualizacji: ${error.message}. Skonfiguruj NEKROLOG_CONFIG.githubRefresh dla GitHub Pages lub NEKROLOG_CONFIG.forceRefreshUrl dla backendu /api/refresh.`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", refresh);
document.getElementById("forceRefreshBtn").addEventListener("click", forceRefresh);
document.getElementById("q").addEventListener("input", refresh);
refresh();
