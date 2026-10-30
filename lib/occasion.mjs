function dateParts(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function nthWeekdayOfMonth(year, month, weekday, occurrence) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return String(1 + offset + (occurrence - 1) * 7).padStart(2, '0');
}

function usHoliday(year, month, day, weekday) {
  if (`${month}-${day}` === '01-01') return 'New Year’s Day: restrained midnight blue, silver sparks, and fresh-start warmth';
  if (`${month}-${day}` === '02-14') return 'Valentine’s Day: warm rose, subtle paper hearts, and candlelit glow';
  if (month === '07' && day === '04') return 'U.S. Independence Day: elegant twilight fireworks, navy, and soft red-white-blue accents';
  if (`${month}-${day}` === '10-31') return 'Halloween: friendly amber lanterns, mist, and deep plum night';
  if (`${month}-${day}` === '12-25') return 'Christmas Day: quiet evergreen, warm window light, and delicate gold ornaments';
  if (month === '11' && weekday === 'Thu' && day === nthWeekdayOfMonth(year, 11, 4, 4)) return 'U.S. Thanksgiving: harvest warmth, copper leaves, and soft candlelight';
  return undefined;
}

const chineseFestivals = {
  2025: { '01-29': 'Chinese Lunar New Year: refined red lanterns, plum blossoms, and soft golden light', '02-12': 'Lantern Festival: glowing lanterns reflected in a calm evening garden', '05-31': 'Dragon Boat Festival: elegant river mist, zongzi leaf greens, and subtle festival ribbons', '10-06': 'Mid-Autumn Festival: luminous moon, osmanthus, and understated lanterns' },
  2026: { '02-17': 'Chinese Lunar New Year: refined red lanterns, plum blossoms, and soft golden light', '03-03': 'Lantern Festival: glowing lanterns reflected in a calm evening garden', '06-19': 'Dragon Boat Festival: elegant river mist, zongzi leaf greens, and subtle festival ribbons', '09-25': 'Mid-Autumn Festival: luminous moon, osmanthus, and understated lanterns' },
  2027: { '02-06': 'Chinese Lunar New Year: refined red lanterns, plum blossoms, and soft golden light', '02-20': 'Lantern Festival: glowing lanterns reflected in a calm evening garden', '06-09': 'Dragon Boat Festival: elegant river mist, zongzi leaf greens, and subtle festival ribbons', '09-15': 'Mid-Autumn Festival: luminous moon, osmanthus, and understated lanterns' }
};

export function getOccasion({ now = new Date(), members = [] } = {}) {
  const { month, day, weekday } = dateParts(now);
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now));
  const key = `${month}-${day}`;
  const birthdayToday = members.some((member) => member.active && member.birthday === key);
  const festival = chineseFestivals[year]?.[key] ?? usHoliday(year, month, day, weekday);
  if (birthdayToday) return { type: 'birthday', prompt: 'family birthday celebration: tasteful streamers, a few glowing balloons, gentle confetti, and warm celebratory light; no names, no cakes with writing, no text' };
  if (festival) return { type: 'holiday', prompt: festival };
  return { type: 'ordinary', prompt: 'an ordinary family day: calm, elegant, and restorative' };
}
