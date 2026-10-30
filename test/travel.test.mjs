import test from 'node:test';
import assert from 'node:assert/strict';
import { getDriveTime } from '../lib/travel.mjs';

test('normalizes a traffic-aware Routes API response', async () => {
  const result = await getDriveTime({
    origin: 'Home',
    destination: 'Practice field',
    apiKey: 'test-key',
    fetcher: async () => new Response(JSON.stringify({ routes: [{ duration: '937s', staticDuration: '720s', distanceMeters: 9432 }] }), { status: 200 })
  });
  assert.deepEqual(result, { durationMinutes: 16, normalMinutes: 12, distanceMeters: 9432 });
});

test('omits departure time to request live traffic at request time', async () => {
  let requestBody;
  await getDriveTime({
    origin: 'Home',
    destination: 'Practice field',
    apiKey: 'test-key',
    fetcher: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ routes: [{ duration: '60s' }] }), { status: 200 });
    }
  });
  assert.equal('departureTime' in requestBody, false);
});
