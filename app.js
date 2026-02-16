import { getDb, getRefs, readDocSafe } from "./firebase.js";
import { makePhraseVariants, textMatchesAny } from "./scripts/normalize.mjs";

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

const el = (id) => document.getElementById(id);
const log = (...a) => {
  el("log").textContent += a.map((x) => typeof x === "string" ? x : JSON.stringify(x, null, 2)).join(" ") + "\n";
};

function resolveName(r) {
  const candidates = [
    r.name,
    r.full_name,
    r.person,
    r.person_name,
    r.deceased,
    r.deceased_name,
    r.note_name,
    r.title,
    r.item1
  ];
  return candidates.map((v) => String(v ?? "").trim()).find(Boolean) || "(brak nazwiska)";
}

function resolveLastName(r) {
  const direct = [r.last_name, r.lastname, r.surname].map((v) => String(v ?? "").trim()).find(Boolean);
  if (direct) return direct;
  const name = resolveName(r).replace(/^Śp\.\s*/i, "").trim();
  if (!name || name === "(brak nazwiska)") return "Brak nazwiska";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts[0] || "Brak nazwiska";
}

function resolveFirstName(r) {
  const direct = [r.first_name, r.firstname, r.given_name].map((v) => String(v ?? "").trim()).find(Boolean);
  if (direct) return direct;
  const name = resolveName(r).replace(/^Śp\.\s*/i, "").trim();
  if (!name || name === "(brak nazwiska)") return "Brak imienia";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(" ");
  return "Brak imienia";
}

function resolveRowDate(r, type) {
  if (type === "death") {
    return String(r.date_death || r.date || "").trim() || "Brak daty";
  }
  return String(r.date_funeral || r.date || "").trim() || "Brak daty";
}

function resolveSourceMeta(r) {
  const sourceLabel = String(
    r.source_name
    || r.source
    || r.source_id
    || r.provider
    || "Źródło wpisu"
  ).trim() || "Źródło wpisu";

  const sourceUrlRaw = String(
    r.url
    || r.source_url
    || r.link
    || r.source_link
    || ""
  ).trim();

  const hasRealLink = /^https?:\/\//i.test(sourceUrlRaw);
  return {
    sourceLabel,
    sourceUrl: hasRealLink ? sourceUrlRaw : ""
  };
}

function sortRowsByDateDesc(rows, type) {
  const stamp = (row) => {
    const raw = resolveRowDate(row, type);
    const t = Date.parse(raw);
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  return [...rows].sort((a, b) => stamp(b) - stamp(a));
}

function rowHasContent(r) {
  if (!r || typeof r !== "object") return false;
  const keys = ["name", "full_name", "note", "date", "date_death", "date_funeral", "place", "source_name", "item1"];
  return keys.some((k) => String(r[k] ?? "").trim());
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(rowHasContent);
}

function pickRows(snap, preferred, fallback) {
  const candidates = [
    snap?.[preferred],
    snap?.[fallback],
    snap?.payload?.[preferred],
    snap?.payload?.[fallback],
    snap?.data?.[preferred],
    snap?.data?.[fallback]
  ];

  for (const list of candidates) {
    const rows = normalizeRows(list);
    if (rows.length) return rows;
  }

  return [];
}

function formatTs(value) {
  if (!value) return "—";
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value?.seconds != null) {
    const ms = Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }
  return String(value);
}

