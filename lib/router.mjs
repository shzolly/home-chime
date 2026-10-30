export const familyEvents = [
  { person: 'Colin', title: 'Piano lesson', time: '4:30 PM', relative: 'in 2 hours' },
  { person: 'Colin', title: 'Soccer practice', time: '6:00 PM', relative: 'later today' },
  { person: 'Family', title: 'Dinner reservation', time: '7:30 PM', relative: 'tonight' }
];

export const fallbackWeather = {
  location: 'Home',
  condition: 'Partly cloudy',
  temperature: 68,
  high: 72,
  low: 54,
  precipitation: 8,
  forecast: [],
  updated: 'just now'
};

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function requestedForecast(normalized, weather) {
  const requestedWeekday = weekdays.find((day) => new RegExp(`\\b${day}\\b`).test(normalized));
  if (!requestedWeekday) return undefined;
  return weather.forecast?.find((day) => day.weekday.toLowerCase() === requestedWeekday);
}

export function routeRequest(text, currentWeather = fallbackWeather, events = familyEvents) {
  const query = text.trim();
  const normalized = query.toLowerCase();

  if (/weather|rain|temperature|forecast/.test(normalized)) {
    const forecast = requestedForecast(normalized, currentWeather);
    if (forecast) {
      return {
        kind: 'feature',
        feature: 'weather',
        speech: `${forecast.weekday} will be ${forecast.condition.toLowerCase()}, with a high of ${forecast.high} and a low of ${forecast.low}. The chance of precipitation is ${forecast.precipitation} percent.`,
        detail: { ...currentWeather, ...forecast, isForecast: true }
      };
    }
    return {
      kind: 'feature',
      feature: 'weather',
      speech: `It is ${currentWeather.condition.toLowerCase()} and ${currentWeather.temperature} degrees. The high is ${currentWeather.high} and the low is ${currentWeather.low}.`,
      detail: currentWeather
    };
  }

  if (/calendar|schedule|event|appointment|what.*doing/.test(normalized)) {
    const person = events.find((event) => normalized.includes(event.person.toLowerCase()))?.person ?? 'Family';
    const matchingEvents = person === 'Family' ? events : events.filter((event) => event.person === person);
    return {
      kind: 'feature',
      feature: 'calendar',
      speech: matchingEvents.length
        ? `${person} has ${matchingEvents.map((event) => `${event.title} at ${event.time}`).join(', ')}.`
        : `I do not see any events for ${person} today.`,
      detail: { person, events: matchingEvents }
    };
  }

  return {
    kind: 'agent',
    feature: 'answer',
    speech: `I do not have a built-in Home Chime feature for that yet. Add the OpenAI API key to let me answer: ${query}`,
    detail: { query, status: 'mock-agent-fallback' }
  };
}
