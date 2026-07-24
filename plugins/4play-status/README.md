# 4play status

Type `!4play` (or `!fourplay`) to see a live status card for the lolcat 4play transport: connection state, warmed sessions with expiry countdowns, blocked origins with cooldowns, container pool usage, open captcha tabs, and the background warmup schedule.

By default the card is admin gated. Anyone can run the bang, but the status and clear controls only unlock for users logged into the settings/admin panel. You can change this in the plugin settings: keep `admin`, set `open` for a trusted local instance, or set `locked` to disable the status API entirely on a public instance.

## Controls

- Refresh: re-reads the latest status snapshot.
- Test 4play: fetches `https://example.com` through the selected transport and reports the result on the card. Also useful to bootstrap a transport that has not served a fetch yet.
- Clear all sessions: wipes every warmed session and cookie jar and retires pooled containers.
- Per-session clear: the x on a row wipes just that origin/container session.

Clears are queued through a control channel and picked up by the transport within a few seconds; the card refreshes itself after the request settles.

## Transport detection

The "4play transport" setting is a dropdown of every transport currently installed, so you never type a name. The list comes from `/api/extensions?type=transports` whenever the card loads, and is cached so it survives restarts; before the card has ever run it falls back to scanning the transports folder next to this plugin.

It pre-selects the first installed transport whose name mentions 4play, which is the right one on a normal install including forks. Pick a different entry if you run a third-party 4play transport or renamed yours to something that does not mention 4play.

The app only hands a transport its cache handle on the transport's first fetch, so a freshly (re)started app shows "asleep" until a search runs through the transport. Use "Test 4play" to bootstrap it.

## Requirements

- The lolcat 4play transport installed and connected.
- For always-ready sessions, set the transport's "Background warmup interval" setting.

## Settings

- Status view access: `admin` requires a valid settings/admin session, `open` skips session checks and lets anyone who can run the bang view and clear 4play status, and `locked` disables the status API for everyone.
- 4play transport: dropdown of the installed transports, pre-selecting the first one whose name mentions 4play.
- Firefox browser link: URL that opens the Firefox instance running the 4play extension. When set, the card shows an "Open Firefox" button and a jump link on every captcha that needs attention.
