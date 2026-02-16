import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parseZckFuneralsHtml,
  parseIntentionsPlusHtml,
  mergeRequiredSources,
  resolveJobOutcome,
  buildFallbackSummaryForHelena
} from '../scripts/refresh.mjs';

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

const noRowsOutcome = resolveJobOutcome({ recentDeaths: 0, upcomingFunerals: 0, refreshErrors: ['A: błąd parsera'] });
assert.equal(noRowsOutcome.status, 'error');
assert.equal(noRowsOutcome.ok, false);
assert.match(noRowsOutcome.errorMessage, /A: błąd parsera/);

const partialOutcome = resolveJobOutcome({ recentDeaths: 2, upcomingFunerals: 0, refreshErrors: ['A: błąd parsera'] });
assert.equal(partialOutcome.status, 'done_with_errors');
assert.equal(partialOutcome.ok, true);

const okOutcome = resolveJobOutcome({ recentDeaths: 1, upcomingFunerals: 1, refreshErrors: [] });
assert.equal(okOutcome.status, 'done');
assert.equal(okOutcome.ok, true);
assert.equal(okOutcome.errorMessage, null);

const fallbackNoHits = buildFallbackSummaryForHelena(
  [{ name: 'Tomasz Sobkowiak', date_death: '2026-02-11', priority_hit: false, url: 'https://example.com/a', source_name: 'A' }],
  [{ name: 'Danuta Skorecka', date_funeral: '2026-02-09', priority_hit: false, url: 'https://example.com/b', source_name: 'B' }]
);
assert.equal(fallbackNoHits.text, 'Helena Gawin - brak informacji');
assert.equal(fallbackNoHits.date_death, null);
assert.equal(fallbackNoHits.date_funeral, null);
assert.equal(fallbackNoHits.urls.length, 0);

const fallbackWithHits = buildFallbackSummaryForHelena(
  [{ name: 'Helena Gawin', date_death: '2026-02-11', priority_hit: true, url: 'https://example.com/a', source_name: 'A' }],
  [{ name: 'Helena Gawin', date_funeral: '2026-02-12', priority_hit: true, url: 'https://example.com/b', source_name: 'B' }]
);
assert.match(fallbackWithHits.text, /Helena Gawin zmarła 2026-02-11, pogrzeb 2026-02-12/);
assert.equal(fallbackWithHits.urls.length, 2);

console.log('All parser tests passed.');
