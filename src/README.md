# `src/` — web frontend

A [React](https://react.dev/) 19 single-page app built with
[Vite](https://vite.dev/). It talks to the `server/` API over `/api/*` and
renders the searchable review explorer, agency rankings, and the suburb map.

## Files

| File | Responsibility |
| --- | --- |
| `main.jsx` | Entry point. Mounts `<App>` into `#root` and pulls in Leaflet + app styles. |
| `App.jsx` | The whole UI: tab state, filters, search, pagination, agency and review detail panels. Owns all data fetching. |
| `api.js` | `getJson(path, params)` — thin `fetch` wrapper that builds query strings and unwraps the `{ data }` / `{ error }` envelope. |
| `date.js` | Date formatting helpers (absolute, relative, sortable values). |
| `components/MapView.jsx` | Leaflet map of suburb-level review aggregates (`react-leaflet`). |
| `styles.css` | Global styles. |

## Dev and build

- `npm run dev` runs Vite on **5173** and proxies `/api` to the API on **3001**
  (see `vite.config.js`), so the frontend and API feel like one origin in dev.
- `npm run build` outputs to `dist/` (gitignored). In production the API server
  serves that build, so everything is same-origin and `api.js` can use relative
  paths.

## Conventions

- Icons come from `lucide-react`.
- All server access goes through `getJson` — don't call `fetch` directly so the
  error envelope is handled consistently.
- The frontend is read-only: there are no write endpoints to call.
