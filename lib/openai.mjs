const endpoint = 'https://api.openai.com/v1/responses';

const weatherToolNames = [
  'get_weather_summary',
  'get_forecast',
  'get_current_conditions',
  'get_alerts',
  'search_location'
];

function defaultHomeLocation() {
  return process.env.HOME_CHIME_HOME_LOCATION?.trim() || '08550 (Princeton Junction, New Jersey, USA)';
}

function resolveHomeLocation(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : defaultHomeLocation();
}

function assistantInstructions(homeLocation) {
  return `You are Home Chime's household answer assistant. Answer in friendly, plain language in no more than 120 words. You cannot operate devices or change settings. When the Weather MCP is available, use it for every weather, forecast, alert, air-quality, or location-specific weather question before answering. Never invent weather data. Home Chime's home location is ${homeLocation}. For any weather question without an explicit different location, including questions that say "here" or "home", use that home location. Do not ask the household for their ZIP code or home location; resolve it with search_location if needed. For weather questions, lead with the answer and make the results easy to speak aloud.`;
}

function isWeatherQuestion(question) {
  return /\b(weather|forecast|rain|temperature|air quality|pollen|humidity|uv|wind|alert|storm|snow|lightning|wildfire|radar|river|flood)\b/i.test(question);
}

function weatherInput(question, homeLocation) {
  const originalQuestion = question.trim().replace(/[.?!]+$/, '');
  return `The household's weather request has already been resolved to its saved home location: ${homeLocation}. Do not ask for a city, ZIP code, address, or location clarification. Use the Weather MCP to answer.\n\nRewritten request: ${originalQuestion} in ${homeLocation}.`;
}

function configuredTools(question) {
  const tools = [];
  if (process.env.HOME_CHIME_OPENAI_TUNNEL_ID && isWeatherQuestion(question)) {
    tools.push({
      type: 'mcp',
      server_label: 'home_weather',
      server_description: 'Read-only live weather, forecast, alerts, and location search for Home Chime.',
      tunnel_id: process.env.HOME_CHIME_OPENAI_TUNNEL_ID,
      require_approval: 'never',
      allowed_tools: weatherToolNames
    });
  }
  if (process.env.HOME_CHIME_OPENAI_WEB_SEARCH === '1') tools.push({ type: 'web_search' });
  return tools;
}

function outputText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  return response.output
    ?.filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('')
    .trim();
}

export async function askOpenAI(question, { fetcher = fetch, homeLocation: configuredHomeLocation } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  const homeLocation = resolveHomeLocation(configuredHomeLocation);
  const tools = configuredTools(question);
  const input = isWeatherQuestion(question)
    ? weatherInput(question.slice(0, 400), homeLocation)
    : question.slice(0, 400);
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-6-luna',
      instructions: assistantInstructions(homeLocation),
      input,
      max_output_tokens: 350,
      store: false,
      ...(tools.length ? { tools } : {})
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) throw new Error('OpenAI is temporarily unavailable.');
  const payload = await response.json();
  const answer = outputText(payload);
  if (!answer) throw new Error('OpenAI returned no answer.');
  const toolsUsed = payload.output?.filter((item) => item.type === 'mcp_call').map((item) => item.name) ?? [];
  return {
    answer: answer.slice(0, 1_600),
    provider: toolsUsed.length ? 'openai-responses-weather-mcp' : 'openai-responses',
    toolsUsed
  };
}
