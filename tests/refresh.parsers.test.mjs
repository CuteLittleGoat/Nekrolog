import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parsePolishDateToIso, parseTime, parseZckFuneralsHtml, parsePukPozegnalismyHtml,
  parseGabriel24NekrologiHtml, parseGabriel24DetailHtml, parseKarawanNekrologiHtml, parseKarawanDetailHtml,
  parseGrobonetNekrologiHtml, parseGrobonetDetailHtml, parsePodwawelskieNekrologiHtml, parsePodwawelskieDetailHtml,
  parseDebnikiSdbPogrzebyHtml, parseSwJadwigaPogrzeboweHtml, parseSource, parseGenericHtml, validateParsedRow
} from '../scripts/nekrolog_core.mjs';
const source={id:'x',name:'X',url:'https://example.com',list_url:'https://example.com'};
assert.equal(parsePolishDateToIso('08.05.2026'),'2026-05-08');
assert.equal(parsePolishDateToIso('8 maja 2026'),'2026-05-08');
assert.equal(parsePolishDateToIso('8 maj 2026'),'2026-05-08');
assert.equal(parsePolishDateToIso('8 V 2026'),'2026-05-08');
assert.equal(parseTime('9:00'),'09:00'); assert.equal(parseTime('godz. 9.00'),'09:00');
const zck=await fs.readFile(new URL('./fixtures/zck_sample.html',import.meta.url),'utf8'); assert.ok(parseZckFuneralsHtml(zck,source).length>=1);
const puk=await fs.readFile(new URL('./fixtures/puk_sample.html',import.meta.url),'utf8'); assert.equal(parsePukPozegnalismyHtml(puk,source)[0].kind,'death');
const karawanList=await fs.readFile(new URL('./fixtures/karawan_list.html',import.meta.url),'utf8'); assert.equal(parseKarawanNekrologiHtml(karawanList,{...source,url:'https://karawan.pl'}).length,2);
const kw=await fs.readFile(new URL('./fixtures/karawan_detail_wladyslaw_stozek.html',import.meta.url),'utf8');
const ke=await fs.readFile(new URL('./fixtures/karawan_detail_elzbieta_rodecka.html',import.meta.url),'utf8');
const w=parseKarawanDetailHtml(kw,{...source,id:'karawan_nekrologi',name:'Karawan',url:'https://karawan.pl'},'https://karawan.pl/nekrolog/wladyslaw-stozek/');
const e=parseKarawanDetailHtml(ke,{...source,id:'karawan_nekrologi',name:'Karawan',url:'https://karawan.pl'},'https://karawan.pl/nekrolog/elzbieta-rodecka/');
for (const r of [w,e]) { assert.ok(r); assert.ok(!/GłównaNekrologiFirmaW Służbie|Główna Nekrologi Firma W Służbie/.test(r.name)); assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(r.note)); assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(r.place)); }
assert.equal(w.date_funeral,'2026-05-08'); assert.equal(w.time_funeral,'09:00');
const gList=await fs.readFile(new URL('./fixtures/gabriel24_list.html',import.meta.url),'utf8'); const gDet=await fs.readFile(new URL('./fixtures/gabriel24_detail.html',import.meta.url),'utf8');
assert.equal(parseGabriel24NekrologiHtml(gList,{...source,url:'https://www.gabriel24.pl'}).length,1); assert.match(parseGabriel24DetailHtml(gDet,source,'https://x').name,/Jan Kowalski/);
const grList=await fs.readFile(new URL('./fixtures/grobonet_list.html',import.meta.url),'utf8'); const grDet=await fs.readFile(new URL('./fixtures/grobonet_detail.html',import.meta.url),'utf8');
assert.equal(parseGrobonetNekrologiHtml(grList,{...source,url:'https://krakowsalwator.grobonet.com'}).length,1); assert.match(parseGrobonetDetailHtml(grDet,source,'https://x').name,/Anna Nowak/);
const pList=await fs.readFile(new URL('./fixtures/podwawelskie_list.html',import.meta.url),'utf8'); const pDet=await fs.readFile(new URL('./fixtures/podwawelskie_detail.html',import.meta.url),'utf8');
assert.equal(parsePodwawelskieNekrologiHtml(pList,{...source,url:'https://www.podwawelskie.pl'}).length,1); assert.equal(parsePodwawelskieDetailHtml(pDet,source,'https://x').date_funeral,'2026-05-08');
const deb=await fs.readFile(new URL('./fixtures/debniki_sdb_list.html',import.meta.url),'utf8'); const debRows=parseDebnikiSdbPogrzebyHtml(deb,source); assert.ok(debRows.some(r=>/pogrzeb/i.test(r.note))); assert.ok(!debRows.some(r=>/\+ Jan Kowalski/.test(r.note)));
const jad=await fs.readFile(new URL('./fixtures/sw_jadwiga_pogrzebowe_sample.html',import.meta.url),'utf8'); assert.equal(parseSwJadwigaPogrzeboweHtml(jad,source)[0].kind,'funeral');
assert.equal(validateParsedRow({kind:'funeral',name:'Główna Nekrologi',note:'ok',place:'ok',source_id:'1',source_name:'x',url:'u'}),false);
assert.match((await parseSource({type:'unknown'})).error,/Nieznany parser/); assert.match((await parseGenericHtml({id:'abc'})).error,/Brak parsera/);
console.log('All parser tests passed.');
