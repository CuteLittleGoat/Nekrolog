import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDiscordMessage, notifyCzerwonaHelena } from '../scripts/discord_notify.mjs';

test('buildDiscordMessage uses expected template', () => {
  const msg = buildDiscordMessage({ name: 'Czerwona Helena', source_name: 'Źródło test', url: 'https://example.com/x' });
  assert.match(msg, /@koza_z_zagrody, @loshumbakos/);
  assert.match(msg, /Zmienił się status Czerwonej Heleny!/);
  assert.match(msg, /Imię\/nazwisko w rekordzie: Czerwona Helena/);
  assert.match(msg, /Źródło: Źródło test/);
  assert.match(msg, /Link: https:\/\/example.com\/x/);
});

test('notifyCzerwonaHelena sends once and deduplicates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nekrolog-discord-'));
  const statePath = join(dir, 'discord_notified.json');
  const rows = [{ name: 'Czerwona Helena', source_name: 'X', url: 'https://example.com/1' }];
  let calls = 0;

  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 204 };
  };

  const first = await notifyCzerwonaHelena({ rows, webhookUrl: 'https://discord.example/webhook', fetchImpl, statePath });
  assert.equal(first.sent, true);
  assert.equal(calls, 1);

  const second = await notifyCzerwonaHelena({ rows, webhookUrl: 'https://discord.example/webhook', fetchImpl, statePath });
  assert.equal(second.sent, false);
  assert.equal(second.skipped_reason, 'already_notified');
  assert.equal(calls, 1);
});
