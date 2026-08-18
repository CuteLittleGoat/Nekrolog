import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { HELENA_GAWIN_PHRASES, buildMatchHaystack } from './nekrolog_core.mjs';
import { textMatchesAny } from './normalize.mjs';

const DEFAULT_STATE_PATH = 'data/discord_notified.json';
const TARGET_PHRASES = HELENA_GAWIN_PHRASES;
// Lista kluczy rosła bez ograniczeń; zostawiamy okno ostatnich zgłoszeń.
const MAX_SENT_KEYS = 500;
const RETRY_DELAYS_MS = [1000, 3000];

// Discord tworzy realne powiadomienie tylko dla składni <@ID>. Nazwy użytkowników
// w treści są zwykłym tekstem. ID podajemy zmienną DISCORD_MENTION_IDS
// (rozdzielone przecinkami); bez niej zostaje dotychczasowy tekst.
const FALLBACK_MENTION_TEXT = '@koza_z_zagrody, @loshumbakos';

const ALERT_LABELS = {
  death: 'zgon / wzmianka',
  funeral: 'pogrzeb',
  intention: 'intencja mszalna (potrzeba)',
  grave: 'miejsce pochówku'
};

function cleanValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function mentionPrefix(mentionIds = process.env.DISCORD_MENTION_IDS) {
  const ids = String(mentionIds || '').split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^\d{5,}$/.test(x));
  return ids.length ? ids.map((id) => `<@${id}>`).join(' ') : FALLBACK_MENTION_TEXT;
}

function allowedMentions(mentionIds = process.env.DISCORD_MENTION_IDS) {
  const ids = String(mentionIds || '').split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^\d{5,}$/.test(x));
  return ids.length ? { parse: [], users: ids } : { parse: [] };
}

function isCzerwonaHelenaRow(row) {
  return textMatchesAny(buildMatchHaystack(row), TARGET_PHRASES);
}

function selectHits(rows = []) {
  return (rows || []).filter((row) => row?.priority_hit === true || isCzerwonaHelenaRow(row));
}

function selectFirstHit(rows = []) {
  return selectHits(rows)[0] ?? null;
}

// Klucz obejmuje daty i porę, więc uzupełnienie terminu pogrzebu przez źródło
// jest nowym zdarzeniem i wywoła kolejne powiadomienie.
function buildStateKey(row) {
  const name = cleanValue(row?.name || row?.full_name || 'unknown');
  const source = cleanValue(row?.source_name || row?.source_id || 'unknown');
  const link = cleanValue(row?.url || row?.source_url || '');
  const kind = cleanValue(row?.kind || 'row');
  const dates = [row?.date_death, row?.date_funeral, row?.time_funeral, row?.date_intention, row?.time_intention].map((v) => cleanValue(v)).join('/');
  return [kind, name, source, link, dates].join('|');
}

function buildDiscordMessage(row, mentionIds) {
  const name = cleanValue(row?.name || row?.full_name || 'brak danych');
  const source = cleanValue(row?.source_name || row?.source_id || 'brak danych');
  const link = cleanValue(row?.url || row?.source_url || 'brak danych');
  const kind = cleanValue(row?.kind);
  const label = ALERT_LABELS[kind];

  const details = [];
  if (row?.date_death) details.push(`Data zgonu: ${cleanValue(row.date_death)}`);
  if (row?.date_funeral) details.push(`Data pogrzebu: ${cleanValue(row.date_funeral)}${row?.time_funeral ? `, godz. ${cleanValue(row.time_funeral)}` : ''}`);
  if (row?.date_intention) details.push(`Termin intencji: ${cleanValue(row.date_intention)}${row?.time_intention ? `, godz. ${cleanValue(row.time_intention)}` : ''}`);
  if (row?.place) details.push(`Miejsce: ${cleanValue(row.place)}`);
  if (Array.isArray(row?.also_in_sources) && row.also_in_sources.length) details.push(`Także w: ${row.also_in_sources.map(cleanValue).join(', ')}`);

  return [
    mentionPrefix(mentionIds),
    `Zmienił się status Czerwonej Heleny!${label ? ` [${label}]` : ''}`,
    `Imię/nazwisko w rekordzie: ${name}`,
    ...details,
    `Źródło: ${source}`,
    `Link: ${link}`
  ].join('\n');
}

