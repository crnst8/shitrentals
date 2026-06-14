# shitrentals

A fast, self-hosted explorer for the public rental and agency reviews published
by [shitrentals.org](https://www.shitrentals.org/).

It combines the property and agency tables into one searchable dataset, links
matching agency names, ranks repeat offenders, and maps reviews at suburb level.

## Local development

```bash
npm install
npm run sync
npm run dev
```

Open `http://localhost:5173`.

## Commands

- `npm run sync` refreshes the checked-in snapshot from the public Airtable
  share and updates locality coordinates.
- `npm run cross-reference` flags reviewed *properties* that are currently
  listed for rent, writing `data/rental-matches.{json,csv}` (gitignored). It
  scrapes homely.com.au public pages (no credentials required). Useful flags:
  `--limit N`, `--state VIC`.
- `npm run dev` starts Vite and the Hono API.
- `npm run verify` runs lint, tests, and the production build.
- `npm start` serves the API and a built frontend on `PORT` (default `3001`).

The generated SQLite database is local and ignored by Git. On first start it is
rebuilt from `data/reviews.json`.

## Repository layout

Each directory has its own README with the details:

- [`server/`](server/README.md) — Hono API and SQLite database.
- [`src/`](src/README.md) — React + Vite frontend.
- [`scripts/`](scripts/README.md) — Airtable sync and rental cross-reference.
- [`shared/`](shared/README.md) — pure helpers shared by server and scripts.
- [`data/`](data/README.md) — the review snapshot and generated artifacts.
- [`test/`](test/README.md) — Node test-runner tests.

No credentials or `.env` file are required to run the app or the data scripts.
Optional runtime overrides (`PORT`, `DB_PATH`) can be set as ordinary
environment variables.

## Data notes

- Source reviews remain read-only and retain their Airtable record IDs.
- Agency correlation is name-based and intentionally conservative.
- Map points are approximate suburb/locality centroids, not exact properties.
- Temporary Airtable access signatures and attachment URLs are never stored.
- Review text remains the responsibility of the upstream publisher.

## Upstream forms

- [Review a rental](https://www.shitrentals.org/review/review-a-shit-rental)
- [Review an agency](https://www.shitrentals.org/review/review-a-shit-agency)

