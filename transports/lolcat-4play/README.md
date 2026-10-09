# 4play (lolcat)

Sends the Degoog engines you pick through a real Firefox session, using lolcat's official [4play](https://git.lolcat.ca/lolcat/4play) extension.

Degoog speaks the 4play protocol itself. You still install the Firefox extension, but you don't run lolcat's sample Node `page-render.js` server.

Full user docs: [Degoog 4play guide](https://degoog-org.github.io/docs/tips-and-tricks.html#4play)  
Official developer notes: [4play setup](https://git.lolcat.ca/lolcat/4get/src/branch/master/docs/configure.md#4play-setup)

## Setup

1. Install **4play (lolcat)** from the Degoog Store.
2. Run Firefox ESR or current Firefox on a real desktop session.
3. Give it a real display: a powered monitor, a laptop screen, an EDID adapter, or Firefox in a Docker container. Headless or software-rendered Firefox doesn't work well yet.
4. Install the [official 4play Firefox extension](https://addons.mozilla.org/en-US/firefox/addon/4play/) in a clean profile.
5. Allow the extension in private windows and turn on its automatic updates.
6. In Degoog, open `Settings -> Transports -> 4play (lolcat) -> Configure`.
7. Set a strong password and copy the WebSocket path from that panel.
8. Enter the Degoog WebSocket URL and password in the Firefox extension. The transport's settings page shows the URL.
9. Wait for the dot to turn green.
10. Pick **4play (lolcat)** as the outgoing HTTP client for the engines that need it.

For the official Store install, the WebSocket path is usually:

```text
/ws/degoog-org-official-extensions-lolcat-4play-transport
```

Copy the path from your own Degoog settings, since renamed or third-party installs can use a different one.

## What it does

- Opens warmup tabs in Firefox for each search origin.
- Copies the headers and cookies Firefox really sends.
- Replays requests with that session through curl or curl-impersonate when it can.
- Keeps one engine search in the same container from the first request to the last, so follow-ups like Google's result link lookups carry the same cookies.
- Leaves tabs open when a CAPTCHA needs you.
- Keeps its state across Degoog restarts if `DEGOOG_VALKEY_URL` is set.

## Settings worth knowing

- **Container isolation** keeps each origin's browser state separate. Leave it on.
- **Max containers** is how many origins can stay ready at once.
- **Container TTL** is how long a Firefox container lives before it gets recycled.
- **Origin warmup query** is the harmless search typed in before the real one.
- **Background warmup** re-warms only the origins that have already used 4play, not every engine.
- **Proxy settings** apply per Firefox container, so warmup and the real request take the same route.

## Status plugin

Install **4play status** and run:

```text
!4play
```

It shows the Firefox connection, primed sessions, live containers, CAPTCHA tabs and background warmup. It can also test the transport or clear sessions. Only admins can use it by default.

## Privacy trade-off

4play works well, but it only stays private if you set it up carefully. Firefox talks to the engines during warmup, and Degoog takes the cookies and headers it needs to reuse that session. You get better scraping in exchange for trusting your own setup more. Keep the WebSocket private, set a password, and put it behind a proper proxy if Firefox runs on another machine. If privacy is the goal, route both Firefox and Degoog's outgoing requests through proxies or a VPN you trust. Without that, 4play makes scraping work better but doesn't make it more private.
