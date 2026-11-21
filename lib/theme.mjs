import { localClock, nextLocalDate, solarMinutes, solarPoint } from './solar.mjs';

const fallbackSunriseMinutes = 7 * 60;
const fallbackSunsetMinutes = 19 * 60;

function fallbackSchedule(local) {
  const sunrise = { date: local.date, minutes: fallbackSunriseMinutes };
  const sunset = { date: local.date, minutes: fallbackSunsetMinutes };
  const sunrisePoint = solarPoint(sunrise);
  const sunsetPoint = solarPoint(sunset);

  if (local.minutes < fallbackSunriseMinutes) {
    return { phase: 'night', source: 'fallback-clock', sunrise: sunrisePoint, sunset: sunsetPoint, next: { phase: 'day', event: 'sunrise', ...sunrisePoint } };
  }
  if (local.minutes < fallbackSunsetMinutes) {
    return { phase: 'day', source: 'fallback-clock', sunrise: sunrisePoint, sunset: sunsetPoint, next: { phase: 'night', event: 'sunset', ...sunsetPoint } };
  }
  return {
    phase: 'night',
    source: 'fallback-clock',
    sunrise: sunrisePoint,
    sunset: sunsetPoint,
    next: { phase: 'day', event: 'sunrise', ...solarPoint({ date: nextLocalDate(local.date), minutes: fallbackSunriseMinutes }) }
  };
}

/**
 * Which of the two dashboard palettes should be on screen right now.
 *
 * The theme changes exactly twice a day: at local sunrise the daylight palette
 * takes over, and at local sunset the night palette does. Sunrise and sunset
 * come from the Open-Meteo daily forecast, so the switches follow the seasons
 * instead of a hard-coded hour. When solar data has not been fetched yet the
 * schedule falls back to 7:00 AM and 7:00 PM local clock time.
 */
export function themeSchedule(now = new Date(), weather = {}) {
  const local = localClock(now);
  const forecast = Array.isArray(weather?.forecast) ? weather.forecast : [];
  const today = forecast.find((day) => day.date === local.date) ?? weather ?? {};
  const sunrise = solarMinutes(today.sunrise);
  const sunset = solarMinutes(today.sunset);
  const solarToday = Boolean(sunrise && sunset)
    && sunrise.date === local.date
    && sunset.date === local.date
    && sunrise.minutes < sunset.minutes;

  if (!solarToday) return fallbackSchedule(local);

  const sunrisePoint = solarPoint(sunrise);
  const sunsetPoint = solarPoint(sunset);

  if (local.minutes < sunrise.minutes) {
    return { phase: 'night', source: 'open-meteo', sunrise: sunrisePoint, sunset: sunsetPoint, next: { phase: 'day', event: 'sunrise', ...sunrisePoint } };
  }
  if (local.minutes < sunset.minutes) {
    return { phase: 'day', source: 'open-meteo', sunrise: sunrisePoint, sunset: sunsetPoint, next: { phase: 'night', event: 'sunset', ...sunsetPoint } };
  }

  const tomorrow = nextLocalDate(local.date);
  const nextSunrise = solarMinutes(forecast.find((day) => day.date === tomorrow)?.sunrise);
  return {
    phase: 'night',
    source: 'open-meteo',
    sunrise: sunrisePoint,
    sunset: sunsetPoint,
    next: nextSunrise?.date === tomorrow ? { phase: 'day', event: 'sunrise', ...solarPoint(nextSunrise) } : undefined
  };
}
