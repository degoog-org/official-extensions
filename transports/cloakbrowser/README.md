# CloakBrowser setup for degoog

Run your own CloakBrowser service, a stealth build of Chromium, and route degoog requests through it.

## 1. Files

Create a folder, such as `~/cloakbrowser`, with these four files:

### `docker-compose.yml`

```yaml
services:
  cloakbrowser:
    build: .
    restart: unless-stopped
    volumes:
        - ./state:/app/state
    ports:
      - "53322:3000"
    shm_size: "2gb"
```

### `Dockerfile`

```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
  libasound2 libx11-6 libxext6 libxss1 libdbus-1-3 libnspr4 \
  ca-certificates --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
```

### `package.json`

```json
{
  "name": "cloakbrowser-server",
  "type": "module",
  "dependencies": {
    "cloakbrowser": "latest",
    "playwright-core": "latest"
  }
}
```

### `server.js`

```js
import { launch } from "cloakbrowser";
import http from "http";
import fs from "fs";
import path from "path";

const PORT = 3000;
const STATE_DIR = "/app/state";
const STATE_FILE = path.join(STATE_DIR, "storage.json");
const WARMED_ORIGINS = new Set();

let _browser = null;
let _context = null;
let _initPromise = null;
let _saveTimer = null;

const _ensureStateDir = () => {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
};

const _loadStorageState = () => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (err) {
    console.warn("[state] load failed:", err?.message ?? err);
  }
  return undefined;
};

const _scheduleSave = () => {
  if (_saveTimer) return;
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    try {
      if (!_context?.storageState) return;
      const state = await _context.storageState();
      fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    } catch (err) {
      console.warn("[state] save failed:", err?.message ?? err);
    }
  }, 1500);
};

const _initBrowser = async () => {
  if (_context) return _context;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _ensureStateDir();
    _browser = await launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const storageState = _loadStorageState();
    _context = await _browser.newContext(
      storageState ? { storageState } : undefined,
    );
    return _context;
  })();
  return _initPromise;
};

const _warmOrigin = async (context, originUrl, options = {}) => {
  if (!originUrl || WARMED_ORIGINS.has(originUrl)) return;
  const page = await context.newPage();
  try {
    await page.goto(originUrl, {
      waitUntil: options.waitUntil ?? "domcontentloaded",
      timeout: options.timeout ?? 20000,
    });
    const dwell = options.dwellMs ?? 1500;
    if (dwell > 0) await page.waitForTimeout(dwell);
    WARMED_ORIGINS.add(originUrl);
    _scheduleSave();
  } finally {
    await page.close().catch(() => {});
  }
};

const _readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on("error", reject);
  });

const _handleContent = async (req, res) => {
  const {
    url,
    gotoOptions = {},
    cookies = [],
    referer,
    warmup,
    dwellMs,
  } = await _readBody(req);

  if (!url) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "url is required" }));
    return;
  }

  const context = await _initBrowser();
  if (cookies.length > 0) {
    await context.addCookies(cookies).catch((err) =>
      console.warn("[cookies] addCookies failed:", err?.message ?? err),
    );
  }

  if (warmup) {
    await _warmOrigin(context, warmup.url, {
      waitUntil: warmup.waitUntil,
      timeout: warmup.timeout,
      dwellMs: warmup.dwellMs,
    }).catch((err) => console.warn("[warmup] failed:", err?.message ?? err));
  }

  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: gotoOptions.waitUntil ?? "networkidle",
      timeout: gotoOptions.timeout ?? 20000,
      referer,
    });
    if (dwellMs && dwellMs > 0) await page.waitForTimeout(dwellMs);
    const html = await page.content();
    _scheduleSave();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } finally {
    await page.close().catch(() => {});
  }
};

http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/content") {
    await _handleContent(req, res).catch((err) => {
      console.error("[content] error:", err?.message ?? err);
      if (!res.headersSent) { res.writeHead(500); res.end(""); }
    });
    return;
  }
  if (req.method === "POST" && req.url === "/reset") {
    WARMED_ORIGINS.clear();
    try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch {}
    if (_context) {
      await _context.close().catch(() => {});
      _context = null;
    }
    res.writeHead(200);
    res.end("");
    return;
  }
  res.writeHead(404);
  res.end("");
}).listen(PORT, () => console.log(`cloakbrowser listening on :${PORT}`));
```

## 2. Start it

```bash
docker compose up -d --build
```

## 3. Configure in degoog

Open `Settings -> Transports -> CloakBrowser -> Configure` and set **CloakBrowser URL** to `http://127.0.0.1:53322`, or wherever you exposed the service.

Then open `Settings -> Engines -> Configure` and pick `cloakbrowser` as the outgoing transport for each engine that should use it.
