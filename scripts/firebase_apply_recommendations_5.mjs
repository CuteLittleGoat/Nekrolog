const PROJECT_ID = "karty-turniej";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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

async function getDocument(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
  return res.json();
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

  const res = await fetch(`${BASE}/${path}?${params.toString()}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH ${path}: HTTP ${res.status} ${body}`);
  }

  return res.json();
}

function normalizeSources(sources) {
  return sources.map((source) => {
    const out = { ...source };
    if (out.id === "par_debniki_contact") out.enabled = false;
    if (out.id === "podgorki_tynieckie_grobonet" && out.url === "https://klepsydrakrakow.grobonet.com/") {
      out.url = "https://klepsydrakrakow.grobonet.com/nekrologi.php";
    }
    return out;
  });
}

async function main() {
  const snapPath = "Nekrologi_snapshots/latest";
  const cfgPath = "Nekrologi_config/sources";

  const cfgDoc = await getDocument(cfgPath);
  const currentSources = fromFirestoreValue(cfgDoc.fields?.sources) || [];
  const nextSources = normalizeSources(currentSources);

  await patchDocument(cfgPath, {
    sources: nextSources,
    updated_at: new Date().toISOString()
  });

  await patchDocument(snapPath, {
    deaths: [],
    funerals: [],
    recent_deaths: [],
    upcoming_funerals: [],
    deaths_count: 0,
    funerals_count: 0,
    updated_at: new Date().toISOString()
  });

  console.log("OK: Applied Firebase recommendations 5.1 and 5.2 (without refresh_error, already provided manually).");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
