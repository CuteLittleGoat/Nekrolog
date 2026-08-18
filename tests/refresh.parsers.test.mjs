// Testy parserów działają na ZRZUTACH REALNYCH STRON (tests/fixtures/*_RRRR-MM-DD.html).
// Poprzednie fixture'y były syntetyczne i opisywały strukturę, której źródła nigdy nie
// miały — zestaw był zielony, podczas gdy cztery parsery w produkcji zwracały zero.
// Odświeżenie zrzutów: patrz README, sekcja "Fixture'y regresyjne".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parsePolishDateToIso, parseTime, isoFromParts, normalizePersonName, isSafeUrl, validateParsedRow,
  parseZckFuneralsHtml, parsePukPozegnalismyHtml,
  parseGabriel24NekrologiHtml, parseGabriel24DetailHtml,
  parseKarawanNekrologiHtml, parseKarawanDetailHtml,
  parseGrobonetGrobyHtml, grobonetSearchUrl,
  parsePodwawelskieRowsFromListHtml, parsePodwawelskieNekrologiHtml,
  parseDebnikiSdbPogrzebyHtml, parseDebnikiSdbDetailHtml, parseDebnikiIntencjeHtml,
  parseSwJadwigaPogrzeboweHtml, parseSource, parseGenericHtml, mergeRequiredSources
} from '../scripts/nekrolog_core.mjs';

const fixture = (name) => fs.readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const SOURCES = Object.fromEntries(mergeRequiredSources([]).map((s) => [s.id, s]));
const generic = { id: 'x', name: 'X', url: 'https://example.com', list_url: 'https://example.com' };

test('parsowanie dat: formaty polskie i odrzucanie dat spoza kalendarza', () => {
  assert.equal(parsePolishDateToIso('08.05.2026'), '2026-05-08');
  assert.equal(parsePolishDateToIso('8 maja 2026'), '2026-05-08');
  assert.equal(parsePolishDateToIso('8 maj 2026'), '2026-05-08');
  assert.equal(parsePolishDateToIso('8 V 2026'), '2026-05-08');
  assert.equal(parsePolishDateToIso('2026-05-08'), '2026-05-08');
  // Bez walidacji zakresu Date.UTC przewijało 31.02 na 3 marca i data przechodziła dalej.
  assert.equal(parsePolishDateToIso('32.01.2026'), null);
  assert.equal(parsePolishDateToIso('31.02.2026'), null);
  assert.equal(parsePolishDateToIso('45.13.2026'), null);
  assert.equal(isoFromParts(2026, 2, 29), null);
  assert.equal(isoFromParts(2024, 2, 29), '2024-02-29');
});

test('parseTime odróżnia godzinę od daty i numeru', () => {
  assert.equal(parseTime('9:00'), '09:00');
  assert.equal(parseTime('godz. 9.00'), '09:00');
  assert.equal(parseTime('Data pogrzebu 12.05.2026 12:00'), '12:00');
  assert.equal(parseTime('12.04.2026 09:30 Anna Nowak msza pogrzebowa'), '09:30');
});

test('normalizePersonName ujednolica zapis między źródłami', () => {
  assert.equal(normalizePersonName('Śp. JAN SADZIK'), 'Jan Sadzik');
  assert.equal(normalizePersonName('JANINA KRAMARZ-GÓRKA'), 'Janina Kramarz-Górka');
  assert.equal(normalizePersonName('Anna Jakobschy (lat 82)'), 'Anna Jakobschy');
  assert.equal(normalizePersonName('+ Waldemar Musiał'), 'Waldemar Musiał');
  assert.equal(normalizePersonName('Maria Gronkowska'), 'Maria Gronkowska');
});

test('ZCK: data z nagłówka strony, komplet rekordów, miejsce bez godziny', async () => {
  const html = await fixture('zck_funerals_2026-08-18.html');
  const rows = parseZckFuneralsHtml(html, SOURCES.zck_funerals);
  assert.equal(rows.length, 20);
  // Regres na \b: po ekstrakcji tekstu data sklejała się z nazwą cmentarza
  // ("2026-08-18Cmentarz"), więc regex jej nie widział i podstawiany był dzień pobrania.
  assert.equal(rows[0].date_funeral, '2026-08-18');
  assert.equal(rows[0].date_is_fallback, false);
  assert.ok(rows.every((r) => r.date_is_fallback === false));
  assert.equal(rows[0].name, 'Anna Jakobschy');
  assert.equal(rows[0].time_funeral, '09:30');
  assert.equal(rows[0].place, 'Sala pożegnań – Cmentarz Rakowicki');
  // Godziny jednocyfrowe wsiąkały w pole place, bo parseTime dopełnia je zerem.
  assert.ok(rows.every((r) => !/^\d{1,2}:\d{2}/.test(r.place)));
  assert.ok(rows.every((r) => !/\(lat \d+\)/.test(r.name)));
});

