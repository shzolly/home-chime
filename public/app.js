const timeElement = document.querySelector('#time');
const calendarList = document.querySelector('#calendar-list');
const calendarPanel = document.querySelector('.calendar-panel');
const statusLabel = document.querySelector('#status-label');
const background = document.querySelector('#generated-background');
const nextBackground = document.querySelector('#generated-background-next');
let displayedMinute;
let displayedBackgroundSlot;
let backgroundVersion;
let backgroundObjectUrl;
let nextBackgroundObjectUrl;
let backgroundFadeTimer;
let backgroundLoading = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function updateClock() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const parts = formatter.formatToParts(now);
  const time = parts.map((part) => part.value).join('');
  if (displayedMinute && displayedMinute !== time && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timeElement.classList.remove('time-tick');
    requestAnimationFrame(() => timeElement.classList.add('time-tick'));
  }
  displayedMinute = time;
  const separatorHidden = now.getSeconds() % 2 === 1;
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value?.toUpperCase() || '';
  timeElement.innerHTML = parts.filter((part) => part.type !== 'dayPeriod').map((part) => part.type === 'literal'
    ? `<span class="clock-separator${separatorHidden ? ' is-hidden' : ''}" aria-hidden="true">${escapeHtml(part.value)}</span>`
    : escapeHtml(part.value)).join('');
  timeElement.setAttribute('aria-label', time);
  document.querySelector('#day-period').textContent = dayPeriod;
  document.querySelector('#weekday').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now).toUpperCase();
  document.querySelector('#date').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  document.body.dataset.weekday = now.getDay();
}

