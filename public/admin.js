const loginView = document.querySelector('#login-view');
const setupView = document.querySelector('#setup-view');
const adminView = document.querySelector('#admin-view');
const loginMessage = document.querySelector('#login-message');
const familyList = document.querySelector('#family-list');
const eventList = document.querySelector('#event-list');
const calendarMember = document.querySelector('#calendar-member');
const eventForm = document.querySelector('#event-form');
let allEvents = [];
let editingEventId;
let editingMemberId;

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...(options.headers ?? {}) }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Something went wrong.');
  return body;
}

function setView(view) {
  loginView.classList.toggle('hidden', view !== 'login');
  setupView.classList.toggle('hidden', view !== 'setup');
  adminView.classList.toggle('hidden', view !== 'admin');
}

function renderFamily(members) {
  familyList.replaceChildren(...members.map((member) => {
    const item = document.createElement('li');
    item.innerHTML = `<span class="member-color" style="--member-color:${member.color}" aria-hidden="true"></span><strong></strong><small></small><button class="text-button member-edit" type="button">Edit</button>`;
    item.querySelector('strong').textContent = member.name;
    item.querySelector('small').textContent = member.birthday ? `Birthday · ${member.birthday}` : 'Birthday not set';
    item.querySelector('.member-edit').addEventListener('click', () => beginMemberEdit(member));
    return item;
  }));
  if (!members.length) familyList.innerHTML = '<li class="empty">Add the first person who uses Home Chime.</li>';
  const selectedMember = calendarMember.value;
  calendarMember.replaceChildren(new Option('All family members', ''));
  members.filter((member) => member.active).forEach((member) => calendarMember.add(new Option(member.name, String(member.id))));
  calendarMember.value = selectedMember;
  setEventFormEnabled();
}

function resetMemberForm() {
  editingMemberId = undefined;
  document.querySelector('#member-name').value = '';
  document.querySelector('#member-birthday').value = '';
  document.querySelector('#member-color').value = '#4f7cac';
  document.querySelector('#family-submit').textContent = 'Add';
  document.querySelector('#family-cancel').classList.add('hidden');
}

function beginMemberEdit(member) {
  editingMemberId = member.id;
  document.querySelector('#member-name').value = member.name;
  document.querySelector('#member-birthday').value = member.birthday ?? '';
  document.querySelector('#member-color').value = member.color;
  document.querySelector('#family-submit').textContent = 'Save';
  document.querySelector('#family-cancel').classList.remove('hidden');
  document.querySelector('#member-name').focus();
}

function setEventFormEnabled() {
  const enabled = Boolean(calendarMember.value);
  eventForm.querySelectorAll('input, select, button').forEach((element) => { element.disabled = !enabled; });
  eventForm.classList.toggle('is-disabled', !enabled);
}

