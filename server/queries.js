import { buildFtsQuery, cleanText, normalizeAgencyName } from '../shared/normalize.js';

export function getMeta(db) {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS reviews,
      SUM(source_type = 'property') AS propertyReviews,
      SUM(source_type = 'agency') AS agencyReviews,
      SUM(latitude IS NOT NULL AND longitude IS NOT NULL) AS mappedReviews,
      COUNT(DISTINCT NULLIF(agency_key, '')) AS agencies
    FROM reviews
  `).get();
  const ratings = db.prepare(`
    SELECT ROUND(AVG(rating), 1) AS averageRating,
      SUM(rating <= 2) AS lowRatingReviews
    FROM reviews WHERE rating IS NOT NULL
  `).get();
  const states = db.prepare(`
    SELECT state, COUNT(*) AS count
    FROM reviews WHERE state != ''
    GROUP BY state ORDER BY state
  `).all();
  const metadata = Object.fromEntries(
    db.prepare('SELECT key, value FROM metadata').all().map((row) => [row.key, row.value])
  );
  const listed = db.prepare('SELECT COUNT(*) AS listedReviews FROM listing_matches').get();
  return { ...counts, ...ratings, ...listed, states, ...metadata };
}

export function searchReviews(db, input) {
  const page = clampInt(input.page, 1, 10_000, 1);
  const pageSize = clampInt(input.pageSize, 1, 100, 24);
  const where = [];
  const values = {};
  const ftsQuery = buildFtsQuery(input.q);
  let from = 'reviews r';

  if (ftsQuery) {
    from = 'reviews_fts f JOIN reviews r ON r.id = f.review_id';
    where.push('reviews_fts MATCH @fts');
    values.fts = ftsQuery;
  }
  from += ' LEFT JOIN listing_matches lm ON lm.review_id = r.id';
  applyReviewFilters(where, values, input);
  if (input.listed === '1' || input.listed === 'true') {
    where.push('lm.review_id IS NOT NULL');
  }

  const sort = {
    relevance: ftsQuery ? 'bm25(reviews_fts), COALESCE(r.submitted_at, r.source_created_at) DESC' : null,
    newest: 'COALESCE(r.submitted_at, r.source_created_at) DESC',
    oldest: 'COALESCE(r.submitted_at, r.source_created_at) ASC',
    rating_low: 'r.rating ASC, COALESCE(r.submitted_at, r.source_created_at) DESC',
    rating_high: 'r.rating DESC, COALESCE(r.submitted_at, r.source_created_at) DESC'
  }[input.sort] || (ftsQuery ? 'bm25(reviews_fts), COALESCE(r.submitted_at, r.source_created_at) DESC' : 'COALESCE(r.submitted_at, r.source_created_at) DESC');

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM ${from} ${clause}`).get(values).count;
  const items = db.prepare(`
    SELECT r.*,
      lm.listing_id, lm.listing_address, lm.listing_url,
      lm.listing_price, lm.listing_status, lm.unit_match
    FROM ${from}
    ${clause}
    ORDER BY ${sort}
    LIMIT @limit OFFSET @offset
  `).all({ ...values, limit: pageSize, offset: (page - 1) * pageSize }).map(serializeReview);

  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function listAgencies(db, input) {
  const where = ["r.agency_key != ''"];
  const values = {};
  const query = cleanText(input.q).toLowerCase();
  if (query) {
    where.push('LOWER(r.agency_name) LIKE @query');
    values.query = `%${query}%`;
  }
  if (input.state) {
    where.push('r.state = @state');
    values.state = cleanText(input.state).toUpperCase();
  }
  const minReviews = clampInt(input.minReviews, 1, 1000, 2);
  const limit = clampInt(input.limit, 1, 200, 50);
  values.minReviews = minReviews;
  values.limit = limit;
  const order = {
    reviews: 'total_reviews DESC, low_rating_reviews DESC, average_rating ASC',
    rating: 'average_rating ASC, total_reviews DESC',
    low_ratings: 'low_rating_reviews DESC, total_reviews DESC, average_rating ASC',
    name: 'a.name COLLATE NOCASE'
  }[input.sort] || 'low_rating_reviews DESC, total_reviews DESC, average_rating ASC';

  return db.prepare(`
    SELECT
      a.agency_key,
      a.name,
      COUNT(*) AS total_reviews,
      SUM(r.source_type = 'property') AS property_reviews,
      SUM(r.source_type = 'agency') AS agency_reviews,
      SUM(r.rating <= 2) AS low_rating_reviews,
      ROUND(AVG(r.rating), 1) AS average_rating,
      GROUP_CONCAT(DISTINCT NULLIF(r.state, '')) AS states,
      GROUP_CONCAT(DISTINCT NULLIF(r.suburb, '')) AS suburbs,
      MAX(COALESCE(r.submitted_at, r.source_created_at)) AS latest_review_at
    FROM reviews r
    JOIN agencies a ON a.agency_key = r.agency_key
    WHERE ${where.join(' AND ')}
    GROUP BY a.agency_key, a.name
    HAVING COUNT(*) >= @minReviews
    ORDER BY ${order}
    LIMIT @limit
  `).all(values).map((row) => ({
    ...row,
    states: splitList(row.states),
    suburbs: splitList(row.suburbs).slice(0, 8)
  }));
}

