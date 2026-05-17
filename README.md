# Official degoog extensions

---

<details>
<summary>Plugins</summary>

### Weather

Shows weather information using Open-Meteo. Command plugin: run it to get current conditions for a location.

<details>
<summary>Screenshot</summary>

![Weather](plugins/weather/screenshots/1.png)

</details>

### Define

Look up word definitions using the Free Dictionary API. Command: type a word to get definitions, phonetics, and example usage.

<details>
<summary>Screenshot</summary>

![Define](plugins/define/screenshots/1.png)

</details>

### Time

Show current time in a timezone or city. Command plugin that displays the time for the given place or timezone.

<details>
<summary>Screenshot</summary>

![Time](plugins/time/screenshots/1.png)

</details>

### QR Code

Generate a QR code for a URL. Command: pass a URL to get a scannable QR code.

<details>
<summary>Screenshot</summary>

![QR Code](plugins/qr/screenshots/1.png)

</details>

### Password

Generate a random password. Command plugin that creates a secure random password on demand.

<details>
<summary>Screenshot</summary>

![Password](plugins/password/screenshots/1.png)

</details>

### Search history

Stores search history in `data/history.json` with timestamps. Use `!history` to see a paginated, deletable list of past searches.

<details>
<summary>Screenshot</summary>

![Search history 1](plugins/search-history/screenshots/1.png)
![Search history 2](plugins/search-history/screenshots/2.png)
![Search history 3](plugins/search-history/screenshots/3.png)

</details>

### TMDb

Shows movie and TV show details above search results. Slot plugin: when results include TMDb links, it displays poster, rating, and summary in a card above the results.

<details>
<summary>Screenshot</summary>

![TMDb 1](plugins/tmdb-slot/screenshots/1.png)
![TMDb 2](plugins/tmdb-slot/screenshots/2.png)

</details>

### Math

Evaluates math expressions and shows the result above search results. Slot plugin: type an expression in the search bar to get the computed result in a slot.

<details>
<summary>Screenshot</summary>

![Math](plugins/math-slot/screenshots/1.png)

</details>

### Jellyfin

Search your Jellyfin media library. Command plugin: query your Jellyfin server for movies, shows, and other media.

<details>
<summary>Screenshot</summary>

![Jellyfin](plugins/jellyfin/screenshots/1.png)

</details>

### RomM

Search your RomM game library. Command plugin: query your RomM instance for games by title, with cover art in the results.

<details>
<summary>Screenshot</summary>

![RomM](plugins/romm/screenshots/1.png)

</details>

### Colors

Generate a five-color palette. Command: `!colors` for a random palette, or pass color names or hex values (e.g. `!colors orange red yellow`) to fill swatches from left to right and shuffle them with your space bar.

<details>
<summary>Screenshot</summary>

![Colors 1](plugins/colors/screenshots/1.png)
![Colors 2](plugins/colors/screenshots/2.png)

</details>

### Meilisearch

Search across your Meilisearch indexes. Command plugin: run searches against your Meilisearch instance from the search bar.

<details>
<summary>Screenshot</summary>

![Meilisearch](plugins/meilisearch/screenshots/1.jpeg)

</details>

### Home RSS Feeds

Shows RSS feed items above search results. Slot plugin: configured feeds are displayed in a slot on the home/search page.

<details>
<summary>Screenshot</summary>

![RSS 1](plugins/rss/screenshots/1.png)
![RSS 2](plugins/rss/screenshots/2.png)
![RSS 3](plugins/rss/screenshots/3.png)

</details>

### GitHub

When search results include GitHub repos or users, shows styled info above results. Slot plugin that renders GitHub cards (repo stats, user info) in a slot.

<details>
<summary>Screenshot</summary>

![GitHub](plugins/github-slot/screenshots/1.png)

</details>

### Apps pocket

Adds a Google-style apps grid next to the settings icon. Apps are customised via the Configure button as a JSON list.

<details>
<summary>Screenshot</summary>

![GitHub](plugins/apps-pocket/screenshots/1.png)

</details>

### Spell Check

