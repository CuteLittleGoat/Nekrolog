import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HELENA_GAWIN_PHRASES } from '../scripts/nekrolog_core.mjs';
import { textMatchesAny } from '../scripts/normalize.mjs';
import { buildDiscordMessage, buildNoMatchMessage, notifyCzerwonaHelena } from '../scripts/discord_notify.mjs';

test('buildDiscordMessage uses expected template', () => {
  const msg = buildDiscordMessage({ name: 'Helena Gawin', source_name: 'Źródło test', url: 'https://example.com/x' });
  assert.match(msg, /@koza_z_zagrody, @loshumbakos/);
  assert.match(msg, /Zmienił się status Czerwonej Heleny!/);
  assert.match(msg, /Imię\/nazwisko w rekordzie: Helena Gawin/);
  assert.match(msg, /Źródło: Źródło test/);
  assert.match(msg, /Link: https:\/\/example.com\/x/);
});

test('notifyCzerwonaHelena sends once and deduplicates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nekrolog-discord-'));
  const statePath = join(dir, 'discord_notified.json');
  const rows = [{ name: 'Helena Gawin', source_name: 'X', url: 'https://example.com/1' }];
  let calls = 0;

  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 204 };
  };

  const first = await notifyCzerwonaHelena({ rows, webhookUrl: 'https://discord.example/webhook', fetchImpl, statePath });
  assert.equal(first.sent, true);
  assert.equal(calls, 1);

  const second = await notifyCzerwonaHelena({ rows, webhookUrl: 'https://discord.example/webhook', fetchImpl, statePath });
  assert.equal(second.sent, false);
  assert.equal(second.skipped_reason, 'already_notified');
  assert.equal(calls, 1);
});

test('buildNoMatchMessage formats heartbeat payload', () => {
  const msg = buildNoMatchMessage('2026-05-13T19:00:00.000Z');
  assert.equal(msg, 'Data: 2026-05-13 19:00\nBrak danych dotyczących stanu Helenomatu.');
});

test('notifyCzerwonaHelena sends heartbeat for no match on each refresh', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    const payload = JSON.parse(options.body);
    assert.match(payload.content, /Brak danych dotyczących stanu Helenomatu\./);
    return { ok: true, status: 204 };
  };

  const first = await notifyCzerwonaHelena({ rows: [], webhookUrl: 'https://discord.example/webhook', fetchImpl, refreshedAt: '2026-05-13T07:00:00.000Z' });
  const second = await notifyCzerwonaHelena({ rows: [], webhookUrl: 'https://discord.example/webhook', fetchImpl, refreshedAt: '2026-05-13T19:00:00.000Z' });

  assert.equal(first.sent, true);
  assert.equal(second.sent, true);
  assert.equal(first.type, 'heartbeat_no_match');
  assert.equal(second.type, 'heartbeat_no_match');
  assert.equal(calls, 2);
});

test('loose matching handles punctuation, prefixes, dashes and diacritics', () => {
  const phrases = HELENA_GAWIN_PHRASES;
  assert.equal(textMatchesAny('+ Helena Gawin', phrases), true);
  assert.equal(textMatchesAny('† Helena Gawin', phrases), true);
  assert.equal(textMatchesAny('Ś.P. Helena Gawin', phrases), true);
  assert.equal(textMatchesAny('ś.p. Helenę Gawin', phrases), true);
  assert.equal(textMatchesAny('Helena Gawin–Dereń', phrases), true);
  assert.equal(textMatchesAny('Helena Gawin Deren', phrases), true);
  assert.equal(textMatchesAny('Gawin, Helena', phrases), true);
  assert.equal(textMatchesAny('Helena Nowak', phrases), false);
  assert.equal(textMatchesAny('Gawron Helena', phrases), false);
  assert.equal(textMatchesAny('Helena', phrases), false);
});
