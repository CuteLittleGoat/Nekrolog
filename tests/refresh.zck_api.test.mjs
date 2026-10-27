// ZCK: porządek pogrzebów na kolejne dni (API kalendarza) i lokalizator grobów. Oba
// wymagają tego co przeglądarka: tokenu CSRF ze strony i ciasteczka wydanego razem z nim.
// Sesja HTTP jest tu podstawiona — testy sprawdzają przepływ i interpretację odpowiedzi
// na zrzutach z 2026-10-27, bez ruchu sieciowego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  mergeRequiredSources, parseZckFunerals, parseZckLokalizator, parseZckGraveyards, zckCsrfToken,
  ZCK_LOCATOR_BASELINE, isPriorityHit, HELENA_GAWIN_PHRASES
} from '../scripts/nekrolog_core.mjs';

const fixture = (name) => fs.readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const SOURCES = Object.fromEntries(mergeRequiredSources([]).map((s) => [s.id, s]));
const REF = '2026-10-27';

// Sesja zapisuje zapytania; `answer` dostaje treść zapytania POST i zwraca odpowiedź API.
function fakeSession(page, answer) {
  const calls = [];
  return {
    calls,
    request: async (url, opts = {}) => {
      calls.push({ url, ...opts });
      if (!opts.method) return { ok: true, status: 200, text: page };
      return answer(JSON.parse(opts.body), url);
    }
  };
}
const ok = (text) => ({ ok: true, status: 200, text });
const notFound = () => ({ ok: false, status: 404, text: '', error: 'HTTP 404' });

test('ZCK: token CSRF ze strony porządku pogrzebów', async () => {
  assert.equal(zckCsrfToken(await fixture('zck_funerals_2026-10-27.html')), 'TEST-CSRF-TOKEN');
  assert.equal(zckCsrfToken('<html><head></head></html>'), null);
});

test('ZCK: porządek pogrzebów na 7 kolejnych dni z API kalendarza', async () => {
  const page = await fixture('zck_funerals_2026-10-27.html');
  const day = await fixture('zck_funerals_api_2026-10-28.html');
  const empty = await fixture('zck_funerals_api_brak_2026-11-02.html');
  const session = fakeSession(page, (date) => ok(date === '2026-10-28' ? day : empty.replace('2026-11-02', date)));
  const out = await parseZckFunerals(SOURCES.zck_funerals, { session, gapMs: 0 });
  assert.equal(out.error, null);
  assert.equal(out.diagnostics.parser_status, 'ok');
  assert.equal(out.diagnostics.days_fetched, 7);

  // Zapytania jak z kalendarza na stronie: data jako JSON, token w nagłówku, kolejne dni.
  const posts = session.calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => JSON.parse(c.body)), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  assert.ok(posts.every((c) => c.url === 'https://www.zck-krakow.pl/funerals/api' && c.headers['x-csrf-token'] === 'TEST-CSRF-TOKEN'));

  const byDay = {};
  for (const r of out.rows) byDay[r.date_funeral] = (byDay[r.date_funeral] || 0) + 1;
  assert.deepEqual(byDay, { '2026-10-27': 15, '2026-10-28': 22 });
  const rakowicki = out.rows.filter((r) => r.date_funeral === '2026-10-28' && /Rakowicki/.test(r.place));
  assert.equal(rakowicki.length, 7);
  assert.equal(rakowicki[0].name, 'Alicja Stobierska');
  assert.equal(rakowicki[0].time_funeral, '09:40');
  assert.ok(out.rows.every((r) => r.date_is_fallback === false));
});

test('ZCK: brak API nie kasuje dnia bieżącego, ale jest zgłaszany', async () => {
  const page = await fixture('zck_funerals_2026-10-27.html');
  const httpError = await parseZckFunerals(SOURCES.zck_funerals, { session: fakeSession(page, () => ({ ok: false, status: 400, text: '', error: 'HTTP 400' })), gapMs: 0 });
  assert.equal(httpError.rows.length, 15, 'rekordy dnia bieżącego zostają');
  assert.match(httpError.error, /kolejne dni niedostępny/);
  assert.equal(httpError.diagnostics.parser_status, 'api_error');

  // Brak jakiejkolwiek odpowiedzi HTTP zachowuje tolerancję awarii sieciowej.
  const network = await parseZckFunerals(SOURCES.zck_funerals, { session: fakeSession(page, () => ({ ok: false, status: 0, text: '', error: 'fetch: timeout' })), gapMs: 0 });
  assert.equal(network.diagnostics.parser_status, 'http_error');
  assert.equal(network.diagnostics.http_status, 0);

  // Pojedynczy nieudany dzień to tylko diagnostyka.
  const day = await fixture('zck_funerals_api_2026-10-28.html');
  const partial = await parseZckFunerals(SOURCES.zck_funerals, { session: fakeSession(page, (date) => (date === '2026-10-29' ? { ok: false, status: 503, text: '', error: 'HTTP 503' } : ok(day.replace('2026-10-28', date)))), gapMs: 0 });
  assert.equal(partial.error, null);
  assert.equal(partial.diagnostics.days_failed, 1);
});

