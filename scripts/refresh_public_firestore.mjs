import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseZckFunerals,
  parseIntentionsPlus,
  parseGenericHtml,
  isIntentionLikeSource,
  isIntentionLikeRow,
  isEligibleDeathRow,
  mergeRequiredSources,
  resolveJobOutcome,
  buildFallbackSummaryForHelena
} from "./refresh.mjs";
import { todayLocalMidnight, addDays, inWindow } from "./date.mjs";
import { makePhraseVariants, textMatchesAny } from "./normalize.mjs";

const PROJECT_ID = "karty-turniej";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
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

function clean(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function nowISO() {
  return new Date().toISOString();
}

function isMeaningfulRow(row) {
  return [
    row?.name,
    row?.full_name,
    row?.date,
    row?.date_death,
    row?.date_funeral,
    row?.place,
    row?.note,
    row?.source_name,
    row?.url
  ].some((value) => clean(value).length > 0);
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return value.doubleValue;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "arrayValue")) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }
  if (Object.hasOwn(value, "mapValue")) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function curlJson(args) {
  const raw = execFileSync("curl", ["-sS", ...args], { encoding: "utf8" });
  return JSON.parse(raw);
}

async function getDocument(path) {
  const payload = curlJson([`${BASE}/${path}`]);
  if (payload.error) throw new Error(`GET ${path}: ${payload.error.status} ${payload.error.message}`);
  return payload;
}

async function patchDocument(path, fieldsToUpdate) {
  const params = new URLSearchParams();
  for (const fieldPath of Object.keys(fieldsToUpdate)) {
    params.append("updateMask.fieldPaths", fieldPath);
  }

  const fields = {};
  for (const [k, v] of Object.entries(fieldsToUpdate)) {
    fields[k] = toFirestoreValue(v);
  }

  const bodyPath = join(tmpdir(), `nekrolog-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(bodyPath, JSON.stringify({ fields }), "utf8");
  try {
    const payload = curlJson([
      "-X", "PATCH",
      `${BASE}/${path}?${params.toString()}`,
      "-H", "content-type: application/json",
      "--data-binary", `@${bodyPath}`
    ]);

    if (payload.error) throw new Error(`PATCH ${path}: ${payload.error.status} ${payload.error.message}`);
    return payload;
  } finally {
    try { unlinkSync(bodyPath); } catch {}
  }
}

async function main() {
  const jobPath = "Nekrolog_refresh_jobs/latest";
  const srcPath = "Nekrolog_config/sources";
  const snapPath = "Nekrolog_snapshots/latest";

  const today = todayLocalMidnight();
  const deathStart = addDays(today, -7);
  const deathEnd = addDays(today, 0);
  const funeralStart = addDays(today, 0);
  const funeralEnd = addDays(today, 7);

  await patchDocument(jobPath, {
    status: "running",
    started_at: nowISO(),
    updated_at: nowISO(),
    writer_name: "scripts/refresh_public_firestore.mjs",
    writer_version: "2026-02-23.1",
    ok: true,
    error_message: null,
    source_errors: []
  });

  const srcDoc = await getDocument(srcPath);
  const sourcesRaw = fromFirestoreValue(srcDoc.fields?.sources) || [];
  const sources = mergeRequiredSources(sourcesRaw);

  if (sources.length !== (Array.isArray(sourcesRaw) ? sourcesRaw.length : 0)) {
    await patchDocument(srcPath, { sources, updated_at: nowISO() });
  }

  if (!sources.length) throw new Error("Brak źródeł w Nekrolog_config/sources");

  const phraseVariants = makePhraseVariants(HELENA_GAWIN_PHRASES);
  const enabled = sources.filter((s) => s.enabled !== false);

  const allRows = [];
  const sourceErrors = [];
  const sourceLite = enabled.map((s) => ({
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

    const skipDeathsForSource = isIntentionLikeSource(s);

    for (const r of parsed.rows) {
      if (!isMeaningfulRow(r)) continue;
      if ((skipDeathsForSource || isIntentionLikeRow(r)) && r.kind === "death") continue;
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
    }
  }

  const funerals = allRows.filter((r) => r.kind === "funeral");
  const deaths = allRows.filter(isEligibleDeathRow);
  const upcoming_funerals = funerals.filter((r) => inWindow(r.date_funeral, funeralStart, funeralEnd));
  const recent_deaths = deaths.filter((r) => inWindow(r.date_death, deathStart, deathEnd) || (!r.date_death && r.note));

  upcoming_funerals.sort((a, b) => (a.date_funeral || "").localeCompare(b.date_funeral || "") || (a.time_funeral || "").localeCompare(b.time_funeral || ""));
  recent_deaths.sort((a, b) => (b.date_death || "").localeCompare(a.date_death || ""));

  const fallbackSummary = buildFallbackSummaryForHelena(recent_deaths, upcoming_funerals);
  const refreshErrors = sourceErrors.map((e) => `${e.source_name}: ${clean(e.error)}`);

  const payload = {
    generated_at: nowISO(),
    updated_at: nowISO(),
    deaths,
    funerals,
    recent_deaths,
    upcoming_funerals,
    fallback_summary: fallbackSummary,
    sources: sourceLite,
    target_phrases: HELENA_GAWIN_PHRASES,
    source_errors: sourceErrors,
    refresh_error: refreshErrors.join(" | "),
    writer_name: "scripts/refresh_public_firestore.mjs",
    writer_version: "2026-02-23.1"
  };

  await patchDocument(snapPath, {
    ...payload,
    payload,
    data: payload
  });

  const jobOutcome = resolveJobOutcome({
    recentDeaths: recent_deaths.length,
    upcomingFunerals: upcoming_funerals.length,
    refreshErrors
  });

  await patchDocument(jobPath, {
    status: jobOutcome.status,
    finished_at: nowISO(),
    updated_at: nowISO(),
    ok: jobOutcome.ok,
    error_message: jobOutcome.errorMessage,
    source_errors: sourceErrors,
    agent_ping: null,
    writer_name: "scripts/refresh_public_firestore.mjs",
    writer_version: "2026-02-23.1"
  });

  console.log(`OK. Rows: ${allRows.length} funerals: ${upcoming_funerals.length} deaths: ${recent_deaths.length}`);
}

await main();