function eventDay(startsAt) {
  const date = new Date(startsAt);
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const localDate = formatter.format(date);
  const localToday = formatter.format(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (localDate === localToday) return 'TODAY';
  if (localDate === formatter.format(tomorrow)) return 'TOMORROW';
  return new Intl.DateTimeFormat(undefined, { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(date).toUpperCase();
}

function upcomingWithinHours(events, hours = 12) {
  const now = Date.now();
  const cutoff = now + hours * 60 * 60 * 1_000;
  return events.filter((event) => {
    const startsAt = Date.parse(event.startsAt);
    const endsAt = Date.parse(event.endsAt);
    return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= cutoff && endsAt >= now;
  });
}

function isReminderDue(event) {
  const startsAt = Date.parse(event.startsAt);
  const reminderMinutes = Number(event.reminderMinutes);
  const reminderStartsAt = startsAt - reminderMinutes * 60_000;
  return Number.isFinite(startsAt) && Number.isFinite(reminderMinutes) && reminderMinutes >= 0
    && Date.now() >= reminderStartsAt && Date.now() < reminderStartsAt + 10 * 60_000;
}

function updateReminderIndicators() {
  document.querySelectorAll('.calendar-event[data-starts-at]').forEach((element) => {
    element.classList.toggle('is-reminder-due', isReminderDue({ startsAt: element.dataset.startsAt, reminderMinutes: Number(element.dataset.reminderMinutes) }));
  });
}

function renderCalendar(events) {
  calendarPanel.hidden = events.length === 0;
  if (!events.length) {
    return;
  }
  document.querySelector('#calendar-count').textContent = `${events.length} EVENT${events.length === 1 ? '' : 'S'}`;
  let previousDay;
  calendarList.innerHTML = events.map((event) => {
    const day = eventDay(event.startsAt);
    const label = day === previousDay ? '' : `<li class="calendar-day">${day}</li>`;
    previousDay = day;
    return `${label}<li class="calendar-event${isReminderDue(event) ? ' is-reminder-due' : ''}" data-starts-at="${escapeHtml(event.startsAt)}" data-reminder-minutes="${escapeHtml(event.reminderMinutes)}"><span class="member-dot" style="--member-color:${escapeHtml(event.color)}"></span><div class="event-copy"><span class="event-time">${escapeHtml(event.time)}</span><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.person)} · ${escapeHtml(event.location)} · ${escapeHtml(event.relative)}</span></div></li>`;
  }).join('');
}

function setWeatherVisual(visual, wind) {
  document.body.dataset.weather = visual ?? 'partly-cloudy';
  document.body.dataset.windy = Number(wind) >= 14 ? 'true' : 'false';
}

function precipitationDisplay(forecast) {
  const kind = forecast?.visual === 'snow' ? 'snow' : forecast?.visual === 'storm' ? 'storm' : 'rain';
  const chance = Number.isFinite(Number(forecast?.precipitation)) ? Math.round(Number(forecast.precipitation)) : 0;
  if (chance <= 0) return '';
  const label = kind === 'snow' ? 'snow' : kind === 'storm' ? 'storm' : 'rain';
  const icons = {
    rain: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 18h10a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.4 12.4 2.8 2.8 0 0 0 6.5 18Z"/><path d="m9 20-1 2m5-2-1 2m5-2-1 2"/></svg>',
    snow: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 17h10a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.4 11.4 2.8 2.8 0 0 0 6.5 17Z"/><path d="M9 20v3m-1.3-2.3 2.6 1.6m0-1.6-2.6 1.6m6.3-2.3v3m-1.3-2.3 2.6 1.6m0-1.6-2.6 1.6"/></svg>',
    storm: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 17h10a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.4 11.4 2.8 2.8 0 0 0 6.5 17Z"/><path d="m13 18-3 4h3l-1 3 4-5h-3l1-2Z"/></svg>'
  };
  return `<span class="forecast-precipitation" role="img" aria-label="${chance}% chance of ${label}">${icons[kind]}<span>${chance}%</span></span>`;
}

async function loadBackground(force = false, slot) {
  if (backgroundLoading) return;
  if (!slot || (!force && slot === displayedBackgroundSlot && backgroundVersion)) return;
  backgroundLoading = true;
  let objectUrl;
  try {
    const response = await fetch('/api/background', { cache: 'no-store' });
    if (!response.ok || response.status === 204) return;
    const nextVersion = response.headers.get('x-home-chime-background-generated-at') ?? slot;
    objectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });
    if (!background.classList.contains('has-image')) {
      if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
      backgroundObjectUrl = objectUrl;
      background.style.backgroundImage = `url("${objectUrl}")`;
      background.classList.add('has-image');
      backgroundVersion = nextVersion;
      displayedBackgroundSlot = slot;
      return;
    }
    if (backgroundFadeTimer) clearTimeout(backgroundFadeTimer);
    if (nextBackgroundObjectUrl) URL.revokeObjectURL(nextBackgroundObjectUrl);
    nextBackgroundObjectUrl = objectUrl;
    nextBackground.style.backgroundImage = `url("${objectUrl}")`;
    nextBackground.classList.add('has-image');
    requestAnimationFrame(() => nextBackground.classList.add('is-visible'));
    backgroundVersion = nextVersion;
    displayedBackgroundSlot = slot;
    backgroundFadeTimer = setTimeout(() => {
      if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
      backgroundObjectUrl = objectUrl;
      nextBackgroundObjectUrl = undefined;
      background.style.backgroundImage = `url("${objectUrl}")`;
      nextBackground.classList.remove('is-visible', 'has-image');
      nextBackground.style.backgroundImage = '';
      backgroundFadeTimer = undefined;
    }, 1_550);
  } catch (error) {
    if (objectUrl && objectUrl !== backgroundObjectUrl && objectUrl !== nextBackgroundObjectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  } finally { backgroundLoading = false; }
}

async function syncBackground() {
  try {
    const response = await fetch('/api/background/status', { cache: 'no-store' });
    const { background: available, slot } = response.ok ? await response.json() : {};
    const hasNewImage = Boolean(available?.generatedAt && available.generatedAt !== backgroundVersion);
    if (!backgroundVersion || hasNewImage || slot !== displayedBackgroundSlot) await loadBackground(hasNewImage, slot);
  } catch { /* The existing scene remains visible if the local server is restarting. */ }
}

async function loadHome() {
  const response = await fetch('/api/home');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Weather is unavailable.');
  document.querySelector('#weather-location').textContent = data.weather.location.toUpperCase();
  document.querySelector('#temperature').textContent = data.weather.temperature;
  const condition = document.querySelector('#condition');
  const isOvercast = data.weather.condition?.trim().toLowerCase() === 'overcast';
  condition.hidden = isOvercast;
  condition.textContent = isOvercast ? '' : data.weather.condition;
  document.querySelector('#weather-detail').textContent = `High ${data.weather.high}° · Low ${data.weather.low}° · Updated ${data.weather.updated}${data.weather.stale ? ' · Saved update' : ''}`;
  const weatherMetrics = [
    Number.isFinite(Number(data.weather.apparentTemperature)) ? `Feels like ${data.weather.apparentTemperature}°` : undefined,
    Number.isFinite(Number(data.weather.wind)) ? `Wind ${data.weather.wind} mph` : undefined,
    Number.isFinite(Number(data.weather.humidity)) ? `Humidity ${data.weather.humidity}%` : undefined
  ].filter(Boolean);
  document.querySelector('#weather-metrics').textContent = weatherMetrics.join(' · ');
  const forecastSlots = ['today', 'tomorrow', 'after'];
  forecastSlots.forEach((slot, index) => {
    const forecast = data.weather.forecast?.[index];
    document.querySelector(`#forecast-${slot}-condition`).textContent = forecast?.condition ?? 'Forecast unavailable';
    const precipitation = precipitationDisplay(forecast);
    document.querySelector(`#forecast-${slot}-detail`).innerHTML = forecast ? `${forecast.high}° / ${forecast.low}°${precipitation ? ` · ${precipitation}` : ''}` : '';
    const dailyExtras = [
      Number.isFinite(Number(forecast?.wind)) ? `Wind ${forecast.wind} mph` : undefined,
      Number.isFinite(Number(forecast?.uvIndex)) ? `UV ${forecast.uvIndex}` : undefined
    ].filter(Boolean);
    document.querySelector(`#forecast-${slot}-extra`).textContent = dailyExtras.join(' · ');
  });
  setWeatherVisual(data.weather.visual, data.weather.wind);
  const calendarWindowHours = data.settings.calendarWindowHours ?? 12;
  document.querySelector('#calendar-window-title').textContent = `Next ${calendarWindowHours} Hours`;
  const upcomingEvents = upcomingWithinHours(data.events, calendarWindowHours);
  renderCalendar(upcomingEvents.slice(0, 3));
  statusLabel.textContent = upcomingEvents.length ? `Next ${calendarWindowHours} hours` : `No events in the next ${calendarWindowHours} hours`;
}

function startHomeMotion() {
  const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('home-ready')));
  if (document.fonts?.ready) document.fonts.ready.then(settle, settle);
  else settle();
}

updateClock();
startHomeMotion();
loadHome().catch((error) => { statusLabel.textContent = error.message; });
syncBackground();
setInterval(() => { updateClock(); updateReminderIndicators(); }, 1_000);
setInterval(() => loadHome().catch(() => {}), 60_000);
setInterval(syncBackground, 60_000);