Intercepts search queries and corrects spelling using [LanguageTool](https://languagetool.org). Point it at a self-hosted instance for full privacy — the public API works out of the box with no key required. Supports all languages LanguageTool supports. Single-word queries are skipped to avoid false positives.

<details>
<summary>Screenshot</summary>

![Spell Check](plugins/spell-check/screenshots/1.png)

</details>

### DuckDuckGo bang redirect

Type `!!` followed by any DuckDuckGo bang command to trigger them directly from degoog. This will route through DuckDuckGo.

### Highlight Terms

Automatically wraps query-matching words in `<strong>` on result titles and snippets on every search page. No configuration needed — install and it works. Use `!highlight` to confirm it is active.

<details>
<summary>Screenshot</summary>

![Highlight Terms](plugins/highlight-terms/screenshots/1.png)

</details>

### File tab results

Adds a Files tab to search results that finds downloadable files via file-type engines.

</details>

</details>

---

<details>
<summary>Themes</summary>

### Degoog Docs

A theme that matches the degoog documentation site.

### Zen

A minimalist calming theme. Overrides the default degoog look with a simple, low-noise layout and colors.

<details>
<summary>Screenshot</summary>

![Zen 1](themes/zen/screenshots/1.png)
![Zen 2](themes/zen/screenshots/2.png)

</details>

### Catppuccin

Catppuccin palette: Mocha (blue), Latte (light blue), Rose (red/coral), Peach (orange/amber). Multiple flavor options.

<details>
<summary>Screenshot</summary>

![Catppuccin 1](themes/catpuccin/screenshots/1.png)
![Catppuccin 2](themes/catpuccin/screenshots/2.png)
![Catppuccin 3](themes/catpuccin/screenshots/3.png)

</details>

### Pokemon

Starter-inspired color schemes: Pikachu (yellow), Bulbasaur (green), Charmander (orange), Squirtle (blue).

<details>
<summary>Screenshot</summary>

![Pokemon 1](themes/pokemon/screenshots/1.png)
![Pokemon 2](themes/pokemon/screenshots/2.png)
![Pokemon 3](themes/pokemon/screenshots/3.png)

</details>

</details>

---

<details>
<summary>Transports</summary>

### FlareSolverr

Bypass Cloudflare challenges via a [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) instance. Once configured, engines can select "flaresolverr" as their outgoing transport. Requires a running FlareSolverr instance.

<details>
<summary>Screenshot</summary>

![FlareSolverr](transports/flaresolverr/screenshots/1.png)

</details>

### Browserless

Fetches pages through a self-hosted Browserless instance (or any compatible headless browser service). Renders JavaScript before returning HTML — useful for engines like Google Images that block standard HTTP requests. Compatible with browserless/chromium, CloakBrowser wrappers, and any service exposing `POST /content`.

<details>
<summary>Screenshot</summary>

![Browserless](transports/browserless/screenshots/1.png)

</details>

### CloakBrowser

Fetches pages through a self-hosted CloakBrowser service (stealth Chromium). Patches bot-detection signals at the C++ level — `navigator.webdriver`, canvas, CDP leaks — bypassing Google and Cloudflare. See homelab/cloakbrowser for the Docker service.

<details>
<summary>Screenshot</summary>

![CloakBrowser](transports/cloakbrowser/screenshots/1.png)

</details>

### Camoufox

Fetches pages through a self-hosted Camoufox service (stealth Firefox). Patches bot-detection signals at the C++ level, bypassing Google and Cloudflare. See homelab/camoufox for the Docker service.

<details>
<summary>Screenshot</summary>

![Camoufox](transports/camoufox/screenshots/1.png)

</details>

### degoog-4play

Uses a browser extension to harvest a genuine session for each target host, then passes those cookies to curl-impersonate for outgoing requests.

</details>

---

<details>
<summary>Engines</summary>

### DuckDuckGo Images

Adds the very powerful DDG images search engine to degoog, adding an extra ~70 images per page to the image results.

<details>
<summary>Screenshot</summary>

![Ecosia](engines/duckduckgo-images/screenshots/1.webp)

</details>

### Ecosia

Adds the Ecosia search engine to degoog. Ecosia may return no results when Cloudflare blocks server-side requests; use another engine if that happens.

<details>
<summary>Screenshot</summary>

![Ecosia](engines/ecosia/screenshots/1.png)

</details>

### Startpage

Adds the Startpage engine to degoog. You can enable Anonymous View so result links open via Startpage's proxy.

<details>
<summary>Screenshot</summary>

![Startpage](engines/startpage/screenshots/1.png)

</details>

### Internet Archive

Adds the Internet Archive as a file-type engine. Searches archive.org for downloadable files, books, software, and media.

<details>
<summary>Screenshot</summary>

![Internet Archive](engines/internet-archive/screenshots/1.png)

</details>

### Brave API Search

Adds the Brave Search API as a web engine. Requires a free API key from brave.com/search/api (2,000 queries/month on the free tier).

<details>
<summary>Screenshot</summary>

![Brave API Search](engines/brave-api-search/screenshots/1.png)

</details>

### Openverse

Adds the Openverse image engine to degoog. Searches CC-licensed images aggregated from Flickr, Wikimedia and museum collections via the public Openverse API. No API key required.

<details>
<summary>Screenshot</summary>

![Openverse](engines/openverse/screenshots/1.png)

</details>

### Wikimedia Commons

Adds the Wikimedia Commons image engine to degoog. Searches the Wikimedia Commons media archive via the MediaWiki API. No API key required.

<details>
<summary>Screenshot</summary>

![Wikimedia Commons](engines/wikimedia-commons/screenshots/1.png)

</details>

### NASA Images

Adds the NASA image engine to degoog. Searches the NASA Image and Video Library. No API key required.

<details>
<summary>Screenshot</summary>

![NASA Images](engines/nasa-images/screenshots/1.png)

</details>

### Hacker News

Adds the Hacker News engine to degoog. Searches Hacker News stories via the Algolia API. No API key required.

<details>
<summary>Screenshot</summary>

![Hacker News](engines/hacker-news/screenshots/1.png)

</details>

### DuckDuckGo News

Adds the DuckDuckGo News engine to degoog. No API key required.

<details>
<summary>Screenshot</summary>

![DuckDuckGo News](engines/duckduckgo-news/screenshots/1.png)

</details>

### The Guardian

Adds The Guardian as a news engine via the Guardian Open Platform API. Requires a free API key from open-platform.theguardian.com.

<details>
<summary>Screenshot</summary>

![The Guardian](engines/the-guardian/screenshots/1.png)

</details>

</details>

---

<details>
<summary>Autocomplete</summary>

### Brave

Autocomplete suggestions from Brave Search. Works without an API key; optionally add your Brave Search API key for authenticated requests.

### Bing

Autocomplete suggestions from Bing. No API key required.

### Yahoo

Autocomplete suggestions from Yahoo Search. No API key required.

</details>
