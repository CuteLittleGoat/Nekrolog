// Parafie do 5 km od ul. Kapelanka: listy zmarłych z ogłoszeń, intencje mszalne, intencje
// pogrzebowe i ewidencja grobów w Borku Fałęckim. Zrzuty stron są przycięte, a dane osób
// żyjących (adresy, zamawiający msze, intencje za żyjących) zastąpiono w nich neutralnymi
// wartościami („ul. Przykładowa”, „Jana Zamawiającego”) — patrz README, sekcja o fixture'ach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  mergeRequiredSources, parseParishSource, parseEparafiaIntencjePogrzebowe, parseEparafiaEwidencjaGrobow,
  parseLooseDate, extractDeathNames, cleanIntentionText, applyFirstSeen, PARISH_PROFILES
} from '../scripts/nekrolog_core.mjs';

const fixture = (name) => fs.readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const SOURCES = Object.fromEntries(mergeRequiredSources([]).map((s) => [s.id, s]));
const REF = '2026-10-27';

// Fałszywy fetcher: adres → plik zrzutu. Adres spoza mapy dostaje 404, a lista zapytań
// pozwala sprawdzić, o co parser faktycznie pytał.
function fetcherFor(map) {
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    return map[url] ? { ok: true, status: 200, text: await fixture(map[url]) } : { ok: false, status: 404, text: '', error: 'HTTP 404' };
  };
  return { fetcher, asked };
}
const parse = (id, map, extra = {}) => parseParishSource(SOURCES[id], { fetcher: fetcherFor(map).fetcher, referenceIso: REF, ...extra });
const names = (rows, kind) => rows.filter((r) => r.kind === kind).map((r) => r.name);

// Żaden rekord nie może nieść adresu ani zamawiającego — to dane osób żyjących.
function assertNoLivingData(rows) {
  for (const r of rows) {
    const text = [r.name, r.note, r.place].join(' ');
    assert.doesNotMatch(text, /\bul\.?\s|Przykładow|Aleja|\bod\s+\p{L}|Zamawiając|Testowego|W intencji Parafian/u, `${r.source_id}: ${text}`);
  }
}

test('daty ogłoszeń i intencji: formaty spotykane na stronach parafii', () => {
  assert.equal(parseLooseDate('25.10.2026 - XXX Tydzień zwykły', REF), '2026-10-25');
  assert.equal(parseLooseDate('25 – 31.10. 2026', REF), '2026-10-25');
  assert.equal(parseLooseDate('27.09 – 3.10.2026', REF), '2026-09-27');
  assert.equal(parseLooseDate('25.10 do 1.11.2026 r.', REF), '2026-10-25');
  assert.equal(parseLooseDate('2025.11.30', REF), '2025-11-30');
  assert.equal(parseLooseDate('1.02.2026', REF), '2026-02-01');
  assert.equal(parseLooseDate('2026-10-25', REF), '2026-10-25');
  assert.equal(parseLooseDate(', 25.10:', REF), '2026-10-25');
  assert.equal(parseLooseDate(' 18 sierpnia', REF), '2026-08-18');
  // Harmonogram obejmuje najbliższe tygodnie: styczeń widziany w grudniu to następny rok.
  assert.equal(parseLooseDate('2.01', '2026-12-28'), '2027-01-02');
  assert.equal(parseLooseDate('31.02.2026', REF), null);
});

