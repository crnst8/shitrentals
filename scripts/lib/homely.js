// Fetches active rental listings from homely.com.au for a given suburb.
//
// Homely is a public Australian listings aggregator whose pages tolerate
// sustained, throttled requests (some other listing sites sit behind bot
// managers that IP-ban after a handful of plain HTTP requests).
//
// For speed we read the Next.js data endpoint
//   /_next/data/<buildId>/for-rent/<slug>/real-estate.json?...&page=N
// which returns the same `ssrData` as the page but ~3x smaller (pure JSON, no
// HTML). `buildId` rotates on Homely deploys, so it's discovered once from a
// page's __NEXT_DATA__ and refreshed on a 404. If the JSON endpoint can't be
// used we fall back to scraping the HTML page.
//
// Data shape: props.pageProps.ssrData.{ paging, listings[] }

import { normalizeLookup } from '../../shared/normalize.js';
import { parseAddress } from './address-match.js';

const BASE = 'https://www.homely.com.au';

const BROWSER_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-AU,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
};

const NOT_FOUND = Symbol('not-found');
let cachedBuildId = null;

export function suburbSlug(suburb, state, postcode) {
  const name = normalizeLookup(suburb).replace(/ /g, '-');
  return `${name}-${String(state).toLowerCase()}-${postcode}`;
}

// Fetches every active rental listing for a single suburb/postcode page.
// `fetchSsr(slug, page)` is injectable so the parser/pager can be unit tested
// without network. It returns the page's `ssrData`, or null when the suburb
// page does not exist.
export async function fetchHomelyRentals(suburb, state, postcode, options = {}) {
  const { maxPages = 40, pageConcurrency = 4, fetchSsr = defaultFetchSsr } = options;
  const slug = suburbSlug(suburb, state, postcode);

  // Page 1 first: it tells us how many pages exist, so the rest can be fetched
  // concurrently instead of one-at-a-time (the slow part for large suburbs).
  const first = await fetchSsr(slug, 1);
  if (!first) return []; // 404 / unknown locality
  const collected = [first];
  const totalPages = Math.min(first.paging?.totalPages || 1, maxPages);

  if (totalPages > 1) {
    const remaining = [];
    for (let page = 2; page <= totalPages; page += 1) remaining.push(page);
    await pool(remaining, pageConcurrency, async (page) => {
      const ssr = await fetchSsr(slug, page);
      if (ssr) collected.push(ssr);
    });
  }

  const listings = [];
  for (const ssr of collected) {
    for (const raw of ssr.listings || []) {
      const listing = normalizeListing(raw, suburb, state, postcode);
      if (listing) listings.push(listing);
    }
  }
  return listings;
}

async function pool(items, concurrency, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

export function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function extractSsrData(html) {
  return extractNextData(html)?.props?.pageProps?.ssrData ?? null;
}

export function normalizeListing(raw, suburb, state, postcode) {
  if (!raw || raw.listingType !== 'rental') return null;
  if (raw.statusType && raw.statusType === 'leased') return null;
  const street = raw.address?.streetAddress || '';
  const parsed = parseAddress(street);
  if (!parsed.baseKey) return null;
  return {
    id: raw.id,
    address: street,
    displayableAddress: raw.address?.longAddress || raw.location?.address || street,
    suburb,
    state,
    postcode,
    status: raw.statusType || '',
    displayPrice: raw.priceDetails?.longDescription || raw.priceDetails?.shortDescription || '',
    bedrooms: raw.bedrooms ?? null,
    bathrooms: raw.bathrooms ?? null,
    url: raw.uri ? `${BASE}/homes/${raw.uri}${raw.id != null ? `/${raw.id}` : ''}` : '',
    lat: raw.location?.latLong?.latitude ?? null,
    lng: raw.location?.latLong?.longitude ?? null,
    baseKey: parsed.baseKey,
    unit: parsed.unit
  };
}

// ---------------------------------------------------------------------------

async function defaultFetchSsr(slug, page) {
  // Fast path: the Next.js JSON data endpoint.
  let buildId = cachedBuildId || (cachedBuildId = await discoverBuildId(slug));
  if (buildId) {
    const result = await fetchNextData(buildId, slug, page);
    if (result === NOT_FOUND) {
      // Could be a missing suburb, or a rotated buildId. Refresh once to tell.
      cachedBuildId = null;
      const fresh = await discoverBuildId(slug);
      if (fresh && fresh !== buildId) {
        cachedBuildId = fresh;
        const retry = await fetchNextData(fresh, slug, page);
        return retry === NOT_FOUND ? null : retry;
      }
      return null; // genuinely no such suburb page
    }
    if (result) return result;
  }
  // Fallback: scrape the HTML page.
  const html = await fetchText(`${BASE}/for-rent/${slug}/real-estate${page > 1 ? `?page=${page}` : ''}`);
  return html === NOT_FOUND ? null : extractSsrData(html);
}

async function fetchNextData(buildId, slug, page) {
  const url = `${BASE}/_next/data/${buildId}/for-rent/${slug}/real-estate.json`
    + `?mode=for-rent&location=${slug}&facets=real-estate${page > 1 ? `&page=${page}` : ''}`;
  const body = await fetchText(url);
  if (body === NOT_FOUND) return NOT_FOUND;
  try {
    return JSON.parse(body)?.pageProps?.ssrData ?? null;
  } catch {
    return null;
  }
}

async function discoverBuildId(slug) {
  const html = await fetchText(`${BASE}/for-rent/${slug}/real-estate`);
  if (html === NOT_FOUND) return null;
  return extractNextData(html)?.buildId ?? null;
}

// Returns response text, NOT_FOUND for 404, or throws after retrying blocks.
async function fetchText(url, attempt = 0) {
  const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (response.status === 404) return NOT_FOUND;
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error(`homely fetch blocked (${response.status})`);
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(20_000, 1500 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return fetchText(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`homely fetch failed (${response.status})`);
  return response.text();
}