test('PUK: para rekordów zgon + pogrzeb z linkiem do klepsydry', async () => {
  const html = await fixture('puk_pozegnalismy_2026-08-18.html');
  const rows = parsePukPozegnalismyHtml(html, SOURCES.puk_pozegnalismy);
  assert.ok(rows.length >= 40);
  const death = rows.find((r) => r.kind === 'death');
  assert.equal(death.name, 'Marek Nalborski');
  assert.equal(death.date_death, '2026-08-14');
  assert.equal(death.date_funeral, '2026-08-20');
  assert.equal(death.time_funeral, '12:20');
  assert.match(death.url, /nekrolog\.eklepsydra\.pl/);
  assert.ok(rows.some((r) => r.kind === 'funeral' && r.name === 'Marek Nalborski'));
});

test('Gabriel24: lista pomija strony oferty i paginację', async () => {
  const html = await fixture('gabriel24_list_2026-08-18.html');
  const links = parseGabriel24NekrologiHtml(html, SOURCES.gabriel_nekrologi).map((x) => x.url);
  assert.equal(links.length, 12);
  assert.ok(links.every((u) => /\/nekrolog\/[^/]+\/$/.test(u)));
  assert.ok(!links.some((u) => /pogrzeby-|zasilek|kwiaty|transmisje|akcesoria|przewozy|\/page\//.test(u)));
});

test('Gabriel24: detal oddaje komplet dat mimo stopki z Facebookiem', async () => {
  const html = await fixture('gabriel24_detail_2026-08-18.html');
  const row = parseGabriel24DetailHtml(html, SOURCES.gabriel_nekrologi, 'https://www.gabriel24.pl/nekrolog/tomasz-korczak/');
  assert.ok(row, 'rekord nie może zniknąć przez słowo "Facebook" w widżecie udostępniania');
  assert.equal(row.name, 'Tomasz Korczak');
  assert.equal(row.date_death, '2026-07-23');
  assert.equal(row.date_funeral, '2026-07-31');
  assert.equal(row.time_funeral, '13:00');
  assert.match(row.place, /Cmentarz Prokocim/);
  assert.ok(row.note.length > 0);
});

test('Gabriel24: strona usługowa nie tworzy rekordu osoby', async () => {
  const html = await fixture('gabriel24_service_page_2026-08-18.html');
  assert.equal(parseGabriel24DetailHtml(html, SOURCES.gabriel_nekrologi, 'https://www.gabriel24.pl/zasilek-pogrzebowy/'), null);
});

test('Karawan: lista i detal z datą zgonu, pogrzebu, godziną i cmentarzem', async () => {
  const list = await fixture('karawan_list_2026-08-18.html');
  const links = parseKarawanNekrologiHtml(list, SOURCES.karawan_nekrologi).map((x) => x.url);
  assert.equal(links.length, 7);
  assert.ok(links.every((u) => /karawan\.pl\/nekrolog\/[^/]+\/$/.test(u)));

  const detail = await fixture('karawan_detail_2026-08-18.html');
  const row = parseKarawanDetailHtml(detail, SOURCES.karawan_nekrologi, 'https://karawan.pl/nekrolog/jan-sadzik/');
  assert.ok(row);
  assert.equal(row.name, 'Jan Sadzik');
  assert.equal(row.date_death, '2026-08-11');
  assert.equal(row.date_funeral, '2026-08-18');
  assert.equal(row.time_funeral, '13:40');
  assert.match(row.place, /RAKOWICK/i);
});

test('Podwawelskie: kafelki z ikonami fa-star / fa-cross', async () => {
  const html = await fixture('podwawelskie_list_2026-08-18.html');
  const rows = parsePodwawelskieRowsFromListHtml(html, SOURCES.podwawelskie_nekrologi, SOURCES.podwawelskie_nekrologi.url);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].name, 'Henryka Sęk-Maszewska');
  assert.equal(rows[0].date_death, '2026-07-08');
  assert.equal(rows[0].kind, 'death');
  assert.match(rows[0].note, /ur\.: 1944-11-09/);
  assert.equal(parsePodwawelskieNekrologiHtml(html, SOURCES.podwawelskie_nekrologi).length, 6);
});

test('św. Jadwiga: zgłoszenia zgonu z datą publikacji, nigdy jako data pogrzebu', async () => {
  const html = await fixture('sw_jadwiga_list_2026-08-18.html');
  const rows = parseSwJadwigaPogrzeboweHtml(html, SOURCES.sw_jadwiga_pogrzebowe);
  assert.equal(rows.length, 30);
  assert.equal(rows[0].name, 'Waldemar Musiał');
  assert.equal(rows[0].date_death, '2026-08-13');
  assert.equal(rows[0].kind, 'death');
  // Strony szczegółowe zawierają intencje mszalne, a nie termin pogrzebu.
  assert.ok(rows.every((r) => r.date_funeral === null));
  assert.match(rows[0].url, /msze-swiete-pogrzebowe\/waldemar-musial/);
});

