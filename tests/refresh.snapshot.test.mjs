// Warstwa okien czasowych, scalania duplikatów, statusu zadania i dopasowania fraz.
// Wcześniej nie miała żadnych testów — a leżały w niej wszystkie defekty krytyczne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inWindow, todayLocalMidnight, addDays, toISODate } from '../scripts/date.mjs';
import {
  mergeRequiredSources, mergeDuplicateRows, dedupeKeyForRow, resolveJobOutcome,
  buildFallbackSummaryForHelena, buildMatchHaystack, rowMatchesPhrases, HELENA_GAWIN_PHRASES,
  isIntentionLikeRow, isEligibleDeathRow
} from '../scripts/nekrolog_core.mjs';
import { isCzerwonaHelenaRow, selectHits, buildStateKey, buildDiscordMessage, mentionPrefix } from '../scripts/discord_notify.mjs';

const row = (over = {}) => ({ kind: 'death', name: 'Jan Kowalski', note: '', place: '', source_name: 'Źródło', source_id: 's', url: 'https://example.com/1', ...over });

test('okna czasowe: zgony -7..0, pogrzeby 0..+7', () => {
  const today = todayLocalMidnight();
  const iso = (n) => toISODate(addDays(today, n));
  assert.equal(inWindow(iso(0), addDays(today, -7), today), true);
  assert.equal(inWindow(iso(-7), addDays(today, -7), today), true);
  assert.equal(inWindow(iso(-8), addDays(today, -7), today), false);
  assert.equal(inWindow(iso(7), today, addDays(today, 7)), true);
  assert.equal(inWindow(iso(8), today, addDays(today, 7)), false);
  assert.equal(inWindow(null, addDays(today, -7), today), false);
});

test('rekord bez daty nie wpada już bezterminowo do okna zgonów', () => {
  const today = todayLocalMidnight();
  // Dawna reguła brzmiała: inWindow(...) || (!date_death && note) — wpis bez daty,
  // ale z dowolną notatką, kwalifikował się na zawsze.
  assert.equal(inWindow(null, addDays(today, -7), today), false);
});

test('scalanie duplikatów międzyźródłowych zachowuje bogatszy rekord', () => {
  const skromny = row({ name: 'Jan Sadzik', date_death: '2026-08-11', source_name: 'ZCK', url: 'https://zck/1' });
  const pelny = row({ name: 'Jan Sadzik', date_death: '2026-08-11', date_funeral: '2026-08-18', time_funeral: '13:40', place: 'Cmentarz Rakowicki', note: 'x', source_name: 'Karawan', url: 'https://karawan/1' });
  const merged = mergeDuplicateRows([skromny, pelny]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source_name, 'Karawan');
  assert.equal(merged[0].date_funeral, '2026-08-18');
  assert.deepEqual(merged[0].also_in_sources, ['ZCK']);
});

test('scalanie nie łączy różnych osób ani różnych rodzajów wpisu', () => {
  const a = row({ name: 'Jan Sadzik', date_death: '2026-08-11' });
  const b = row({ name: 'Jan Sadzik', kind: 'funeral', date_funeral: '2026-08-18' });
  const c = row({ name: 'Anna Sadzik', date_death: '2026-08-11' });
  assert.equal(mergeDuplicateRows([a, b, c]).length, 3);
  // Wersaliki, prefiks "Śp." i diakrytyka nie mogą rozbijać tożsamości.
  assert.equal(dedupeKeyForRow(row({ name: 'Jan Sadzik', date_death: '2026-08-11' })), dedupeKeyForRow(row({ name: 'JAN SADZIK', date_death: '2026-08-11' })));
});

test('scalanie propaguje flagę trafienia', () => {
  const merged = mergeDuplicateRows([
    row({ name: 'Helena Gawin', date_death: '2026-08-11', priority_hit: true, source_name: 'A' }),
    row({ name: 'Helena Gawin', date_death: '2026-08-11', note: 'więcej treści', place: 'X', priority_hit: false, source_name: 'B' })
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].priority_hit, true);
});

test('status zadania opisuje kondycję odczytu, nie liczbę rekordów', () => {
  // Tydzień bez pogrzebów w oknie to poprawny wynik, a nie awaria.
  assert.equal(resolveJobOutcome({ recentDeaths: 0, upcomingFunerals: 0, sourcesTotal: 8, sourcesHealthy: 8 }).status, 'done');
  assert.equal(resolveJobOutcome({ recentDeaths: 0, upcomingFunerals: 0, sourcesTotal: 8, sourcesHealthy: 8 }).ok, true);
  assert.equal(resolveJobOutcome({ recentDeaths: 5, upcomingFunerals: 5, refreshErrors: ['x: błąd'], sourcesTotal: 8, sourcesHealthy: 7 }).status, 'done_with_errors');
  assert.equal(resolveJobOutcome({ recentDeaths: 0, upcomingFunerals: 0, sourcesTotal: 8, sourcesHealthy: 0 }).status, 'error');
});

