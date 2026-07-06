# 4play (lolcat) Jenny prototype

Experimental rebuild of the lolcat 4play transport. It treats 4play as the browser
protocol layer and keeps session orchestration inside Degoog.

Goals:

- Use the official 4play Firefox extension as much as practical.
- Disable response-body WebSocket capture with `web_response_whitelist([])` by default and use
  `web_request` as the session/cookie signal.
- Optionally open a tab per fetch and allowlisted `web_response` base64 HTML capture instead of curl replay.
- Warm sessions like a person: open a real tab, focus the search field, type the
  query character-by-character, and submit via button/form interaction.
- Prefer clean warm sessions over CAPTCHA-solved/degraded sessions.
- Use curl-impersonate first, with plain curl only as a last fallback when no
  Firefox impersonation binary works.
- Keep FlareSolverr as an optional challenge fallback before manual/browser-tab escalation.
- Publish status/control data in the same cache shape the 4play status plugin can read.

This folder is intentionally standalone for review.
