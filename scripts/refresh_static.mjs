import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { todayLocalMidnight, addDays, inWindow } from './date.mjs';
import { notifyCzerwonaHelena } from './discord_notify.mjs';
import { textMatchesAny } from './normalize.mjs';
import {
  HELENA_GAWIN_PHRASES,
  REQUIRED_SOURCES,
  clean,
  nowISO,
  parseSource,
  isIntentionLikeSource,
  isIntentionLikeRow,
  isEligibleDeathRow,
  mergeRequiredSources,
  resolveJobOutcome,
  buildFallbackSummaryForHelena,
  isMeaningfulRow
} from './nekrolog_core.mjs';

const CONFIG_PATH = 'config/sources.json';
const LATEST_PATH = 'data/latest.json';
const JOB_PATH = 'data/job.json';
const ERR_PATH = 'data/errors.json';

const WRITER = 'scripts/refresh_static.mjs';
const VERSION = 'static-1';

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
    const allRows = [];
    const sourceErrors = [];
    const targetPhrases = HELENA_GAWIN_PHRASES;

    for (const s of enabled) {
      let parsed;
      parsed = await parseSource(s);

      const skipDeathsForSource = isIntentionLikeSource(s);
      for (const r of parsed.rows || []) {
        if (!isMeaningfulRow(r)) continue;
        if ((skipDeathsForSource || isIntentionLikeRow(r)) && r.kind === 'death') continue;
        const hit = textMatchesAny([r.name, r.note, r.place, r.source_name].join(' '), targetPhrases);
        allRows.push({ ...r, priority_hit: !!hit });
      }
      if (parsed.error) sourceErrors.push({ source_id: s.id, source_name: s.name, url: s.url, error: clean(parsed.error) });
    }

    const funerals = allRows.filter((r) => r.kind === 'funeral');
    const deaths = allRows.filter(isEligibleDeathRow);
    const upcoming_funerals = funerals.filter((r) => inWindow(r.date_funeral, funeralStart, funeralEnd));
    const recent_deaths = deaths.filter((r) => inWindow(r.date_death, deathStart, deathEnd) || (!r.date_death && r.note));
    upcoming_funerals.sort((a,b)=> (a.date_funeral||'').localeCompare(b.date_funeral||'') || (a.time_funeral||'').localeCompare(b.time_funeral||''));
    recent_deaths.sort((a,b)=> (b.date_death||'').localeCompare(a.date_death||''));

    const fallbackSummary = buildFallbackSummaryForHelena(recent_deaths, upcoming_funerals);
    const refreshErrors = sourceErrors.map((e) => `${e.source_name}: ${clean(e.error)}`);
    const generatedAt = nowISO();

    const sourceLite = mergedSources.map((s) => ({ id: s.id, name: s.name, type: s.type, url: s.url, distance_km: s.distance_km ?? null, enabled: s.enabled !== false }));
    const base = {
      generated_at: generatedAt, updated_at: generatedAt, deaths, funerals, recent_deaths, upcoming_funerals,
      fallback_summary: fallbackSummary, sources: sourceLite, target_phrases: HELENA_GAWIN_PHRASES,
      source_errors: sourceErrors, refresh_error: refreshErrors.join(' | ') || null, writer_name: WRITER, writer_version: VERSION
    };
    const latest = { ...base, payload: base, data: base };
    await writeJson(LATEST_PATH, latest);

    const outcome = resolveJobOutcome({ recentDeaths: recent_deaths.length, upcomingFunerals: upcoming_funerals.length, refreshErrors });
    const discordNotification = await notifyCzerwonaHelena({
      rows: [...recent_deaths, ...upcoming_funerals],
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      enabled: process.env.DISCORD_NOTIFY_ENABLED !== 'false',
      refreshedAt: generatedAt
    });

    const finishedAt = nowISO();
    const job = { status: outcome.status, started_at: startedAt, finished_at: finishedAt, updated_at: finishedAt, ok: outcome.ok, error_message: outcome.errorMessage, source_errors: sourceErrors, writer_name: WRITER, writer_version: VERSION, trigger, discord_notification: discordNotification };
    await writeJson(JOB_PATH, job);
    await writeJson(ERR_PATH, { generated_at: finishedAt, errors: sourceErrors });

    console.log(`Rows=${allRows.length} funerals=${upcoming_funerals.length} deaths=${recent_deaths.length} source_errors=${sourceErrors.length} status=${job.status}`);
  } catch (e) {
    const finishedAt = nowISO();
    const message = String(e?.message || e);
    try { await access(LATEST_PATH, fsConstants.F_OK); } catch {}
    await writeJson(JOB_PATH, { status: 'error', started_at: startedAt, finished_at: finishedAt, updated_at: finishedAt, ok: false, error_message: message, source_errors: [], writer_name: WRITER, writer_version: VERSION, trigger });
    await writeJson(ERR_PATH, { generated_at: finishedAt, errors: [{ error: message }] });
    console.error('ERROR:', message);
    process.exit(1);
  }
}

await main();
