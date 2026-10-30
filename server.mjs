import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRecurringEvents, toDashboardEvents } from './lib/events.mjs';
import { backgroundScheduleSlot, getDashboardBackground, getDashboardBackgroundStatus } from './lib/background.mjs';
import { getDriveTime } from './lib/travel.mjs';
import { selectDueReminders } from './lib/reminders.mjs';
import { createStore } from './lib/store.mjs';
import { getOccasion } from './lib/occasion.mjs';
import { getWeather } from './lib/weather.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const publicDirectory = join(root, 'public');
const adminPassword = process.env.HOME_CHIME_ADMIN_PASSWORD;
const sessions = new Map();
const store = await createStore();
const calendarWindowOptions = new Set([4, 8, 12, 24]);
const backgroundRefreshOptions = new Set([5, 10, 20, 30, 60, 120, 240, 720, 1_440]);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

async function parseJson(request) {
  const parts = [];
  for await (const chunk of request) parts.push(chunk);
  return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

function currentSession(request) {
  const token = parseCookies(request).home_chime_admin;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return undefined;
  }
  return { token, ...session };
}

function passwordMatches(password) {
  if (!adminPassword || typeof password !== 'string') return false;
  const expected = Buffer.from(adminPassword);
  const given = Buffer.from(password);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function requireAdmin(request, response) {
  if (currentSession(request)) return true;
  sendJson(response, 401, { error: 'Admin sign-in is required.' });
  return false;
}

function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function validateBirthday(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) throw new Error('Birthday must use MM-DD.');
  const [month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) throw new Error('Birthday is not a real calendar date.');
  return value;
}

function validateMember(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 60) throw new Error('Family member name must be 1 to 60 characters.');
  return { name, color: validColor(input.color) ? input.color : '#4f7cac', birthday: validateBirthday(input.birthday) };
}

function validateSettings(input) {
  const output = {};
  if ('weatherRefreshMinutes' in input) {
    if (!Number.isInteger(input.weatherRefreshMinutes) || input.weatherRefreshMinutes < 5 || input.weatherRefreshMinutes > 120) throw new Error('Weather refresh must be between 5 and 120 minutes.');
    output.weatherRefreshMinutes = input.weatherRefreshMinutes;
  }
  if ('calendarWindowHours' in input) {
    if (!calendarWindowOptions.has(input.calendarWindowHours)) throw new Error('Calendar window must be 4, 8, 12, or 24 hours.');
    output.calendarWindowHours = input.calendarWindowHours;
  }
  if ('backgroundRefreshMinutes' in input) {
    if (!backgroundRefreshOptions.has(input.backgroundRefreshMinutes)) throw new Error('Background refresh interval is invalid.');
    output.backgroundRefreshMinutes = input.backgroundRefreshMinutes;
  }
  if ('temperatureUnit' in input) {
    if (!['fahrenheit', 'celsius'].includes(input.temperatureUnit)) throw new Error('Temperature unit is invalid.');
    output.temperatureUnit = input.temperatureUnit;
  }
  if ('homeAddress' in input) {
    if (typeof input.homeAddress !== 'string' || input.homeAddress.trim().length > 200) throw new Error('Home address must be 200 characters or fewer.');
    output.homeAddress = input.homeAddress.trim();
  }
  if ('travelBufferMinutes' in input) {
    if (!Number.isInteger(input.travelBufferMinutes) || input.travelBufferMinutes < 0 || input.travelBufferMinutes > 60) throw new Error('Travel buffer must be between 0 and 60 minutes.');
    output.travelBufferMinutes = input.travelBufferMinutes;
  }
  return output;
}

function validateEvent(input, settings) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 120) throw new Error('Event title must be 1 to 120 characters.');
  const startsAt = typeof input.startsAt === 'string' ? input.startsAt : '';
  if (Number.isNaN(Date.parse(startsAt))) throw new Error('Event date and time are required.');
  const endsAt = typeof input.endsAt === 'string' ? input.endsAt : '';
  if (Number.isNaN(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('End time must be after the start time.');
  const familyMemberId = Number(input.familyMemberId);
  if (!Number.isInteger(familyMemberId) || familyMemberId < 1) throw new Error('Select a family member before adding an event.');
  const location = typeof input.location === 'string' ? input.location.trim() || 'Home' : 'Home';
  if (location.length > 160) throw new Error('Location must be 160 characters or fewer.');
  const recurrence = input.recurrence === 'weekly' ? 'weekly' : 'none';
  const recurrenceUntil = typeof input.recurrenceUntil === 'string' && input.recurrenceUntil ? input.recurrenceUntil : null;
  if (recurrenceUntil && Number.isNaN(Date.parse(`${recurrenceUntil}T12:00:00Z`))) throw new Error('Repeat-until date is invalid.');
  return { title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), familyMemberId, location, reminderMinutes: settings.travelBufferMinutes, recurrence, recurrenceUntil };
}

