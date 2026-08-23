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

const BOT_USER_AGENT = "nekrolog-refresh-bot/1.0 (+https://github.com/)";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Statusy, przy których ponowienie ma sens: przejściowe błędy serwera i limity.
// ZCK i PUK potrafią zwrócić 503 lub zerwać połączenie, a przy kolejnej próbie
// odpowiadają 200 — bez ponowienia całe źródło znika z przebiegu na 12 godzin.
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 521, 522, 524]);
const RETRY_DELAYS_MS = [700, 2000];

function selectIpv4Agent(parsedUrl) {
  return parsedUrl?.protocol === "http:" ? ipv4HttpAgent : ipv4HttpsAgent;
}

function isRetryableNetworkError(error) {
  const code = String(error?.code || "").toUpperCase();
  return ["ENOTFOUND", "ENETUNREACH", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE"].includes(code);
}

function isTransientStatus(status) {
  return TRANSIENT_STATUSES.has(Number(status));
}

function stringifyError(error, attemptLabel) {
  const base = String(error?.message || error || "nieznany błąd");
  const code = error?.code ? ` [${error.code}]` : "";
  return `${attemptLabel}: ${base}${code}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runFetch(url, signal, options = {}) {
  const res = await fetch(url, {
    signal,
    headers: {
      "user-agent": BOT_USER_AGENT,
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
      BOT_USER_AGENT,
      "--header",
      "accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "--write-out",
      "\n__HTTP_STATUS__:%{http_code}",
      ...(browserHeaders ? [
        "--user-agent",
        BROWSER_USER_AGENT,
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

// Pojedyncza próba: node-fetch, a przy 403 / statusie przejściowym awaryjnie curl
// z nagłówkami przeglądarkowymi. Ponowienia obsługuje fetchText.
async function attemptOnce(url, timeoutMs, useIpv4Agent = false) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const options = useIpv4Agent ? { agent: selectIpv4Agent } : {};
    const first = await runFetch(url, ctrl.signal, options);
    if (first.ok) return first;

    if (first.status === 403 || isTransientStatus(first.status)) {
      const browserAttempt = fetchViaCurl(url, timeoutMs, true);
      if (browserAttempt.ok) return browserAttempt;
      return first;
    }

    return first;
  } catch (error) {
    const curlAttempt = fetchViaCurl(url, timeoutMs);
    if (curlAttempt.ok) return curlAttempt;
    const browserAttempt = fetchViaCurl(url, timeoutMs, true);
    if (browserAttempt.ok) return browserAttempt;
    return {
      ok: false,
      status: browserAttempt.status || curlAttempt.status || 0,
      text: "",
      error: `${stringifyError(error, "fetch")}; ${curlAttempt.error}`,
      networkError: error
    };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url, timeoutMs = 20000) {
  let last = null;
  // Rzeczywista liczba obiegów pętli. Wcześniej komunikat raportował stałe
  // "(prób: 3)" niezależnie od przebiegu — przy statusie nieponawialnym (np. 403)
  // wykonywana jest tylko jedna próba, a diagnostyka sugerowała wyczerpanie ponowień.
  let attempts = 0;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    // Kolejne podejścia wymuszają IPv4 — część hostów zrywa połączenie po IPv6.
    last = await attemptOnce(url, timeoutMs, attempt > 0);
    attempts = attempt + 1;
    if (last.ok) return { ...last, attempts };

    const worthRetrying = isTransientStatus(last.status)
      || last.status === 0
      || isRetryableNetworkError(last.networkError);
    if (!worthRetrying || attempt === RETRY_DELAYS_MS.length) break;

    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  const error = last?.error || `HTTP ${last?.status ?? 0}`;
  return { ok: false, status: last?.status ?? 0, text: last?.text ?? "", error: `${error} (prób: ${attempts})`, attempts };
}

export { isRetryableNetworkError, isTransientStatus, BOT_USER_AGENT, BROWSER_USER_AGENT };
