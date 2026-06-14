# `test/` — tests

Tests use the built-in Node test runner (`node --test`, no extra framework).
Run them with:

```bash
npm test
```

## Files

| File | Covers |
| --- | --- |
| `database.test.js` | Snapshot import, migrations, and the read queries in `server/` against an in-memory / temp database. |
| `address-match.test.js` | Address parsing, `baseKey` generation, and unit agreement in `scripts/lib/address-match.js`. |
| `homely.test.js` | The homely listing parser and pagination (with injected `fetch`, no network). |
| `date.test.js` | The date formatting helpers in `src/date.js`. |

## Conventions

- The server is imported with `NODE_ENV=test` so `server/app.js` does **not**
  start listening on a port.
- Tests are offline: anything that would hit the network (listing fetches) is
  exercised with an injected `fetch` and fixture data.
- `npm run verify` runs lint + tests + the production build; run it after
  meaningful changes.
