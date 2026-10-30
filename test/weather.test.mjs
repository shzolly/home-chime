import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWeather, toDashboardWeather } from '../lib/weather.mjs';

test('maps a rainy WMO code to a rainy dashboard state', () => {
  assert.deepEqual(describeWeather(63, 1), { condition: 'Rain', visual: 'rain' });
});

test('normalizes an Open-Meteo response for the dashboard', () => {
  const weather = toDashboardWeather({
    current: { temperature_2m: 61.7, apparent_temperature: 60.1, relative_humidity_2m: 58.4, weather_code: 2, is_day: 1, precipitation: 0, wind_speed_10m: 9.1 },
    daily: { time: ['2026-10-24'], weather_code: [2], temperature_2m_max: [67.2], temperature_2m_min: [51.8], precipitation_probability_max: [25], wind_speed_10m_max: [14.4], uv_index_max: [3.6] }
  }, '2026-10-24T20:00:00.000Z');
  assert.equal(weather.location, 'Princeton Junction');
  assert.equal(weather.temperature, 62);
  assert.equal(weather.visual, 'partly-cloudy');
  assert.equal(weather.precipitation, 25);
  assert.equal(weather.humidity, 58);
  assert.deepEqual(weather.forecast[0], {
    date: '2026-10-24', weekday: 'Saturday', condition: 'Partly cloudy', visual: 'partly-cloudy', high: 67, low: 52, precipitation: 25, wind: 14, uvIndex: 4
  });
});
