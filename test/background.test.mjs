import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { backgroundScheduleSlot, createBackgroundService, scenePrompt, US_LANDSCAPE_SCENES } from '../lib/background.mjs';

test('uses a broad U.S. scene catalog in the background prompt', () => {
  assert.ok(US_LANDSCAPE_SCENES.length >= 60);
  const scene = US_LANDSCAPE_SCENES[0];
  const prompt = scenePrompt(new Date('2026-10-29T16:00:00.000Z'), { weather: { condition: 'Cloudy' } }, scene);
  assert.match(prompt, new RegExp(scene.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(prompt, /Current conditions: Cloudy\./);
  assert.match(prompt, /Date and seasonal setting: Thursday, October 29, 2026 — mid-autumn in Princeton Junction, New Jersey\./);
  assert.match(prompt, /No people, faces, buildings close to camera/);
});

test('generates once per scheduled background slot', async () => {
  const dataDirectory = join(process.cwd(), 'data');
  await mkdir(dataDirectory, { recursive: true });
  const directory = await mkdtemp(join(dataDirectory, 'test-background-'));
  let calls = 0;
  const service = createBackgroundService({
    dataDirectory: directory,
    apiKey: 'test-key',
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('webp-image').toString('base64') }] }), { status: 200 });
    }
  });
  try {
  const first = await service.get({ now: new Date('2026-10-27T12:00:00.000Z'), slot: '2026-10-27-sunrise' });
  const second = await service.get({ now: new Date('2026-10-27T12:30:00.000Z'), slot: '2026-10-27-sunrise' });
  await service.get({ now: new Date('2026-10-27T23:00:00.000Z'), slot: '2026-10-27-sunset' });
    assert.equal(first.image.toString(), 'webp-image');
    assert.equal(second.image.toString(), 'webp-image');
    assert.equal(calls, 2);
    assert.equal((await service.status()).generatedAt, '2026-10-27T23:00:00.000Z');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('uses the current day’s sunrise and sunset as background slots', () => {
  const solar = { sunrise: '2026-10-27T07:28', sunset: '2026-10-27T18:07' };
  assert.equal(backgroundScheduleSlot(new Date('2026-10-27T10:00:00.000Z'), solar), '2026-10-26-sunset');
  assert.equal(backgroundScheduleSlot(new Date('2026-10-27T12:30:00.000Z'), solar), '2026-10-27-sunrise');
  assert.equal(backgroundScheduleSlot(new Date('2026-10-27T23:00:00.000Z'), solar), '2026-10-27-sunset');
});