test('ZCK: strona bez tokenu CSRF to zmiana strony, a nie cichy brak kolejnych dni', async () => {
  const page = (await fixture('zck_funerals_2026-10-27.html')).replace(/<meta name="csrf-token"[^>]*>/, '');
  const out = await parseZckFunerals(SOURCES.zck_funerals, { session: fakeSession(page, () => assert.fail('bez tokenu API nie jest odpytywane')), gapMs: 0 });
  assert.match(out.error, /brak tokenu CSRF/);
  assert.equal(out.rows.length, 15);
});

test('ZCK: tydzień bez pogrzebów jest potwierdzonym brakiem danych', async () => {
  const empty = await fixture('zck_funerals_api_brak_2026-11-02.html');
  const page = (await fixture('zck_funerals_2026-10-27.html')).replace(/<table class="[^"]*funerals[^"]*">[\s\S]*?<\/table>/g, '<table class="table funerals"><tbody><tr><td colspan="3">Brak pogrzebów...</td></tr></tbody></table>');
  const out = await parseZckFunerals(SOURCES.zck_funerals, { session: fakeSession(page, (date) => ok(empty.replace('2026-11-02', date))), gapMs: 0 });
  assert.equal(out.rows.length, 0);
  assert.equal(out.diagnostics.parser_status, 'empty_confirmed');
});

// ── Lokalizator grobów ──

async function locatorSession({ adam, extraHelena = [] } = {}) {
  const page = await fixture('zck_lokalizator_2026-10-27.html');
  const helena2 = JSON.parse(await fixture('zck_lokalizator_helena_gawin_2_2026-10-27.json'));
  const adamJson = adam ?? await fixture('zck_lokalizator_adam_gawin_2_2026-10-27.json');
  // Czwarty historyczny wpis z listy bazowej (Wola Duchacka, 1942) — odpowiedź jak z API.
  const wola = [{ name: 'HELENA', surname: 'GAWIN', date: '20.12.1942', grave_quarter: 'F', grave_row: '7', grave_spot: '13', birthday: '02.02.1868', extra: [{ name: 'JAN', surname: 'GAWIN', date: '01.01.1950', birthday: '01.01.1870' }] }];
  return fakeSession(page, (q) => {
    if (q.name === 'Adam') return q.graveyard === '2' ? ok(adamJson) : notFound();
    if (q.name === 'Helena' && q.surname === 'Gawin' && q.graveyard === '2') return ok(JSON.stringify([...helena2, ...extraHelena]));
    if (q.name === 'Helena' && q.surname === 'Gawin' && q.graveyard === '8') return ok(JSON.stringify(wola));
    return notFound();
  });
}

test('lokalizator: lista cmentarzy ze strony, bez Podgórek Tynieckich (Grobonet)', async () => {
  const graveyards = parseZckGraveyards(await fixture('zck_lokalizator_2026-10-27.html'));
  assert.equal(graveyards.length, 12);
  assert.equal(graveyards[0].id, '2');
  assert.equal(graveyards[0].name, 'Cmentarz Rakowicki');
  assert.ok(!graveyards.some((g) => g.id === '14'));
});

test('lokalizator: znane wpisy „Helena Gawin” nie trafiają do rekordów, grób Adama Gawina — tak', async () => {
  const session = await locatorSession();
  const out = await parseZckLokalizator(SOURCES.zck_lokalizator, { session, gapMs: 0, referenceIso: REF });
  assert.equal(out.error, null);
  // 2 osoby × 12 cmentarzy + obserwowany grób.
  assert.equal(out.diagnostics.queries, 25);
  assert.equal(out.diagnostics.baseline_matched, 4);
  assert.deepEqual(out.rows.map((r) => r.name), ['Adam Gawin']);
  const adam = out.rows[0];
  assert.equal(adam.kind, 'grave');
  assert.equal(adam.place, 'Cmentarz Rakowicki, kw. LXXIV, rz. 7, m. 11');
  assert.equal(adam.date_birth, '1939-12-27');
  assert.equal(adam.date_death, '2012-06-26');
  assert.match(adam.note, /Henryk Gawin/);
  assert.equal(adam.force_match, undefined);
  // Żaden rekord nie wywoła alarmu: lista bazowa obejmuje wszystkie znane wpisy.
  assert.ok(out.rows.every((r) => !isPriorityHit(r, HELENA_GAWIN_PHRASES)));
  const body = JSON.parse(session.calls.find((c) => c.method === 'POST').body);
  assert.deepEqual(Object.keys(body), ['name', 'surname', 'birthdate', 'deathdate', 'graveyard']);
});

test('lokalizator: nowy pochówek Heleny Gawin daje rekord grobu i trafienie', async () => {
  const fresh = { name: 'HELENA', surname: 'GAWIN', date: '20.10.2026', grave_quarter: 'LXXIV', grave_row: '7', grave_spot: '11', birthday: '01.01.1940', extra: [] };
  const out = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: await locatorSession({ extraHelena: [fresh] }), gapMs: 0, referenceIso: REF });
  const helena = out.rows.find((r) => r.name === 'Helena Gawin');
  assert.ok(helena);
  assert.equal(helena.date_death, '2026-10-20');
  assert.equal(isPriorityHit(helena, HELENA_GAWIN_PHRASES), true);
});

