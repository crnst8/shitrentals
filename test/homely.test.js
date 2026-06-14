import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSsrData, fetchHomelyRentals, normalizeListing, suburbSlug } from '../scripts/lib/homely.js';

test('suburbSlug builds the homely locality slug', () => {
  assert.equal(suburbSlug('Brunswick', 'VIC', '3056'), 'brunswick-vic-3056');
  assert.equal(suburbSlug('Park Ridge South', 'QLD', '4125'), 'park-ridge-south-qld-4125');
});

test('normalizeListing extracts address, price and a matchable baseKey', () => {
  const listing = normalizeListing({
    id: 13238820,
    listingType: 'rental',
    statusType: 'available',
    uri: '58-union-street-brunswick-vic-3056',
    address: { streetAddress: '58 Union Street', longAddress: '58 Union Street, Brunswick VIC 3056' },
    priceDetails: { longDescription: '$550 per week', shortDescription: '$550pw' },
    location: { latLong: { latitude: -37.77, longitude: 144.95 } }
  }, 'Brunswick', 'VIC', '3056');

  assert.equal(listing.baseKey, '58 union street');
  assert.equal(listing.displayPrice, '$550 per week');
  assert.equal(listing.url, 'https://www.homely.com.au/homes/58-union-street-brunswick-vic-3056/13238820');
});

test('normalizeListing skips leased and non-rental rows', () => {
  const base = { id: 1, address: { streetAddress: '1 Test St' } };
  assert.equal(normalizeListing({ ...base, listingType: 'rental', statusType: 'leased' }), null);
  assert.equal(normalizeListing({ ...base, listingType: 'sale' }), null);
});

test('extractSsrData reads the __NEXT_DATA__ payload', () => {
  const ssr = { paging: { totalPages: 1 }, listings: [] };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps: { ssrData: ssr } } }
  )}</script></html>`;
  assert.deepEqual(extractSsrData(html), ssr);
  assert.equal(extractSsrData('<html>no data</html>'), null);
});

test('fetchHomelyRentals paginates and matches DB-style addresses (injected fetch)', async () => {
  const pages = {
    1: ssr([{ street: '58 Union Street' }, { street: '4/883 Park Street' }], 1, 2),
    2: ssr([{ street: '315/288 Albert Street' }], 2, 2)
  };
  const fetchSsr = async (slug, page) => pages[page];

  const listings = await fetchHomelyRentals('Brunswick', 'VIC', '3056', { fetchSsr });
  assert.equal(listings.length, 3);
  const keys = listings.map((l) => l.baseKey);
  assert.ok(keys.includes('883 park street')); // unit stripped from "4/883 Park Street"
  assert.ok(keys.includes('288 albert street'));
});

test('fetchHomelyRentals returns [] for an unknown suburb', async () => {
  const listings = await fetchHomelyRentals('Nowhere', 'VIC', '9999', { fetchSsr: async () => null });
  assert.deepEqual(listings, []);
});

function ssr(streets, currentPage, totalPages) {
  const listings = streets.map((s, i) => ({
    id: `${currentPage}-${i}`,
    listingType: 'rental',
    statusType: 'available',
    uri: 'x',
    address: { streetAddress: s.street }
  }));
  return { paging: { currentPage, totalPages }, listings };
}
