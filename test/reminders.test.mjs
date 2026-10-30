import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDueReminders } from '../lib/reminders.mjs';

test('selects events for ten minutes from their calculated reminder start', () => {
  const events = [{ id: 1, title: 'Piano', startsAt: '2026-10-25T20:00:00.000Z', reminderMinutes: 15 }];
  assert.equal(selectDueReminders(events, { now: new Date('2026-10-25T19:45:00.000Z') }).length, 1);
  assert.equal(selectDueReminders(events, { now: new Date('2026-10-25T19:54:59.000Z') }).length, 1);
  assert.equal(selectDueReminders(events, { now: new Date('2026-10-25T19:55:00.000Z') }).length, 0);
  assert.equal(selectDueReminders(events, { now: new Date('2026-10-25T20:00:00.000Z') }).length, 0);
});