test('nazwiska z listy „pożegnaliśmy”: bez adresu, wieku i reszty zdania', () => {
  assert.deepEqual(
    extractDeathNames(': Ś.p Teresę Banaś z ul. Ludowej, Ś.p. Małgorzata Toboła z Al. Dembowskiego. Polecajmy zmarłych'),
    ['Teresę Banaś', 'Małgorzata Toboła']
  );
  assert.deepEqual(extractDeathNames(': + Irenę Chwajoł i + Jana Zawalskiego. Pomódlmy się „Dobry Jezu...”'), ['Irenę Chwajoł', 'Jana Zawalskiego']);
  assert.deepEqual(extractDeathNames(' do wieczności śp. +Wiesław Jaśkowiec i Urszula Łatka. Polećmy ich'), ['Wiesław Jaśkowiec', 'Urszula Łatka']);
  assert.deepEqual(extractDeathNames('† Janusza Nowotnika - ul. Widok 14'), ['Janusza Nowotnika']);
  assert.deepEqual(extractDeathNames('śp Józefa Zapałę z ul Mieczykowej a w środę pożegnamy śp Helenę Piskorz z ul Bartla na Cmentarzu'), ['Józefa Zapałę', 'Helenę Piskorz']);
  // Tytuł przed nazwiskiem jest pomijany, a nie kończy odczytu.
  assert.deepEqual(extractDeathNames(' śp. ks. Jan Kowalski.'), ['Jan Kowalski']);
  assert.deepEqual(extractDeathNames(' lato i jesień. Pomódlmy się'), []);
});

test('treść intencji: bez zamawiającego i bez intencji za żyjących', () => {
  assert.equal(cleanIntentionText('+ Jan Kuczat od Marii i Anny'), 'Jan Kuczat');
  assert.equal(cleanIntentionText('+ Bogusława Wojsznis – Zdziech od przyjaciół grupy'), 'Bogusława Wojsznis – Zdziech');
  assert.equal(cleanIntentionText('+Ewa Baran, od Anny i Tomasza z rodziną.'), 'Ewa Baran');
  assert.equal(cleanIntentionText('Za † Waldemara Ferdko (od Żony i Córek)'), 'Waldemara Ferdko');
  assert.equal(cleanIntentionText('+ Maria Latko oraz w int. Jakuba w 22 r. urodzin'), 'Maria Latko');
  assert.equal(cleanIntentionText('+ Józef Manterys – gregorianka 25'), 'Józef Manterys – gregorianka 25');
  assert.equal(cleanIntentionText('+ Jan Lech, 18 r. śm.'), 'Jan Lech, 18 r. śm.');
});

test('każde źródło parafialne ma profil odczytu', () => {
  const parish = Object.values(SOURCES).filter((s) => s.type === 'parafia_ogloszenia' || s.type === 'parafia_intencje');
  assert.ok(parish.length >= 14);
  for (const s of parish) assert.ok(PARISH_PROFILES[s.id], `brak profilu dla ${s.id}`);
});

test('MB Fatimskiej (Os. Podwawelskie): ogłoszenia z wielu tygodni, data z nagłówka tygodnia', async () => {
  const out = await parse('podwawelskie_ogloszenia', { [SOURCES.podwawelskie_ogloszenia.list_url]: 'podwawelskie_ogloszenia_2026-10-27.html' });
  assert.equal(out.error, null);
  assert.deepEqual(out.rows.map((r) => [r.name, r.date_reported]), [
    ['Bożenę Stępską-Kamińską', '2026-10-25'],
    ['Bolesława Włodarskiego', '2026-10-11'],
    ['Irenę Chwajoł', '2026-10-04'],
    ['Jana Zawalskiego', '2026-10-04']
  ]);
  // Ogłoszenie nie podaje daty zgonu — data ogłoszenia nigdy nie udaje daty zgonu.
  assert.ok(out.rows.every((r) => r.kind === 'death' && r.date_death === null));
  assertNoLivingData(out.rows);
});

test('św. Józefa: tydzień „25 – 31.10. 2026”, nazwiska bez ulic', async () => {
  const out = await parse('jozef_ogloszenia', { [SOURCES.jozef_ogloszenia.list_url]: 'jozef_ogloszenia_2026-10-27.html' });
  assert.deepEqual(names(out.rows, 'death'), ['Teresę Banaś', 'Małgorzata Toboła', 'Stefan Krzyszkowski', 'Maria Tomal', 'Wiktoria Nowak']);
  assert.ok(out.rows.every((r) => r.date_reported === '2026-10-25'));
  assertNoLivingData(out.rows);
});

