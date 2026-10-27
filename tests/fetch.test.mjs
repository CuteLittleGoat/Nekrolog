// Warstwa pobierania. Awaryjne wywołania curl mają sens wyłącznie tam, gdzie serwer
// odpowiedział i odrzucił żądanie po nagłówkach. Przy zerwaniu połączenia idą tą samą
// drogą sieciową, powtarzają ten sam wynik i potrajają koszt próby — a to właśnie
// koszt ścieżki błędu zagrażał limitowi timeout-minutes: 20 całego workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConnectionFailure, isRetryableNetworkError, isTransientStatus, createHttpSession, BOT_USER_AGENT } from '../scripts/fetch.mjs';

test('własny limit czasu jest awarią połączenia', () => {
  const abort = new Error('The operation was aborted.');
  abort.name = 'AbortError';
  assert.equal(isConnectionFailure(abort), true);
});

test('kody zerwania połączenia są rozpoznawane', () => {
  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN']) {
    assert.equal(isConnectionFailure({ code }), true, `${code} musi być awarią połączenia`);
  }
  assert.equal(isConnectionFailure({ errno: 'econnreset' }), true, 'kod bywa w errno i bywa małymi literami');
});

test('błąd innej natury zachowuje awaryjną ścieżkę curl', () => {
  // Dla tych przypadków curl bywa skuteczny (inna implementacja TLS/HTTP), więc
  // skrót ich nie obejmuje.
  assert.equal(isConnectionFailure(new TypeError('Invalid URL')), false);
  assert.equal(isConnectionFailure({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), false);
  assert.equal(isConnectionFailure({ code: 'ERR_INVALID_CHAR' }), false);
  assert.equal(isConnectionFailure(null), false);
  assert.equal(isConnectionFailure(undefined), false);
});

test('klasyfikacja statusów przejściowych pozostaje nienaruszona', () => {
  // 403 celowo NIE jest przejściowy: to blokada anty-botowa, obsługiwana osobno.
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(isTransientStatus(status), true);
  for (const status of [200, 301, 403, 404, 410]) assert.equal(isTransientStatus(status), false);
  assert.equal(isRetryableNetworkError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isRetryableNetworkError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), false);
});

// ── Sesja HTTP (ZCK: token CSRF + ciasteczko, ewidencja Borku: zapytanie warunkowe) ──

function fakeResponse({ status = 200, text = '', cookies = [], headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    headers: { getSetCookie: () => cookies, get: (name) => headers[name.toLowerCase()] ?? null }
  };
}

test('sesja odsyła ciasteczko wydane przez serwer i przedstawia się nagłówkiem bota', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(init);
    return seen.length === 1 ? fakeResponse({ text: 'strona', cookies: ['_frontendCSRF=abc123; path=/; HttpOnly'] }) : fakeResponse({ text: 'api' });
  };
  const session = createHttpSession({ fetchImpl, retryDelaysMs: [] });
  await session.request('https://example.test/funerals');
  const api = await session.request('https://example.test/funerals/api', { method: 'POST', headers: { 'x-csrf-token': 't' }, body: '"2026-10-28"' });
  assert.equal(api.text, 'api');
  assert.equal(seen[0].headers.cookie, undefined);
  assert.equal(seen[1].headers.cookie, '_frontendCSRF=abc123');
  assert.equal(seen[1].method, 'POST');
  assert.equal(seen[1].body, '"2026-10-28"');
  assert.equal(seen[1].headers['x-csrf-token'], 't');
  assert.equal(seen[1].headers['user-agent'], BOT_USER_AGENT);
});

test('sesja ponawia tylko statusy przejściowe; 304 i 404 zwraca od razu', async () => {
  const statuses = [503, 200];
  let calls = 0;
  const session = createHttpSession({ fetchImpl: async () => fakeResponse({ status: statuses[calls++] ?? 200 }), retryDelaysMs: [0] });
  const retried = await session.request('https://example.test/');
  assert.equal(retried.ok, true);
  assert.equal(retried.attempts, 2);

  for (const status of [304, 404]) {
    let n = 0;
    const s = createHttpSession({ fetchImpl: async () => { n += 1; return fakeResponse({ status, headers: { 'last-modified': 'Mon, 26 Oct 2026 15:39:34 GMT' } }); }, retryDelaysMs: [0, 0] });
    const r = await s.request('https://example.test/plik');
    assert.equal(r.status, status);
    assert.equal(n, 1, `HTTP ${status} nie jest ponawiany`);
    assert.equal(r.header('last-modified'), 'Mon, 26 Oct 2026 15:39:34 GMT');
  }
});

test('sesja: zerwane połączenie daje status 0 i licznik prób', async () => {
  const session = createHttpSession({
    fetchImpl: async () => { const e = new Error('socket hang up'); e.code = 'ECONNRESET'; throw e; },
    retryDelaysMs: [0]
  });
  const r = await session.request('https://example.test/');
  assert.equal(r.ok, false);
  assert.equal(r.status, 0);
  assert.equal(r.attempts, 2);
  assert.match(r.error, /ECONNRESET.*\(prób: 2\)/);
});
