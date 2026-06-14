# `server/` — API and database

A small [Hono](https://hono.dev/) HTTP server (run on Node via
`@hono/node-server`) that serves the read API and, in production, the built
frontend from `dist/`.

## Files

| File | Responsibility |
| --- | --- |
| `app.js` | Wires up routes, security headers, static file serving, and starts the server (unless `NODE_ENV=test`). Exports the Hono `app` for tests. |
| `database.js` | Opens the SQLite database (`better-sqlite3`), runs migrations, and imports the `data/reviews.json` snapshot on first boot. Also persists cross-reference listing matches. |
| `queries.js` | All read queries: review search (FTS5), agency rankings, single-agency detail, map points, and dataset metadata. Pure functions that take a `db` handle. |

## API routes

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/api/meta` | Dataset totals, per-state counts, sync metadata. |
| `GET` | `/api/reviews` | Paginated review search. Query: `q`, `type`, `state`, `maxRating`, `agency`, `sort`, `page`, `pageSize`. |
| `GET` | `/api/agencies` | Ranked agencies. Query: `q`, `state`, `minReviews`, `limit`, `sort`. |
| `GET` | `/api/agencies/:agencyKey` | One agency with its reviews. `404` if unknown. |
| `GET` | `/api/map` | Suburb-level aggregates with coordinates. Same filters as reviews. |
| `GET` | `/api/health` | `{ status: "ok" }`. |

Responses are wrapped as `{ data }` on success or `{ error: { code, message } }`
on failure.

## Database

- SQLite in WAL mode at `data/shitrentals.db` (override with `DB_PATH`). The DB
  file is gitignored and rebuilt from `data/reviews.json` whenever it is empty.
- Schema changes are explicit, append-only migrations in the `migrations` array
  in `database.js`, tracked in the `_migrations` table.
- Full-text search uses an FTS5 virtual table (`reviews_fts`); see
  `buildFtsQuery` in `shared/normalize.js` for how user input becomes a query.

## Conventions

- Source reviews are read-only; never mutate them here. New review data only
  arrives via `npm run sync`.
- Keep query functions pure and parameterized — no string-interpolated user
  input into SQL.