function formatHeartbeatDate(value) {
  const date = new Date(value || Date.now());
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

// Heartbeat niesie teraz kondycję odczytu — inaczej "brak trafienia" wyglądał
// identycznie, gdy połowa źródeł milczała.
function buildNoMatchMessage(refreshedAt, health = null) {
  const lines = [
    `Data: ${formatHeartbeatDate(refreshedAt)}`,
    'Brak danych dotyczących stanu Helenomatu.'
  ];
  if (health) {
    lines.push(`Źródła sprawne: ${health.sourcesHealthy ?? '?'}/${health.sourcesTotal ?? '?'}; rekordy: ${health.rows ?? 0} (zgony ${health.recentDeaths ?? 0}, pogrzeby ${health.upcomingFunerals ?? 0}, intencje ${health.upcomingIntentions ?? 0})`);
  }
  return lines.join('\n');
}

async function readState(statePath = DEFAULT_STATE_PATH) {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return { sent_keys: [] };
  }
}

async function writeState(state, statePath = DEFAULT_STATE_PATH) {
  await mkdir('data', { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postDiscordWebhook(webhookUrl, content, fetchImpl = globalThis.fetch, mentionIds) {
  if (!webhookUrl) return { ok: false, skipped: true, reason: 'missing_webhook_url' };

  let last = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: allowedMentions(mentionIds) })
    });

    if (response.ok) return { ok: true, status: response.status };
    last = { ok: false, status: response.status, reason: `discord_http_${response.status}` };

    const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
    if (!retryable || attempt === RETRY_DELAYS_MS.length) break;

    // Discord podaje Retry-After w sekundach; przy 429 to jedyna wiarygodna pauza.
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : RETRY_DELAYS_MS[attempt];
    await sleep(wait);
  }
  return last || { ok: false, status: 0, reason: 'unknown_error' };
}

async function notifyCzerwonaHelena({ rows, webhookUrl, enabled = true, fetchImpl = globalThis.fetch, statePath = DEFAULT_STATE_PATH, refreshedAt = null, health = null, mentionIds = undefined }) {
  const result = { attempted: false, sent: false, skipped: false, skipped_reason: null, status: null, key: null, type: null, hits: 0, sent_count: 0, alerts: [] };

  if (!enabled) {
    result.skipped = true;
    result.skipped_reason = 'disabled';
    return result;
  }

  const hits = selectHits(rows);
  result.hits = hits.length;

  if (!hits.length) {
    if (!webhookUrl) {
      result.skipped = true;
      result.skipped_reason = 'missing_secret_DISCORD_WEBHOOK_URL';
      return result;
    }

    result.type = 'heartbeat_no_match';
    result.attempted = true;
    const post = await postDiscordWebhook(webhookUrl, buildNoMatchMessage(refreshedAt, health), fetchImpl, mentionIds);
    result.sent = !!post.ok;
    result.status = post.status ?? null;
    if (!post.ok) result.skipped_reason = post.reason || 'unknown_error';
    return result;
  }

  if (!webhookUrl) {
    result.skipped = true;
    result.skipped_reason = 'missing_secret_DISCORD_WEBHOOK_URL';
    result.key = buildStateKey(hits[0]);
    return result;
  }

  const state = await readState(statePath);
  const sentKeys = Array.isArray(state.sent_keys) ? state.sent_keys : [];
  const known = new Set(sentKeys);
  const freshKeys = [];

  result.type = 'alert_match';
  result.key = buildStateKey(hits[0]);

  // Każde trafienie sprawdzamy osobno. Wcześniej brany był wyłącznie pierwszy
  // rekord, więc już zgłoszony wpis blokował powiadomienia o pozostałych.
  for (const hit of hits) {
    const key = buildStateKey(hit);
    if (known.has(key)) {
      result.alerts.push({ key, kind: hit?.kind || null, sent: false, reason: 'already_notified' });
      continue;
    }

    result.attempted = true;
    const post = await postDiscordWebhook(webhookUrl, buildDiscordMessage(hit, mentionIds), fetchImpl, mentionIds);
    result.status = post.status ?? result.status;
    if (post.ok) {
      known.add(key);
      freshKeys.push(key);
      result.sent = true;
      result.sent_count += 1;
      result.alerts.push({ key, kind: hit?.kind || null, sent: true });
    } else {
      result.alerts.push({ key, kind: hit?.kind || null, sent: false, reason: post.reason || 'unknown_error' });
      result.skipped_reason = post.reason || 'unknown_error';
    }
  }

  if (freshKeys.length) {
    await writeState({ sent_keys: [...sentKeys, ...freshKeys].slice(-MAX_SENT_KEYS) }, statePath);
  } else if (!result.attempted) {
    result.skipped = true;
    result.skipped_reason = 'already_notified';
  }

  return result;
}

export { buildDiscordMessage, buildNoMatchMessage, buildStateKey, notifyCzerwonaHelena, postDiscordWebhook, isCzerwonaHelenaRow, selectHits, selectFirstHit, mentionPrefix };
