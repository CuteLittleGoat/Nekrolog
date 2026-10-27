// Testy parserów działają na ZRZUTACH REALNYCH STRON (tests/fixtures/*_RRRR-MM-DD.html).
// Poprzednie fixture'y były syntetyczne i opisywały strukturę, której źródła nigdy nie
// miały — zestaw był zielony, podczas gdy cztery parsery w produkcji zwracały zero.
// Odświeżenie zrzutów: patrz README, sekcja "Fixture'y regresyjne".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parsePolishDateToIso, parseTime, isoFromParts, normalizePersonName, isSafeUrl, validateParsedRow,
  parseZckFuneralsHtml, zckConfirmsNoFunerals, parsePukPozegnalismyHtml,
  parseGabriel24NekrologiHtml, parseGabriel24DetailHtml,
  parseKarawanNekrologiHtml, parseKarawanDetailHtml,
  parseGrobonetGrobyHtml, grobonetSearchUrl,
  parsePodwawelskieRowsFromListHtml, parsePodwawelskieNekrologiHtml,
  parseDebnikiSdbPogrzebyHtml, parseDebnikiSdbDetailHtml, parseDebnikiIntencjeHtml,
  parseSwJadwigaPogrzeboweHtml, parseSource, parseGenericHtml, mergeRequiredSources,
  parseRssItems, parseKarawanFeedXml, parseKarawanNekrologi, parseEklepsydraEventsHtml, parsePukPozegnalismy
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
  // Zrzut z nowego hosta parafii (jadwiga.eparafia.pl) — struktura listy bez zmian.
  const html = await fixture('sw_jadwiga_list_2026-10-05.html');
  const rows = parseSwJadwigaPogrzeboweHtml(html, SOURCES.sw_jadwiga_pogrzebowe);
  assert.equal(rows.length, 30);
  assert.equal(rows[0].name, 'Stefan Biernat');
  assert.equal(rows[0].date_death, '2026-09-25');
  assert.equal(rows[0].kind, 'death');
  // Strony szczegółowe zawierają intencje mszalne, a nie termin pogrzebu.
  assert.ok(rows.every((r) => r.date_funeral === null));
  // Linki na liście są względne — rozwiązują się względem adresu źródła, więc po
  // zmianie domeny muszą wskazywać nowy host, a nie martwy swietajadwiga.diecezja.pl.
  assert.equal(rows[0].url, 'https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe/stefan-biernat');
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

test('ZCK: dzień bez pogrzebów jest potwierdzonym brakiem danych, nie awarią parsera', async () => {
  // Weekend w Krakowie bywa bez ceremonii — strona wypisuje wtedy przy każdym
  // cmentarzu "Brak pogrzebów", zachowując pełną strukturę. Zero rekordów jest
  // poprawną odpowiedzią źródła i nie może uruchamiać alarmu o zmianie strony.
  const html = await fixture('zck_funerals_brak_2026-08-23.html');
  assert.equal(parseZckFuneralsHtml(html, SOURCES.zck_funerals).length, 0);
  assert.equal(zckConfirmsNoFunerals(html), true);

  // Dzień z pogrzebami nie może być mylnie uznany za potwierdzony brak.
  const pelny = await fixture('zck_funerals_2026-08-18.html');
  assert.equal(zckConfirmsNoFunerals(pelny), false);
});

test('ZCK: zniknięcie tabel to awaria, nie potwierdzony brak', async () => {
  // Wyciszenie wymaga dowodu strukturalnego. Gdy tabele znikną — czyli strona
  // faktycznie się zmieni — alarm ma zadziałać.
  assert.equal(zckConfirmsNoFunerals('<html><body><h4>2026-08-23</h4><p>Brak pogrzebów</p></body></html>'), false);
  assert.equal(zckConfirmsNoFunerals('<html><body></body></html>'), false);
});

test('Karawan: kanał RSS podaje 10 ostatnich nekrologów, lista tylko bieżące', async () => {
  const feed = await fixture('karawan_feed_2026-10-27.xml');
  const items = parseRssItems(feed);
  assert.equal(items.length, 10);
  assert.equal(items[0].title, 'PIOTR WRZESIŃSKI');
  const links = parseKarawanFeedXml(feed).map((x) => x.url);
  assert.equal(links.length, 10);
  assert.ok(links.every((u) => /karawan\.pl\/nekrolog\/[^/]+\/$/.test(u)));
  // Strona listy z tego samego dnia pokazuje ułamek tego, co jest w kanale.
  const list = parseKarawanNekrologiHtml(await fixture('karawan_list_2026-10-27.html'), SOURCES.karawan_nekrologi);
  assert.ok(list.length < links.length);
});

