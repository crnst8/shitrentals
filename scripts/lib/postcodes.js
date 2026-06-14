// Builds a suburb+state -> postcode(s) index from the public australian
// postcodes dataset (the same source the Airtable sync uses for map points).
// Homely's rental URLs require a postcode, but the review database only stores
// suburb + state, so we resolve postcodes locally. The CSV is cached under
// data/ after the first download.

import { parse } from 'csv-parse/sync';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText, normalizeLookup } from '../../shared/normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAP_SOURCE_URL =
  'https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv';
const cachePath = path.join(root, 'data', 'australian_postcodes.csv');

export async function loadPostcodeIndex() {
  let csv;
  if (fs.existsSync(cachePath)) {
    csv = fs.readFileSync(cachePath, 'utf8');
  } else {
    const response = await fetch(MAP_SOURCE_URL, {
      headers: { 'user-agent': 'RentalRecord/0.1 data-sync' }
    });
    if (!response.ok) throw new Error(`Postcode download failed (${response.status})`);
    csv = await response.text();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, csv);
  }

  const records = parse(csv, { columns: true, skip_empty_lines: true, relax_quotes: true });
  const index = new Map();
  for (const record of records) {
    const postcode = cleanText(record.postcode);
    if (!/^\d{3,4}$/.test(postcode)) continue;
    const key = `${normalizeLookup(record.locality)}|${cleanText(record.state).toUpperCase()}`;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(postcode);
  }
  return index;
}

export function postcodesFor(index, suburb, state) {
  const key = `${normalizeLookup(suburb)}|${cleanText(state).toUpperCase()}`;
  return [...(index.get(key) || [])];
}
