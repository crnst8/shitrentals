# `scripts/` — data sync and cross-reference

Standalone Node scripts (run with `npm run …`) that build and enrich the local
dataset. They are not part of the running server.

## Top-level scripts

| Script | npm command | What it does |
| --- | --- | --- |
| `sync-airtable.mjs` | `npm run sync` | Refreshes `data/reviews.json` from the public shitrentals Airtable share, geocodes suburbs to locality centroids, and deletes the stale SQLite DB so it rebuilds on next start. |
| `cross-reference-rentals.mjs` | `npm run cross-reference` | Flags reviewed *properties* that are currently listed for rent. Writes `data/rental-matches.{json,csv}` (gitignored) and persists matches into the DB. |

### `cross-reference-rentals.mjs` flags

- `--limit N` — only the first N reviewed suburbs (smoke test).
- `--state VIC` — restrict to one state.
- `--concurrency N` — parallel suburb fetches (default 2).
- `--max-pages N` — listing pages per suburb (default 40).
- `--delay MS` — pause between suburbs to stay polite.
- `--import FILE` — load a previously generated matches JSON into the DB without
  re-scraping.
- `--no-db` — write the files but don't touch the database.

Listings come from homely.com.au public pages — **no credentials required**.

## `lib/` — cross-reference helpers

| File | Responsibility |
| --- | --- |
| `address-match.js` | Pure address parsing/normalization. Turns free-text and structured addresses into a comparable `baseKey` (street number + expanded street name) and grades unit agreement. Unit-tested. |
| `homely.js` | Fetches active rental listings from homely.com.au, reading the Next.js data endpoint (`__NEXT_DATA__` / `ssrData`) with an HTML fallback. |
| `postcodes.js` | Resolves a suburb + state to postcode(s) from the australianpostcodes CSV (homely URLs need a postcode). |

## Conventions

- These scripts read source data read-only; new reviews only ever come from
  `npm run sync` against the upstream Airtable share.
- Matching stays intentionally conservative (street number + street name within
  a suburb), mirroring the project's name-based agency correlation.
- Keep `lib/address-match.js` pure and side-effect-free so it stays unit-testable.
