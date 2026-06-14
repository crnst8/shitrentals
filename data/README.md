# `data/` — datasets and generated artifacts

Holds the one checked-in data snapshot plus several files that are generated or
downloaded locally and therefore gitignored.

## Files

| File | Tracked? | Origin |
| --- | --- | --- |
| `reviews.json` | **Yes** | The canonical review snapshot. Produced by `npm run sync` from the public shitrentals Airtable share. The SQLite DB is rebuilt from this. |
| `shitrentals.db`, `*.db-wal`, `*.db-shm` | No (gitignored) | The local SQLite database (WAL mode). Rebuilt automatically from `reviews.json` on first server start. |
| `australian_postcodes.csv` | No (gitignored) | Suburb → coordinate / postcode reference, downloaded by `npm run sync` (~8 MB). Source: [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes). |
| `rental-matches.json`, `rental-matches.csv` | No (gitignored) | Output of `npm run cross-reference`: reviewed properties currently listed for rent. |

> Any `*-matches.{json,csv}` file is treated as a generated cross-reference
> artifact and is gitignored.

## Regenerating

```bash
npm run sync             # refresh reviews.json (+ downloads postcodes, drops the DB)
npm run cross-reference  # regenerate rental-matches.* and update the DB
```

## Notes

- `reviews.json` keeps upstream Airtable record IDs so records trace back to the
  public source. It is treated as read-only input — edits happen upstream via
  the shitrentals submission forms, not here.
- Coordinates are suburb/locality centroids, not exact property locations.
- Temporary Airtable access signatures and attachment URLs are never stored.
