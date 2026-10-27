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
// Dwie tabele opóźnień o tej samej długości — liczba prób jest wspólna, różni się
// tylko odstęp. Skala setek milisekund pasuje do chwilowego 503, ale nie do hosta,
// który przestał odpowiadać: po 0,7 s zachowa się tak samo. Przebieg z 2026-08-28
// wykonał trzy ponowienia do gabriel24.pl i wszystkie zwróciły ten sam curl: (28).
const RETRY_DELAYS_MS = [700, 2000];
const CONNECTION_RETRY_DELAYS_MS = [2000, 8000];

// Kody zerwania na poziomie połączenia — żadna odpowiedź HTTP nie dotarła.
const CONNECTION_ERROR_CODES = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE",
  "ENETUNREACH", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN"
]);

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

// Awaria połączenia, a nie odpowiedź serwera. Rozróżnienie decyduje o tym, czy
// uruchamiać awaryjne curl: mają one sens wyłącznie tam, gdzie serwer odpowiedział
// i odrzucił żądanie po nagłówkach.
function isConnectionFailure(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true; // nasz własny limit czasu
  const code = String(error.code || error.errno || "").toUpperCase();
  return CONNECTION_ERROR_CODES.has(code);
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
    // Przy zerwaniu połączenia awaryjne curl idą tą samą drogą sieciową i powtarzają
    // ten sam wynik — potrajają koszt próby (3 × timeoutMs), nie zwiększając szans.
    // Bez tego skrótu jeden martwy adres kosztował do 183 s i 9 wywołań sieciowych,
    // co realnie zagrażało limitowi timeout-minutes: 20 całego workflow.
    if (isConnectionFailure(error)) {
      return {
        ok: false,
        status: 0,
        text: "",
        error: stringifyError(error, "fetch"),
        networkError: error
      };
    }

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

    const delays = isConnectionFailure(last.networkError) ? CONNECTION_RETRY_DELAYS_MS : RETRY_DELAYS_MS;
    await sleep(delays[attempt]);
  }

  const error = last?.error || `HTTP ${last?.status ?? 0}`;
  return { ok: false, status: last?.status ?? 0, text: last?.text ?? "", error: `${error} (prób: ${attempts})`, attempts };
}

// ─────────────── Sesja HTTP: ciasteczka, POST, zapytania warunkowe ───────────────
// fetchText obsługuje wyłącznie GET bez ciasteczek. Kalendarz pogrzebów i lokalizator
// grobów ZCK wymagają tego samego co przeglądarka: tokenu CSRF z nagłówka strony
// i ciasteczka _frontendCSRF, które serwer wydaje razem z nim każdemu odwiedzającemu.
// Sesja niczego nie obchodzi — przedstawia się tym samym nagłówkiem bota co fetchText,
// a ciasteczko wydane przez serwer odsyła tylko w obrębie jednego przebiegu.
// Nie ma tu awaryjnego curl z nagłówkami przeglądarki: sesja nie podszywa się pod nic.
function readSetCookies(headers) {
  if (typeof headers?.getSetCookie === "function") return headers.getSetCookie();
  if (typeof headers?.raw === "function") return headers.raw()["set-cookie"] || [];
  const single = headers?.get?.("set-cookie");
  return single ? [single] : [];
}

export function createHttpSession({ timeoutMs = 20000, fetchImpl = fetch, retryDelaysMs = RETRY_DELAYS_MS } = {}) {
  const jar = new Map();

  async function request(url, { method = "GET", headers = {}, body } = {}) {
    let last = null;
    let attempts = 0;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      attempts = attempt + 1;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
        const res = await fetchImpl(url, {
          method,
          body,
          signal: ctrl.signal,
          headers: {
            "user-agent": BOT_USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...(cookie ? { cookie } : {}),
            ...headers
          }
        });
        for (const raw of readSetCookies(res.headers)) {
          const pair = String(raw).split(";")[0];
          const eq = pair.indexOf("=");
          if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
        const text = await res.text();
        const header = (name) => res.headers?.get?.(name) ?? null;
        last = { ok: res.ok, status: res.status, text, header, error: res.ok ? null : `HTTP ${res.status}` };
        // 304 to odpowiedź na zapytanie warunkowe, a 4xx mówi coś konkretnego —
        // ponawiamy wyłącznie statusy przejściowe.
        if (res.ok || !isTransientStatus(res.status)) break;
      } catch (error) {
        last = { ok: false, status: 0, text: "", header: () => null, error: stringifyError(error, "fetch"), networkError: error };
        if (!isConnectionFailure(error) && !isRetryableNetworkError(error)) break;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < retryDelaysMs.length) await sleep(retryDelaysMs[attempt]);
    }
    return { ...last, attempts, error: last.error ? `${last.error} (prób: ${attempts})` : null };
  }

  return { request, cookies: jar };
}

export { isRetryableNetworkError, isTransientStatus, isConnectionFailure, BOT_USER_AGENT, BROWSER_USER_AGENT };
