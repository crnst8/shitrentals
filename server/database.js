import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText, normalizeAgencyName } from '../shared/normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDbPath = path.join(root, 'data', 'shitrentals.db');
const defaultSnapshotPath = path.join(root, 'data', 'reviews.json');

const migrations = [
  {
    name: '001_reviews_search',
    up(db) {
      db.exec(`
        CREATE TABLE reviews (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL CHECK (source_type IN ('property', 'agency')),
          source_id TEXT NOT NULL,
          title TEXT NOT NULL,
          address TEXT NOT NULL DEFAULT '',
          suburb TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          agency_name TEXT NOT NULL DEFAULT '',
          agency_key TEXT NOT NULL DEFAULT '',
          rating INTEGER CHECK (rating BETWEEN 1 AND 5),
          review_text TEXT NOT NULL DEFAULT '',
          submitted_at TEXT,
          source_created_at TEXT,
          landlord_type TEXT NOT NULL DEFAULT '',
          latitude REAL,
          longitude REAL,
          location_precision TEXT,
          imported_at TEXT NOT NULL
        );

        CREATE TABLE agencies (
          agency_key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          total_reviews INTEGER NOT NULL,
          property_reviews INTEGER NOT NULL,
          agency_reviews INTEGER NOT NULL,
          low_rating_reviews INTEGER NOT NULL,
          average_rating REAL,
          states_json TEXT NOT NULL,
          suburbs_json TEXT NOT NULL,
          latest_review_at TEXT
        );

        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE reviews_fts USING fts5(
          review_id UNINDEXED,
          title,
          address,
          suburb,
          state,
          country,
          agency_name,
          review_text,
          tokenize = 'unicode61 remove_diacritics 2'
        );

        CREATE INDEX idx_reviews_source ON reviews(source_type);
        CREATE INDEX idx_reviews_state ON reviews(state);
        CREATE INDEX idx_reviews_rating ON reviews(rating);
        CREATE INDEX idx_reviews_agency ON reviews(agency_key);
        CREATE INDEX idx_reviews_location ON reviews(latitude, longitude);
      `);
    }
  },
  {
    name: '002_listing_matches',
    up(db) {
      db.exec(`
        CREATE TABLE listing_matches (
          review_id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          listing_id TEXT,
          listing_address TEXT NOT NULL DEFAULT '',
          listing_url TEXT NOT NULL DEFAULT '',
          listing_price TEXT NOT NULL DEFAULT '',
          listing_status TEXT NOT NULL DEFAULT '',
          unit_match TEXT NOT NULL DEFAULT '',
          matched_at TEXT NOT NULL
        );
      `);
    }
  }
];

