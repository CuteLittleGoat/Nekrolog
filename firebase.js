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

async function requestRefreshViaBackend() {
  const backendCfg = window.NEKROLOG_CONFIG?.backend || {};
  const endpoint = String(backendCfg.refreshEndpoint || "").trim();
  if (!endpoint) {
    throw new Error("Brak NEKROLOG_CONFIG.backend.refreshEndpoint");
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
}

export async function requestRefresh(jobRef) {
  const backendEndpoint = String(window.NEKROLOG_CONFIG?.backend?.refreshEndpoint || "").trim();
  if (!backendEndpoint) {
    throw new Error(
      "Odświeżanie wymaga backend.refreshEndpoint. Bez endpointu status joba utknie na queued i snapshot nie zostanie przebudowany."
    );
  }

  await requestRefreshViaBackend();

  await setDoc(jobRef, {
    trigger: "manual_ui",
    requested_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    error_message: null
  }, { merge: true });
}