function renderEvents(events) {
  eventList.replaceChildren(...events.map((event) => {
    const item = document.createElement('li');
    const details = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('small');
    const remove = document.createElement('button');
    const startsAt = new Date(event.startsAt);
    const endsAt = event.endsAt ? new Date(event.endsAt) : new Date(startsAt.getTime() + 60 * 60_000);
    title.textContent = event.title;
    const recurrence = event.recurrence === 'weekly' ? ' · repeats weekly' : '';
    const initialTravel = event.initialDriveMinutes ? ` · initial drive ${event.initialDriveMinutes} min${event.initialNormalMinutes ? ` (normal ${event.initialNormalMinutes})` : ''}` : '';
    const latestTravel = event.latestDriveMinutes && event.latestDriveMinutes !== event.initialDriveMinutes ? ` · latest traffic ${event.latestDriveMinutes} min` : '';
    const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
    meta.textContent = `${event.memberName ?? 'Family'} · ${event.location} · ${dateTime.format(startsAt)}–${timeOnly.format(endsAt)} · alerts ${event.reminderMinutes} min before for 10 min${recurrence}${initialTravel}${latestTravel}`;
    remove.type = 'button';
    remove.className = 'text-button event-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${event.title}?`)) return;
      try {
        await request(`/api/admin/events/${event.id}`, { method: 'DELETE' });
        await loadEvents();
      } catch (error) { document.querySelector('#event-message').textContent = error.message; }
    });
    details.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'event-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button event-edit';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => beginEdit(event));
    actions.append(edit);
    if (event.location.trim().toLowerCase() !== 'home') {
      const traffic = document.createElement('button');
      traffic.type = 'button';
      traffic.className = 'text-button event-traffic';
      traffic.textContent = 'Refresh traffic';
      traffic.addEventListener('click', async () => {
        traffic.disabled = true;
        traffic.textContent = 'Checking traffic…';
        try {
          const result = await request(`/api/admin/events/${event.id}/travel`, { method: 'POST' });
          traffic.textContent = `Leave ${result.leaveMinutesBefore} min early`;
          const message = document.querySelector('#event-message');
          message.textContent = `Current traffic: about ${result.durationMinutes} minutes. The alert will start ${result.leaveMinutesBefore} minutes before ${event.title}.`;
          await loadEvents();
        } catch (error) {
          traffic.disabled = false;
          traffic.textContent = 'Check drive time';
          document.querySelector('#event-message').textContent = error.message;
        }
      });
      actions.append(traffic);
    }
    actions.append(remove);
    item.append(details, actions);
    return item;
  }));
  if (!events.length) eventList.innerHTML = `<li class="empty">${calendarMember.value ? 'No scheduled events for this family member.' : 'No scheduled events for the family yet.'}</li>`;
}

async function loadEvents() {
  const { events } = await request('/api/admin/events');
  allEvents = events;
  renderEvents(calendarMember.value ? events.filter((event) => String(event.familyMemberId) === calendarMember.value) : events);
}

async function loadAdmin() {
  const [{ members }, { settings }, { events }] = await Promise.all([request('/api/admin/family'), request('/api/admin/settings'), request('/api/admin/events')]);
  renderFamily(members);
  allEvents = events;
  renderEvents(events);
  document.querySelector('#weather-refresh').value = String(settings.weatherRefreshMinutes);
  document.querySelector('#calendar-window').value = String(settings.calendarWindowHours);
  document.querySelector('#background-refresh').value = String(settings.backgroundRefreshMinutes);
  document.querySelector('#home-address').value = settings.homeAddress;
  document.querySelector('#travel-buffer').value = String(settings.travelBufferMinutes);
  setView('admin');
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';
  try {
    await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: document.querySelector('#password').value }) });
    document.querySelector('#password').value = '';
    await loadAdmin();
  } catch (error) { loginMessage.textContent = error.message; }
});

document.querySelector('#family-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#family-message');
  try {
    const isEditing = Boolean(editingMemberId);
    const { member } = await request(isEditing ? `/api/admin/family/${editingMemberId}` : '/api/admin/family', { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify({ name: document.querySelector('#member-name').value, birthday: document.querySelector('#member-birthday').value, color: document.querySelector('#member-color').value }) });
    message.textContent = `${member.name} was ${isEditing ? 'updated' : 'added'}.`;
    resetMemberForm();
    const { members } = await request('/api/admin/family');
    renderFamily(members);
  } catch (error) { message.textContent = error.message; }
});

document.querySelector('#family-cancel').addEventListener('click', resetMemberForm);

function eventFormPayload() {
  const date = document.querySelector('#event-date').value;
  const time = document.querySelector('#event-time').value;
  const endTime = document.querySelector('#event-end-time').value;
  if (!calendarMember.value) throw new Error('Select a family member before saving an event.');
  if (!date || !time || !endTime) throw new Error('Choose a date, start time, and end time.');
  const startsAt = new Date(`${date}T${time}`);
  const endsAt = new Date(`${date}T${endTime}`);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('End time must be after the start time.');
  return {
    title: document.querySelector('#event-title').value,
    familyMemberId: Number(calendarMember.value),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    location: document.querySelector('#event-location').value,
    recurrence: document.querySelector('#event-weekly').checked ? 'weekly' : 'none'
  };
}