test('ten sam zestaw pól przeszukują snapshot, Discord i UI', () => {
  // Trafienie wyłącznie w polu place było oznaczane w snapshocie, ale nie wywoływało alertu.
  const wPolu = row({ name: 'Jan Kowalski', place: 'Helena Gawin', note: '' });
  assert.match(buildMatchHaystack(wPolu), /Helena Gawin/);
  assert.equal(rowMatchesPhrases(wPolu, HELENA_GAWIN_PHRASES), true);
  assert.equal(isCzerwonaHelenaRow(wPolu), true);
});

test('zgłaszane są wszystkie trafienia, nie tylko pierwsze', () => {
  const hits = selectHits([
    row({ name: 'Helena Gawin', source_name: 'A', url: 'https://a/1' }),
    row({ name: 'Ktoś Inny' }),
    row({ name: 'Helena Gawin', source_name: 'B', url: 'https://b/1' }),
    row({ kind: 'intention', name: 'Helena Gawin', source_name: 'C', url: 'https://c/1' })
  ]);
  assert.equal(hits.length, 3);
});

test('klucz deduplikacji uwzględnia daty, więc uzupełnienie terminu jest nowym zdarzeniem', () => {
  const bezTerminu = row({ name: 'Helena Gawin', date_death: '2026-08-11' });
  const zTerminem = row({ name: 'Helena Gawin', date_death: '2026-08-11', date_funeral: '2026-08-18', time_funeral: '13:40' });
  assert.notEqual(buildStateKey(bezTerminu), buildStateKey(zTerminem));
});

test('alert rozróżnia kategorie i niesie szczegóły terminu', () => {
  const intencja = buildDiscordMessage(row({ kind: 'intention', name: 'Helena Gawin', date_intention: '2026-08-20', time_intention: '18:00' }));
  assert.match(intencja, /\[intencja mszalna \(potrzeba\)\]/);
  assert.match(intencja, /Termin intencji: 2026-08-20, godz\. 18:00/);
  const pogrzeb = buildDiscordMessage(row({ kind: 'funeral', name: 'Helena Gawin', date_funeral: '2026-08-18', time_funeral: '13:40' }));
  assert.match(pogrzeb, /\[pogrzeb\]/);
  assert.match(pogrzeb, /Data pogrzebu: 2026-08-18, godz\. 13:40/);
});

test('wzmianki Discord: <@ID> gdy podano identyfikatory, inaczej tekst', () => {
  assert.equal(mentionPrefix('123456789012345678,987654321098765432'), '<@123456789012345678> <@987654321098765432>');
  assert.equal(mentionPrefix(''), '@koza_z_zagrody, @loshumbakos');
  assert.equal(mentionPrefix('nie-id'), '@koza_z_zagrody, @loshumbakos');
});

test('podsumowanie Helenomatu liczone z rekordów, nie stałe', () => {
  const puste = buildFallbackSummaryForHelena([], [], []);
  assert.equal(puste.text, 'Helena Gawin - brak informacji');
  const zTrafieniem = buildFallbackSummaryForHelena(
    [row({ name: 'Helena Gawin', date_death: '2026-08-11', priority_hit: true, url: 'https://a/1' })],
    [row({ kind: 'funeral', name: 'Helena Gawin', date_funeral: '2026-08-18', priority_hit: true, url: 'https://b/1' })],
    []
  );
  assert.match(zTrafieniem.text, /znaleziono 2/);
  assert.equal(zTrafieniem.date_death, '2026-08-11');
  assert.equal(zTrafieniem.date_funeral, '2026-08-18');
  assert.equal(zTrafieniem.urls.length, 2);
});

test('mergeRequiredSources wymusza typ parsera nad zastaną konfiguracją', () => {
  // sources.txt zawierał type: "generic_html" dla wszystkich źródeł; wcześniej taka
  // konfiguracja wygrywała i wyłączała wszystkie dedykowane parsery.
  const merged = mergeRequiredSources([{ id: 'zck_funerals', type: 'generic_html', enabled: true }]);
  assert.equal(merged.find((s) => s.id === 'zck_funerals').type, 'zck_funerals');
  assert.ok(merged.some((s) => s.id === 'debniki_intencje' && s.type === 'debniki_intencje'));
  // Deklarowane OCR/PDF były nieprawdziwe — oba serwisy publikują tekst.
  assert.equal(merged.find((s) => s.id === 'karawan_nekrologi').requires_ocr, false);
  assert.equal(merged.find((s) => s.id === 'gabriel_nekrologi').requires_ocr, false);
});

test('klasyfikacja rodzajów rekordu', () => {
  assert.equal(isEligibleDeathRow(row({ kind: 'death' })), true);
  assert.equal(isEligibleDeathRow(row({ kind: 'intention' })), false);
  assert.equal(isIntentionLikeRow(row({ kind: 'intention' })), true);
  assert.equal(isIntentionLikeRow(row({ kind: 'death' })), false);
});
