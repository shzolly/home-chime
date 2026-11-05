import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const cachePath = join(process.env.HOME_CHIME_DATA_DIR ?? appRoot, 'data', 'weather-cache.json');
const refreshAfterMs = 10 * 60 * 1000;

const home = {
  name: 'Princeton Junction',
  latitude: 40.31733,
  longitude: -74.61988,
  timezone: 'America/New_York'
};

let memoryCache;

export function describeWeather(code, isDay = 1) {
  if (code === 0) return { condition: isDay ? 'Clear sky' : 'Clear night', visual: isDay ? 'clear' : 'night' };
  if ([1, 2].includes(code)) return { condition: 'Partly cloudy', visual: 'partly-cloudy' };
  if (code === 3) return { condition: 'Overcast', visual: 'cloudy' };
  if ([45, 48].includes(code)) return { condition: 'Foggy', visual: 'fog' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { condition: 'Rain', visual: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: 'Snow', visual: 'snow' };
  if ([95, 96, 97, 99].includes(code)) return { condition: 'Thunderstorm', visual: 'storm' };
  return { condition: 'Weather update', visual: 'partly-cloudy' };
}

function formatUpdated(time) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: home.timezone,
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(time));
}

export function toDashboardWeather(payload, fetchedAt = new Date().toISOString()) {
  const current = payload.current;
  const daily = payload.daily;
  if (!current || !daily?.temperature_2m_max?.length) throw new Error('Open-Meteo response did not include current forecast data.');
  const description = describeWeather(current.weather_code, current.is_day);
  const forecast = daily.time.map((date, index) => {
    const dailyDescription = describeWeather(daily.weather_code?.[index] ?? current.weather_code, 1);
    return {
      date,
      weekday: new Intl.DateTimeFormat('en-US', { timeZone: home.timezone, weekday: 'long' }).format(new Date(`${date}T12:00:00`)),
      condition: dailyDescription.condition,
      visual: dailyDescription.visual,
      high: Math.round(daily.temperature_2m_max[index]),
      low: Math.round(daily.temperature_2m_min[index]),
      precipitation: Math.round(daily.precipitation_probability_max?.[index] ?? 0),
      wind: Number.isFinite(Number(daily.wind_speed_10m_max?.[index])) ? Math.round(Number(daily.wind_speed_10m_max[index])) : undefined,
      uvIndex: Number.isFinite(Number(daily.uv_index_max?.[index])) ? Math.round(Number(daily.uv_index_max[index])) : undefined
    };
  });
  return {
    location: home.name,
    condition: description.condition,
    visual: description.visual,
    isDay: Number(current.is_day) === 1 ? 1 : 0,
    temperature: Math.round(current.temperature_2m),
    apparentTemperature: Math.round(current.apparent_temperature),
    high: Math.round(daily.temperature_2m_max[0]),
    low: Math.round(daily.temperature_2m_min[0]),
    precipitation: Math.round(daily.precipitation_probability_max?.[0] ?? 0),
    wind: Math.round(current.wind_speed_10m),
    humidity: Number.isFinite(Number(current.relative_humidity_2m)) ? Math.round(Number(current.relative_humidity_2m)) : undefined,
    forecast,
    updated: formatUpdated(fetchedAt),
    fetchedAt,
    source: 'open-meteo'
  };
}

async function readDiskCache() {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return undefined;
  }
}

async function persist(weather) {
  await mkdir(dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(weather), 'utf8');
  await rename(temporaryPath, cachePath);
}

async function fetchForecast(fetcher) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(home.latitude),
    longitude: String(home.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: home.timezone,
    forecast_days: '8'
  }).toString();

  const response = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}.`);
  return toDashboardWeather(await response.json());
}

export async function getWeather({ fetcher = fetch, now = Date.now(), refreshAfter = refreshAfterMs } = {}) {
  if (!memoryCache) memoryCache = await readDiskCache();
  const hasLatestFields = memoryCache?.forecast?.length && 'humidity' in memoryCache && 'isDay' in memoryCache && memoryCache.forecast.every((day) => 'wind' in day && 'uvIndex' in day);
  if (hasLatestFields && now - Date.parse(memoryCache.fetchedAt) < refreshAfter) return memoryCache;

  try {
    const weather = await fetchForecast(fetcher);
    memoryCache = weather;
    await persist(weather);
    return weather;
  } catch (error) {
    if (memoryCache) return { ...memoryCache, stale: true };
    throw error;
  }
}