function resetEventForm() {
  editingEventId = undefined;
  eventForm.reset();
  const localNow = new Date();
  document.querySelector('#event-date').value = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
  document.querySelector('#event-time').value = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}`;
  const defaultEnd = new Date(localNow.getTime() + 60 * 60_000);
  document.querySelector('#event-end-time').value = `${String(defaultEnd.getHours()).padStart(2, '0')}:${String(defaultEnd.getMinutes()).padStart(2, '0')}`;
  document.querySelector('#event-location').value = 'Home';
  document.querySelector('#event-submit').textContent = 'Add event';
  document.querySelector('#event-cancel').classList.add('hidden');
}

function beginEdit(event) {
  editingEventId = event.id;
  calendarMember.value = String(event.familyMemberId);
  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : new Date(startsAt.getTime() + 60 * 60_000);
  const localDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(startsAt);
  const localTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(startsAt);
  document.querySelector('#event-title').value = event.title;
  document.querySelector('#event-date').value = localDate;
  document.querySelector('#event-time').value = localTime;
  document.querySelector('#event-end-time').value = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(endsAt);
  document.querySelector('#event-location').value = event.location;
  document.querySelector('#event-weekly').checked = event.recurrence === 'weekly';
  document.querySelector('#event-submit').textContent = 'Save changes';
  document.querySelector('#event-cancel').classList.remove('hidden');
  setEventFormEnabled();
  renderEvents(allEvents.filter((candidate) => String(candidate.familyMemberId) === calendarMember.value));
  document.querySelector('#event-title').focus();
}

document.querySelector('#event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#event-message');
  message.textContent = '';
  try {
    const isEditing = Boolean(editingEventId);
    const result = await request(isEditing ? `/api/admin/events/${editingEventId}` : '/api/admin/events', { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(eventFormPayload()) });
    const saved = result.event;
    const trafficMessage = result.travel?.atHome ? ' Alerts use the household buffer.' : result.travel?.error ? ` Saved with the household buffer only: ${result.travel.error}` : result.travel ? ` Initial traffic is ${result.travel.durationMinutes} minutes; alert starts ${result.travel.leaveMinutesBefore} minutes before.` : '';
    message.textContent = `${saved.title} was ${isEditing ? 'updated' : 'added'}.${trafficMessage}`;
    resetEventForm();
    await loadEvents();
  } catch (error) { message.textContent = error.message; }
});

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#settings-message');
  try {
    await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ weatherRefreshMinutes: Number(document.querySelector('#weather-refresh').value), calendarWindowHours: Number(document.querySelector('#calendar-window').value), backgroundRefreshMinutes: Number(document.querySelector('#background-refresh').value), homeAddress: document.querySelector('#home-address').value, travelBufferMinutes: Number(document.querySelector('#travel-buffer').value) }) });
    message.textContent = 'Dashboard settings saved.';
  } catch (error) { message.textContent = error.message; }
});

document.querySelector('#logout').addEventListener('click', async () => {
  await request('/api/admin/logout', { method: 'POST' });
  setView('login');
});

calendarMember.addEventListener('change', () => {
  setEventFormEnabled();
  if (editingEventId && !calendarMember.value) resetEventForm();
  renderEvents(calendarMember.value ? allEvents.filter((event) => String(event.familyMemberId) === calendarMember.value) : allEvents);
});

document.querySelector('#event-cancel').addEventListener('click', () => {
  resetEventForm();
  renderEvents(calendarMember.value ? allEvents.filter((event) => String(event.familyMemberId) === calendarMember.value) : allEvents);
});

async function boot() {
  const session = await request('/api/admin/session');
  if (!session.configured) return setView('setup');
  if (session.authenticated) return loadAdmin();
  setView('login');
}

const localNow = new Date();
document.querySelector('#event-date').value = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
document.querySelector('#event-time').value = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}`;
const initialEnd = new Date(localNow.getTime() + 60 * 60_000);
document.querySelector('#event-end-time').value = `${String(initialEnd.getHours()).padStart(2, '0')}:${String(initialEnd.getMinutes()).padStart(2, '0')}`;

boot().catch((error) => { loginMessage.textContent = error.message; setView('login'); });
