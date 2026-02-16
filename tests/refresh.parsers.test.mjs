import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseZckFuneralsHtml, parseIntentionsPlusHtml, mergeRequiredSources } from '../scripts/refresh.mjs';

const source = { id: 'test', name: 'Test Source', url: 'https://example.com', enabled: true };

const zckHtml = await fs.readFile(new URL('./fixtures/zck_sample.html', import.meta.url), 'utf8');
const zckRows = parseZckFuneralsHtml(zckHtml, source);
assert.equal(zckRows.length, 2);
assert.equal(zckRows[0].time_funeral, '10:00');
assert.equal(zckRows[0].name, 'Jan Kowalski');
assert.match(zckRows[0].place, /Kaplica mała/);
assert.equal(zckRows[0].date_funeral, '2026-02-16');

const intHtml = await fs.readFile(new URL('./fixtures/intencje_sample.html', import.meta.url), 'utf8');
const intRows = parseIntentionsPlusHtml(intHtml, source);
assert.equal(intRows.length, 2);
assert.equal(intRows[0].name, 'Jan Kowalski');
assert.match(intRows[1].note, /Maria Nowak/);

const merged = mergeRequiredSources([{ id: 'par_debniki_contact', url: 'https://old.example', enabled: true }]);
const debniki = merged.find((s) => s.id === 'par_debniki_contact');
assert.equal(debniki.enabled, false);
const grobonet = merged.find((s) => s.id === 'podgorki_tynieckie_grobonet');
if (grobonet && grobonet.url === 'https://klepsydrakrakow.grobonet.com/') {
  throw new Error('URL podgorki_tynieckie_grobonet should be normalized to /nekrologi.php');
}

console.log('All parser tests passed.');
