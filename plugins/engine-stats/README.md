# Engine stats

Records per-engine search telemetry and shows it with `!engine-stats`.

Answers the question the timings row next to each search cannot: which engine
has been slow or failing over the last hours, not just on this one query.

## Requirements

Degoog 0.26.0 or newer. It relies on the `observe` hook on query interceptors,
which does not exist in earlier versions.

## Usage

- `!engine-stats` shows the default window
- `!engine-stats 1h`, `6h`, `24h`, `48h` picks a window

## What it records

Per engine, per hour: run count, failure count by status (`timeout`,
`network`, `blocked`, `captcha`, `rate_limited`, `parse_error`), response time
histogram, result counts, and the most recent error reason.

Nothing about queries is recorded. The recorder receives engine name, search
type, page number, timing, result count and status. Query text never reaches
it.

## Reading the table

- **Runs** is fresh upstream calls, with total including cache replays after
  the slash.
- **Fail** is the share of fresh calls that errored.
- **Empty** is the share of *successful* calls that returned zero results. A
  high number here with a low failure rate usually means a parser broke while
  the engine still answers HTTP 200.
- **p50/p90/p95** come from a fixed latency histogram, so they are bucketed
  approximations, not exact percentiles. `16s+` means the bucket overflowed.
- **Cached** never affects timings or failure rates. Cache replays would
  otherwise report whatever was fast enough to get cached.

Row colour: green under 5% failures, amber past 5% failures or 25% empty
responses, red past 25% failures.

## Settings

- **Retention (hours)**, default 48, capped at 336. Older hourly buckets are
  dropped.
- **Default window**, used when `!engine-stats` runs without an argument.

## Storage

Aggregates live in memory and are flushed to `data/engine-stats.json` at most
every 15 seconds. Only counters and histogram buckets are stored, so the file
stays small regardless of traffic. Losing it loses history, nothing else.
