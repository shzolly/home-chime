const routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

function secondsToMinutes(duration) {
  const seconds = Number.parseInt(String(duration).replace(/s$/, ''), 10);
  return Math.max(1, Math.ceil(seconds / 60));
}

export async function getDriveTime({ origin, destination, departureTime, apiKey = process.env.GOOGLE_MAPS_API_KEY, fetcher = fetch } = {}) {
  if (!apiKey) throw new Error('Add GOOGLE_MAPS_API_KEY to enable live traffic estimates.');
  if (!origin || !destination) throw new Error('Save a home base and event location before checking traffic.');
  const response = await fetcher(routesUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': 'routes.duration,routes.staticDuration,routes.distanceMeters'
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      ...(departureTime ? { departureTime } : {})
    })
  });
  if (!response.ok) throw new Error('Traffic estimate is temporarily unavailable.');
  const route = (await response.json()).routes?.[0];
  if (!route?.duration) throw new Error('No driving route was found for this location.');
  return {
    durationMinutes: secondsToMinutes(route.duration),
    normalMinutes: route.staticDuration ? secondsToMinutes(route.staticDuration) : undefined,
    distanceMeters: route.distanceMeters
  };
}
