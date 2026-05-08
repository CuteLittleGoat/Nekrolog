import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parsePolishDateToIso, parseTime, parseZckFuneralsHtml, parsePukPozegnalismyHtml,
  parseGabriel24NekrologiHtml, parseGabriel24DetailHtml, parseKarawanNekrologiHtml, parseKarawanDetailHtml,
  parseGrobonetNekrologiHtml, parseGrobonetDetailHtml, parsePodwawelskieNekrologiHtml, parsePodwawelskieDetailHtml,
  parseDebnikiSdbPogrzebyHtml, parseDebnikiSdbDetailHtml, parseSwJadwigaPogrzeboweHtml, parseSource, parseGenericHtml, validateParsedRow
} from '../scripts/nekrolog_core.mjs';

const source = { id:'x', name:'X', url:'https://example.com', list_url:'https://example.com' };

assert.equal(parsePolishDateToIso('08.05.2026'), '2026-05-08');
assert.equal(parsePolishDateToIso('8 maja 2026'), '2026-05-08');
assert.equal(parsePolishDateToIso('8 maj 2026'), '2026-05-08');
assert.equal(parsePolishDateToIso('8 V 2026'), '2026-05-08');
assert.equal(parseTime('9:00'), '09:00');
assert.equal(parseTime('godz. 9.00'), '09:00');
assert.equal(parseTime('o 9:00'), '09:00');
assert.equal(parseTime('Data pogrzebu 12.05.2026 12:00'), '12:00');
assert.equal(parseTime('Pogrzeb 11.05.2026 godz. 12:00'), '12:00');
assert.equal(parseTime('Data 12.05.2026'), null);

const zck = await fs.readFile(new URL('./fixtures/zck_sample.html', import.meta.url), 'utf8');
const zckRows = parseZckFuneralsHtml(zck, source);
assert.ok(zckRows.length >= 1);
assert.equal(zckRows[0].kind, 'funeral');

const puk = await fs.readFile(new URL('./fixtures/puk_sample.html', import.meta.url), 'utf8');
const pukRows = parsePukPozegnalismyHtml(puk, source);
assert.equal(pukRows[0].kind, 'death');
assert.equal(pukRows[0].date_funeral, '2026-05-12');
assert.equal(pukRows[0].time_funeral, '12:00');

const karawanList = await fs.readFile(new URL('./fixtures/karawan_list.html', import.meta.url), 'utf8');
assert.equal(parseKarawanNekrologiHtml(karawanList, { ...source, url:'https://karawan.pl' }).length, 2);

const kw = await fs.readFile(new URL('./fixtures/karawan_detail_wladyslaw_stozek.html', import.meta.url), 'utf8');
const ke = await fs.readFile(new URL('./fixtures/karawan_detail_elzbieta_rodecka.html', import.meta.url), 'utf8');
const w = parseKarawanDetailHtml(kw, { ...source, id:'karawan_nekrologi', name:'Karawan', url:'https://karawan.pl' }, 'https://karawan.pl/nekrolog/wladyslaw-stozek/');
const e = parseKarawanDetailHtml(ke, { ...source, id:'karawan_nekrologi', name:'Karawan', url:'https://karawan.pl' }, 'https://karawan.pl/nekrolog/elzbieta-rodecka/');
for (const r of [w, e]) {
  assert.ok(r);
  assert.ok(!/GłównaNekrologiFirmaW Służbie|Główna Nekrologi Firma W Służbie/.test(r.name));
  assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(r.note));
  assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(r.place));
}
assert.equal(w.date_funeral, '2026-05-08');
assert.equal(w.time_funeral, '09:00');

const gList = await fs.readFile(new URL('./fixtures/gabriel24_list.html', import.meta.url), 'utf8');
const gDet = await fs.readFile(new URL('./fixtures/gabriel24_detail.html', import.meta.url), 'utf8');
assert.equal(parseGabriel24NekrologiHtml(gList, { ...source, url:'https://www.gabriel24.pl' }).length, 1);
const gRow = parseGabriel24DetailHtml(gDet, source, 'https://www.gabriel24.pl/nekrolog/jan-kowalski');
assert.match(gRow.name, /Jan Kowalski/);
assert.equal(gRow.time_funeral, '09:00');

const grList = await fs.readFile(new URL('./fixtures/grobonet_list.html', import.meta.url), 'utf8');
const grDet = await fs.readFile(new URL('./fixtures/grobonet_detail.html', import.meta.url), 'utf8');
assert.equal(parseGrobonetNekrologiHtml(grList, { ...source, url:'https://krakowsalwator.grobonet.com' }).length, 1);
assert.match(parseGrobonetDetailHtml(grDet, source, 'https://krakowsalwator.grobonet.com/nekrologi.php?id=1').name, /Anna Nowak/);

const pList = await fs.readFile(new URL('./fixtures/podwawelskie_list.html', import.meta.url), 'utf8');
const pDet = await fs.readFile(new URL('./fixtures/podwawelskie_detail.html', import.meta.url), 'utf8');
assert.equal(parsePodwawelskieNekrologiHtml(pList, { ...source, url:'https://www.podwawelskie.pl' }).length, 1);
const pRow = parsePodwawelskieDetailHtml(pDet, source, 'https://www.podwawelskie.pl/aktualnosci/nekrolog-maria-kurek.html');
assert.equal(pRow.date_death, null);
assert.equal(pRow.date_funeral, '2026-05-08');

const deb = await fs.readFile(new URL('./fixtures/debniki_sdb_list.html', import.meta.url), 'utf8');
const debRows = parseDebnikiSdbPogrzebyHtml(deb, source);
assert.ok(debRows.some((r) => /pogrzeb/i.test(r.note)));
assert.ok(!debRows.some((r) => /\+ Jan Kowalski/.test(r.note)));
const debDetail = await fs.readFile(new URL('./fixtures/debniki_sdb_detail_funeral.html', import.meta.url), 'utf8');
const debDetailRow = parseDebnikiSdbDetailHtml(debDetail, source, 'https://debniki.sdb.org.pl/aktualnosci/msza-pogrzebowa-jan-nowak');
assert.equal(debDetailRow.kind, 'funeral');
assert.equal(debDetailRow.time_funeral, '09:00');

const jad = await fs.readFile(new URL('./fixtures/sw_jadwiga_pogrzebowe_sample.html', import.meta.url), 'utf8');
assert.equal(parseSwJadwigaPogrzeboweHtml(jad, source)[0].kind, 'funeral');

assert.equal(validateParsedRow({ kind:'funeral', name:'Główna Nekrologi', note:'ok', place:'ok', source_id:'1', source_name:'x', url:'u' }), false);
assert.equal(validateParsedRow({ kind:'funeral', name:'Jan Kowalski', note:'googletagmanager', place:'ok', source_id:'1', source_name:'x', url:'u' }), false);
assert.match((await parseSource({ type:'unknown' })).error, /Nieznany parser/);
assert.match((await parseGenericHtml({ id:'abc' })).error, /Brak parsera/);

console.log('All parser tests passed.');
