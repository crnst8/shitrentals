# `shared/` — code shared across the app

Dependency-free helpers imported by both the server and the data scripts. Keep
anything here pure (no I/O, no Node-only APIs) so it can run anywhere and be
unit-tested in isolation.

## Files

| File | Exports | Purpose |
| --- | --- | --- |
| `normalize.js` | `cleanText`, `normalizeLookup`, `normalizeAgencyName`, `buildFtsQuery` | Text normalization used for storage, agency keying, and full-text search. |

### What each helper does

- `cleanText` — collapse whitespace and trim.
- `normalizeLookup` — lowercase, strip diacritics and punctuation, expand `&` to
  `and`; the canonical form used for matching.
- `normalizeAgencyName` — `normalizeLookup` plus stripping corporate suffixes
  (`pty`, `ltd`, …) so "Foo Realty Pty Ltd" and "Foo Realty" share one key.
- `buildFtsQuery` — turn a user search string into a safe SQLite FTS5 `MATCH`
  query (prefix terms, AND-joined, capped at 10 terms).

## Conventions

- No imports from `server/`, `src/`, or `scripts/` — this directory is a leaf so
  there are no circular dependencies.
- Agency keys must stay stable: changing `normalizeAgencyName` re-buckets every
  agency, so treat it as a migration-level change.
