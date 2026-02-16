import { getDb, getRefs, readDocSafe, saveTargetPhrases } from "./firebase.js";
import { makePhraseVariants, textMatchesAny } from "./scripts/normalize.mjs"; // (tak, użyjemy tej samej logiki)
import { fmtRow } from "./parsers.js";

const el = (id) => document.getElementById(id);
const log = (...a) => { el("log").textContent += a.map(x => typeof x === "string" ? x : JSON.stringify(x,null,2)).join(" ") + "\n"; };

function renderList(container, rows, phrases) {
  container.innerHTML = "";
  if (!rows?.length) {
    container.innerHTML = `<div class="small">Brak wpisów w oknie czasowym.</div>`;
    return;
  }

  for (const r of rows) {
    const hit = textMatchesAny([r.name, r.note, r.place, r.source_name].join(" "), phrases);
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="top">
        <div class="name">${escapeHtml(r.name || "(brak nazwiska)")}</div>
        <div class="badge ${hit ? "hit" : ""}">${hit ? "TRAFIENIE" : (r.kind || r.category || "wpis")}</div>
      </div>
      <div class="small">${escapeHtml(fmtRow(r))}</div>
      <div class="small">
        Źródło: <a href="${escapeAttr(r.url || r.source_url || "#")}" target="_blank" rel="noopener">${escapeHtml(r.source_name || r.source_id || "link")}</a>
      </div>
      ${r.note ? `<div class="small">${escapeHtml(r.note)}</div>` : ""}
    `;
    container.appendChild(div);
  }
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
      <div class="smeta">
        ${typeof s.distance_km === "number" ? `${s.distance_km.toFixed(1)} km • ` : ""}${s.enabled === false ? "WYŁ." : "AKT."}
      </div>
      <div class="smeta"><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a></div>
    `;
    container.appendChild(div);
  }
}

function escapeHtml(s){return (s??"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));}
function escapeAttr(s){return escapeHtml(s).replace(/"/g,"%22");}

async function loadAll() {
  el("log").textContent = "";
  const db = getDb();
  const { snapRef, jobRef, srcRef } = getRefs(db);

  const snap = await readDocSafe(snapRef);
  const job  = await readDocSafe(jobRef);
  const cfg  = await readDocSafe(srcRef);

  log("snapshot:", snap ? "OK" : "BRAK", "job:", job ? "OK" : "BRAK", "sources:", cfg?.sources?.length ?? 0);

  const phrasesRaw = (snap?.target_phrases ?? []).join("\n");
  el("phrases").value = phrasesRaw;

  const phrases = makePhraseVariants((snap?.target_phrases ?? []));
  renderList(el("deaths"), snap?.recent_deaths ?? snap?.deaths ?? [], phrases);
  renderList(el("funerals"), snap?.upcoming_funerals ?? snap?.funerals ?? [], phrases);
  renderSources(el("sources"), snap?.sources ?? cfg?.sources ?? []);

  el("snapshotTime").textContent = (snap?.generated_at || snap?.updated_at || "—");
  el("jobStatus").textContent = (job?.status || "—");
  el("jobTime").textContent = (job?.updated_at || job?.finished_at || job?.started_at || "—");

  const st = (job?.status || "").toLowerCase();
  const pill = el("statusPill");
  if (st.includes("error")) pill.style.borderColor = "rgba(255,107,107,0.45)";
  else if (st.includes("running")) pill.style.borderColor = "rgba(255,209,102,0.45)";
  else pill.style.borderColor = "rgba(68,209,158,0.35)";
}

async function savePhrases() {
  const db = getDb();
  const lines = el("phrases").value.split("\n").map(s => s.trim()).filter(Boolean);
  await saveTargetPhrases(db, lines);
  el("phrasesSaved").textContent = "Zapisano ✓";
  setTimeout(()=> el("phrasesSaved").textContent="", 1600);
  await loadAll();
}

el("btnReload").addEventListener("click", loadAll);
el("btnSavePhrases").addEventListener("click", savePhrases);
loadAll();
