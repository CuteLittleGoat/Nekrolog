import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { HELENA_GAWIN_PHRASES } from './nekrolog_core.mjs';
import { textMatchesAny } from './normalize.mjs';

const DEFAULT_STATE_PATH = 'data/discord_notified.json';
const TARGET_PHRASES = HELENA_GAWIN_PHRASES;

function cleanValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}


function isCzerwonaHelenaRow(row) {
  const haystack = [
    row?.name,
    row?.full_name,
    row?.note,
    row?.source_name
  ].filter(Boolean).join(' ');
  return textMatchesAny(haystack, TARGET_PHRASES);
}

function selectFirstHit(rows = []) {
  return rows.find((row) => isCzerwonaHelenaRow(row)) ?? null;
}

function buildStateKey(row) {
  const name = cleanValue(row?.name || row?.full_name || 'unknown');
  const source = cleanValue(row?.source_name || row?.source_id || 'unknown');
  const link = cleanValue(row?.url || row?.source_url || '');
  return [name, source, link].join('|');
}

function buildDiscordMessage(row) {
  const name = cleanValue(row?.name || row?.full_name || 'brak danych');
  const source = cleanValue(row?.source_name || row?.source_id || 'brak danych');
  const link = cleanValue(row?.url || row?.source_url || 'brak danych');

  return [
    '@koza_z_zagrody, @loshumbakos',
    'Zmienił się status Czerwonej Heleny!',
    `Imię/nazwisko w rekordzie: ${name}`,
    `Źródło: ${source}`,
    `Link: ${link}`
  ].join('\n');
}

function formatHeartbeatDate(value) {
  const date = new Date(value || Date.now());
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

function buildNoMatchMessage(refreshedAt) {
  return [
    `Data: ${formatHeartbeatDate(refreshedAt)}`,
    'Brak danych dotyczących stanu Helenomatu.'
  ].join('\n');
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

async function postDiscordWebhook(webhookUrl, content, fetchImpl = globalThis.fetch) {
  if (!webhookUrl) return { ok: false, skipped: true, reason: 'missing_webhook_url' };

  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (response.ok) return { ok: true, status: response.status };
  return { ok: false, status: response.status, reason: `discord_http_${response.status}` };
}

async function notifyCzerwonaHelena({ rows, webhookUrl, enabled = true, fetchImpl = globalThis.fetch, statePath = DEFAULT_STATE_PATH, refreshedAt = null }) {
  const result = { attempted: false, sent: false, skipped: false, skipped_reason: null, status: null, key: null, type: null };

  if (!enabled) {
    result.skipped = true;
    result.skipped_reason = 'disabled';
    return result;
  }

  const hit = selectFirstHit(rows);
  if (!hit) {
    if (!webhookUrl) {
      result.skipped = true;
      result.skipped_reason = 'missing_secret_DISCORD_WEBHOOK_URL';
      return result;
    }

    result.type = 'heartbeat_no_match';
    result.attempted = true;
    const post = await postDiscordWebhook(webhookUrl, buildNoMatchMessage(refreshedAt), fetchImpl);
    if (post.ok) {
      result.sent = true;
      result.status = post.status ?? null;
      return result;
    }

    result.sent = false;
    result.status = post.status ?? null;
    result.skipped_reason = post.reason || 'unknown_error';
    return result;
  }

  const key = buildStateKey(hit);
  result.key = key;
  const state = await readState(statePath);
  const sentKeys = Array.isArray(state.sent_keys) ? state.sent_keys : [];

  if (sentKeys.includes(key)) {
    result.skipped = true;
    result.skipped_reason = 'already_notified';
    return result;
  }

  if (!webhookUrl) {
    result.skipped = true;
    result.skipped_reason = 'missing_secret_DISCORD_WEBHOOK_URL';
    return result;
  }

  const message = buildDiscordMessage(hit);
  result.type = 'alert_match';
  result.attempted = true;

  const post = await postDiscordWebhook(webhookUrl, message, fetchImpl);
  if (post.ok) {
    result.sent = true;
    result.status = post.status ?? null;
    await writeState({ sent_keys: [...new Set([...sentKeys, key])] }, statePath);
    return result;
  }

  result.sent = false;
  result.status = post.status ?? null;
  result.skipped_reason = post.reason || 'unknown_error';
  return result;
}

export { buildDiscordMessage, buildNoMatchMessage, notifyCzerwonaHelena, postDiscordWebhook, isCzerwonaHelenaRow };
