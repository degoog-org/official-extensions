# Credits

First and foremost, credits where credits is due. This idea came from the lovely lolcat, creator of [4get](https://git.lolcat.ca/lolcat). After a nice chat in the degoog discord server I decided it was worth creating a transport for it.

# How to - Fplay for degoog

Uses a browser extension to harvest a genuine session for each target host, then passes those cookies to curl-impersonate for outgoing requests. The browser only runs **warmup loads** when a cached session is missing or stale.

Sessions are cached for **5 hours** before the extension may be asked to refresh them.

## How it works

1. On first request to a host (or after TTL), Degoog’s 4play transport asks the extension over WebSocket to open that host’s **origin** in a background tab.
2. The extension waits for the load to finish, reads cookies with `chrome.cookies`, then closes the tab.
3. curl-impersonate performs the real HTTP request using those cookies (and its own TLS/UA profile unless you change transport settings below).

## Requirements

- A browser with **WebExtensions** support and the **Fplay extension** loaded and connected to your Degoog instance.
- **curl-impersonate** on `PATH` is optional but recommended. If it is not found, 4play falls back to the system `curl` binary. Most requests will still work; the only practical difference is that TLS fingerprinting checks (used by a small number of sites) may fail without the impersonated profile. Google Images requires curl-impersonate and will return no results without it.

## Browser support

- **Supported**: Chrome, Edge, Brave (Chromium), Firefox
- **Not supported**: Safari (and browsers without WebExtensions `cookies` / `tabs` support)

## curl-impersonate setup (optional)

4play uses [curl-impersonate](https://github.com/lexiforest/curl-impersonate) under the hood. It’s a patched build of curl that mimics Firefox’s TLS fingerprint; some endpoints block requests by TLS fingerprint rather than headers/cookies.

### Without Docker (macOS)

```bash
brew tap shakacode/brew
brew install curl-impersonate
```

### Without Docker (Linux)

Download a release binary for your architecture and put it in your `PATH`:

```bash
curl -fsSL https://github.com/lexiforest/curl-impersonate/releases/download/v1.2.2/curl-impersonate-v1.2.2.x86_64-linux-gnu.tar.gz \
  | tar -xz -C /usr/local/bin curl_firefox133
chmod +x /usr/local/bin/curl_firefox133
```

### With Docker

The Degoog image is Alpine-based. The curl-impersonate binaries are bash wrapper scripts, so bash must be installed first. The `-linux-musl` release is required for Alpine's libc.

```yaml
services:
  degoog:
    image: ghcr.io/degoog-org/degoog:latest
    entrypoint: >
      sh -c "apk add --no-cache bash && curl -fsSL https://github.com/lexiforest/curl-impersonate/releases/download/v1.2.2/curl-impersonate-v1.2.2.x86_64-linux-musl.tar.gz
      | tar -xz -C /usr/local/bin || true && exec /entrypoint.sh"
    volumes:
      - ./data:/app/data
    ports:
      - "4444:4444"
      - "3031:3031"
    restart: unless-stopped
```

> **Important:** The 4play WebSocket port (`3031` by default) must be explicitly exported alongside Degoog's main port. Without it, the browser extension cannot reach the server and sessions will never be established.

## Extension setup

### Install

Load the `extension/` folder as an unpacked extension:

**Chrome / Edge**

- Open `chrome://extensions`
- Enable **Developer mode**
- **Load unpacked** -> choose `extension/`

**Firefox**

- `about:debugging` -> This Firefox -> **Load Temporary Add-on** -> select `manifest.json`

### Configure (required)

Open the extension’s **toolbar popup** (click the icon):

- **Server URL** — WebSocket endpoint for 4play (e.g. `ws://127.0.0.1:3031` or `192.168.x.x:3031`). You may omit the scheme; `ws://` is assumed. Use `wss://` only if you terminate TLS in front of the socket.
- **Password** — Must match the optional password in Degoog’s 4play transport settings (leave empty if the server has no password).

Settings are stored in the extension only (`chrome.storage.local`). There are no hardcoded URLs in `background.js`.

### Degoog transport settings

**Settings -> Transports -> Fplay -> Configure**

- **WebSocket port** — Listen port (default `3031`). Must match the host/port you entered in the extension.
- **Password** — Optional; must match the extension if set.
- **Strip engine cookies** (default **on**) — Ignores `Cookie` headers from search engines so only the browser session (and curl’s jar logic) apply. Turn **off** only if you intentionally need an engine-injected cookie line as well (can conflict with session cookies).
- **Strip engine user agents** (default **on**) — Drops engine `User-Agent` headers so curl-impersonate’s profile is used. Turn **off** only if you need to forward a custom UA from an engine.

### Using 4play for searches

**Settings -> Engines ->** each engine **-> Advanced -> Outgoing transport:** `4play`

Keep the browser running with the extension connected (popup shows **Connected** when the WebSocket is up).

## Behaviour and limits

- **One browser connection** — A single extension instance connects to the 4play WebSocket. Multiple enabled engines still share that transport; parallel queries may trigger several warmups for **different** hosts at once.
- **Warmup URL** — Today the transport warms **`https://hostname/`** (site root), not the full search URL. Sites that only set cookies on a specific path may need future transport changes.
- **Concurrent same host** — Two engines hitting the same host before the first session is cached might warm that host twice in parallel (usually harmless).

## Operational notes

- Some sites behave badly without a normal display environment (e.g. suggestions about **EDID / headless** setups apply the same as for any “real browser” automation).

## Privacy and trust (read this)

- **What the extension does:** It opens only the URLs Degoog requests for session harvest and sends **cookie payloads** for those origins to **your** Degoog process over the configured WebSocket. It does not upload your general browsing history to a third-party service by itself.
- **Who receives data:** The machine running Degoog receives those cookies so curl can replay them. Treat that server like any other privileged component on your network.
- **WebSocket exposure:** Binding 4play to **localhost** keeps traffic on one machine. If you use a **LAN IP**, anyone who can reach that port could attempt to connect — use the **transport password** in that case. Plain **`ws://` is not encrypted on the wire**; treat the network accordingly.
- **Compared to transports without a browser:** You deliberately trade “server-only HTTP” for **real browser-issued cookies**, which improves compatibility but increases what your Degoog instance can derive from those sessions.
