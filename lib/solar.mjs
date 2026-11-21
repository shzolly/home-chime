export const HOME_TIME_ZONE = 'America/New_York';

export function localClock(now, timeZone = HOME_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function solarMinutes(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return match ? { date: match[1], minutes: Number(match[2]) * 60 + Number(match[3]) } : undefined;
}

export function previousLocalDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function nextLocalDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function formatSolarTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function solarPoint(solar) {
  const hour = String(Math.floor(solar.minutes / 60)).padStart(2, '0');
  const minute = String(solar.minutes % 60).padStart(2, '0');
  return { date: solar.date, at: `${solar.date}T${hour}:${minute}`, time: formatSolarTime(solar.minutes) };
}
