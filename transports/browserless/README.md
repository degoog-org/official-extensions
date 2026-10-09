# Browserless — degoog setup

Run a self-hosted [Browserless](https://github.com/browserless/browserless) Chromium instance that degoog can route requests through.

## 1. Files

Create a folder (e.g. `~/browserless`) with this single file:

### `docker-compose.yml`

```yaml
services:
  browserless:
    image: ghcr.io/browserless/chromium:latest
    restart: unless-stopped
    ports:
      - "53321:3000"
    environment:
      TIMEOUT: 30000
      CONCURRENT: 5
      TOKEN: ""
      CHROME_FLAGS: "--disable-blink-features=AutomationControlled --disable-features=IsolateOrigins,site-per-process --user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    shm_size: "2gb"
```

## 2. Start it

```bash
docker compose up -d
```

## 3. Configure in degoog

Settings → Transports → Browserless → Configure:

- **Browserless URL**: `http://127.0.0.1:53321` (or wherever you exposed the service)
- **API Token**: leave blank if you set `TOKEN: ""` above; otherwise set the same token here.

Then, in `Settings -> Engines -> Configure`, pick `browserless` as the outgoing transport for any engine you want routed through it.
