import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HELENA_GAWIN_PHRASES } from '../scripts/nekrolog_core.mjs';
import { textMatchesAny } from '../scripts/normalize.mjs';
import { buildDiscordMessage, buildNoMatchMessage, notifyCzerwonaHelena, groupHitsForSending } from '../scripts/discord_notify.mjs';

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

test('nowe intencje jednego źródła idą jedną wiadomością, każda z własnym kluczem', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nekrolog-discord-'));
  const statePath = join(dir, 'discord_notified.json');
  const intencja = (date) => ({ kind: 'intention', name: 'Helena Gawin – gregorianka', date_intention: date, time_intention: '07:00', source_id: 'p', source_name: 'Parafia', url: 'https://p/1' });
  const rows = [intencja('2026-10-26'), intencja('2026-10-27'), intencja('2026-10-28'), { kind: 'death', name: 'Helena Gawin', source_id: 'z', source_name: 'Z', url: 'https://z/1' }];
  const bodies = [];
  const fetchImpl = async (_url, options) => { bodies.push(JSON.parse(options.body).content); return { ok: true, status: 204 }; };

  const first = await notifyCzerwonaHelena({ rows, webhookUrl: 'https://discord.example/webhook', fetchImpl, statePath });
  assert.equal(bodies.length, 2, 'jedna wiadomość dla trzech intencji i jedna dla zgonu');
  assert.equal(first.sent_count, 2);
  assert.equal(first.alerts.filter((a) => a.sent).length, 4);
  assert.match(bodies[0], /Terminy intencji \(3\): 2026-10-26 07:00, 2026-10-27 07:00, 2026-10-28 07:00/);

  // Kolejny przebieg z nowym terminem: zgłaszany jest tylko nowy termin.
  const second = await notifyCzerwonaHelena({ rows: [...rows, intencja('2026-10-29')], webhookUrl: 'https://discord.example/webhook', fetchImpl, statePath });
  assert.equal(bodies.length, 3);
  assert.equal(second.sent_count, 1);
  assert.match(bodies[2], /Termin intencji: 2026-10-29, godz\. 07:00/);
});

test('grupowanie dotyczy wyłącznie intencji', () => {
  const groups = groupHitsForSending([
    { kind: 'grave', source_id: 'a' }, { kind: 'grave', source_id: 'a' },
    { kind: 'intention', source_id: 'b' }, { kind: 'intention', source_id: 'c' }, { kind: 'intention', source_id: 'b' }
  ]);
  assert.deepEqual(groups.map((g) => g.length), [1, 1, 2, 1]);
});

test('alert niesie powód zgłoszenia, datę ogłoszenia i rok zgonu', () => {
  const grob = buildDiscordMessage({ kind: 'grave', name: 'Maria Kowalska', match_reason: 'nowa osoba w obserwowanym grobie Adam Gawin (Cmentarz Rakowicki, LXXIV/7/11)', place: 'Cmentarz Rakowicki, kw. LXXIV, rz. 7, m. 11', source_name: 'ZCK', url: 'https://zck/locator' });
  assert.match(grob, /\[miejsce pochówku\]/);
  assert.match(grob, /Powód zgłoszenia: nowa osoba w obserwowanym grobie Adam Gawin/);
  const wzmianka = buildDiscordMessage({ kind: 'death', name: 'Helenę Gawin', date_reported: '2026-10-25', source_name: 'Parafia', url: 'https://p/1' });
  assert.match(wzmianka, /Data ogłoszenia: 2026-10-25/);
  const borek = buildDiscordMessage({ kind: 'grave', name: 'Helena Gawin', year_death: '2026', source_name: 'Borek', url: 'https://b/1' });
  assert.match(borek, /Rok zgonu: 2026/);
});