function isAwayFromHome(event) {
  return event.location.trim().toLowerCase() !== 'home';
}

function applyReminderBuffer(events, settings) {
  return events.map((event) => {
    if (!isAwayFromHome(event)) return { ...event, reminderMinutes: settings.travelBufferMinutes };
    const driveMinutes = event.latestDriveMinutes ?? event.initialDriveMinutes;
    return { ...event, reminderMinutes: Number.isFinite(driveMinutes) ? driveMinutes + settings.travelBufferMinutes : settings.travelBufferMinutes };
  });
}

async function addInitialTravelEstimate(event, settings) {
  if (!isAwayFromHome(event)) return { event, travel: { atHome: true } };
  try {
    const travel = await getDriveTime({ origin: settings.homeAddress, destination: event.location });
    const leaveMinutesBefore = travel.durationMinutes + settings.travelBufferMinutes;
    const updatedEvent = store.recordInitialTravel(event.id, { ...travel, leaveMinutesBefore });
    return { event: updatedEvent, travel: { ...travel, leaveMinutesBefore } };
  } catch (error) {
    return { event, travel: { error: error.message ?? 'Traffic estimate is temporarily unavailable.' } };
  }
}

async function refreshApproachingTravel(events, settings, now) {
  const refreshed = new Set();
  for (const event of events) {
    if (refreshed.has(event.id) || !isAwayFromHome(event)) continue;
    const startsAt = new Date(event.startsAt).getTime();
    const minutesUntil = (startsAt - now.getTime()) / 60_000;
    const referenceMinutes = event.latestDriveMinutes ?? event.initialDriveMinutes ?? 0;
    const refreshWindowMinutes = Math.max(120, referenceMinutes + settings.travelBufferMinutes + 30);
    const checkedAt = Date.parse(event.latestDriveCheckedAt ?? event.initialDriveCheckedAt ?? '');
    if (minutesUntil <= 0 || minutesUntil > refreshWindowMinutes || (Number.isFinite(checkedAt) && now.getTime() - checkedAt < 15 * 60_000)) continue;
    refreshed.add(event.id);
    try {
      const travel = await getDriveTime({ origin: settings.homeAddress, destination: event.location });
      const leaveMinutesBefore = travel.durationMinutes + settings.travelBufferMinutes;
      const updated = store.recordLatestTravel(event.id, { ...travel, leaveMinutesBefore });
      event.reminderMinutes = updated.reminderMinutes;
      event.latestDriveMinutes = updated.latestDriveMinutes;
      event.latestNormalMinutes = updated.latestNormalMinutes;
      event.latestDriveCheckedAt = updated.latestDriveCheckedAt;
    } catch {
      // The previously saved estimate remains the safe fallback if live traffic is unavailable.
    }
  }
}

async function refreshDashboardBackground() {
  const now = new Date();
  const settings = store.getSettings();
  let weather;
  try { weather = await getWeather(); } catch { /* The scene can still render when weather is briefly unavailable. */ }
  return getDashboardBackground({
    now,
    slot: backgroundScheduleSlot(now, settings.backgroundRefreshMinutes),
    context: { weather, occasion: getOccasion({ now, members: store.listFamily() }) }
  });
}

function scheduleBackgroundRefresh() {
  const millisecondsUntilNextMinute = 60_000 - (Date.now() % 60_000) + 25;
  setTimeout(async () => {
    try { await refreshDashboardBackground(); } catch (error) { console.error(`Background refresh failed: ${error.message ?? error}`); }
    scheduleBackgroundRefresh();
  }, millisecondsUntilNextMinute);
}

