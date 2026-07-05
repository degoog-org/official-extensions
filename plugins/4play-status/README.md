# 4play status

Type `!4play` (or `!fourplay`) to see a live status card for the lolcat 4play transport: connection state, warmed sessions with expiry countdowns, blocked origins with cooldowns, container pool usage, open captcha tabs, and the background warmup schedule.

The card is admin gated. Anyone can run the bang, but the status and clear controls only unlock for users logged into the settings/admin panel.

## Controls

- Refresh: re-reads the latest status snapshot.
- Clear all sessions: wipes every warmed session and cookie jar and retires pooled containers.
- Per-session clear: the x on a row wipes just that origin/container session.

Clears are queued through a control channel and picked up by the transport within a few seconds; the card refreshes itself after the request settles.

## Transport detection

The plugin auto-detects the installed 4play transport at request time by asking the app for its transport list and probing each candidate's status channel, so it works whatever folder name the transport was installed under.

The app only hands a transport its cache handle on the transport's first fetch, so a freshly (re)started app shows "asleep" until a search runs through the transport. The card offers a "Wake transport" button that triggers one test fetch to bootstrap it.

## Requirements

- The lolcat 4play transport installed and connected.
- For always-ready sessions, set the transport's "Background warmup interval" setting.

## Settings

- Transport name override: leave blank for auto-detection. Only set it if you run multiple 4play transports and want to pin one (use the runtime name shown at the bottom of the status card).
