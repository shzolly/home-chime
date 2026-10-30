import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackWeather, routeRequest } from '../lib/router.mjs';

test('uses the weather feature before agent fallback', () => {
  const result = routeRequest('Will it rain today?');
  assert.equal(result.kind, 'feature');
  assert.equal(result.feature, 'weather');
  assert.match(result.speech, /partly cloudy/i);
});

test('uses the requested weekday forecast instead of current conditions', () => {
  const result = routeRequest("What's the weather on Wednesday?", {
    ...fallbackWeather,
    forecast: [{ weekday: 'Wednesday', date: '2026-10-28', condition: 'Rain', visual: 'rain', high: 61, low: 49, precipitation: 70 }]
  });
  assert.equal(result.feature, 'weather');
  assert.equal(result.detail.isForecast, true);
  assert.equal(result.detail.weekday, 'Wednesday');
  assert.match(result.speech, /wednesday will be rain/i);
  assert.doesNotMatch(result.speech, /68 degrees/i);
});

test('uses Colin calendar when Colin is named', () => {
  const result = routeRequest("What's Colin's calendar today?");
  assert.equal(result.kind, 'feature');
  assert.equal(result.feature, 'calendar');
  assert.equal(result.detail.person, 'Colin');
  assert.equal(result.detail.events.length, 2);
});

test('falls back to the agent only when no feature applies', () => {
  const result = routeRequest('Who invented the telescope?');
  assert.equal(result.kind, 'agent');
  assert.equal(result.feature, 'answer');
  assert.match(result.speech, /OpenAI API key/i);
});
