import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurringEvents, toDashboardEvents } from '../lib/events.mjs';

test('turns stored event records into dashboard event cards', () => {
  const events = toDashboardEvents([
    { id: 1, memberName: 'Colin', title: 'Piano lesson', startsAt: '2026-10-25T20:30:00.000Z' },
    { id: 2, memberName: null, title: 'Dinner', startsAt: '2026-10-24T20:30:00.000Z' }
  ], { now: new Date('2026-10-25T18:30:00.000Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0].person, 'Colin');
  assert.equal(events[0].relative, 'in 2 hours');
});

test('keeps an event on the dashboard until its end time', () => {
  const events = toDashboardEvents([
    { id: 1, memberName: 'Yanxia', title: 'Appointment', startsAt: '2026-10-25T19:00:00.000Z', endsAt: '2026-10-25T21:00:00.000Z' }
  ], { now: new Date('2026-10-25T20:00:00.000Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0].relative, 'in progress');
});

test('expands a weekly event to its next upcoming occurrence', () => {
  const events = expandRecurringEvents([
    { id: 1, title: 'Soccer', startsAt: '2026-10-04T18:00:00.000Z', recurrence: 'weekly' }
  ], { now: new Date('2026-10-25T12:00:00.000Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0].startsAt, '2026-10-25T18:00:00.000Z');
});

test('keeps a weekly event at the same New York clock time after daylight saving time ends', () => {
  const events = expandRecurringEvents([
    {
      id: 12,
      title: 'Bailey Basketball practice',
      startsAt: '2026-10-29T23:15:00.000Z',
      endsAt: '2026-10-30T00:30:00.000Z',
      recurrence: 'weekly'
    }
  ], { now: new Date('2026-11-03T17:00:00.000Z') });

  assert.equal(events[0].startsAt, '2026-11-06T00:15:00.000Z');
  assert.equal(events[0].endsAt, '2026-11-06T01:30:00.000Z');
  assert.equal(toDashboardEvents(events, { now: new Date('2026-11-03T17:00:00.000Z') })[0].time, '7:15 PM');
});
