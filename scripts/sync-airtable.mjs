import { parse } from 'csv-parse/sync';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText, normalizeLookup } from '../shared/normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceUrl = 'https://airtable.com/embed/app5nuiBfQvyyqojK/shrcYJ6DOxDdiBuDE?layout=card';
const mapSourceUrl = 'https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv';
const tableIds = {
  property: 'tblxFlCLXImh1mJZT',
  agency: 'tblAGJ2FmYQ5eWfXI'
};

const sourcePage = await fetchText(sourceUrl);
const context = parseShareContext(sourcePage);
const [propertyTable, agencyTable, mapCsv] = await Promise.all([
  fetchTable(context, tableIds.property),
  fetchTable(context, tableIds.agency),
  fetchText(mapSourceUrl)
]);

const locations = buildLocationIndex(mapCsv);
const propertyReviews = normalizeTable(propertyTable, 'property', locations);
const agencyReviews = normalizeTable(agencyTable, 'agency', locations);
const snapshot = {
  syncedAt: new Date().toISOString(),
  sourceUrl,
  mapSourceUrl,
  reviews: [...propertyReviews, ...agencyReviews]
};

await fs.mkdir(path.join(root, 'data'), { recursive: true });
await fs.writeFile(path.join(root, 'data', 'reviews.json'), `${JSON.stringify(snapshot)}\n`);
await fs.rm(path.join(root, 'data', 'shitrentals.db'), { force: true });
await fs.rm(path.join(root, 'data', 'shitrentals.db-shm'), { force: true });
await fs.rm(path.join(root, 'data', 'shitrentals.db-wal'), { force: true });

const mapped = snapshot.reviews.filter((review) => review.latitude != null).length;
console.log(`Synced ${snapshot.reviews.length} reviews (${propertyReviews.length} property, ${agencyReviews.length} agency).`);
console.log(`Mapped ${mapped} reviews to suburb/locality centroids.`);

function parseShareContext(html) {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const initScript = scripts.find((script) => script.includes('window.initData = '));
  const prefetchScript = scripts.find((script) => script.includes('x-early-prefetch'));
  if (!initScript || !prefetchScript) throw new Error('Airtable share bootstrap data was not found');

  const marker = 'window.initData = ';
  const start = initScript.indexOf(marker) + marker.length;
  const init = JSON.parse(initScript.slice(start, initScript.indexOf(';', start)));
  const headers = JSON.parse(prefetchScript.match(/var headers = (\{.*?\});/)?.[1] || '{}');
  delete headers['x-airtable-accept-msgpack'];
  headers['x-time-zone'] = 'Australia/Melbourne';
  return { init, headers };
}

async function fetchTable({ init, headers }, tableId) {
  const params = encodeURIComponent(JSON.stringify({
    includeDataForTableIds: [tableId],
    includeDataForViewIds: null,
    shouldIncludeSchemaChecksum: true,
    mayExcludeCellDataForLargeViews: false,
    allowMsgpackOfResult: false
  }));
  const url = `https://airtable.com/v0.3/application/${init.sharedApplicationId}/read`
    + `?stringifiedObjectParams=${params}`
    + `&requestId=reqRentalRecordSync`
    + `&accessPolicy=${encodeURIComponent(init.accessPolicy)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Airtable table request failed (${response.status})`);
  const payload = await response.json();
  const schema = payload.data.tableSchemas.find((table) => table.id === tableId);
  const data = payload.data.tableDatas.find((table) => table.id === tableId);
  if (!schema || !data) throw new Error(`Airtable table ${tableId} was not returned`);
  return { schema, rows: data.rows };
}

function normalizeTable(table, sourceType, locations) {
  const columns = Object.fromEntries(table.schema.columns.map((column) => [column.name, column]));
  const selectName = (columnName, value) => columns[columnName]?.typeOptions?.choices?.[value]?.name || '';
  const value = (row, name) => row.cellValuesByColumnId[columns[name]?.id];

  return table.rows.map((row) => {
    const isProperty = sourceType === 'property';
    const state = isProperty
      ? selectName('State/City', value(row, 'State/City'))
      : selectName('State', value(row, 'State'));
    const suburb = cleanText(value(row, isProperty ? 'Suburb' : 'Branch Suburb'));
    const location = locations.get(`${normalizeLookup(suburb)}|${state}`) || null;
    const agencyName = cleanText(value(row, isProperty ? 'Agency Name' : 'Name of Agency'));
    const address = cleanText(value(row, isProperty ? 'Address' : 'Street Number & Name'));
    return {
      id: `${sourceType}:${row.id}`,
      sourceId: row.id,
      sourceType,
      title: isProperty ? address : agencyName,
      address,
      suburb,
      state,
      country: isProperty
        ? selectName('Country', value(row, 'Country')) || 'Australia'
        : 'Australia',
      agencyName,
      rating: integerOrNull(value(row, 'Rating')),
      reviewText: cleanText(value(row, 'Review')),
      submittedAt: isProperty ? value(row, 'Review Submitted') || null : row.createdTime,
      sourceCreatedAt: row.createdTime,
      landlordType: isProperty
        ? selectName('Agency or Private Landlord?', value(row, 'Agency or Private Landlord?'))
        : 'Agency',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      locationPrecision: location ? 'suburb' : null
    };
  });
}

function buildLocationIndex(csv) {
  const records = parse(csv, { columns: true, skip_empty_lines: true, relax_quotes: true });
  const index = new Map();
  for (const record of records) {
    const latitude = Number(record.Lat_precise || record.lat);
    const longitude = Number(record.Long_precise || record.long);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const key = `${normalizeLookup(record.locality)}|${cleanText(record.state).toUpperCase()}`;
    if (!index.has(key)) index.set(key, { latitude, longitude });
  }
  return index;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'RentalRecord/0.1 data-sync' }
  });
  if (!response.ok) throw new Error(`Request failed for ${url} (${response.status})`);
  return response.text();
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

