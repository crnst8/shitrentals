import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importSnapshot, openDatabase, replaceListingMatches } from '../server/database.js';
import { getAgency, getMapPoints, getMeta, listAgencies, searchReviews } from '../server/queries.js';
import { buildFtsQuery, normalizeAgencyName } from '../shared/normalize.js';

test('agency names normalize conservatively', () => {
  assert.equal(normalizeAgencyName('  Ray White Pty. Ltd. '), 'ray white');
  assert.equal(normalizeAgencyName('Ray White — Brunswick'), 'ray white brunswick');
  assert.equal(normalizeAgencyName('Jellis Craig & Co'), 'jellis craig and co');
});

test('FTS query uses prefix terms and ignores punctuation', () => {
  assert.equal(buildFtsQuery('mould, St Kilda'), '"mould"* AND "st"* AND "kilda"*');
});

test('search, correlation and map queries use the normalized snapshot', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rental-record-'));
  const db = openDatabase({
    dbPath: path.join(directory, 'test.db'),
    snapshotPath: path.join(directory, 'missing.json')
  });

  importSnapshot(db, {
    syncedAt: '2026-06-14T00:00:00.000Z',
    reviews: [
      {
        id: 'property:1',
        sourceType: 'property',
        sourceId: '1',
        title: '1 Test Street',
        address: '1 Test Street',
        suburb: 'Brunswick',
        state: 'VIC',
        country: 'Australia',
        agencyName: 'Example Realty Pty Ltd',
        rating: 1,
        reviewText: 'Persistent mould and ignored repairs.',
        submittedAt: '2025-01-01T00:00:00.000Z',
        latitude: -37.766,
        longitude: 144.961,
        locationPrecision: 'suburb'
      },
      {
        id: 'agency:2',
        sourceType: 'agency',
        sourceId: '2',
        title: 'Example Realty',
        suburb: 'Brunswick',
        state: 'VIC',
        country: 'Australia',
        agencyName: 'Example Realty',
        rating: 2,
        reviewText: 'Maintenance requests went unanswered.',
        submittedAt: '2025-02-01T00:00:00.000Z',
        latitude: -37.766,
        longitude: 144.961,
        locationPrecision: 'suburb'
      },
      {
        id: 'property:3',
        sourceType: 'property',
        sourceId: '3',
        title: '2 Good Road',
        suburb: 'Carlton',
        state: 'VIC',
        country: 'Australia',
        agencyName: 'Different Agency',
        rating: 5,
        reviewText: 'A responsive manager.',
        submittedAt: '2025-03-01T00:00:00.000Z',
        latitude: -37.8,
        longitude: 144.967,
        locationPrecision: 'suburb'
      }
    ]
  });

  const search = searchReviews(db, { q: 'mould', pageSize: 10 });
  assert.equal(search.total, 1);
  assert.equal(search.items[0].id, 'property:1');

  const agencies = listAgencies(db, { minReviews: 2, sort: 'low_ratings' });
  assert.equal(agencies.length, 1);
  assert.equal(agencies[0].total_reviews, 2);
  assert.equal(agencies[0].low_rating_reviews, 2);

  const agency = getAgency(db, 'example realty');
  assert.equal(agency.reviews.length, 2);
  assert.equal(agency.property_reviews, 1);
  assert.equal(agency.agency_reviews, 1);

  const points = getMapPoints(db, { state: 'VIC' });
  assert.equal(points.length, 2);
  assert.equal(points.find((point) => point.suburb === 'Brunswick').review_count, 2);

  db.close();
  await rm(directory, { recursive: true, force: true });
});

test('listing matches persist, filter reviews, attach to results and count in meta', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rental-record-'));
  const db = openDatabase({
    dbPath: path.join(directory, 'test.db'),
    snapshotPath: path.join(directory, 'missing.json')
  });

  importSnapshot(db, {
    syncedAt: '2026-06-14T00:00:00.000Z',
    reviews: [
      { id: 'property:1', sourceType: 'property', sourceId: '1', title: '1 Test Street', address: '1 Test Street', suburb: 'Brunswick', state: 'VIC', country: 'Australia', agencyName: 'Example Realty', rating: 1, reviewText: 'Mould.' },
      { id: 'property:2', sourceType: 'property', sourceId: '2', title: '2 Other Street', address: '2 Other Street', suburb: 'Brunswick', state: 'VIC', country: 'Australia', agencyName: 'Example Realty', rating: 3, reviewText: 'Fine.' }
    ]
  });

  // Two raw matches for the same review: the unit-exact one should win.
  const saved = replaceListingMatches(db, [
    { review: { id: 'property:1' }, listing: { id: 'L9', address: '5/1 Test Street', url: 'https://homely/x', price: '$500 per week', status: 'available' }, unitMatch: 'mismatch' },
    { review: { id: 'property:1' }, listing: { id: 'L1', address: '1 Test Street', url: 'https://homely/1', price: '$600 per week', status: 'available' }, unitMatch: 'none' }
  ], 'homely.com.au (for-rent)');
  assert.equal(saved, 1);

  const meta = getMeta(db);
  assert.equal(meta.listedReviews, 1);

  const listed = searchReviews(db, { listed: '1', pageSize: 10 });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].id, 'property:1');
  assert.equal(listed.items[0].listing.price, '$600 per week'); // unit-less match won
  assert.equal(listed.items[0].listing.url, 'https://homely/1');

  const all = searchReviews(db, { pageSize: 10 });
  assert.equal(all.total, 2);
  assert.equal(all.items.find((r) => r.id === 'property:2').listing, null);

  db.close();
  await rm(directory, { recursive: true, force: true });
});

