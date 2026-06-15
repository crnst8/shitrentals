// Cross-references reviewed *properties* in the local database against active
// "for rent" listings, flagging reviewed homes that are currently on the rental
// market. Matching is intentionally conservative: street number + street name
// within the same suburb + state (units reported, not required), mirroring the
// project's name-based agency correlation.
//
// Listings come from homely.com.au public pages (no credentials required).
//
// Usage:
//   node scripts/cross-reference-rentals.mjs                 # full scan, all reviewed suburbs
//   node scripts/cross-reference-rentals.mjs --limit 5       # first 5 suburbs (smoke test)
//   node scripts/cross-reference-rentals.mjs --state VIC
//   node scripts/cross-reference-rentals.mjs --incremental   # cron mode (see below)
//
// Incremental mode (--incremental, optionally --discover N, default 60) only
// scans suburbs that already have a match — refreshing each listing's status
// and dropping any that have been delisted — plus the N least-recently-scanned
// suburbs to discover new matches. Repeated runs rotate through every suburb,
// so a cheap cron keeps existing matches current while gradually widening
// coverage, instead of re-scraping the whole country each time.
//
// Outputs data/rental-matches.json and data/rental-matches.csv (both gitignored).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  matchedSuburbKeys,
  mergeListingMatches,
  openDatabase,
  recordSuburbScan,
  replaceListingMatches,
  suburbScanTimes
} from '../server/database.js';
import { parseAddress, unitAgreement } from './lib/address-match.js';
import { fetchHomelyRentals } from './lib/homely.js';
import { loadPostcodeIndex, postcodesFor } from './lib/postcodes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));

const db = openDatabase();

// Import-only mode: load a previously generated rental-matches.json into the
// database without re-scraping.
if (args.import) {
  const report = JSON.parse(fs.readFileSync(args.import, 'utf8'));
  const saved = replaceListingMatches(db, report.matches || [], report.source || 'import');
  console.log(`Imported ${saved} listing match(es) from ${args.import} into the database.`);
  process.exit(0);
}

const allSuburbs = loadReviewedSuburbs(db, args);
if (allSuburbs.length === 0) {
  console.error('No reviewed property suburbs found for the given filters.');
  process.exit(1);
}

// Incremental mode only scans the suburbs that matter this run: every suburb
// that already has a match (to refresh status and catch delistings) plus a
// rotating batch of the least-recently-scanned suburbs (to discover new ones).
// Full mode scans every reviewed suburb and replaces the whole match set.
const suburbs = args.incremental ? selectIncrementalTargets(db, allSuburbs, args.discover) : allSuburbs;

const fetcher = await buildFetcher(args);
console.log(
  args.incremental
    ? `Incremental cross-reference: ${suburbs.length}/${allSuburbs.length} suburb(s) ` +
      `(matched + ${args.discover} discovery) against ${fetcher.label}...`
    : `Cross-referencing ${suburbs.length} reviewed suburb(s) against ${fetcher.label}...`
);

const matches = [];
const scannedReviewIds = new Set();
let suburbsDone = 0;
let suburbsUnresolved = 0;
let suburbsErrored = 0;
let listingsSeen = 0;

await runPool(suburbs, args.concurrency, async (entry) => {
  let listings;
  try {
    listings = await fetcher.fetchRentListings(entry.suburb, entry.state);
  } catch (error) {
    suburbsErrored += 1;
    console.warn(`  ! ${entry.suburb}, ${entry.state}: ${error.message}`);
    return;
  }
  if (listings === null) {
    suburbsUnresolved += 1;
    return;
  }
  listingsSeen += listings.length;
  if (args.delay) await sleep(args.delay);

  const index = new Map();
  for (const listing of listings) {
    if (!listing.baseKey) continue;
    if (!index.has(listing.baseKey)) index.set(listing.baseKey, []);
    index.get(listing.baseKey).push(listing);
  }

  let suburbMatchCount = 0;
  for (const review of entry.reviews) {
    // Every reviewed property in a successfully scanned suburb is now accounted
    // for: if it isn't matched below it is treated as not-listed (incremental
    // merge clears any stale match for it).
    if (args.incremental) scannedReviewIds.add(review.id);
    const parsed = parseAddress(review.address);
    if (!parsed.baseKey) continue;
    const hits = index.get(parsed.baseKey);
    if (!hits) continue;
    for (const listing of hits) {
      suburbMatchCount += 1;
      matches.push({
        review: {
          id: review.id,
          sourceId: review.source_id,
          address: review.address,
          suburb: review.suburb,
          state: review.state,
          agencyName: review.agency_name,
          rating: review.rating,
          reviewText: review.review_text
        },
        listing: {
          id: listing.id,
          address: listing.displayableAddress,
          status: listing.status,
          price: listing.displayPrice,
          bedrooms: listing.bedrooms,
          url: listing.url
        },
        unitMatch: unitAgreement(parsed.unit, listing.unit)
      });
    }
  }

  if (args.incremental) recordSuburbScan(db, entry.suburb, entry.state, listings.length, suburbMatchCount);

  suburbsDone += 1;
  if (suburbsDone % 25 === 0 || suburbsDone === suburbs.length) {
    console.log(`  ...${suburbsDone}/${suburbs.length} suburbs, ${matches.length} match(es) so far`);
  }
});

matches.sort((a, b) => (a.review.rating ?? 9) - (b.review.rating ?? 9));

