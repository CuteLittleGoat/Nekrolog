import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function getDb() {
  const cfg = window.NEKROLOG_CONFIG?.firebaseConfig;
  if (!cfg?.projectId) throw new Error("Brak window.NEKROLOG_CONFIG.firebaseConfig");
  const app = initializeApp(cfg);
  return getFirestore(app);
}

export function getRefs(db) {
  const cfg = window.NEKROLOG_CONFIG.firebaseConfig;
  const snapRef = doc(db, cfg.nekrologSnapshotsCollection, cfg.nekrologSnapshotDocId);
  const jobRef = doc(db, cfg.nekrologRefreshJobsCollection, cfg.nekrologRefreshJobDocId);
  const srcRef = doc(db, cfg.nekrologConfigCollection, "sources");
  return { snapRef, jobRef, srcRef };
}

export async function readDocSafe(ref) {
  const s = await getDoc(ref);
  return s.exists() ? s.data() : null;
}

export async function saveTargetPhrases(db, phrases) {
  const { snapRef } = getRefs(db);
  await setDoc(snapRef, {
    target_phrases: phrases,
    updated_at: serverTimestamp()
  }, { merge: true });
}


function resolveRefreshEndpoint() {
  const backendCfg = window.NEKROLOG_CONFIG?.backend || {};
  const explicitEndpoint = String(backendCfg.refreshEndpoint || "").trim();
  if (explicitEndpoint) return explicitEndpoint;

  const firebaseCfg = window.NEKROLOG_CONFIG?.firebaseConfig || {};
  const projectId = String(firebaseCfg.projectId || "").trim();
  const region = String(backendCfg.refreshFunctionRegion || "europe-central2").trim();
  const functionName = String(backendCfg.refreshFunctionName || "requestNekrologRefresh").trim();

  if (!projectId || !region || !functionName) return "";
  return `https://${region}-${projectId}.cloudfunctions.net/${encodeURIComponent(functionName)}`;
}

async function requestRefreshViaBackend() {
  const backendCfg = window.NEKROLOG_CONFIG?.backend || {};
  const endpoint = resolveRefreshEndpoint();
  if (!endpoint) {
    throw new Error("Brak endpointu odświeżania. Ustaw backend.refreshEndpoint albo skonfiguruj firebaseConfig.projectId + backend.refreshFunctionRegion + backend.refreshFunctionName.");
  }

  const headers = { "Content-Type": "application/json" };
  const endpointSecret = String(backendCfg.refreshEndpointSecret || "").trim();
  if (endpointSecret) {
    headers["x-refresh-secret"] = endpointSecret;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason: "manual_ui" })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Backend odrzucił żądanie odświeżenia (${response.status}): ${payload.slice(0, 200)}`);
  }

  return { endpoint };
}

export async function requestRefresh(jobRef) {
  const backendEndpoint = resolveRefreshEndpoint();
  if (!backendEndpoint) {
    throw new Error("Brak endpointu backendu odświeżania. Ustaw backend.refreshEndpoint.");
  }

  try {
    await requestRefreshViaBackend();
  } catch (err) {
    const backendError = String(err?.message || err);
    await setDoc(jobRef, {
      manual_request_attempted_at: serverTimestamp(),
      manual_request_error: backendError
    }, { merge: true });
    throw new Error(`Nie udało się uruchomić backendowego odświeżania: ${backendError}`);
  }

  await setDoc(jobRef, {
    trigger: "manual_ui",
    requested_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    manual_request_error: null
  }, { merge: true });

  return {
    ok: true,
    mode: "backend",
    backendEndpoint
  };
}