test('Karawan: kandydaci z listy i z kanału są scalani, awaria jednej drogi nie zatrzymuje źródła', async () => {
  const list = await fixture('karawan_list_2026-10-27.html');
  const feed = await fixture('karawan_feed_2026-10-27.xml');
  const detail = await fixture('karawan_detail_2026-08-18.html');
  const asked = [];
  const fetcherWith = (listOk, feedOk) => async (url) => {
    asked.push(url);
    if (url === SOURCES.karawan_nekrologi.list_url) return listOk ? { ok: true, status: 200, text: list } : { ok: false, status: 503, text: '', error: 'HTTP 503' };
    if (url === SOURCES.karawan_nekrologi.feed_url) return feedOk ? { ok: true, status: 200, text: feed } : { ok: false, status: 0, text: '', error: 'timeout' };
    return { ok: true, status: 200, text: detail };
  };
  const both = await parseKarawanNekrologi(SOURCES.karawan_nekrologi, { fetcher: fetcherWith(true, true) });
  const fromList = parseKarawanNekrologiHtml(list, SOURCES.karawan_nekrologi).map((x) => x.url);
  const fromFeed = parseKarawanFeedXml(feed).map((x) => x.url);
  assert.equal(both.diagnostics.candidate_links, new Set([...fromList, ...fromFeed]).size);
  assert.equal(both.diagnostics.feed_links, 10);
  assert.equal(both.error, null);

  // Lista niedostępna, kanał działa: źródło nie upada, awaria trafia do diagnostyki.
  const feedOnly = await parseKarawanNekrologi(SOURCES.karawan_nekrologi, { fetcher: fetcherWith(false, true) });
  assert.equal(feedOnly.error, null);
  assert.equal(feedOnly.diagnostics.candidate_links, 10);
  assert.match(feedOnly.diagnostics.list_error, /503/);

  // Obie drogi niedostępne: błąd jak dotąd.
  const none = await parseKarawanNekrologi(SOURCES.karawan_nekrologi, { fetcher: fetcherWith(false, false) });
  assert.ok(none.error);
  assert.equal(none.rows.length, 0);
});

test('PUK: godzina i cmentarz ze strony klepsydry, pobranej raz na kartę', async () => {
  const detail = await fixture('eklepsydra_szczegoly_2026-10-27.html');
  const events = parseEklepsydraEventsHtml(detail);
  assert.deepEqual(events[0], { type: 'Pogrzeb', date: '2026-10-29', time: '13:00', place: 'Cmentarz Rakowicki', address: 'Rakowicka 26 Kraków' });

  const list = await fixture('puk_pozegnalismy_2026-08-18.html');
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    if (url === SOURCES.puk_pozegnalismy.list_url) return { ok: true, status: 200, text: list };
    return { ok: true, status: 200, text: detail };
  };
  const first = await parsePukPozegnalismy(SOURCES.puk_pozegnalismy, { fetcher, referenceIso: '2026-08-20', gapMs: 0 });
  // Tylko pogrzeby od daty odniesienia wzwyż — przeszłe karty nie są pobierane.
  const upcoming = new Set(first.rows.filter((r) => r.kind === 'funeral' && r.date_funeral >= '2026-08-20').map((r) => r.url));
  assert.equal(first.diagnostics.detail_pages, upcoming.size);
  assert.ok(upcoming.size > 0);
  const nalborski = first.rows.filter((r) => r.name === 'Marek Nalborski');
  assert.ok(nalborski.every((r) => r.place === 'Cmentarz Rakowicki (Rakowicka 26 Kraków)'));
  // Data w klepsydrze (29.10) nie zgadza się z datą pogrzebu z karty (20.08) — godzina
  // z klepsydry nie nadpisuje danych karty.
  assert.equal(nalborski.find((r) => r.kind === 'funeral').time_funeral, '12:20');
  // Karta z przeszłym pogrzebem zachowuje miejsce źródła.
  assert.ok(first.rows.filter((r) => !upcoming.has(r.url)).every((r) => r.place === SOURCES.puk_pozegnalismy.name));

  // Drugi przebieg z zapisanym stanem nie pyta ponownie o te same karty.
  const before = asked.length;
  const second = await parsePukPozegnalismy(SOURCES.puk_pozegnalismy, { fetcher, state: first.state, referenceIso: '2026-08-20', gapMs: 0 });
  assert.equal(asked.length, before + 1, 'tylko strona listy');
  assert.equal(second.diagnostics.detail_pages, 0);
  assert.equal(second.rows.find((r) => r.name === 'Marek Nalborski').place, 'Cmentarz Rakowicki (Rakowicka 26 Kraków)');
});
