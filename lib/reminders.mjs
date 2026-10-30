const alertWindowMilliseconds = 10 * 60_000;

export function selectDueReminders(events, { now = new Date() } = {}) {
  const currentTime = now.getTime();
  return events.filter((event) => {
    const startsAt = new Date(event.startsAt).getTime();
    const reminderAt = startsAt - event.reminderMinutes * 60_000;
    return currentTime >= reminderAt && currentTime < reminderAt + alertWindowMilliseconds;
  });
}

export function reminderKey(event) {
  return `${event.id}:${event.startsAt}`;
}
