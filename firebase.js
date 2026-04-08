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


function resolveRefreshEndpoints() {
  const backendCfg = window.NEKROLOG_CONFIG?.backend || {};
  const firebaseCfg = window.NEKROLOG_CONFIG?.firebaseConfig || {};

  const explicitEndpoint = String(backendCfg.refreshEndpoint || "").trim();
  const projectId = String(firebaseCfg.projectId || "").trim();
  const region = String(backendCfg.refreshFunctionRegion || "europe-central2").trim();
  const functionName = String(backendCfg.refreshFunctionName || "requestNekrologRefresh").trim();

  const candidates = [];
  if (explicitEndpoint) candidates.push(explicitEndpoint);

  const hostname = typeof window !== "undefined"
    ? String(window.location?.hostname || "").toLowerCase()
    : "";
  const isGithubPages = hostname.endsWith(".github.io");

  if (typeof window !== "undefined" && window.location?.origin && functionName && !isGithubPages) {
    candidates.push(new URL(`/${encodeURIComponent(functionName)}`, window.location.origin).toString());
  }

  if (projectId && region && functionName) {
    candidates.push(`https://${region}-${projectId}.cloudfunctions.net/${encodeURIComponent(functionName)}`);
  }

  return [...new Set(candidates)];
}

async function requestRefreshViaBackend(endpoints) {
  const backendCfg = window.NEKROLOG_CONFIG?.backend || {};
  if (!Array.isArray(endpoints) || !endpoints.length) {
    throw new Error("Brak endpointu odświeżania. Ustaw backend.refreshEndpoint albo skonfiguruj firebaseConfig.projectId + backend.refreshFunctionRegion + backend.refreshFunctionName.");
  }

  const headers = {};
  const endpointSecret = String(backendCfg.refreshEndpointSecret || "").trim();
  if (endpointSecret) {
    headers["x-refresh-secret"] = endpointSecret;
  }

  const errors = [];
  const attemptDetails = [];

  for (const endpoint of endpoints) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: endpointSecret ? JSON.stringify({ reason: "manual_ui" }) : undefined
      });
    } catch (err) {
      const networkDetails = String(err?.message || err);
      const message = `Błąd sieci/CORS dla endpointu ${endpoint}: ${networkDetails}`;
      errors.push(message);
      attemptDetails.push({ endpoint, type: "network", message: networkDetails });
      continue;
    }

    if (!response.ok) {
      const payload = await response.text();
      const trimmedPayload = payload.slice(0, 200);
      errors.push(`Backend odrzucił żądanie odświeżenia (${response.status}) dla ${endpoint}: ${trimmedPayload}`);
      attemptDetails.push({ endpoint, type: "http", status: response.status, payload: trimmedPayload });
      continue;
    }

    return { endpoint, attempts: endpoints, errors, attemptDetails };
  }

  const backendError = new Error(errors.join(" | "));
  backendError.refreshDetails = {
    endpointCandidates: endpoints,
    attemptErrors: errors,
    attemptDetails
  };
  throw backendError;
}

export async function requestRefresh(jobRef) {
  const backendEndpoints = resolveRefreshEndpoints();
  if (!backendEndpoints.length) {
    throw new Error("Brak endpointu backendu odświeżania. Ustaw backend.refreshEndpoint.");
  }

  let requestResult;
  try {
    requestResult = await requestRefreshViaBackend(backendEndpoints);
  } catch (err) {
    const backendError = String(err?.message || err);
    const refreshDetails = err?.refreshDetails || {
      endpointCandidates: backendEndpoints,
      attemptErrors: [backendError],
      attemptDetails: []
    };

    await setDoc(jobRef, {
      manual_request_attempted_at: serverTimestamp(),
      manual_request_error: backendError,
      manual_request_endpoint: backendEndpoints[0],
      manual_request_endpoint_candidates: backendEndpoints,
      manual_request_attempt_details: refreshDetails.attemptDetails || []
    }, { merge: true });

    const wrapped = new Error(`Nie udało się uruchomić backendowego odświeżania: ${backendError}`);
    wrapped.refreshDetails = {
      endpointCandidates: refreshDetails.endpointCandidates || backendEndpoints,
      attemptErrors: refreshDetails.attemptErrors || [backendError],
      attemptDetails: refreshDetails.attemptDetails || [],
      originalMessage: backendError
    };
    throw wrapped;
  }

  await setDoc(jobRef, {
    trigger: "manual_ui",
    requested_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    manual_request_error: null,
    manual_request_endpoint: requestResult.endpoint,
    manual_request_endpoint_candidates: requestResult.attempts,
    manual_request_attempt_details: requestResult.attemptDetails || []
  }, { merge: true });

  return {
    ok: true,
    mode: "backend",
    backendEndpoint: requestResult.endpoint
  };
}