function renderList(container, rows, phrases, type) {
  container.innerHTML = "";
  if (!rows?.length) {
    container.innerHTML = `<div class="small">Brak wpisów w oknie czasowym.</div>`;
    return;
  }

  const sorted = sortRowsByDateDesc(rows, type);

  for (const r of sorted) {
    const displayName = resolveName(r);
    const hit = textMatchesAny([displayName, r.note, r.place, r.source_name].join(" "), phrases);
    const lastName = resolveLastName(r);
    const firstName = resolveFirstName(r);
    const dateLabel = type === "death" ? "Data zgonu" : "Data pogrzebu";
    const dateValue = resolveRowDate(r, type);
    const { sourceLabel, sourceUrl } = resolveSourceMeta(r);
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="top">
        <div class="name">${escapeHtml(lastName)}, ${escapeHtml(firstName)}</div>
        <div class="badge ${hit ? "hit" : ""}">${hit ? "TRAFIENIE" : (r.kind || r.category || "wpis")}</div>
      </div>
      <div class="small">${escapeHtml(dateLabel)}: ${escapeHtml(dateValue)}</div>
      <div class="small source-row">Źródło: ${sourceUrl
        ? `<a href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(sourceLabel)}</a>`
        : escapeHtml(sourceLabel)}</div>
    `;
    container.appendChild(div);
  }
}

function renderHelenaStatus(container, snap) {
  const phrases = makePhraseVariants(HELENA_GAWIN_PHRASES);
  const rows = [
    ...(snap?.recent_deaths ?? snap?.deaths ?? []),
    ...(snap?.upcoming_funerals ?? snap?.funerals ?? [])
  ];

  const hits = rows.filter((r) => textMatchesAny([resolveName(r), r.note, r.place, r.source_name].join(" "), phrases));
  if (hits.length) {
    const urls = [...new Map(hits.map((r) => [`${r.url}|${r.source_name}`, { url: r.url, source_name: r.source_name }])).values()];
    container.innerHTML = `
      <div><strong>Helena Gawin</strong>: znaleziono ${hits.length} pasujących wpisów.</div>
      <div class="small">${urls.map((u) => `<a href="${escapeAttr(u.url)}" target="_blank" rel="noopener">${escapeHtml(u.source_name || u.url)}</a>`).join(" • ")}</div>
    `;
    return;
  }

  const fallback = snap?.fallback_summary;
  if (fallback?.text) {
    const links = (fallback.urls || []).map((u) => `<a href="${escapeAttr(u.url)}" target="_blank" rel="noopener">${escapeHtml(u.source_name || u.url)}</a>`).join(" • ");
    container.innerHTML = `
      <div><strong>${escapeHtml(fallback.text)}</strong></div>
      ${links ? `<div class="small">Źródła: ${links}</div>` : ""}
    `;
    return;
  }

  const legacy = snap?.helena_status;
  if (legacy && legacy.hit === true) {
    const items = (legacy.items || []).map((it) => it?.item1).filter(Boolean);
    container.innerHTML = `
      <div><strong>Helena Gawin</strong>: znaleziono ${Number(legacy.hits_count || items.length || 0)} pasujących wpisów.</div>
      ${items.length ? `<div class="small">${items.map(escapeHtml).join(" • ")}</div>` : ""}
    `;
    return;
  }

  container.innerHTML = `<div><strong>Helena Gawin - brak informacji</strong></div>`;
}

function renderSources(container, sources) {
  container.innerHTML = "";
  if (!sources?.length) {
    container.innerHTML = `<div class="small">Brak źródeł (uzupełnij Nekrolog_config/sources).</div>`;
    return;
  }

  for (const s of sources) {
    const div = document.createElement("div");
    div.className = "source";
    div.innerHTML = `
      <div class="sname">${escapeHtml(s.name || s.id || "Źródło")}</div>
      <div class="smeta">${typeof s.distance_km === "number" ? `${s.distance_km.toFixed(1)} km • ` : ""}${s.enabled === false ? "WYŁ." : "AKT."}</div>
      <div class="smeta"><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a></div>
    `;
    container.appendChild(div);
  }
}

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "%22");
}

async function loadAll() {
  el("log").textContent = "";
  const db = getDb();
  const { snapRef, jobRef, srcRef } = getRefs(db);

  const snap = await readDocSafe(snapRef);
  const job = await readDocSafe(jobRef);
  const cfg = await readDocSafe(srcRef);

  log("snapshot:", snap ? "OK" : "BRAK", "job:", job ? "OK" : "BRAK", "sources:", cfg?.sources?.length ?? 0);

  const phrases = makePhraseVariants(HELENA_GAWIN_PHRASES);
  const deaths = pickRows(snap, "recent_deaths", "deaths");
  const funerals = pickRows(snap, "upcoming_funerals", "funerals");

  renderList(el("deaths"), deaths, phrases, "death");
  renderList(el("funerals"), funerals, phrases, "funeral");
  renderHelenaStatus(el("helenaStatus"), snap ?? {});
  renderSources(el("sources"), snap?.sources ?? snap?.payload?.sources ?? snap?.data?.sources ?? cfg?.sources ?? []);

  el("snapshotTime").textContent = formatTs(snap?.generated_at || snap?.updated_at);
  el("jobStatus").textContent = (job?.status || "—");
  el("jobTime").textContent = formatTs(job?.updated_at || job?.finished_at || job?.started_at);

  if (!deaths.length && !funerals.length) {
    const reason = snap?.refresh_error || job?.error_message;
    if (reason) {
      log("Brak prawidłowych wpisów. Ostatni błąd odświeżania:", reason);
    }
  }

  const st = (job?.status || "").toLowerCase();
  const pill = el("statusPill");
  if (st.includes("error")) pill.style.borderColor = "rgba(255,107,107,0.45)";
  else if (st.includes("running")) pill.style.borderColor = "rgba(255,209,102,0.45)";
  else pill.style.borderColor = "rgba(68,209,158,0.35)";
}

el("btnReload").addEventListener("click", loadAll);
loadAll();