const out = {
  generatedAt: new Date().toISOString(),
  source: fetcher.label,
  suburbsQueried: suburbs.length,
  suburbsUnresolved,
  suburbsErrored,
  listingsSeen,
  matchCount: matches.length,
  matches
};

const jsonPath = path.join(root, 'data', 'rental-matches.json');
const csvPath = path.join(root, 'data', 'rental-matches.csv');
fs.writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(csvPath, toCsv(matches));

let savedToDb = 0;
if (!args.noDb) {
  savedToDb = args.incremental
    ? mergeListingMatches(db, matches, fetcher.label, scannedReviewIds)
    : replaceListingMatches(db, matches, fetcher.label);
}

console.log('');
console.log(`Done. ${matches.length} reviewed propert(y/ies) currently listed for rent in the scanned suburb(s).`);
if (!args.noDb) {
  console.log(args.incremental
    ? `Merged ${savedToDb} match(es) for ${scannedReviewIds.size} scanned review(s) into the database.`
    : `Persisted ${savedToDb} match(es) to the database (one per review).`);
}
console.log(`Scanned ${listingsSeen} live rental listings across ${suburbs.length} suburb(s)` +
  (suburbsUnresolved ? `, ${suburbsUnresolved} suburb(s) had no listing page` : '') +
  (suburbsErrored ? `, ${suburbsErrored} suburb queries failed` : '') + '.');
console.log(`Wrote ${path.relative(root, jsonPath)} and ${path.relative(root, csvPath)}.`);

// ---------------------------------------------------------------------------

async function buildFetcher(options) {
  // homely is the only source. Resolve postcodes locally since homely URLs
  // require them.
  const postcodes = await loadPostcodeIndex();
  return {
    label: 'homely.com.au (for-rent)',
    async fetchRentListings(suburb, state) {
      const codes = postcodesFor(postcodes, suburb, state);
      if (codes.length === 0) return null; // can't resolve a postcode for this suburb
      const merged = new Map();
      for (const postcode of codes) {
        const listings = await fetchHomelyRentals(suburb, state, postcode, { maxPages: options.maxPages });
        for (const listing of listings) merged.set(listing.id ?? listing.url, listing);
      }
      return [...merged.values()];
    }
  };
}

// Picks the suburbs to scan in incremental mode: all suburbs that already have
// a match (always refreshed), plus the `discover` least-recently-scanned of the
// rest. Spreads full coverage across many small, fast runs.
function selectIncrementalTargets(database, all, discover) {
  const hot = matchedSuburbKeys(database);
  const scanned = suburbScanTimes(database);
  const key = (entry) => `${entry.suburb}|${entry.state}`;
  const matched = all.filter((entry) => hot.has(key(entry)));
  const cold = all
    .filter((entry) => !hot.has(key(entry)))
    .sort((a, b) => (scanned.get(key(a)) || '').localeCompare(scanned.get(key(b)) || ''));
  return [...matched, ...cold.slice(0, Math.max(0, discover))];
}

function loadReviewedSuburbs(database, options) {
  const where = ["source_type = 'property'", "suburb != ''", "state != ''", "address != ''"];
  const params = {};
  if (options.state) {
    where.push('state = @state');
    params.state = options.state.toUpperCase();
  }
  const rows = database.prepare(`
    SELECT id, source_id, address, suburb, state, agency_name, rating, review_text
    FROM reviews
    WHERE ${where.join(' AND ')}
    ORDER BY suburb, state
  `).all(params);

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.suburb}|${row.state}`;
    if (!grouped.has(key)) grouped.set(key, { suburb: row.suburb, state: row.state, reviews: [] });
    grouped.get(key).reviews.push(row);
  }
  let list = [...grouped.values()];
  if (Number.isFinite(options.limit)) list = list.slice(0, options.limit);
  return list;
}

async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      await worker(queue.shift());
    }
  });
  await Promise.all(runners);
}

function toCsv(rows) {
  const header = [
    'rating', 'review_address', 'suburb', 'state', 'review_agency', 'unit_match',
    'listing_address', 'listing_status', 'listing_price', 'bedrooms', 'listing_url',
    'review_id', 'listing_id'
  ];
  const lines = [header.join(',')];
  for (const m of rows) {
    lines.push([
      m.review.rating ?? '',
      m.review.address,
      m.review.suburb,
      m.review.state,
      m.review.agencyName,
      m.unitMatch,
      m.listing.address,
      m.listing.status,
      m.listing.price,
      m.listing.bedrooms ?? '',
      m.listing.url,
      m.review.id,
      m.listing.id
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = {
    concurrency: 2, maxPages: 40, delay: 0,
    limit: undefined, state: '', import: '', noDb: false,
    incremental: false, discover: 60
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') out.limit = Number.parseInt(argv[++i], 10);
    else if (arg === '--state') out.state = argv[++i];
    else if (arg === '--concurrency') out.concurrency = Number.parseInt(argv[++i], 10) || 2;
    else if (arg === '--max-pages') out.maxPages = Number.parseInt(argv[++i], 10) || 40;
    else if (arg === '--delay') out.delay = Number.parseInt(argv[++i], 10) || 0;
    else if (arg === '--import') out.import = argv[++i];
    else if (arg === '--no-db') out.noDb = true;
    else if (arg === '--incremental') out.incremental = true;
    else if (arg === '--discover') out.discover = Number.parseInt(argv[++i], 10) || 0;
  }
  return out;
}