// Replaces the set of "currently listed for rent" matches produced by
// scripts/cross-reference-rentals.mjs. Kept separate from the read-only review
// snapshot: review ids are stable across syncs, so matches survive re-imports
// and a re-run simply refreshes them.
export function replaceListingMatches(db, matches, source) {
  const matchedAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO listing_matches (
      review_id, source, listing_id, listing_address, listing_url,
      listing_price, listing_status, unit_match, matched_at
    ) VALUES (
      @reviewId, @source, @listingId, @listingAddress, @listingUrl,
      @listingPrice, @listingStatus, @unitMatch, @matchedAt
    )
    ON CONFLICT(review_id) DO UPDATE SET
      source=excluded.source, listing_id=excluded.listing_id,
      listing_address=excluded.listing_address, listing_url=excluded.listing_url,
      listing_price=excluded.listing_price, listing_status=excluded.listing_status,
      unit_match=excluded.unit_match, matched_at=excluded.matched_at
  `);

  // Best match wins per review: a unit-exact (or unit-less) match beats a
  // same-building, different-unit match.
  const best = new Map();
  const rank = { match: 0, none: 1, unknown: 2, mismatch: 3 };
  for (const match of matches) {
    const current = best.get(match.review.id);
    const score = rank[match.unitMatch] ?? 4;
    if (!current || score < current.score) best.set(match.review.id, { match, score });
  }

  return db.transaction(() => {
    db.prepare('DELETE FROM listing_matches').run();
    for (const { match } of best.values()) {
      insert.run({
        reviewId: match.review.id,
        source,
        listingId: match.listing.id != null ? String(match.listing.id) : null,
        listingAddress: match.listing.address || '',
        listingUrl: match.listing.url || '',
        listingPrice: match.listing.price || '',
        listingStatus: match.listing.status || '',
        unitMatch: match.unitMatch || '',
        matchedAt
      });
    }
    return best.size;
  })();
}

export function openDatabase(options = {}) {
  const dbPath = options.dbPath || process.env.DB_PATH || defaultDbPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);

  const count = db.prepare('SELECT COUNT(*) AS count FROM reviews').get().count;
  const snapshotPath = options.snapshotPath || defaultSnapshotPath;
  if (count === 0 && fs.existsSync(snapshotPath)) {
    importSnapshot(db, JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
  }
  return db;
}

export function importSnapshot(db, snapshot) {
  if (!Array.isArray(snapshot?.reviews)) {
    throw new Error('Snapshot must contain a reviews array');
  }

  const insertReview = db.prepare(`
    INSERT INTO reviews (
      id, source_type, source_id, title, address, suburb, state, country,
      agency_name, agency_key, rating, review_text, submitted_at,
      source_created_at, landlord_type, latitude, longitude,
      location_precision, imported_at
    ) VALUES (
      @id, @sourceType, @sourceId, @title, @address, @suburb, @state, @country,
      @agencyName, @agencyKey, @rating, @reviewText, @submittedAt,
      @sourceCreatedAt, @landlordType, @latitude, @longitude,
      @locationPrecision, @importedAt
    )
  `);
  const insertFts = db.prepare(`
    INSERT INTO reviews_fts (
      review_id, title, address, suburb, state, country, agency_name, review_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAgency = db.prepare(`
    INSERT INTO agencies (
      agency_key, name, total_reviews, property_reviews, agency_reviews,
      low_rating_reviews, average_rating, states_json, suburbs_json,
      latest_review_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const setMetadata = db.prepare(`
    INSERT INTO metadata (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);

  db.transaction(() => {
    db.exec('DELETE FROM reviews_fts; DELETE FROM agencies; DELETE FROM reviews; DELETE FROM metadata;');
    const agencies = new Map();

    for (const source of snapshot.reviews) {
      const review = normalizeReview(source, snapshot.syncedAt);
      insertReview.run(review);
      insertFts.run(
        review.id,
        review.title,
        review.address,
        review.suburb,
        review.state,
        review.country,
        review.agencyName,
        review.reviewText
      );
      if (review.agencyKey) addAgencyReview(agencies, review);
    }

    for (const [agencyKey, agency] of agencies) {
      const ratings = agency.ratings;
      insertAgency.run(
        agencyKey,
        mostCommon(agency.names),
        agency.total,
        agency.property,
        agency.agency,
        agency.low,
        ratings.length ? round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : null,
        JSON.stringify([...agency.states].sort()),
        JSON.stringify([...agency.suburbs].sort().slice(0, 40)),
        agency.latest || null
      );
    }

    setMetadata.run('source_synced_at', snapshot.syncedAt || new Date().toISOString());
    setMetadata.run('source_url', snapshot.sourceUrl || '');
    setMetadata.run('map_source_url', snapshot.mapSourceUrl || '');
  })();
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((row) => row.name));
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
    })();
  }
}

function normalizeReview(source, importedAt) {
  const agencyName = cleanText(source.agencyName);
  return {
    id: cleanText(source.id),
    sourceType: source.sourceType === 'agency' ? 'agency' : 'property',
    sourceId: cleanText(source.sourceId || source.id),
    title: cleanText(source.title) || 'Untitled review',
    address: cleanText(source.address),
    suburb: cleanText(source.suburb),
    state: cleanText(source.state).toUpperCase(),
    country: cleanText(source.country) || 'Australia',
    agencyName,
    agencyKey: normalizeAgencyName(agencyName),
    rating: Number.isInteger(source.rating) ? source.rating : null,
    reviewText: cleanText(source.reviewText),
    submittedAt: source.submittedAt || null,
    sourceCreatedAt: source.sourceCreatedAt || null,
    landlordType: cleanText(source.landlordType),
    latitude: Number.isFinite(source.latitude) ? source.latitude : null,
    longitude: Number.isFinite(source.longitude) ? source.longitude : null,
    locationPrecision: source.locationPrecision || null,
    importedAt: importedAt || new Date().toISOString()
  };
}

function addAgencyReview(agencies, review) {
  const current = agencies.get(review.agencyKey) || {
    names: new Map(),
    total: 0,
    property: 0,
    agency: 0,
    low: 0,
    ratings: [],
    states: new Set(),
    suburbs: new Set(),
    latest: null
  };
  current.names.set(review.agencyName, (current.names.get(review.agencyName) || 0) + 1);
  current.total += 1;
  current[review.sourceType] += 1;
  if (review.rating != null) {
    current.ratings.push(review.rating);
    if (review.rating <= 2) current.low += 1;
  }
  if (review.state) current.states.add(review.state);
  if (review.suburb) current.suburbs.add(review.suburb);
  const date = review.submittedAt || review.sourceCreatedAt;
  if (date && (!current.latest || date > current.latest)) current.latest = date;
  agencies.set(review.agencyKey, current);
}

function mostCommon(counts) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}

function round(value) {
  return Math.round(value * 10) / 10;
}

