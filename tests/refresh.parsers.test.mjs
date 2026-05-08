import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parseZckFuneralsHtml,parsePukPozegnalismyHtml,parseGabriel24NekrologiHtml,parseGabriel24DetailHtml,parseKarawanNekrologiHtml,parseKarawanDetailHtml,parseGrobonetNekrologiHtml,parseGrobonetDetailHtml,parsePodwawelskieNekrologiHtml,parsePodwawelskieDetailHtml,parseDebnikiSdbPogrzebyHtml,parseSwJadwigaPogrzeboweHtml,parseSource,parseGenericHtml
} from '../scripts/nekrolog_core.mjs';
const source={id:'x',name:'X',url:'https://example.com',list_url:'https://example.com'};
const zck=await fs.readFile(new URL('./fixtures/zck_sample.html',import.meta.url),'utf8');
assert.ok(parseZckFuneralsHtml(zck,source).length>=1);
const puk=await fs.readFile(new URL('./fixtures/puk_sample.html',import.meta.url),'utf8');
const pukRows=parsePukPozegnalismyHtml(puk,source); assert.equal(pukRows[0].kind,'death');
const list=await fs.readFile(new URL('./fixtures/generic_list.html',import.meta.url),'utf8');
const detail=await fs.readFile(new URL('./fixtures/generic_detail.html',import.meta.url),'utf8');
for (const fn of [parseGabriel24NekrologiHtml,parseKarawanNekrologiHtml,parseGrobonetNekrologiHtml,parsePodwawelskieNekrologiHtml]) assert.equal(fn(list,source).length,1);
for (const fn of [parseGabriel24DetailHtml,parseKarawanDetailHtml,parseGrobonetDetailHtml,parsePodwawelskieDetailHtml]) assert.match(fn(detail,source,'https://example.com/d').name,/Jan Kowalski/);
const deb=await fs.readFile(new URL('./fixtures/debniki_sdb_sample.html',import.meta.url),'utf8'); assert.equal(parseDebnikiSdbPogrzebyHtml(deb,source)[0].kind,'funeral');
const jad=await fs.readFile(new URL('./fixtures/sw_jadwiga_pogrzebowe_sample.html',import.meta.url),'utf8'); assert.equal(parseSwJadwigaPogrzeboweHtml(jad,source)[0].kind,'funeral');
assert.match((await parseSource({type:'unknown'})).error,/Nieznany parser/);
assert.match((await parseGenericHtml({id:'abc'})).error,/Brak parsera/);
console.log('All parser tests passed.');
