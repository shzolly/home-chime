function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  });
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second')
  };
}

function instantForZonedParts(parts, timeZone, milliseconds) {
  const desiredWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let instant = desiredWallTime;

  // The formatted local fields reveal the offset at this instant. Repeating
  // the correction makes this work on either side of a DST transition.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(instant), timeZone);
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = desiredWallTime - actualWallTime;
    if (!correction) break;
    instant += correction;
  }

  return new Date(instant + milliseconds);
}

function addCalendarWeek(date, timeZone) {
  const local = zonedParts(date, timeZone);
  const nextWeek = new Date(Date.UTC(local.year, local.month - 1, local.day + 7, local.hour, local.minute, local.second));
  return instantForZonedParts({
    year: nextWeek.getUTCFullYear(),
    month: nextWeek.getUTCMonth() + 1,
    day: nextWeek.getUTCDate(),
    hour: nextWeek.getUTCHours(),
    minute: nextWeek.getUTCMinutes(),
    second: nextWeek.getUTCSeconds()
  }, timeZone, date.getUTCMilliseconds());
}

function relativeTime(startsAt, endsAt, now) {
  if (new Date(startsAt).getTime() <= now.getTime() && new Date(endsAt).getTime() >= now.getTime()) return 'in progress';
  const minutes = Math.round((new Date(startsAt).getTime() - now.getTime()) / 60_000);
  if (minutes < -1) return 'earlier';
  if (minutes <= 1) return 'now';
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export function toDashboardEvents(events, { now = new Date(), timeZone = 'America/New_York' } = {}) {
  const time = formatter(timeZone);
  return events
    .map((event) => {
      const endsAt = event.endsAt ?? new Date(new Date(event.startsAt).getTime() + 60 * 60_000).toISOString();
      return {
      id: event.id,
      person: event.memberName ?? 'Family',
      color: event.color ?? '#8bb7ff',
      title: event.title,
      time: time.format(new Date(event.startsAt)),
      relative: relativeTime(event.startsAt, endsAt, now),
      startsAt: event.startsAt,
      endsAt,
      reminderMinutes: event.reminderMinutes,
      location: event.location ?? 'Home'
      };
    })
    .filter((event) => new Date(event.endsAt).getTime() >= now.getTime());
}

export function expandRecurringEvents(events, { now = new Date(), timeZone = 'America/New_York' } = {}) {
  return events.flatMap((event) => {
    if (event.recurrence !== 'weekly') {
      const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime() + 60 * 60_000;
      return endsAt >= now.getTime() ? [event] : [];
    }
    const initial = new Date(event.startsAt);
    const initialEnd = event.endsAt ? new Date(event.endsAt) : new Date(initial.getTime() + 60 * 60_000);
    const duration = Math.max(0, initialEnd.getTime() - initial.getTime());
    let occurrence = new Date(initial);
    while (occurrence.getTime() + duration < now.getTime()) occurrence = addCalendarWeek(occurrence, timeZone);
    if (event.recurrenceUntil && occurrence.getTime() > new Date(`${event.recurrenceUntil}T23:59:59.999Z`).getTime()) return [];
    return [{ ...event, startsAt: occurrence.toISOString(), endsAt: new Date(occurrence.getTime() + duration).toISOString(), seriesStartsAt: event.startsAt }];
  }).sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
}
