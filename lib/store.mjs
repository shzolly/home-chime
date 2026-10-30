import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultDatabasePath = join(process.env.HOME_CHIME_DATA_DIR ?? appRoot, 'data', 'home-chime.sqlite');
const defaultHomeAddress = process.env.HOME_CHIME_HOME_LOCATION?.trim() || '08550 (Princeton Junction, New Jersey, USA)';

const defaultSettings = {
  weatherRefreshMinutes: 10,
  calendarWindowHours: 12,
  backgroundRefreshMinutes: 60,
  temperatureUnit: 'fahrenheit',
  homeAddress: defaultHomeAddress,
  travelBufferMinutes: 5
};

function parseSetting(value) {
  return JSON.parse(value);
}

export async function createStore(databasePath = defaultDatabasePath) {
  await mkdir(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4f7cac',
      birthday TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      location TEXT NOT NULL DEFAULT 'Home',
      reminder_minutes INTEGER NOT NULL DEFAULT 5,
      recurrence TEXT NOT NULL DEFAULT 'none',
      recurrence_until TEXT,
      initial_drive_minutes INTEGER,
      initial_normal_minutes INTEGER,
      initial_drive_checked_at TEXT,
      latest_drive_minutes INTEGER,
      latest_normal_minutes INTEGER,
      latest_drive_checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminder_deliveries (
      event_id INTEGER NOT NULL,
      occurrence_starts_at TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      PRIMARY KEY (event_id, occurrence_starts_at)
    );
  `);

  const eventColumns = new Set(database.prepare('PRAGMA table_info(calendar_events)').all().map((column) => column.name));
  const eventMigrations = {
    ends_at: 'TEXT',
    location: "TEXT NOT NULL DEFAULT 'Home'",
    recurrence: "TEXT NOT NULL DEFAULT 'none'",
    recurrence_until: 'TEXT',
    initial_drive_minutes: 'INTEGER',
    initial_normal_minutes: 'INTEGER',
    initial_drive_checked_at: 'TEXT',
    latest_drive_minutes: 'INTEGER',
    latest_normal_minutes: 'INTEGER',
    latest_drive_checked_at: 'TEXT'
  };
  for (const [name, definition] of Object.entries(eventMigrations)) {
    if (!eventColumns.has(name)) database.exec(`ALTER TABLE calendar_events ADD COLUMN ${name} ${definition}`);
  }
  const memberColumns = new Set(database.prepare('PRAGMA table_info(family_members)').all().map((column) => column.name));
  if (!memberColumns.has('birthday')) database.exec('ALTER TABLE family_members ADD COLUMN birthday TEXT');
  database.exec("DELETE FROM settings WHERE key IN ('dashboardTimeoutSeconds', 'voiceEnabled')");

  const now = new Date().toISOString();
  const insertSetting = database.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) insertSetting.run(key, JSON.stringify(value), now);
  database.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'homeAddress' AND value = ?")
    .run(JSON.stringify(defaultHomeAddress), now, JSON.stringify(''));

  const listFamilyStatement = database.prepare('SELECT id, name, color, birthday, active, created_at AS createdAt, updated_at AS updatedAt FROM family_members ORDER BY active DESC, name COLLATE NOCASE');
  const getSettingsStatement = database.prepare('SELECT key, value FROM settings');
  const updateSettingStatement = database.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
  const insertFamilyStatement = database.prepare('INSERT INTO family_members (name, color, birthday, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)');
  const updateFamilyStatement = database.prepare('UPDATE family_members SET name = ?, color = ?, birthday = ?, active = ?, updated_at = ? WHERE id = ?');
  const listEventsStatement = database.prepare(`
    SELECT calendar_events.id, calendar_events.family_member_id AS familyMemberId,
      family_members.name AS memberName, family_members.color, calendar_events.title, calendar_events.location,
      calendar_events.starts_at AS startsAt, calendar_events.ends_at AS endsAt, calendar_events.reminder_minutes AS reminderMinutes,
      calendar_events.recurrence, calendar_events.recurrence_until AS recurrenceUntil,
      calendar_events.initial_drive_minutes AS initialDriveMinutes, calendar_events.initial_normal_minutes AS initialNormalMinutes,
      calendar_events.initial_drive_checked_at AS initialDriveCheckedAt, calendar_events.latest_drive_minutes AS latestDriveMinutes,
      calendar_events.latest_normal_minutes AS latestNormalMinutes, calendar_events.latest_drive_checked_at AS latestDriveCheckedAt,
      calendar_events.created_at AS createdAt, calendar_events.updated_at AS updatedAt
    FROM calendar_events
    LEFT JOIN family_members ON family_members.id = calendar_events.family_member_id
    ORDER BY calendar_events.starts_at ASC
  `);
  const listUpcomingEventsStatement = database.prepare(`
    SELECT calendar_events.id, calendar_events.family_member_id AS familyMemberId,
      family_members.name AS memberName, family_members.color, calendar_events.title, calendar_events.location,
      calendar_events.starts_at AS startsAt, calendar_events.ends_at AS endsAt, calendar_events.reminder_minutes AS reminderMinutes,
      calendar_events.recurrence, calendar_events.recurrence_until AS recurrenceUntil,
      calendar_events.initial_drive_minutes AS initialDriveMinutes, calendar_events.initial_normal_minutes AS initialNormalMinutes,
      calendar_events.initial_drive_checked_at AS initialDriveCheckedAt, calendar_events.latest_drive_minutes AS latestDriveMinutes,
      calendar_events.latest_normal_minutes AS latestNormalMinutes, calendar_events.latest_drive_checked_at AS latestDriveCheckedAt
    FROM calendar_events
    LEFT JOIN family_members ON family_members.id = calendar_events.family_member_id
    WHERE calendar_events.starts_at >= ?
    ORDER BY calendar_events.starts_at ASC
    LIMIT ?
  `);
  const insertEventStatement = database.prepare('INSERT INTO calendar_events (family_member_id, title, starts_at, ends_at, location, reminder_minutes, recurrence, recurrence_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const getEventStatement = database.prepare(`
    SELECT calendar_events.id, calendar_events.family_member_id AS familyMemberId,
      family_members.name AS memberName, family_members.color, calendar_events.title, calendar_events.location,
      calendar_events.starts_at AS startsAt, calendar_events.ends_at AS endsAt, calendar_events.reminder_minutes AS reminderMinutes,
      calendar_events.recurrence, calendar_events.recurrence_until AS recurrenceUntil,
      calendar_events.initial_drive_minutes AS initialDriveMinutes, calendar_events.initial_normal_minutes AS initialNormalMinutes,
      calendar_events.initial_drive_checked_at AS initialDriveCheckedAt, calendar_events.latest_drive_minutes AS latestDriveMinutes,
      calendar_events.latest_normal_minutes AS latestNormalMinutes, calendar_events.latest_drive_checked_at AS latestDriveCheckedAt,
      calendar_events.created_at AS createdAt, calendar_events.updated_at AS updatedAt
    FROM calendar_events LEFT JOIN family_members ON family_members.id = calendar_events.family_member_id
    WHERE calendar_events.id = ?
  `);
  const updateEventReminderStatement = database.prepare('UPDATE calendar_events SET reminder_minutes = ?, updated_at = ? WHERE id = ?');
  const updateEventStatement = database.prepare(`UPDATE calendar_events SET family_member_id = ?, title = ?, starts_at = ?, ends_at = ?, location = ?, reminder_minutes = ?, recurrence = ?, recurrence_until = ?, initial_drive_minutes = NULL, initial_normal_minutes = NULL, initial_drive_checked_at = NULL, latest_drive_minutes = NULL, latest_normal_minutes = NULL, latest_drive_checked_at = NULL, updated_at = ? WHERE id = ?`);
  const updateInitialTravelStatement = database.prepare('UPDATE calendar_events SET reminder_minutes = ?, initial_drive_minutes = ?, initial_normal_minutes = ?, initial_drive_checked_at = ?, latest_drive_minutes = ?, latest_normal_minutes = ?, latest_drive_checked_at = ?, updated_at = ? WHERE id = ?');
  const updateLatestTravelStatement = database.prepare('UPDATE calendar_events SET reminder_minutes = ?, latest_drive_minutes = ?, latest_normal_minutes = ?, latest_drive_checked_at = ?, updated_at = ? WHERE id = ?');
  const deleteEventStatement = database.prepare('DELETE FROM calendar_events WHERE id = ?');
  const reminderDeliveredStatement = database.prepare('SELECT 1 AS delivered FROM reminder_deliveries WHERE event_id = ? AND occurrence_starts_at = ?');
  const insertReminderDeliveryStatement = database.prepare('INSERT OR IGNORE INTO reminder_deliveries (event_id, occurrence_starts_at, delivered_at) VALUES (?, ?, ?)');

  return {
    close: () => database.close(),
    listFamily: () => listFamilyStatement.all().map((member) => ({ ...member, active: Boolean(member.active) })),
    addFamily({ name, color, birthday = null }) {
      const timestamp = new Date().toISOString();
      const result = insertFamilyStatement.run(name, color, birthday, timestamp, timestamp);
      return database.prepare('SELECT id, name, color, birthday, active, created_at AS createdAt, updated_at AS updatedAt FROM family_members WHERE id = ?').get(Number(result.lastInsertRowid));
    },
    updateFamily(id, { name, color, birthday = null, active }) {
      const result = updateFamilyStatement.run(name, color, birthday, active ? 1 : 0, new Date().toISOString(), id);
      if (!result.changes) return undefined;
      const member = database.prepare('SELECT id, name, color, birthday, active, created_at AS createdAt, updated_at AS updatedAt FROM family_members WHERE id = ?').get(id);
      return { ...member, active: Boolean(member.active) };
    },
    listEvents: () => listEventsStatement.all(),
    getEvent: (id) => getEventStatement.get(id),
    updateEventReminder(id, reminderMinutes) {
      const result = updateEventReminderStatement.run(reminderMinutes, new Date().toISOString(), id);
      return result.changes ? getEventStatement.get(id) : undefined;
    },
    updateEvent(id, { familyMemberId, title, startsAt, endsAt, location = 'Home', reminderMinutes = 5, recurrence = 'none', recurrenceUntil = null }) {
      const resolvedEndsAt = endsAt ?? new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString();
      const result = updateEventStatement.run(familyMemberId, title, startsAt, resolvedEndsAt, location, reminderMinutes, recurrence, recurrenceUntil, new Date().toISOString(), id);
      return result.changes ? getEventStatement.get(id) : undefined;
    },
    recordInitialTravel(id, { durationMinutes, normalMinutes, leaveMinutesBefore, checkedAt = new Date().toISOString() }) {
      const result = updateInitialTravelStatement.run(leaveMinutesBefore, durationMinutes, normalMinutes ?? null, checkedAt, durationMinutes, normalMinutes ?? null, checkedAt, new Date().toISOString(), id);
      return result.changes ? getEventStatement.get(id) : undefined;
    },
    recordLatestTravel(id, { durationMinutes, normalMinutes, leaveMinutesBefore, checkedAt = new Date().toISOString() }) {
      const result = updateLatestTravelStatement.run(leaveMinutesBefore, durationMinutes, normalMinutes ?? null, checkedAt, new Date().toISOString(), id);
      return result.changes ? getEventStatement.get(id) : undefined;
    },
    reminderWasDelivered(eventId, occurrenceStartsAt) {
      return Boolean(reminderDeliveredStatement.get(eventId, occurrenceStartsAt));
    },
    markReminderDelivered(eventId, occurrenceStartsAt) {
      return insertReminderDeliveryStatement.run(eventId, occurrenceStartsAt, new Date().toISOString()).changes > 0;
    },
    listUpcomingEvents({ after = new Date().toISOString(), limit = 3 } = {}) {
      return listUpcomingEventsStatement.all(after, limit);
    },
    addEvent({ familyMemberId, title, startsAt, endsAt, location = 'Home', reminderMinutes = 5, recurrence = 'none', recurrenceUntil = null }) {
      const timestamp = new Date().toISOString();
      const resolvedEndsAt = endsAt ?? new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString();
      const result = insertEventStatement.run(familyMemberId, title, startsAt, resolvedEndsAt, location, reminderMinutes, recurrence, recurrenceUntil, timestamp, timestamp);
      return getEventStatement.get(Number(result.lastInsertRowid));
    },
    deleteEvent(id) {
      return deleteEventStatement.run(id).changes > 0;
    },
    getSettings() {
      const saved = Object.fromEntries(getSettingsStatement.all().map(({ key, value }) => [key, parseSetting(value)]));
      return { ...defaultSettings, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key in defaultSettings)) };
    },
    updateSettings(patch) {
      const timestamp = new Date().toISOString();
      for (const [key, value] of Object.entries(patch)) updateSettingStatement.run(key, JSON.stringify(value), timestamp);
      return this.getSettings();
    }
  };
}
