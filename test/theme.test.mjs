import test from 'node:test';
import assert from 'node:assert/strict';
import { themeSchedule } from '../lib/theme.mjs';

const weather = {
  isDay: 1,
  sunrise: '2026-11-21T06:51',
  sunset: '2026-11-21T16:41',
  forecast: [
    { date: '2026-11-20', sunrise: '2026-11-20T06:50', sunset: '2026-11-20T16:41' },
    { date: '2026-11-21', sunrise: '2026-11-21T06:51', sunset: '2026-11-21T16:41' },
    { date: '2026-11-22', sunrise: '2026-11-22T06:52', sunset: '2026-11-22T16:40' }
  ]
};

function at(iso) {
  return new Date(iso);
}

test('uses the night palette before sunrise and points at the coming sunrise', () => {
  const theme = themeSchedule(at('2026-11-21T05:30:00-05:00'), weather);
  assert.equal(theme.phase, 'night');
  assert.equal(theme.source, 'open-meteo');
  assert.deepEqual(theme.next, { phase: 'day', event: 'sunrise', date: '2026-11-21', at: '2026-11-21T06:51', time: '6:51 AM' });
});

test('uses the day palette between sunrise and sunset', () => {
  const theme = themeSchedule(at('2026-11-21T12:00:00-05:00'), weather);
  assert.equal(theme.phase, 'day');
  assert.equal(theme.next.event, 'sunset');
  assert.equal(theme.next.time, '4:41 PM');
});

test('switches to night at sunset and schedules tomorrow’s sunrise', () => {
  const theme = themeSchedule(at('2026-11-21T17:05:00-05:00'), weather);
  assert.equal(theme.phase, 'night');
  assert.equal(theme.next.event, 'sunrise');
  assert.equal(theme.next.date, '2026-11-22');
  assert.equal(theme.next.time, '6:52 AM');
});

test('treats the exact sunrise minute as day and the exact sunset minute as night', () => {
  assert.equal(themeSchedule(at('2026-11-21T06:51:00-05:00'), weather).phase, 'day');
  assert.equal(themeSchedule(at('2026-11-21T16:41:00-05:00'), weather).phase, 'night');
});

test('ignores sunrise and sunset from other days in a long forecast', () => {
  const longForecast = {
    ...weather,
    sunrise: '2026-11-19T06:48',
    sunset: '2026-11-19T16:43',
    forecast: [
      { date: '2026-11-19', sunrise: '2026-11-19T06:48', sunset: '2026-11-19T16:43' },
      { date: '2026-11-21', sunrise: '2026-11-21T06:51', sunset: '2026-11-21T16:41' }
    ]
  };
  assert.equal(themeSchedule(at('2026-11-21T20:00:00-05:00'), longForecast).phase, 'night');
  assert.equal(themeSchedule(at('2026-11-21T10:00:00-05:00'), longForecast).phase, 'day');
});

test('falls back to a 7 AM and 7 PM clock schedule without solar data', () => {
  const beforeDawn = themeSchedule(at('2026-11-21T06:20:00-05:00'), {});
  assert.equal(beforeDawn.phase, 'night');
  assert.equal(beforeDawn.source, 'fallback-clock');
  assert.equal(beforeDawn.next.time, '7:00 AM');

  const midday = themeSchedule(at('2026-11-21T13:00:00-05:00'), {});
  assert.equal(midday.phase, 'day');
  assert.equal(midday.next.time, '7:00 PM');

  const lateEvening = themeSchedule(at('2026-11-21T21:30:00-05:00'), {});
  assert.equal(lateEvening.phase, 'night');
  assert.equal(lateEvening.next.date, '2026-11-22');
  assert.equal(lateEvening.next.time, '7:00 AM');
});

test('tolerates a forecast import that has no forecast array', () => {
  const theme = themeSchedule(at('2026-11-21T10:00:00-05:00'), { sunrise: '2026-11-20T06:50', sunset: '2026-11-20T16:41' });
  assert.equal(theme.phase, 'day');
  assert.equal(theme.source, 'fallback-clock');
});
