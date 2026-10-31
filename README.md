# Home Chime

Home Chime is a local, Raspberry Pi-friendly family calendar display. It uses a large clock, current and next-day Open-Meteo weather, an always-visible consolidated family schedule, and spoken calendar reminders.

## Run locally

Requires Node.js 22 or later.

```powershell
node --env-file=.env server.mjs
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

## Raspberry Pi deployment

Home Chime requires Node.js 22 or later. Keep the `.env` file only on the Pi; it contains your admin password and any API keys and is intentionally excluded from Git.

### Install the app on the Pi

```bash
cd ~
git clone https://github.com/shzolly/home-chime.git
cd home-chime
npm install
cp .env.example .env
nano .env
chmod 600 .env
```

Enter `HOME_CHIME_ADMIN_PASSWORD` in `.env`, plus `OPENAI_API_KEY` if you want generated backgrounds. Save Nano with `Ctrl+O`, press `Enter`, then exit with `Ctrl+X`.

### Run manually in a terminal

Use this for a first test or when you are making changes:

```bash
cd ~/home-chime
npm test
node --env-file=.env server.mjs
```

Open `http://localhost:4173` on the Pi. To manage Home Chime from another device on the same home network, find the Pi address with `hostname -I` and open `http://<pi-address>:4173/admin`.

Stop a manual run with `Ctrl+C`.

### Run automatically as a service

Create the service definition:

```bash
sudo nano /etc/systemd/system/home-chime.service
```

Paste the following. If your Pi user or project directory is different, replace `pi` and `/home/pi/home-chime` with the correct values. The Node.js path below is correct for a standard NodeSource installation; confirm it with `which node` if needed.

```ini
[Unit]
Description=Home Chime Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/home-chime
EnvironmentFile=/home/pi/home-chime/.env
ExecStart=/usr/bin/node /home/pi/home-chime/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save with `Ctrl+O`, press `Enter`, then exit with `Ctrl+X`. Enable the service and start it immediately:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now home-chime
sudo systemctl status home-chime
```

`active (running)` confirms it is working. Home Chime will now start automatically whenever the Pi starts.

Useful service commands:

```bash
sudo systemctl restart home-chime
sudo systemctl stop home-chime
sudo systemctl status home-chime
journalctl -u home-chime -f
```

### Deploy a later update

```bash
cd ~/home-chime
git pull
npm install
sudo systemctl restart home-chime
```

For the dedicated monitor, configure Chromium kiosk mode to open `http://localhost:4173` after desktop auto-login.
