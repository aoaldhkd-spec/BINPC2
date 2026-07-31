# Benchmark Results — 100-user Simultaneous Entry

## Run Date
2026-07-31

## Environment
- API server: `http://localhost:8080/api/db`
- Node.js: v24.13.0
- Concurrent users: 100 (all fired simultaneously)
- Script: `scripts/simulate-100-entry.js`

## Scenario
Each simulated user performs:
1. **INSERT** — register a new profile (POST `/api/db/op`, `op: insert`, `table: profiles`)
2. **SELECT** — load the full profile list (POST `/api/db/op`, `op: select`, `table: profiles`)

Both steps are retried on 503 (up to 3 times) with exponential back-off.

## Results

| Metric | Value |
|--------|-------|
| Total users | 100 |
| INSERT success | 100/100 (100.0%) |
| SELECT success | 100/100 (100.0%) |
| 503 retries | 0 |
| Network errors | 0 |
| Wall-clock time | 0.23 s |

### Response-time percentiles (full round-trip: INSERT + SELECT)

| Percentile | Latency |
|-----------|---------|
| p50 | 172 ms |
| p95 | 204 ms |
| p99 | 206 ms |
| max | 206 ms |

### INSERT only

| Percentile | Latency |
|-----------|---------|
| p50 | 90 ms |
| p95 | 141 ms |
| max | 142 ms |

### SELECT only

| Percentile | Latency |
|-----------|---------|
| p50 | 79 ms |
| p95 | 123 ms |
| max | 127 ms |

## Verdict

✅ **PASS** — 100% success rate (≥ 99% threshold) and p95 = 204 ms (< 3 000 ms threshold).

## Pass/Fail Criteria

| Criterion | Threshold | Actual | Result |
|-----------|-----------|--------|--------|
| INSERT success rate | ≥ 99% | 100% | ✅ PASS |
| Full round-trip p95 | < 3 000 ms | 204 ms | ✅ PASS |

## How to re-run

```bash
node scripts/simulate-100-entry.js \
  --url http://localhost:8080/api/db \
  --users 100 \
  --concurrency 100
```

Add `--verbose` to see per-user timings.

## Notes

- All requests are served from the in-memory store (`store` Map); Postgres writes happen asynchronously in the background. This is the intended architecture — the `/op` endpoint is optimised for in-memory reads/writes.
- The concurrency limiter (`MAX_CONCURRENT_OPS = 80`) was not triggered during this run (0 × 503), indicating the server was comfortably within capacity.
- The script originally used CommonJS `require()` which conflicts with `"type": "module"` in `scripts/package.json`. It was converted to ES-module `import` syntax, and a bug where `runWithConcurrency` resolved immediately before tasks completed was fixed in the same pass.
