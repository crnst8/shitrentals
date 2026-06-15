// Re-imports data/reviews.json into an existing database. Used after
// `npm run sync` to apply a refreshed snapshot to a running deployment without
// rebuilding the volume.
//
// importSnapshot replaces reviews/agencies/metadata but leaves listing_matches
// untouched, and review ids are stable across syncs, so the "currently listed"
// matches survive a reseed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSnapshot, openDatabase } from '../server/database.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = process.env.SNAPSHOT_PATH || path.join(root, 'data', 'reviews.json');

const db = openDatabase();
const before = db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
importSnapshot(db, JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
const after = db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
const matches = db.prepare('SELECT COUNT(*) AS n FROM listing_matches').get().n;
console.log(`Reseeded reviews ${before} -> ${after}; ${matches} listing match(es) preserved.`);
