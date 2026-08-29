import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { todayLocalMidnight, addDays, inWindow, toISODate } from './date.mjs';
import { notifyCzerwonaHelena } from './discord_notify.mjs';
import {
  HELENA_GAWIN_PHRASES,
  REQUIRED_SOURCES,
  clean,
  nowISO,
  parseSource,
  isIntentionLikeRow,
  isEligibleDeathRow,
  mergeRequiredSources,
  mergeDuplicateRows,
  rowMatchesPhrases,
  resolveJobOutcome,
  buildFallbackSummaryForHelena,
  isMeaningfulRow,
  isBlockedByAntiBot,
  isConfirmedEmpty,
  isTransientNetworkFailure,
  classifySourceOutcome
} from './nekrolog_core.mjs';

const CONFIG_PATH = 'config/sources.json';
const LATEST_PATH = 'data/latest.json';
const JOB_PATH = 'data/job.json';
const ERR_PATH = 'data/errors.json';
const HEALTH_PATH = 'data/source_health.json';

const WRITER = 'scripts/refresh_static.mjs';
const VERSION = 'static-2';
// Po ilu kolejnych przebiegach bez rekordów źródło uznajemy za ciche (czyli zepsute,
// a nie chwilowo puste). Dwa przebiegi dziennie => próg to mniej więcej półtora dnia.
const EMPTY_STREAK_ALERT = 3;
// Po ilu dniach blokada zewnętrzna (HTTP 403 z warstwy anty-botowej) przestaje być
// tolerowanym ostrzeżeniem i wraca do rangi błędu. Tolerancja ma przykrywać awarię
// przejściową, a nie trwałą utratę źródła — po tym czasie stan wymaga decyzji:
// albo źródło wraca, albo należy je wyłączyć (enabled: false).
const BLOCK_TOLERANCE_DAYS = 14;
// Po ilu kolejnych nieudanych odczytach sieciowych ostrzeżenie staje się błędem.
// Dwa przebiegi dziennie => próg 2 daje około pół doby tolerancji: chwilowa awaria
// sieci przechodzi bez degradacji statusu, trwała utrata źródła nie.
const NETWORK_FAIL_ALERT = 2;

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; } }
async function writeJson(path, data) { await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8'); }

async function ensureSourcesConfig() {
  let cfg = await readJson(CONFIG_PATH, null);
  if (!cfg || !Array.isArray(cfg.sources)) {
    cfg = { sources: REQUIRED_SOURCES };
    await writeJson(CONFIG_PATH, cfg);
  }
  return cfg;
}

// Źródło, które zwraca zero rekordów przez kilka przebiegów z rzędu, jest zepsute —
// wcześniej taki stan trwał bezterminowo z error: null i nie było go widać nigdzie.
function updateSourceHealth(previous, source, parsed) {
  const prev = previous?.[source.id] || {};
  const rows = (parsed.rows || []).length;
  const httpOk = !parsed.error;
  // Potwierdzony brak danych (źródło wprost pisze, że nic nie ma) jest odczytem
  // udanym — zeruje licznik, tak samo jak przebieg z rekordami. Licznik ma wykrywać
  // ciszę po awarii, a nie dni, w których po prostu nic się nie wydarzyło.
  const confirmedEmpty = isConfirmedEmpty(parsed);
  const streak = (rows > 0 || confirmedEmpty) ? 0 : Number(prev.empty_streak || 0) + 1;
  const blocked = isBlockedByAntiBot(parsed);
  // Licznik kolejnych niepowodzeń sieciowych. Zeruje się przy każdym odczycie, który
  // nie był awarią sieci — także przy błędzie innej natury, żeby seria nie zlepiała
  // przeterminowania połączenia z regresją parsera w jeden narastający ciąg.
  const networkFailure = isTransientNetworkFailure(parsed);
  const failStreak = networkFailure ? Number(prev.fail_streak || 0) + 1 : 0;
  return {
    source_id: source.id,
    source_name: source.name,
    last_rows: rows,
    last_run: nowISO(),
    last_nonempty_run: rows > 0 ? nowISO() : (prev.last_nonempty_run || null),
    empty_streak: streak,
    fail_streak: failStreak,
    http_ok: httpOk,
    known_empty: source.known_empty === true,
    last_confirmed_empty_run: confirmedEmpty ? nowISO() : (prev.last_confirmed_empty_run || null),
    // Znacznik pierwszego przebiegu z blokadą. Zeruje się przy pierwszym udanym
    // odczycie, więc mierzy czas trwania bieżącej blokady, a nie sumę historyczną.
    blocked_since: blocked ? (prev.blocked_since || nowISO()) : null
  };
}

async function main() {
  await mkdir('config', { recursive: true });
  await mkdir('data', { recursive: true });

  const startedAt = nowISO();
  const trigger = process.env.REFRESH_TRIGGER || 'manual_or_schedule';

  try {
    const cfg = await ensureSourcesConfig();
    const mergedSources = mergeRequiredSources(cfg.sources);
    if (JSON.stringify(cfg.sources) !== JSON.stringify(mergedSources)) await writeJson(CONFIG_PATH, { sources: mergedSources });

    const today = todayLocalMidnight();
    const deathStart = addDays(today, -7);
    const deathEnd = addDays(today, 0);
    const funeralStart = addDays(today, 0);
    const funeralEnd = addDays(today, 7);

    const enabled = mergedSources.filter((s) => s.enabled !== false);
    const previousHealth = await readJson(HEALTH_PATH, {});
    const allRows = [];
    const sourceErrors = [];
    // Ostrzeżenia opisują stan znany i zewnętrzny — nie degradują statusu przebiegu,
    // ale pozostają widoczne w job.json, latest.json i w sekcji Log interfejsu.
    const sourceWarnings = [];
    const sourceDiagnostics = [];
    const sourceHealth = {};
    const targetPhrases = HELENA_GAWIN_PHRASES;
    let sourcesHealthy = 0;
    let sourcesBlocked = 0;

    for (const s of enabled) {
      // Wyjątek w jednym parserze nie może kasować całego przebiegu — wcześniej
      // przerywał pętlę i latest.json nie był w ogóle zapisywany.
      let parsed;
      try {
        parsed = await parseSource(s);
      } catch (error) {
        parsed = { rows: [], error: `wyjątek parsera: ${String(error?.message || error)}`, diagnostics: { parser_status: 'exception' } };
      }

      const health = updateSourceHealth(previousHealth, s, parsed);
      sourceHealth[s.id] = health;
      if (!parsed.error) sourcesHealthy += 1;

      sourceDiagnostics.push({
        source_id: s.id,
        source_name: s.name,
        url: s.url,
        ...(parsed.diagnostics || {}),
        rows: (parsed.rows || []).length,
        empty_streak: health.empty_streak,
        fail_streak: health.fail_streak,
        blocked_since: health.blocked_since,
        error: parsed.error || null
      });

      for (const r of parsed.rows || []) {
        if (!isMeaningfulRow(r)) continue;
        allRows.push({ ...r, priority_hit: rowMatchesPhrases(r, targetPhrases) });
      }

      if (isBlockedByAntiBot(parsed)) sourcesBlocked += 1;

      const classified = classifySourceOutcome({
        source: s,
        parsed,
        health,
        toleranceDays: BLOCK_TOLERANCE_DAYS,
        emptyStreakAlert: EMPTY_STREAK_ALERT,
        networkFailAlert: NETWORK_FAIL_ALERT
      });
      if (classified.kind === 'error') sourceErrors.push(classified.entry);
      else if (classified.kind === 'warning') sourceWarnings.push(classified.entry);
    }

    const rows = mergeDuplicateRows(allRows);
    const funerals = rows.filter((r) => r.kind === 'funeral');
    const deaths = rows.filter(isEligibleDeathRow);
    const intentions = rows.filter(isIntentionLikeRow);
    // Groby to zapisy historyczne (pochówki sprzed lat), więc nie mają okna czasowego —
    // trafiają do własnej sekcji i własnego alertu, a nigdy do "ostatnich zgonów".
    const graves = rows.filter((r) => r.kind === 'grave');

    const upcoming_funerals = funerals.filter((r) => inWindow(r.date_funeral, funeralStart, funeralEnd));
    const recent_deaths = deaths.filter((r) => inWindow(r.date_death, deathStart, deathEnd));
    const upcoming_intentions = intentions.filter((r) => inWindow(r.date_intention, funeralStart, funeralEnd));
    upcoming_funerals.sort((a,b)=> (a.date_funeral||'').localeCompare(b.date_funeral||'') || (a.time_funeral||'').localeCompare(b.time_funeral||''));
    recent_deaths.sort((a,b)=> (b.date_death||'').localeCompare(a.date_death||''));
    upcoming_intentions.sort((a,b)=> (a.date_intention||'').localeCompare(b.date_intention||'') || (a.time_intention||'').localeCompare(b.time_intention||''));

    // Trafienia liczone na WSZYSTKICH rekordach, nie tylko na tych w oknie czasowym.
    // Wpis o monitorowanej osobie sprzed miesiąca (Podwawelskie) albo bez daty
    // ma zostać zgłoszony tak samo jak dzisiejszy.
    const matches = rows.filter((r) => r.priority_hit === true);
    matches.sort((a,b)=> (b.date_death||b.date_funeral||b.date_intention||'').localeCompare(a.date_death||a.date_funeral||a.date_intention||''));

    const fallbackSummary = buildFallbackSummaryForHelena(recent_deaths, upcoming_funerals, upcoming_intentions, targetPhrases);
    // Do resolveJobOutcome trafiają wyłącznie błędy wymagające reakcji. Ostrzeżenia
    // (tolerowane blokady zewnętrzne) są raportowane osobno i nie degradują statusu.
    const refreshErrors = sourceErrors.map((e) => `${e.source_name}: ${clean(e.error)}`);
    const refreshWarnings = sourceWarnings.map((w) => `${w.source_name}: ${clean(w.error)}`);
    const generatedAt = nowISO();

    const sourceLite = mergedSources.map((s) => ({ id: s.id, name: s.name, type: s.type, url: s.url, distance_km: s.distance_km ?? null, enabled: s.enabled !== false }));
    const latest = {
      generated_at: generatedAt,
      updated_at: generatedAt,
      window: { today: toISODate(today), death_from: toISODate(deathStart), death_to: toISODate(deathEnd), funeral_from: toISODate(funeralStart), funeral_to: toISODate(funeralEnd) },
      deaths, funerals, intentions, graves,
      recent_deaths, upcoming_funerals, upcoming_intentions,
      matches,
      fallback_summary: fallbackSummary,
      sources: sourceLite,
      target_phrases: targetPhrases,
      source_errors: sourceErrors,
      source_warnings: sourceWarnings,
      source_diagnostics: sourceDiagnostics,
      refresh_error: refreshErrors.join(' | ') || null,
      refresh_warning: refreshWarnings.join(' | ') || null,
      writer_name: WRITER,
      writer_version: VERSION
    };
    await writeJson(LATEST_PATH, latest);
    await writeJson(HEALTH_PATH, sourceHealth);

    const outcome = resolveJobOutcome({
      recentDeaths: recent_deaths.length,
      upcomingFunerals: upcoming_funerals.length,
      upcomingIntentions: upcoming_intentions.length,
      refreshErrors,
      sourcesTotal: enabled.length,
      sourcesHealthy
    });

    const discordNotification = await notifyCzerwonaHelena({
      rows,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      enabled: process.env.DISCORD_NOTIFY_ENABLED !== 'false',
      refreshedAt: generatedAt,
      health: { sourcesTotal: enabled.length, sourcesHealthy, rows: rows.length, recentDeaths: recent_deaths.length, upcomingFunerals: upcoming_funerals.length, upcomingIntentions: upcoming_intentions.length, graves: graves.length }
    });

    const finishedAt = nowISO();
    const job = { status: outcome.status, started_at: startedAt, finished_at: finishedAt, updated_at: finishedAt, ok: outcome.ok, error_message: outcome.errorMessage, warning_message: refreshWarnings.join(' | ') || null, sources_total: enabled.length, sources_healthy: sourcesHealthy, sources_blocked: sourcesBlocked, rows_total: rows.length, graves_total: graves.length, matches_total: matches.length, source_errors: sourceErrors, source_warnings: sourceWarnings, source_diagnostics: sourceDiagnostics, source_health: sourceHealth, writer_name: WRITER, writer_version: VERSION, trigger, discord_notification: discordNotification };
    await writeJson(JOB_PATH, job);
    await writeJson(ERR_PATH, { generated_at: finishedAt, errors: sourceErrors, warnings: sourceWarnings });

    console.log(`Rows=${rows.length} deaths=${recent_deaths.length} funerals=${upcoming_funerals.length} intentions=${upcoming_intentions.length} graves=${graves.length} matches=${matches.length} healthy=${sourcesHealthy}/${enabled.length} blocked=${sourcesBlocked} warnings=${sourceWarnings.length} status=${job.status}`);
  } catch (e) {
    const finishedAt = nowISO();
    const message = String(e?.message || e);
    await writeJson(JOB_PATH, { status: 'error', started_at: startedAt, finished_at: finishedAt, updated_at: finishedAt, ok: false, error_message: message, source_errors: [], writer_name: WRITER, writer_version: VERSION, trigger });
    await writeJson(ERR_PATH, { generated_at: finishedAt, errors: [{ error: message }] });
    console.error('ERROR:', message);
    process.exit(1);
  }
}

await main();