test('Wola Duchacka: lista pionowa „śp. …” pod nagłówkiem z dwukropkiem', async () => {
  const out = await parse('wola_duchacka_ogloszenia', { [SOURCES.wola_duchacka_ogloszenia.list_url]: 'wola_duchacka_ogloszenia_2026-10-27.html' });
  assert.deepEqual(names(out.rows, 'death'), ['Maria Kwaśniewska', 'Stanisława Blecharz', 'Renata Essen', 'Janina Majewska', 'Ludwika Talarek', 'Krystyna Kapera', 'Marian Celary']);
  assert.deepEqual([...new Set(out.rows.map((r) => r.date_reported))], ['2026-10-18', '2026-10-11']);
});

test('NMP z Lourdes: wpisy z kanału RSS, data z tytułu wpisu', async () => {
  const out = await parse('lourdes_ogloszenia', { [SOURCES.lourdes_ogloszenia.feed_url]: 'lourdes_ogloszenia_feed_2026-10-27.xml' });
  assert.equal(out.diagnostics.documents, 3);
  assert.deepEqual(out.rows[0].name, 'Dorota Niedźwiedzka');
  assert.equal(out.rows[0].date_reported, '2026-10-25');
  assert.equal(out.rows.length, 6);
  assert.match(out.rows[0].url, /misjonarska\.pl\/2026\/10\/24\//);
  assertNoLivingData(out.rows);
});

test('MB Zwycięskiej (Borek): bieżące ogłoszenie wskazane linkiem ze strony głównej', async () => {
  const { fetcher, asked } = fetcherFor({
    'https://zwycieska.eparafia.pl/': 'borek_strona_glowna_2026-10-27.html',
    'https://zwycieska.eparafia.pl/ogloszenia-30-niedziela-zwykla-25-10-2026': 'borek_ogloszenia_2026-10-25.html'
  });
  const out = await parseParishSource(SOURCES.borek_ogloszenia, { fetcher, referenceIso: REF });
  // Najnowsze ogłoszenie (data w adresie) jest pobierane jako pierwsze.
  assert.equal(asked[1], 'https://zwycieska.eparafia.pl/ogloszenia-30-niedziela-zwykla-25-10-2026');
  assert.deepEqual(names(out.rows, 'death'), ['Irenę Miernik', 'Józefa Śliwę', 'Jacka Migdałka']);
  assert.ok(out.rows.every((r) => r.date_reported === '2026-10-25'));
});

test('Kliny Borkowskie: jeden artykuł daje listę zmarłych i intencje tygodnia', async () => {
  const { fetcher } = fetcherFor({
    [SOURCES.kliny_borkowskie_ogloszenia.list_url]: 'kliny_borkowskie_lista_2026-10-27.html',
    'https://kliny.katolicki.eu/index.php/aktualnosci/ogloszenia-i-intencje/30-niedziela-zwykla.html': 'kliny_borkowskie_ogloszenia_2026-10-25.html'
  });
  const out = await parseParishSource(SOURCES.kliny_borkowskie_ogloszenia, { fetcher, referenceIso: REF });
  assert.deepEqual(names(out.rows, 'death'), ['Wiesław Jaśkowiec', 'Urszula Łatka']);
  const intentions = out.rows.filter((r) => r.kind === 'intention');
  assert.equal(intentions.length, 18);
  const kuczat = intentions.find((r) => r.name === 'Jan Kuczat');
  assert.ok(kuczat, 'zamawiający („od Marii i Anny”) musi zostać odcięty');
  assert.equal(kuczat.date_intention, '2026-10-26');
  assert.equal(kuczat.time_intention, '18:30');
  // Msze bez zmarłego („W intencji Parafii”, „Za zmarłych członków Żywego Różańca”) pomijamy.
  assert.ok(!intentions.some((r) => /Parafii|Różańca/.test(r.name)));
  assertNoLivingData(out.rows);
});

test('Dąbie: lista bez dat — pierwszy odczyt to lista bazowa, nowe wpisy dostają datę', async () => {
  const map = { [SOURCES.dabie_odeszli.list_url]: 'dabie_odeszli_2026-10-27.html' };
  const first = await parse('dabie_odeszli', map);
  assert.equal(first.rows.length, 70);
  assert.equal(first.rows[0].name, 'Janusza Nowotnika');
  // Lista kończy się na nagłówku „ROK 2026” — wpisy archiwalne nie są czytane.
  assert.ok(!first.rows.some((r) => r.name === 'Władysława Świerczyńskiego'));
  // Pierwszy odczyt: brak daty zgłoszenia, inaczej cała lista trafiłaby do okna 7 dni.
  assert.ok(first.rows.every((r) => r.date_reported === undefined));
  assert.equal(Object.values(first.state.first_seen).filter((v) => v === 'baseline').length, 70);
  assertNoLivingData(first.rows);

  // Kolejny przebieg: wpis nieobecny w stanie jest nowy i dostaje datę pierwszego odczytu.
  const state = { first_seen: { ...first.state.first_seen } };
  delete state.first_seen['janusza nowotnika'];
  const second = await parse('dabie_odeszli', map, { state, referenceIso: '2026-10-28' });
  assert.equal(second.rows.find((r) => r.name === 'Janusza Nowotnika').date_reported, '2026-10-28');
  assert.equal(second.rows.find((r) => r.name === 'Joannę Chmielek').date_reported, undefined);
});

test('Kliny Zacisze: data z nagłówka „Kraków …”, ogłoszenia archiwalne pominięte', async () => {
  const out = await parse('zacisze_ogloszenia', { [SOURCES.zacisze_ogloszenia.list_url]: 'zacisze_ogloszenia_2026-10-27.html' });
  assert.deepEqual(out.rows.map((r) => [r.name, r.date_reported]), [
    ['Irena Szczepańska', '2026-10-11'],
    ['Zbigniew Krajanowski', '2026-10-03'],
    ['Natalia Schevczenko', '2026-09-27']
  ]);
  // Zrzut zawiera też blok z 2025 r. (śp. Małgorzata Madej) — starszy niż 60 dni.
  assert.ok(!out.rows.some((r) => /Madej/.test(r.name)));
  assertNoLivingData(out.rows);
});

test('tydzień bez zmarłych przy rozpoznanej strukturze to potwierdzony brak danych', async () => {
  const html = '<html><body><p>Ogłoszenia parafialne 25 – 31.10. 2026</p><p>Zapraszamy na różaniec.</p></body></html>';
  const pusty = await parseParishSource(SOURCES.jozef_ogloszenia, { fetcher: async () => ({ ok: true, status: 200, text: html }), referenceIso: REF });
  assert.equal(pusty.diagnostics.parser_status, 'empty_confirmed');
  // Bez daty ogłoszenia (zmiana strony) zero rekordów nie jest potwierdzeniem.
  const zmieniony = await parseParishSource(SOURCES.jozef_ogloszenia, { fetcher: async () => ({ ok: true, status: 200, text: '<html><body><p>Strona w przebudowie</p></body></html>' }), referenceIso: REF });
  assert.equal(zmieniony.diagnostics.parser_status, 'empty');
});

test('intencje tygodniowe: różne układy nagłówków dni i godzin', async () => {
  const cases = [
    ['podwawelskie_intencje', { [SOURCES.podwawelskie_intencje.list_url]: 'podwawelskie_intencje_2026-10-27.html' }, 20, ['Jan Lech, 18 r. śm.', '2026-10-25', '08:00']],
    ['kinga_intencje', { [SOURCES.kinga_intencje.list_url]: 'kinga_intencje_2026-10-27.html' }, 17, ['Dorota Hapłyk – w 9. rocznicę śmierci', '2026-10-25', '07:30']],
    ['plaszow_intencje', { [SOURCES.plaszow_intencje.list_url]: 'plaszow_intencje_2026-10-27.html' }, 26, ['Kazimierę (15 rocz. śm.) i Włodzimierza', '2026-10-25', '07:00']],
    ['bronowickie_intencje', { [SOURCES.bronowickie_intencje.feed_url]: 'bronowickie_intencje_feed_2026-10-27.xml' }, 32, ['Zbigniew Marszałek', '2026-10-25', '07:30']],
    ['skotniki_intencje', { [SOURCES.skotniki_intencje.feed_url]: 'skotniki_intencje_feed_2026-10-27.xml' }, 39, ['Halina Jurgała oraz Bożena i Jadwiga', '2026-10-26', '18:00']],
    ['zacisze_intencje', { [SOURCES.zacisze_intencje.list_url]: 'zacisze_intencje_2026-10-27.html' }, 52, ['Irena Janowska (greg)', '2026-10-20', '07:00']]
  ];
  for (const [id, map, count, [name, date, time]] of cases) {
    const out = await parse(id, map);
    assert.equal(out.error, null, id);
    assert.equal(out.rows.length, count, id);
    assert.ok(out.rows.every((r) => r.kind === 'intention' && /^\d{4}-\d{2}-\d{2}$/.test(r.date_intention)), id);
    assert.deepEqual([out.rows[0].name, out.rows[0].date_intention, out.rows[0].time_intention], [name, date, time], id);
    assertNoLivingData(out.rows);
  }
});

test('intencje: zamawiający i msze za żyjących nie trafiają do rekordów', async () => {
  const plaszow = await parse('plaszow_intencje', { [SOURCES.plaszow_intencje.list_url]: 'plaszow_intencje_2026-10-27.html' });
  assert.ok(plaszow.rows.some((r) => r.name === 'Waldemara Ferdko'));
  const skotniki = await parse('skotniki_intencje', { [SOURCES.skotniki_intencje.feed_url]: 'skotniki_intencje_feed_2026-10-27.xml' });
  assert.ok(skotniki.rows.some((r) => r.name === 'Ewa Baran'));
  // Okno zapisu intencji: tydzień wstecz i miesiąc naprzód od daty odniesienia.
  assert.ok(skotniki.rows.every((r) => r.date_intention >= '2026-10-20' && r.date_intention <= '2026-11-27'));
});

test('Borek: intencje pogrzebowe dają wzmiankę o zgonie i terminy mszy bez zamawiających', async () => {
  const { fetcher, asked } = fetcherFor({
    [SOURCES.borek_intencje_pogrzebowe.list_url]: 'borek_intencje_pogrzebowe_lista_2026-10-27.html',
    'https://zwycieska.eparafia.pl/intencje-pogrzebowe(3)/intencje-pogrzebowe-2026': 'borek_intencje_pogrzebowe_2026_2026-10-27.html'
  });
  const out = await parseEparafiaIntencjePogrzebowe(SOURCES.borek_intencje_pogrzebowe, { fetcher, referenceIso: REF });
  // Najnowsza podstrona roczna jest wybierana ze strony listy (są też 2023–2025).
  assert.equal(asked[1], 'https://zwycieska.eparafia.pl/intencje-pogrzebowe(3)/intencje-pogrzebowe-2026');
  const deaths = out.rows.filter((r) => r.kind === 'death');
  assert.equal(deaths.length, 10);
  assert.equal(deaths[0].name, 'Jacek Migdałek');
  assert.ok(deaths.every((r) => r.date_reported === undefined), 'pierwszy odczyt to lista bazowa');
  const intentions = out.rows.filter((r) => r.kind === 'intention');
  assert.equal(intentions.length, 26);
  const skotniczy = intentions.find((r) => r.name === 'Zbigniew Skotniczy' && r.date_intention === '2026-10-29');
  assert.equal(skotniczy.time_intention, '06:30');
  // Terminy poza oknem (np. grudzień) nie są zapisywane.
  assert.ok(intentions.every((r) => r.date_intention >= '2026-10-20' && r.date_intention <= '2026-11-27'));
  assertNoLivingData(out.rows);
});

test('Borek: ewidencja grobów — całe człony nazwiska, Last-Modified i odpowiedź 304', async () => {
  const json = await fixture('borek_ewidencja_grobow_2026-10-26.json');
  const lastModified = 'Mon, 26 Oct 2026 15:39:34 GMT';
  const calls = [];
  const session = {
    request: async (url, opts = {}) => {
      calls.push(opts.headers || {});
      if (opts.headers?.['if-modified-since'] === lastModified) return { ok: false, status: 304, text: '', header: () => null };
      return { ok: true, status: 200, text: json, header: (n) => (n === 'last-modified' ? lastModified : null) };
    }
  };
  const first = await parseEparafiaEwidencjaGrobow(SOURCES.borek_ewidencja_grobow, { session, referenceIso: REF });
  assert.equal(first.error, null);
  // 9 pochówków o nazwisku Gawin; „Derenda” to inne nazwisko niż „Dereń”.
  assert.equal(first.rows.length, 9);
  assert.ok(first.rows.every((r) => r.kind === 'grave' && /Gawin$/.test(r.name)));
  const zuzanna = first.rows.find((r) => r.name === 'Zuzanna Gawin');
  assert.equal(zuzanna.year_death, '2007');
  assert.equal(zuzanna.place, 'Cmentarz parafialny Borek Fałęcki, kwatera 14, grób 124');
  assert.equal(first.state.last_modified, lastModified);
  assert.equal(calls[0]['if-modified-since'], undefined);

  // Bez zmian w pliku serwer odpowiada 304 — rekordy pochodzą z zapisanego stanu.
  const second = await parseEparafiaEwidencjaGrobow(SOURCES.borek_ewidencja_grobow, { session, state: first.state, referenceIso: REF });
  assert.equal(calls[1]['if-modified-since'], lastModified);
  assert.equal(second.diagnostics.not_modified, true);
  assert.equal(second.rows.length, 9);
});

test('Borek: archiwalny wpis pasujący do fraz nie trafia do rekordów, bieżący — tak', async () => {
  const records = [
    { NrKwatery: '5', NrGrobu: '7', Nazwisko: 'Gawin', Imie: 'Helena', RokZgonu: '1985', IdGrobu: '5/7' },
    { NrKwatery: '6', NrGrobu: '8', Nazwisko: 'Gawin-Dereń', Imie: 'Helena', RokZgonu: '2026', IdGrobu: '6/8' }
  ];
  const session = { request: async () => ({ ok: true, status: 200, text: JSON.stringify(records), header: () => null }) };
  const out = await parseEparafiaEwidencjaGrobow(SOURCES.borek_ewidencja_grobow, { session, referenceIso: REF });
  assert.deepEqual(out.rows.map((r) => r.name), ['Helena Gawin-Dereń']);
  assert.equal(out.diagnostics.historical_skipped, 1);
});

test('pierwszy odczyt wpisów: lista bazowa, potem data pierwszego zauważenia', () => {
  const rows = () => [{ name: 'Jan Kowalski' }, { name: 'Anna Nowak' }];
  const a = rows();
  const first = applyFirstSeen(a, null, (r) => r.name, '2026-10-27');
  assert.deepEqual(first, { 'Jan Kowalski': 'baseline', 'Anna Nowak': 'baseline' });
  assert.ok(a.every((r) => r.date_reported === undefined));
  const b = [...rows(), { name: 'Ewa Zielińska' }];
  const second = applyFirstSeen(b, { first_seen: first }, (r) => r.name, '2026-10-28');
  assert.equal(second['Ewa Zielińska'], '2026-10-28');
  assert.equal(b[2].date_reported, '2026-10-28');
  assert.equal(b[0].date_reported, undefined);
});
