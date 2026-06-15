// Where the API lives. Empty (the default) means "same origin", which is how
// the app runs locally and when Node serves the built frontend itself. When the
// frontend is hosted separately (e.g. Cloudflare Pages) set VITE_API_BASE at
// build time to the API's absolute URL, e.g. https://api.shitrentals.example.
const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function getJson(path, params = {}) {
  const url = new URL(path, API_BASE || window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value != null) url.searchParams.set(key, value);
  }
  // Same-origin: keep the relative path so Vite's dev proxy still works.
  // Cross-origin: use the absolute URL so the request reaches the API host.
  const target = API_BASE ? url.href : `${url.pathname}${url.search}`;
  const response = await fetch(target);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Request failed (${response.status})`);
  }
  return payload.data;
}

