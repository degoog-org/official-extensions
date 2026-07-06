# Credits

All credit to lolcat, creator of [4get](https://git.lolcat.ca/lolcat) and [4play](https://git.lolcat.ca/lolcat/4play). This transport speaks the official 4play protocol so the unmodified Firefox extension can connect directly to degoog.

If you want the version with curl-impersonate cookie harvesting, use the **degoog-fplay** transport instead.

# 4play (lolcat) - degoog transport

Routes searches through a real Firefox session using the official [4play](https://git.lolcat.ca/lolcat/4play) Firefox extension. Degoog runs the WebSocket server itself, you only need to install the extension and point it at degoog. No separate server required.

## How it works

1. The official 4play Firefox extension connects to degoog's WebSocket endpoint on the main port.
2. On first request per origin/container, degoog warms that origin in Firefox, tries a generic homepage search-box warmup, and captures the browser's real request headers/cookies.
3. Subsequent engine requests reuse the warmed browser session headers with curl/curl-impersonate when available, avoiding a visible result tab for every search. If curl is unavailable or no browser headers were captured, it falls back to the tab-backed 4play response path.

## Requirements

- Firefox with the 4play extension installed.
- **Firefox only** - the extension uses `browser.contextualIdentities` and `browser.scripting`, which are not available in Chrome builds.

## 1. Install the Firefox extension

Install the extension on a **clean Firefox profile** - not your main one, as it manages tabs and containers globally.

Clone the repository:

```bash
git clone https://git.lolcat.ca/lolcat/4play.git
```

- Open `about:debugging` -> This Firefox -> **Load Temporary Add-on** -> select `manifest.json` from `4play/extension/`.
- Click the extension icon in the toolbar.
- Find the exact WebSocket URL in **Settings -> Transports -> 4play (lolcat) -> Configure**. It is shown at the top of the settings panel. If you set a password, append it as a path segment. The WebSocket runs on degoog's main port, no separate port needed.
- The badge turns green when connected.

## 2. Configure in degoog

Settings -> Transports -> 4play (lolcat) -> Configure:

### Connection

- **Password** - appended as a path segment to the WebSocket URL shown above. Must match what you entered in the extension popup. Leave blank for no authentication.
- **Page load timeout** - how long to wait for a tab to load before giving up (default 30000 ms).
### Container isolation

- **Container isolation** - open requests in isolated Firefox containers. Enabled by default and also forced on when a proxy is configured.
- **Max container pool size** - maximum number of warm containers to keep available for concurrent requests.
- **Container TTL** - how long a warm container may be reused before it is recycled.

### Session warmup

- **Origin warmup query / TTL / blocked cooldown / settle delay** - control the automatic per-origin browser warmup described above.
- **Background warmup interval (hours)** - re-warms every origin the transport has already handled on a fixed schedule so sessions are ready before the next search (e.g. 72 = every 3 days). 0 (default) disables it. For an origin to stay continuously warm, set this at or below the warmup TTL; a larger value leaves a cold gap between refreshes.

### Fetch mode

The transport has three fetch behaviours, kept as three separate modules (`src/session-behaviour`, `src/html-parsing-behaviour`, `src/triggers`). Two settings pick between them:

- **HTML parsing mode (raw HTML from a browser tab)** - the master toggle. Off by default.
- **Firefox search triggers** - a per-engine list mapping a Firefox search engine to a Degoog engine id. A configured row is active for its engine (no per-row toggle). Each row has:
  - **Firefox engine name (or @keyword)** - the search engine's exact name as Firefox reports it, e.g. `Bing`, `Google`, `DuckDuckGo` (the `!4play` panel lists the exact names your Firefox exposes). Built-in engines usually have no `@` keyword unless you assign one under Firefox Settings -> Search, so the name is the reliable identifier.
  - **Engine id** - the Degoog engine id, matched exactly (e.g. `google-engine`, or a store engine id like `author-repo-engine`). This is what Degoog passes to the transport per request.

How the two combine:

| HTML parsing | Trigger for engine | Warmup | Result |
| --- | --- | --- | --- |
| off | no | normal homepage warmup | warmed session replayed with curl (battle-tested default) |
| off | yes | the trigger drives the warmup (real Firefox search) | warmed session replayed with curl |
| on | no | normal homepage warmup | raw base64 `web_response` body of the engine's own URL |
| on | yes | normal homepage warmup | the trigger's rendered results page (fixes JS-only engines like DuckDuckGo) |

  > Search triggers need the **degoog fork** of the 4play extension, which adds a `search_query` command (backed by `browser.search.search`), a `get_search_engines` command (used by `!4play` to list your engines), and the `"search"` permission. The stock 4play extension cannot drive Firefox's `@keyword`/named search: `tabs.create` never runs the address-bar keyword expansion, and no other WebExtension surface exposes it. Session mode and raw HTML mode (without triggers) work fine with the unmodified extension; only triggers require the fork.

### Proxy (optional)

- **Proxy type** - `none` (default), `socks5`, `socks4`, `http`, or `https`. Enabling any proxy type turns on container isolation automatically.
- **Proxy host** / **Proxy port** - proxy server address.
- **Proxy username** / **Proxy password** - optional credentials.
- **Proxy DNS** - route DNS through the proxy (recommended for SOCKS to avoid leaks).

Then, in Settings -> Engines -> Configure -> Advanced, pick `lolcat-4play` as the outgoing transport. Point the extension at the WebSocket URL shown in the transport settings, substituting your Docker host IP for the hostname.

## Behaviour and limits

- **Firefox only** - use degoog-fplay for Chrome/Edge/Brave support.
- **One browser connection** - a single Firefox instance connects. Parallel origin warmups may open tabs concurrently.
- **Warm containers** - isolated containers are reused up to the configured pool size and recycled when settings change or their TTL expires.
- **Tabs are visible during warmup/fallback** - normal searches use warmed browser headers with curl when available; tabs only flicker for initial warmup, session refresh, block retry, or fallback.
- **Session state is native** - cookies persist across tabs within the same profile. Container isolation keeps parallel requests separated.
- **Clean profile recommended** - dedicated Firefox profile, no personal data, no interfering extensions.
- **Response-body streaming is off by default** - the transport tells the extension not to stream every web response body over the WebSocket (dead bandwidth); page HTML is normally fetched via warmed curl sessions or tab injection. It is turned on only for the duration of a raw-HTML fetch (HTML parsing mode without a trigger), then turned back off. Trigger fetches read the rendered DOM by injection and never stream response bodies.
- **Sessions survive restarts with Valkey** - warmed cookies, headers, and the tracked origin list are persisted through the app cache. With `DEGOOG_VALKEY_URL` set, a restarted degoog rehydrates every warmed session on the transport's first fetch instead of re-warming. Without Valkey the cache is in-memory and resets on restart.
- **Status and controls** - install the companion **4play status** plugin and type `!4play` to see live session/container status and clear warmed sessions (admin gated).

## Privacy and trust

- The Firefox instance contacts external sites during origin warmup and fallback tab fetches. Normal warmed curl searches contact external sites from the Degoog host, using the configured transport proxy when one is set.
- The WebSocket between degoog and the extension is unencrypted (`ws://`). On a LAN, set a password and treat the port accordingly.
