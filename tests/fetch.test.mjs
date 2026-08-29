// Warstwa pobierania. Awaryjne wywołania curl mają sens wyłącznie tam, gdzie serwer
// odpowiedział i odrzucił żądanie po nagłówkach. Przy zerwaniu połączenia idą tą samą
// drogą sieciową, powtarzają ten sam wynik i potrajają koszt próby — a to właśnie
// koszt ścieżki błędu zagrażał limitowi timeout-minutes: 20 całego workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConnectionFailure, isRetryableNetworkError, isTransientStatus } from '../scripts/fetch.mjs';

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
