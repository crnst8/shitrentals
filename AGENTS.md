# Rental Record Agent Instructions

- Keep source reviews read-only. Changes to source data happen through the
  upstream submission forms.
- Never expose Airtable access-policy signatures or temporary attachment URLs.
- Preserve source IDs so records can be traced back to the public dataset.
- Treat map coordinates as locality-level approximations, not exact addresses.
- Use explicit SQLite migrations for schema changes.
- Run `npm run verify` after meaningful changes.

