import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../lib/store.mjs';

test('persists family members and settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'home-chime-store-'));
  const store = await createStore(join(directory, 'home-chime.sqlite'));
  try {
    assert.equal(store.getSettings().homeAddress, '08550 (Princeton Junction, New Jersey, USA)');
    const member = store.addFamily({ name: 'Colin', color: '#4f7cac', birthday: '03-03' });
    assert.equal(member.name, 'Colin');
    assert.equal(member.birthday, '03-03');
    assert.equal(store.listFamily().length, 1);
    assert.equal(store.updateFamily(member.id, { name: 'Colin', color: '#4f7cac', birthday: '06-18', active: true }).birthday, '06-18');
    const settings = store.updateSettings({ weatherRefreshMinutes: 30, calendarWindowHours: 24, backgroundRefreshMinutes: 120, travelBufferMinutes: 10 });
    assert.equal(settings.weatherRefreshMinutes, 30);
    assert.equal(settings.calendarWindowHours, 24);
    assert.equal(settings.backgroundRefreshMinutes, 120);
    assert.equal(settings.travelBufferMinutes, 10);
    const event = store.addEvent({ familyMemberId: member.id, title: 'Piano lesson', startsAt: '2026-10-25T20:30:00.000Z', endsAt: '2026-10-25T21:30:00.000Z', reminderMinutes: 15 });
    assert.equal(event.memberName, 'Colin');
    assert.equal(event.endsAt, '2026-10-25T21:30:00.000Z');
    assert.equal(store.listUpcomingEvents({ after: '2026-10-25T18:30:00.000Z' }).length, 1);
    assert.equal(store.updateEventReminder(event.id, 22).reminderMinutes, 22);
    const edited = store.updateEvent(event.id, { familyMemberId: member.id, title: 'Piano lesson', startsAt: '2026-10-25T20:30:00.000Z', endsAt: '2026-10-25T22:00:00.000Z', location: 'Music school', reminderMinutes: 5, recurrence: 'weekly' });
    assert.equal(edited.location, 'Music school');
    assert.equal(edited.endsAt, '2026-10-25T22:00:00.000Z');
    const initialTravel = store.recordInitialTravel(event.id, { durationMinutes: 18, normalMinutes: 14, leaveMinutesBefore: 23, checkedAt: '2026-10-24T12:00:00.000Z' });
    assert.equal(initialTravel.initialDriveMinutes, 18);
    assert.equal(initialTravel.reminderMinutes, 23);
    const refreshedTravel = store.recordLatestTravel(event.id, { durationMinutes: 25, normalMinutes: 14, leaveMinutesBefore: 30, checkedAt: '2026-10-25T18:00:00.000Z' });
    assert.equal(refreshedTravel.latestDriveMinutes, 25);
    assert.equal(refreshedTravel.reminderMinutes, 30);
    assert.equal(store.reminderWasDelivered(event.id, event.startsAt), false);
    assert.equal(store.markReminderDelivered(event.id, event.startsAt), true);
    assert.equal(store.markReminderDelivered(event.id, event.startsAt), false);
    assert.equal(store.deleteEvent(event.id), true);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