test('Dębniki: linki zbierane przed usunięciem nawigacji i tylko z własnego hosta', async () => {
  const html = await fixture('debniki_home_2026-08-18.html');
  const links = parseDebnikiSdbPogrzebyHtml(html, SOURCES.debniki_sdb).map((x) => x.url);
  assert.ok(links.some((u) => /\/intencje$/.test(u)), 'link do intencji leży w menu, które prepareReadableDocument usuwa');
  assert.ok(links.every((u) => /debniki\.sdb\.org\.pl/.test(u)), 'aktualności innych parafii salezjańskich nie są źródłem');
});

test('Dębniki: intencje mszalne za zmarłych z datą i godziną', async () => {
  const html = await fixture('debniki_intencje_2026-08-18.html');
  const rows = parseDebnikiIntencjeHtml(html, SOURCES.debniki_intencje, '2026-08-18');
  assert.ok(rows.length >= 25);
  assert.ok(rows.every((r) => r.kind === 'intention'));
  assert.ok(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date_intention || '')));
  assert.ok(rows.every((r) => /^\d{2}:\d{2}$/.test(r.time_intention || '')));
  assert.ok(rows.some((r) => r.name === 'Zofia Górak'));
});

test('Dębniki: szczegóły ogłoszeń rozróżniają pogrzeb od wzmianki o zgonie', async () => {
  const src = { ...generic, id: 'debniki_sdb', name: 'Dębniki', url: 'https://debniki.sdb.org.pl/' };
  const funeral = parseDebnikiSdbDetailHtml(await fixture('debniki_sdb_detail_funeral.html'), src, 'https://debniki.sdb.org.pl/x');
  assert.equal(funeral.kind, 'funeral');
  assert.equal(funeral.date_funeral, '2026-05-08');
  assert.equal(funeral.time_funeral, '09:00');
  const death = parseDebnikiSdbDetailHtml(await fixture('debniki_sdb_detail_death_only.html'), src, 'https://debniki.sdb.org.pl/y');
  assert.equal(death.kind, 'death');
  assert.equal(death.date_funeral, null);
  assert.equal(parseDebnikiSdbDetailHtml(await fixture('debniki_sdb_detail_intention_only.html'), src, 'https://debniki.sdb.org.pl/z'), null);
});

test('Grobonet: wyszukiwarka grobów zwraca miejsce pochówku', async () => {
  const html = await fixture('grobonet_groby_gawin_2026-08-18.html');
  const rows = parseGrobonetGrobyHtml(html, SOURCES.salwator_grobonet, 'Gawin');
  assert.ok(rows.length >= 10);
  assert.ok(rows.every((r) => r.kind === 'grave'));
  const konstanty = rows.find((r) => r.name === 'Konstanty Gawin');
  assert.ok(konstanty, 'nazwisko z wyniku wyszukiwania musi być odczytane');
  assert.equal(konstanty.date_death, '2007-04-28');
  assert.equal(konstanty.date_birth, '1931-02-13');
  assert.match(konstanty.place, /Cmentarz Parafialny Kraków-Salwator/);
  assert.match(konstanty.url, /id=detale/);
  assert.equal(
    grobonetSearchUrl(SOURCES.salwator_grobonet, 'Gawin'),
    'https://krakowsalwator.grobonet.com/grobonet/start.php?id=wyniki&name=Gawin'
  );
});

test('walidacja rekordów i bezpieczeństwo adresów', () => {
  assert.equal(validateParsedRow({ kind: 'funeral', name: 'Główna Nekrologi', note: 'ok', place: 'ok', source_id: '1', source_name: 'x', url: 'https://e.pl' }), false);
  assert.equal(validateParsedRow({ kind: 'funeral', name: 'Anna Nowak', note: 'ok', place: 'ok', source_id: '1', source_name: 'x', url: 'javascript:alert(1)' }), false);
  // Intencja bywa opisowa, więc reguła "imię + nazwisko" jej nie dotyczy.
  assert.equal(validateParsedRow({ kind: 'intention', name: 'Rozalia w 6 r. śm.', note: 'ok', place: 'ok', source_id: '1', source_name: 'x', url: 'https://e.pl' }), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('https://example.com'), true);
});

test('nieznane typy źródeł zgłaszają czytelny błąd', async () => {
  assert.match((await parseSource({ type: 'unknown' })).error, /Nieznany parser/);
  assert.match((await parseGenericHtml({ id: 'abc' })).error, /Brak parsera/);
});
