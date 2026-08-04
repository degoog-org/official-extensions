# 4play (lolcat)

Routes selected Degoog engines through a real Firefox session using lolcat's official [4play](https://git.lolcat.ca/lolcat/4play) extension.

Degoog speaks the 4play protocol itself. You still install the Firefox extension, but you do **not** run lolcat's sample Node `page-render.js` server for Degoog.

Full user docs: [Degoog 4play guide](https://degoog-org.github.io/docs/tips-and-tricks.html#4play)  
Official developer notes: [4play setup](https://git.lolcat.ca/lolcat/4get/src/branch/master/docs/configure.md#4play-setup)

## Setup

1. Install **4play (lolcat)** from the Degoog Store.
2. Run Firefox ESR or current Firefox on a real desktop session.
3. Use a real screen, powered monitor, firefox in a docker container, laptop display, or EDID adapter. Avoid headless/software-rendered Firefox (for now at least).
4. Install the [official 4play Firefox extension](https://addons.mozilla.org/en-US/firefox/addon/4play/) in a clean profile.
5. Allow private windows and automatic updates for the extension.
6. In Degoog, open `Settings -> Transports -> 4play (lolcat) -> Configure`.
7. Set a strong password and copy the WebSocket path from that panel.
8. Put the Degoog WebSocket URL and password into the Firefox extension (the transport config page will show it to you).
9. The dot should soon turn green.
10. Pick **4play (lolcat)** as the outgoing HTTP client for engines that need it.

For the official Store install, the WebSocket path is normally:

```text
/ws/degoog-org-official-extensions-lolcat-4play-transport
```

Copy the path shown in your own Degoog settings. Renamed or third-party installs can differ.

## What it does

- Opens warmup tabs in Firefox for search origins.
- Captures Firefox's real outgoing headers and cookies.
- Reuses the primed session with curl/curl-impersonate when possible.
- Keeps CAPTCHA/manual-attention tabs open when needed.
- Can keep state across Degoog restarts if `DEGOOG_VALKEY_URL` is configured.

## Useful settings

- **Container isolation:** keeps browser state split per origin. Usually leave this on.
- **Max containers:** how many origins can stay ready at once.
- **Container TTL:** how long Firefox containers live before recycling.
- **Origin warmup query:** harmless query used before replaying the real user query.
- **Background warmup:** re-warms origins that already used 4play. It does not warm every engine blindly.
- **Proxy settings:** attached per Firefox container so warmup and replay use the same route.

## Status plugin

Install **4play status** and run:

```text
!4play
```

It shows Firefox connection, primed sessions, alive containers, CAPTCHA tabs, and background warmup state. It can also test the transport or clear sessions. Admin-only by default.

## Privacy trade-off

**4play is VERY powerful, but configuring it properly is crucial to stay private.** Firefox talks to engines during warmup, and Degoog gets the cookies and
headers it needs to reuse that browser session. That is the trade: better scraping, more trust placed in your own setup. Keep the WebSocket private,
set a password, and proxy it properly if Firefox is not on the same box. If privacy is the goal, put both Firefox and Degoog's outgoing requests behind
proxies or a VPN you trust. Otherwise you are mostly making scraping work better, not making it more private.