export function getAgency(db, agencyKey) {
  const key = normalizeAgencyName(agencyKey);
  const agency = db.prepare('SELECT * FROM agencies WHERE agency_key = ?').get(key);
  if (!agency) return null;
  return {
    ...agency,
    states: JSON.parse(agency.states_json),
    suburbs: JSON.parse(agency.suburbs_json),
    reviews: db.prepare(`
      SELECT * FROM reviews
      WHERE agency_key = ?
      ORDER BY COALESCE(submitted_at, source_created_at) DESC
    `).all(key).map(serializeReview)
  };
}

export function getMapPoints(db, input) {
  const where = ['r.latitude IS NOT NULL', 'r.longitude IS NOT NULL'];
  const values = {};
  const query = cleanText(input.q).toLowerCase();
  if (query) {
    where.push(`(
      LOWER(r.title) LIKE @mapQuery
      OR LOWER(r.address) LIKE @mapQuery
      OR LOWER(r.suburb) LIKE @mapQuery
      OR LOWER(r.agency_name) LIKE @mapQuery
      OR LOWER(r.review_text) LIKE @mapQuery
    )`);
    values.mapQuery = `%${query}%`;
  }
  applyReviewFilters(where, values, input);
  const limit = clampInt(input.limit, 1, 1000, 500);
  values.limit = limit;
  return db.prepare(`
    SELECT
      r.suburb,
      r.state,
      r.country,
      r.latitude,
      r.longitude,
      COUNT(*) AS review_count,
      ROUND(AVG(r.rating), 1) AS average_rating,
      SUM(r.rating <= 2) AS low_rating_reviews,
      SUM(r.source_type = 'property') AS property_reviews,
      SUM(r.source_type = 'agency') AS agency_reviews
    FROM reviews r
    WHERE ${where.join(' AND ')}
    GROUP BY r.suburb, r.state, r.country, r.latitude, r.longitude
    ORDER BY review_count DESC
    LIMIT @limit
  `).all(values);
}

function applyReviewFilters(where, values, input) {
  if (input.type === 'property' || input.type === 'agency') {
    where.push('r.source_type = @type');
    values.type = input.type;
  }
  if (input.state) {
    where.push('r.state = @state');
    values.state = cleanText(input.state).toUpperCase();
  }
  if (input.maxRating) {
    where.push('r.rating <= @maxRating');
    values.maxRating = clampInt(input.maxRating, 1, 5, 5);
  }
  if (input.agency) {
    where.push('r.agency_key = @agency');
    values.agency = normalizeAgencyName(input.agency);
  }
}

function serializeReview(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    address: row.address,
    suburb: row.suburb,
    state: row.state,
    country: row.country,
    agencyName: row.agency_name,
    agencyKey: row.agency_key,
    rating: row.rating,
    reviewText: row.review_text,
    submittedAt: row.submitted_at,
    sourceCreatedAt: row.source_created_at,
    landlordType: row.landlord_type,
    latitude: row.latitude,
    longitude: row.longitude,
    locationPrecision: row.location_precision,
    listing: row.listing_url || row.listing_id ? {
      id: row.listing_id,
      address: row.listing_address,
      url: row.listing_url,
      price: row.listing_price,
      status: row.listing_status,
      unitMatch: row.unit_match
    } : null
  };
}

function splitList(value) {
  return value ? value.split(',').filter(Boolean) : [];
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
