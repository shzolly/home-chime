# Home Chime

Home Chime is a local, Raspberry Pi-friendly family calendar display. It uses a large clock, current and next-day Open-Meteo weather, an always-visible consolidated family schedule, and spoken calendar reminders.

## Run locally

Requires Node.js 22 or later.

```powershell
npm start
```

Open `http://localhost:4173`. Set `PORT` if the Pi needs a different local port.

## Admin at home

Set `HOME_CHIME_ADMIN_PASSWORD` before starting. Then open `http://<pi-address>:4173/admin` from a device on the home network. The admin console stores family members, calendar events, locations, weekly recurrence, and reminder lead times in `data/home-chime.sqlite`.

## Weather and reminders

Weather comes directly from [Open-Meteo](https://open-meteo.com/) for Princeton Junction, NJ (ZIP 08550). It refreshes every ten minutes and retains the last successful result during a brief provider outage. No weather API key or MCP service is required.

The dashboard refreshes the schedule every minute. Reminder checks run every 30 seconds and use the browser's text-to-speech voice as a development placeholder.

## Hourly generated background

If `OPENAI_API_KEY` is present, Home Chime requests one low-quality WebP image from the OpenAI Images API when the dashboard needs a new hourly background. The prompt blends the local time, current Open-Meteo conditions, a rotating color direction, major U.S. and Chinese holidays, and any birthday saved in Admin. The display adds a subtle browser animation over the generated scene; the Images API itself returns a static WebP rather than a GIF. It keeps the image at `data/dashboard-background.webp` and will reuse it until an hour has passed. The API key never reaches the browser.

In Admin, add a birthday as `MM-DD` for each family member. The year is intentionally not stored; birthdays only influence the celebratory dashboard atmosphere.

Optional settings:

```ini
OPENAI_API_KEY=your-api-key
HOME_CHIME_BACKGROUND_MODEL=gpt-image-2.5-flare
HOME_CHIME_BACKGROUND_REFRESH_MINUTES=60
```

If image generation is unavailable, the dashboard continues with its built-in gradient background.

## Pi deployment direction

Run `node server.mjs` as a `systemd` service on the Pi's local network, and configure Chromium kiosk mode to open `http://localhost:4173`.
