function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  });
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

export function expandRecurringEvents(events, { now = new Date() } = {}) {
  return events.flatMap((event) => {
    if (event.recurrence !== 'weekly') {
      const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime() + 60 * 60_000;
      return endsAt >= now.getTime() ? [event] : [];
    }
    const initial = new Date(event.startsAt);
    const initialEnd = event.endsAt ? new Date(event.endsAt) : new Date(initial.getTime() + 60 * 60_000);
    const duration = Math.max(0, initialEnd.getTime() - initial.getTime());
    const occurrence = new Date(initial);
    while (occurrence.getTime() + duration < now.getTime()) occurrence.setUTCDate(occurrence.getUTCDate() + 7);
    if (event.recurrenceUntil && occurrence.getTime() > new Date(`${event.recurrenceUntil}T23:59:59.999Z`).getTime()) return [];
    return [{ ...event, startsAt: occurrence.toISOString(), endsAt: new Date(occurrence.getTime() + duration).toISOString(), seriesStartsAt: event.startsAt }];
  }).sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
}