const server = createServer(async (request, response) => {
  const method = request.method ?? 'GET';
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (method === 'GET' && requestUrl.pathname === '/api/admin/session') {
    return sendJson(response, 200, { authenticated: Boolean(currentSession(request)), configured: Boolean(adminPassword) });
  }

  if (method === 'POST' && requestUrl.pathname === '/api/admin/login') {
    if (!adminPassword) return sendJson(response, 503, { error: 'Set HOME_CHIME_ADMIN_PASSWORD before using the admin console.' });
    try {
      const { password } = await parseJson(request);
      if (!passwordMatches(password)) return sendJson(response, 401, { error: 'Password was not accepted.' });
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
      return sendJson(response, 200, { authenticated: true }, { 'set-cookie': `home_chime_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
    } catch {
      return sendJson(response, 400, { error: 'A password is required.' });
    }
  }

  if (method === 'POST' && requestUrl.pathname === '/api/admin/logout') {
    const session = currentSession(request);
    if (session) sessions.delete(session.token);
    return sendJson(response, 200, { authenticated: false }, { 'set-cookie': 'home_chime_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (requestUrl.pathname === '/api/admin/family') {
    if (!requireAdmin(request, response)) return;
    if (method === 'GET') return sendJson(response, 200, { members: store.listFamily() });
    if (method === 'POST') {
      try {
        const body = await parseJson(request);
        return sendJson(response, 201, { member: store.addFamily(validateMember(body)) });
      } catch (error) {
        return sendJson(response, 400, { error: error.message ?? 'Family member details are invalid.' });
      }
    }
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const familyUpdateMatch = requestUrl.pathname.match(/^\/api\/admin\/family\/(\d+)$/);
  if (familyUpdateMatch) {
    if (!requireAdmin(request, response)) return;
    if (method !== 'PUT') return sendJson(response, 405, { error: 'Method not allowed.' });
    try {
      const existing = store.listFamily().find((member) => member.id === Number(familyUpdateMatch[1]));
      if (!existing) return sendJson(response, 404, { error: 'Family member not found.' });
      const member = store.updateFamily(existing.id, { ...validateMember(await parseJson(request)), active: existing.active });
      return sendJson(response, 200, { member });
    } catch (error) {
      return sendJson(response, 400, { error: error.message ?? 'Family member details are invalid.' });
    }
  }

  if (requestUrl.pathname === '/api/admin/settings') {
    if (!requireAdmin(request, response)) return;
    if (method === 'GET') return sendJson(response, 200, { settings: store.getSettings() });
    if (method === 'PUT') {
      try {
        const body = await parseJson(request);
        return sendJson(response, 200, { settings: store.updateSettings(validateSettings(body)) });
      } catch (error) {
        return sendJson(response, 400, { error: error.message ?? 'Settings are invalid.' });
      }
    }
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  if (requestUrl.pathname === '/api/admin/events') {
    if (!requireAdmin(request, response)) return;
    if (method === 'GET') return sendJson(response, 200, { events: store.listEvents() });
    if (method === 'POST') {
      try {
        const input = validateEvent(await parseJson(request), store.getSettings());
        if (!store.listFamily().some((member) => member.id === input.familyMemberId && member.active)) throw new Error('Choose an active family member.');
        const event = store.addEvent(input);
        const result = await addInitialTravelEstimate(event, store.getSettings());
        return sendJson(response, 201, result);
      } catch (error) {
        return sendJson(response, 400, { error: error.message ?? 'Event details are invalid.' });
      }
    }
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const eventDeleteMatch = requestUrl.pathname.match(/^\/api\/admin\/events\/(\d+)$/);
  if (eventDeleteMatch) {
    if (!requireAdmin(request, response)) return;
    if (method === 'PUT') {
      try {
        const input = validateEvent(await parseJson(request), store.getSettings());
        if (!store.listFamily().some((member) => member.id === input.familyMemberId && member.active)) throw new Error('Choose an active family member.');
        const event = store.updateEvent(Number(eventDeleteMatch[1]), input);
        if (!event) return sendJson(response, 404, { error: 'Event not found.' });
        return sendJson(response, 200, await addInitialTravelEstimate(event, store.getSettings()));
      } catch (error) {
        return sendJson(response, 400, { error: error.message ?? 'Event details are invalid.' });
      }
    }
    if (method !== 'DELETE') return sendJson(response, 405, { error: 'Method not allowed.' });
    const deleted = store.deleteEvent(Number(eventDeleteMatch[1]));
    return sendJson(response, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'Event not found.' });
  }

  const eventTravelMatch = requestUrl.pathname.match(/^\/api\/admin\/events\/(\d+)\/travel$/);
  if (eventTravelMatch) {
    if (!requireAdmin(request, response)) return;
    if (method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' });
    try {
      const event = store.getEvent(Number(eventTravelMatch[1]));
      if (!event) return sendJson(response, 404, { error: 'Event not found.' });
      if (event.location.trim().toLowerCase() === 'home') return sendJson(response, 200, { atHome: true, durationMinutes: 0 });
      const settings = store.getSettings();
      const travel = await getDriveTime({ origin: settings.homeAddress, destination: event.location });
      const leaveMinutesBefore = travel.durationMinutes + settings.travelBufferMinutes;
      const updatedEvent = store.recordLatestTravel(event.id, { ...travel, leaveMinutesBefore });
      return sendJson(response, 200, { ...travel, leaveMinutesBefore, event: updatedEvent });
    } catch (error) {
      return sendJson(response, 400, { error: error.message ?? 'Traffic estimate is unavailable.' });
    }
  }

  if (method === 'GET' && requestUrl.pathname === '/api/home') {
    try {
      const settings = store.getSettings();
      const now = new Date();
      const events = toDashboardEvents(applyReminderBuffer(expandRecurringEvents(store.listEvents(), { now }), settings).slice(0, 16), { now });
      return sendJson(response, 200, { weather: await getWeather({ refreshAfter: settings.weatherRefreshMinutes * 60 * 1000 }), events, settings, now: now.toISOString() });
    } catch {
      return sendJson(response, 503, { error: 'Weather is temporarily unavailable.' });
    }
  }

  if (method === 'GET' && requestUrl.pathname === '/api/background/status') {
    const now = new Date();
    const settings = store.getSettings();
    return sendJson(response, 200, {
      background: await getDashboardBackgroundStatus(),
      slot: backgroundScheduleSlot(now, settings.backgroundRefreshMinutes),
      refreshMinutes: settings.backgroundRefreshMinutes
    });
  }

  if (method === 'GET' && requestUrl.pathname === '/api/background') {
    try {
      const background = await refreshDashboardBackground();
      if (!background) return response.writeHead(204, { 'cache-control': 'no-store' }).end();
      response.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'no-store', 'x-home-chime-background-generated-at': background.generatedAt });
      return response.end(background.image);
    } catch (error) {
      return sendJson(response, 503, { error: error.message ?? 'Background generation is temporarily unavailable.' });
    }
  }

  if (method === 'GET' && requestUrl.pathname === '/api/reminders') {
    const now = new Date();
    const settings = store.getSettings();
    const upcomingEvents = expandRecurringEvents(store.listEvents(), { now });
    await refreshApproachingTravel(upcomingEvents, settings, now);
    const dueEvents = selectDueReminders(applyReminderBuffer(upcomingEvents, settings), { now });
    const reminders = dueEvents
      .filter((event) => !store.reminderWasDelivered(event.id, event.startsAt))
      .filter((event) => store.markReminderDelivered(event.id, event.startsAt))
      .map((event) => ({
        id: event.id,
        occurrenceStartsAt: event.startsAt,
        person: event.memberName,
        title: event.title,
        location: event.location,
        startsAt: event.startsAt,
        reminderMinutes: event.reminderMinutes,
        speech: `Reminder: ${event.memberName}, ${event.title} is coming up in ${event.reminderMinutes} minutes${event.location.toLowerCase() === 'home' ? '' : ` at ${event.location}`}.`
      }));
    return sendJson(response, 200, { reminders });
  }

  if (method !== 'GET' && method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed.' });

  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname === '/admin' ? '/admin.html' : requestUrl.pathname;
  const assetPath = normalize(join(publicDirectory, requestedPath));
  if (!assetPath.startsWith(publicDirectory)) return sendJson(response, 403, { error: 'Forbidden.' });

  try {
    const data = await readFile(assetPath);
    response.writeHead(200, { 'content-type': mimeTypes[extname(assetPath)] ?? 'application/octet-stream' });
    response.end(method === 'HEAD' ? undefined : data);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Home Chime is running at http://localhost:${port}`);
  void refreshDashboardBackground().catch((error) => console.error(`Initial background refresh failed: ${error.message ?? error}`));
  scheduleBackgroundRefresh();
});