test('lokalizator: archiwalny wpis spoza listy bazowej nie wywołuje alarmu', async () => {
  const old = { name: 'HELENA', surname: 'GAWIN', date: '03.03.1950', grave_quarter: 'X', grave_row: '1', grave_spot: '2', birthday: '01.01.1890', extra: [] };
  const out = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: await locatorSession({ extraHelena: [old] }), gapMs: 0, referenceIso: REF });
  assert.equal(out.diagnostics.historical_skipped, 1);
  assert.ok(!out.rows.some((r) => r.name === 'Helena Gawin'));
});

test('lokalizator: nowa osoba w grobie Adama Gawina jest zgłaszana zawsze', async () => {
  const adam = JSON.parse(await fixture('zck_lokalizator_adam_gawin_2_2026-10-27.json'));
  adam[0].extra.push({ name: 'MARIA', surname: 'KOWALSKA', date: '21.10.2026', birthday: '05.05.1941' });
  const out = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: await locatorSession({ adam: JSON.stringify(adam) }), gapMs: 0, referenceIso: REF });
  const nowa = out.rows.find((r) => r.name === 'Maria Kowalska');
  assert.ok(nowa);
  assert.equal(nowa.force_match, true);
  assert.match(nowa.match_reason, /nowa osoba w obserwowanym grobie Adam Gawin/);
  assert.equal(nowa.place, 'Cmentarz Rakowicki, kw. LXXIV, rz. 7, m. 11');
  // Nazwisko nie pasuje do fraz, a mimo to rekord jest trafieniem.
  assert.equal(isPriorityHit(nowa, HELENA_GAWIN_PHRASES), true);
});

test('lokalizator: zniknięcie obserwowanego grobu i błędy API są zgłaszane', async () => {
  const missing = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: await locatorSession({ adam: '[]' }), gapMs: 0, referenceIso: REF });
  assert.match(missing.error, /obserwowany grób Adam Gawin .* nie został znaleziony/);

  const page = await fixture('zck_lokalizator_2026-10-27.html');
  const failing = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: fakeSession(page, () => ({ ok: false, status: 500, text: '', error: 'HTTP 500' })), gapMs: 0, referenceIso: REF });
  assert.match(failing.error, /25\/25 zapytań bez poprawnej odpowiedzi/);
  assert.equal(failing.diagnostics.parser_status, 'api_error');
  const offline = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: fakeSession(page, () => ({ ok: false, status: 0, text: '', error: 'timeout' })), gapMs: 0, referenceIso: REF });
  assert.equal(offline.diagnostics.parser_status, 'http_error');
});

test('lista bazowa lokalizatora obejmuje cztery znane wpisy z przeglądu 2026-10-27', () => {
  assert.equal(ZCK_LOCATOR_BASELINE.length, 4);
  assert.deepEqual(ZCK_LOCATOR_BASELINE.map((b) => `${b.graveyard}:${b.grave}`), ['2:LXXII/20/14', '2:XXX/4/16', '2:LXIII/2/30', '8:F/7/13']);
});

test('seria zapytań ZCK ma budżet czasu i przerywa się po dwóch zerwanych połączeniach', async () => {
  // Bez tego 26 zapytań × 3 próby × 20 s przekraczało limit workflow (20 min), a przebieg
  // ubity limitem nie zapisuje ani danych, ani statusu.
  const page = await fixture('zck_lokalizator_2026-10-27.html');
  const offline = fakeSession(page, () => ({ ok: false, status: 0, text: '', error: 'timeout' }));
  const out = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: offline, gapMs: 0, referenceIso: REF });
  assert.equal(offline.calls.filter((c) => c.method === 'POST').length, 2, 'po dwóch zerwanych połączeniach seria jest przerywana');
  assert.equal(out.diagnostics.queries_failed, 25);
  assert.equal(out.diagnostics.parser_status, 'http_error');

  const slow = fakeSession(page, async () => { await new Promise((r) => setTimeout(r, 30)); return notFound(); });
  const late = await parseZckLokalizator(SOURCES.zck_lokalizator, { session: slow, gapMs: 0, budgetMs: 70, referenceIso: REF });
  assert.ok(slow.calls.filter((c) => c.method === 'POST').length < 25);
  assert.equal(late.diagnostics.parser_status, 'timeout_budget');
  assert.match(late.error, /zapytań bez poprawnej odpowiedzi/);

  const funeralsPage = await fixture('zck_funerals_2026-10-27.html');
  const slowApi = fakeSession(funeralsPage, async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: false, status: 503, text: '', error: 'HTTP 503' }; });
  const funerals = await parseZckFunerals(SOURCES.zck_funerals, { session: slowApi, gapMs: 0, budgetMs: 50 });
  assert.equal(funerals.rows.length, 15, 'dzień bieżący zostaje');
  assert.equal(funerals.diagnostics.parser_status, 'timeout_budget');
});
