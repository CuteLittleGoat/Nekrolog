import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import fetch from "node-fetch";
import { execFileSync } from "node:child_process";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // starsze runtime Node mogą nie wspierać tej opcji
}

const ipv4Lookup = (hostname, options, callback) => dns.lookup(hostname, { ...options, family: 4 }, callback);

const ipv4HttpAgent = new http.Agent({ keepAlive: true, lookup: ipv4Lookup });
const ipv4HttpsAgent = new https.Agent({ keepAlive: true, lookup: ipv4Lookup });

function selectIpv4Agent(parsedUrl) {
  return parsedUrl?.protocol === "http:" ? ipv4HttpAgent : ipv4HttpsAgent;
}

function isRetryableNetworkError(error) {
  const code = String(error?.code || "").toUpperCase();
  return ["ENOTFOUND", "ENETUNREACH", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(code);
}

function stringifyError(error, attemptLabel) {
  const base = String(error?.message || error || "nieznany błąd");
  const code = error?.code ? ` [${error.code}]` : "";
  return `${attemptLabel}: ${base}${code}`;
}

async function runFetch(url, signal, options = {}) {
  const res = await fetch(url, {
    signal,
    headers: {
      "user-agent": "nekrolog-refresh-bot/1.0 (+https://github.com/)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    ...options
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, text, error: null };
}


function fetchViaCurl(url, timeoutMs) {
  try {
    const seconds = Math.max(5, Math.ceil(timeoutMs / 1000));
    const out = execFileSync("curl", [
      "-L",
      "--silent",
      "--show-error",
      "--max-time",
      String(seconds),
      "--user-agent",
      "nekrolog-refresh-bot/1.0 (+https://github.com/)",
      "--header",
      "accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      url
    ], { encoding: "utf8" });

    return { ok: true, status: 200, text: out, error: null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      error: stringifyError(error, "curl")
    };
  }
}

export async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    try {
      return await runFetch(url, ctrl.signal);
    } catch (error) {
      if (!isRetryableNetworkError(error)) {
        const curlAttempt = fetchViaCurl(url, timeoutMs);
        if (curlAttempt.ok) return curlAttempt;
        return {
          ok: false,
          status: 0,
          text: "",
          error: `${stringifyError(error, "fetch")}; ${curlAttempt.error}`
        };
      }

      try {
        return await runFetch(url, ctrl.signal, { agent: selectIpv4Agent });
      } catch (retryError) {
        const curlAttempt = fetchViaCurl(url, timeoutMs);
        if (curlAttempt.ok) return curlAttempt;
        return {
          ok: false,
          status: 0,
          text: "",
          error: `${stringifyError(error, "fetch")}; ${stringifyError(retryError, "fetch_ipv4")}; ${curlAttempt.error}`
        };
      }
    }
  } finally {
    clearTimeout(t);
  }
}

export { isRetryableNetworkError };
