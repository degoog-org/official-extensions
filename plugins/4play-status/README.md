# 4play status

Type `!4play` or `!fourplay` to see a live status card for the lolcat 4play transport. It shows the connection state, warmed sessions with time left until they expire, which proxy each session uses, blocked origins with their cooldowns, how many containers are in use, open captcha tabs, how replays are sent and the background warmup schedule.

By default only admins see the card. Anyone can run the bang, but the status and clear controls only unlock for users logged into the settings panel. The plugin settings let you change that. Keep `admin`, use `open` on a trusted local instance, or use `locked` to turn the status API off on a public one.

## What's on the card

- **Sessions** with their container, age and expiry. Each one is tagged with the route it uses: a proxy from Degoog's proxy list (by its position, host and port, never the credentials), 4play's own proxy, or direct.
- **Benched** shows up on a session when Degoog took that proxy off the site after a captcha, block or rate limit. **Stale** means the proxy got flagged after the session was warmed, so the next search starts a fresh one.
- **Proxies** lists Degoog's proxies and the sites each one is benched on, with the time left.
- **Replays** says how 4play sends the requests that follow a warmup. `library` uses libcurl-impersonate and keeps connections open per proxy. `binary` starts a curl process per request. `browser only` means no curl was found.

The card updates live while it's open. If the live stream drops, it refreshes every 10 seconds and keeps trying to reconnect.

## Controls

- **Refresh** reads the latest status again.
- **Test 4play** fetches `https://example.com` through the selected transport and shows the result on the card. It also wakes up a transport that hasn't served a fetch yet.
- **Clear all** deletes every warmed session and cookie jar and retires the pooled containers.
- The **x** on a row clears just that session.
- **Dismiss** drops one captcha flag, **Dismiss all** drops every one.

Clears go through a control channel. The card waits for 4play to confirm and shows the result, or tells you if 4play didn't answer within 10 seconds.

## Transport detection

4play transports announce themselves the first time they fetch something, and the "4play transport" setting lists whatever has announced itself. Leave it on the first entry unless you run more than one.

The app only gives a transport its cache handle on the transport's first fetch. After a restart the card says no transport has announced itself until a search goes through 4play.

## Requirements

- The lolcat 4play transport, installed and connected.
- For sessions that are always ready, set the transport's "Background warmup interval".
- The proxy tags and the proxies list need a Degoog version that gives plugins `ctx.proxies`. Older versions show the card without them.

## Settings

- **Status view access.** `admin` needs a valid settings session. `open` skips the session check, so anyone who can run the bang can view and clear 4play status. `locked` turns the status API off for everyone.
- **4play transport.** The 4play transports that have announced themselves.
- **Firefox browser link.** A URL that opens the Firefox running the 4play extension. With it set, the card shows an "Open Firefox" button and a link on every captcha that needs you.
