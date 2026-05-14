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


function parseCurlOutput(out) {
  const marker = "\n__HTTP_STATUS__:";
  const idx = out.lastIndexOf(marker);
  if (idx < 0) return { status: 0, text: out };
  const text = out.slice(0, idx);
  const statusRaw = out.slice(idx + marker.length).trim();
  const status = Number.parseInt(statusRaw, 10) || 0;
  return { status, text };
}

function fetchViaCurl(url, timeoutMs, browserHeaders = false) {
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
      "--write-out",
      "\n__HTTP_STATUS__:%{http_code}",
      ...(browserHeaders ? [
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "--header",
        "accept-language: pl-PL,pl;q=0.9,en;q=0.8",
        "--header",
        `referer: ${new URL(url).origin}/`,
        "--header",
        "upgrade-insecure-requests: 1"
      ] : []),
      url
    ], { encoding: "utf8" });

    const parsed = parseCurlOutput(out);
    const ok = parsed.status >= 200 && parsed.status < 300;
    return { ok, status: parsed.status, text: parsed.text, error: ok ? null : `HTTP ${parsed.status}` };
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
      let first = await runFetch(url, ctrl.signal);
      if (first.status === 403) {
        const second = fetchViaCurl(url, timeoutMs, true);
        if (second.status && second.status !== 403) return second;
        return second.status ? second : first;
      }
      return first;
    } catch (error) {
      if (!isRetryableNetworkError(error)) {
        const curlAttempt = fetchViaCurl(url, timeoutMs);
        if (curlAttempt.ok) return curlAttempt;
        const browserAttempt = fetchViaCurl(url, timeoutMs, true);
        if (browserAttempt.ok || browserAttempt.status) return browserAttempt;
        return {
          ok: false,
          status: 0,
          text: "",
          error: `${stringifyError(error, "fetch")}; ${curlAttempt.error}`
        };
      }

      try {
        const retry = await runFetch(url, ctrl.signal, { agent: selectIpv4Agent });
        if (retry.status === 403) {
          const browserAttempt = fetchViaCurl(url, timeoutMs, true);
          if (browserAttempt.status) return browserAttempt;
        }
        return retry;
      } catch (retryError) {
        const curlAttempt = fetchViaCurl(url, timeoutMs);
        if (curlAttempt.ok || curlAttempt.status) return curlAttempt;
        const browserAttempt = fetchViaCurl(url, timeoutMs, true);
        if (browserAttempt.ok || browserAttempt.status) return browserAttempt;
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
