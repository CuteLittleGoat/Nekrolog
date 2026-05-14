import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parsePolishDateToIso, parseTime, parseZckFuneralsHtml, parsePukPozegnalismyHtml,
  parseGabriel24NekrologiHtml, parseGabriel24DetailHtml, parseKarawanNekrologiHtml, parseKarawanDetailHtml,
  parseGrobonetNekrologiHtml, parseGrobonetDetailHtml, parsePodwawelskieNekrologiHtml, parsePodwawelskieRowsFromListHtml, parsePodwawelskieNekrologi, parsePodwawelskieDetailHtml,
  parseDebnikiSdbPogrzebyHtml, parseDebnikiSdbDetailHtml, parseSwJadwigaPogrzeboweHtml, parseSource, parseGenericHtml, validateParsedRow
} from '../scripts/nekrolog_core.mjs';
const source={id:'x',name:'X',url:'https://example.com',list_url:'https://example.com'};
assert.equal(parsePolishDateToIso('08.05.2026'),'2026-05-08');
assert.equal(parsePolishDateToIso('8 maja 2026'),'2026-05-08');
assert.equal(parsePolishDateToIso('8 maj 2026'),'2026-05-08');
assert.equal(parsePolishDateToIso('8 V 2026'),'2026-05-08');
assert.equal(parseTime('9:00'),'09:00'); assert.equal(parseTime('godz. 9.00'),'09:00');
assert.equal(parseTime('Data pogrzebu 12.05.2026 12:00'),'12:00');
assert.equal(parseTime('12.04.2026 09:30 Anna Nowak msza pogrzebowa'),'09:30');
const zck=await fs.readFile(new URL('./fixtures/zck_sample.html',import.meta.url),'utf8'); assert.ok(parseZckFuneralsHtml(zck,source).length>=1);
const puk=await fs.readFile(new URL('./fixtures/puk_sample.html',import.meta.url),'utf8'); const pukRows=parsePukPozegnalismyHtml(puk,source); assert.equal(pukRows[0].kind,'death'); assert.equal(pukRows[0].time_funeral,'12:00');
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
const grobEmpty=await fs.readFile(new URL('./fixtures/grobonet_empty.html',import.meta.url),'utf8'); assert.equal(parseGrobonetNekrologiHtml(grobEmpty,{...source,url:'https://krakowsalwator.grobonet.com'}).length,0);
const grob=parseGrobonetDetailHtml(grDet,source,'https://x');
assert.equal(grob.date_funeral,'2026-05-08'); assert.equal(grob.time_funeral,'09:00'); assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(grob.note)); assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(grob.place));
const pList=await fs.readFile(new URL('./fixtures/podwawelskie_list.html',import.meta.url),'utf8');
const pLinks=parsePodwawelskieNekrologiHtml(pList,{...source,url:'https://www.podwawelskie.pl'});
assert.equal(pLinks.length,2);
const pRows=parsePodwawelskieRowsFromListHtml(pList,{...source,id:'podwawelskie_nekrologi',name:'Podwawelskie',url:'https://www.podwawelskie.pl'},'https://www.podwawelskie.pl/aktualnosci/nekrologi.html');
assert.equal(pRows[0].kind,'death'); assert.equal(pRows[0].name,'Anna Nowak'); assert.equal(pRows[0].date_death,'2026-05-08');
const pDet=await fs.readFile(new URL('./fixtures/podwawelskie_detail.html',import.meta.url),'utf8');
const pRow=parsePodwawelskieDetailHtml(pDet,source,'https://x');
assert.equal(pRow.date_funeral,'2026-05-08'); assert.equal(pRow.time_funeral,'09:00'); assert.ok(!/2026-05-01/.test(pRow.date_funeral)); assert.ok(!/iframe|googletagmanager|clickcease|src=|href=/i.test(pRow.note));
const deb=await fs.readFile(new URL('./fixtures/debniki_sdb_list.html',import.meta.url),'utf8'); const debLinks=parseDebnikiSdbPogrzebyHtml(deb,source); assert.ok(debLinks.length>=1);
const debPos=await fs.readFile(new URL('./fixtures/debniki_sdb_detail_funeral.html',import.meta.url),'utf8'); const debPosRow=parseDebnikiSdbDetailHtml(debPos,source,'https://example.com/x');
assert.equal(debPosRow.kind,'funeral'); assert.match(debPosRow.name,/Jan Nowak/); assert.equal(debPosRow.date_funeral,'2026-05-08'); assert.equal(debPosRow.time_funeral,'09:00');
const debNeg=await fs.readFile(new URL('./fixtures/debniki_sdb_detail_intention_only.html',import.meta.url),'utf8'); assert.equal(parseDebnikiSdbDetailHtml(debNeg,source,'https://example.com/y'),null);
const debDeath=await fs.readFile(new URL('./fixtures/debniki_sdb_detail_death_only.html',import.meta.url),'utf8'); const debDeathRow=parseDebnikiSdbDetailHtml(debDeath,{...source,id:'debniki_sdb',name:'Dębniki',url:'https://debniki.sdb.org.pl/'},'https://debniki.sdb.org.pl/x'); assert.equal(debDeathRow.kind,'death'); assert.match(debDeathRow.name,/Iren/); assert.equal(debDeathRow.date_funeral,null);
const jad=await fs.readFile(new URL('./fixtures/sw_jadwiga_pogrzebowe_sample.html',import.meta.url),'utf8'); assert.equal(parseSwJadwigaPogrzeboweHtml(jad,source)[0].kind,'funeral');
assert.equal(validateParsedRow({kind:'funeral',name:'Główna Nekrologi',note:'ok',place:'ok',source_id:'1',source_name:'x',url:'u'}),false);
assert.match((await parseSource({type:'unknown'})).error,/Nieznany parser/); assert.match((await parseGenericHtml({id:'abc'})).error,/Brak parsera/);
console.log('All parser tests passed.');
