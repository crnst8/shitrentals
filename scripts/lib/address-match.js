// Pure helpers for matching free-text DB addresses against structured listing
// address parts. Kept dependency-free and side-effect-free so they can be unit
// tested without touching the database or any listing source.

import { normalizeLookup } from '../../shared/normalize.js';

const STREET_TYPES = new Map(Object.entries({
  st: 'street', str: 'street', rd: 'road', ave: 'avenue', av: 'avenue',
  ct: 'court', crt: 'court', cr: 'crescent', cres: 'crescent', cresent: 'crescent',
  dr: 'drive', drv: 'drive', pl: 'place', ln: 'lane', hwy: 'highway',
  pde: 'parade', tce: 'terrace', terr: 'terrace', cl: 'close', blvd: 'boulevard',
  bvd: 'boulevard', boul: 'boulevard', gr: 'grove', grv: 'grove', sq: 'square',
  esp: 'esplanade', cct: 'circuit', cir: 'circuit', circ: 'circuit',
  pkwy: 'parkway', wy: 'way'
}));

export function expandStreet(value) {
  return normalizeLookup(value)
    .split(' ')
    .filter(Boolean)
    .map((token) => STREET_TYPES.get(token) || token)
    .join(' ');
}

// A normalized "<number> <street>" key used to match within a single suburb.
export function streetKey(number, street) {
  const n = normalizeLookup(number);
  const s = expandStreet(street);
  return n && s ? `${n} ${s}` : '';
}

// Parse a free-text DB address such as "2/582 Ipswich Road" or "55-57 Wardell Rd"
// into { unit, number, street, baseKey }.
export function parseAddress(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const match = text.match(
    /^\s*(?:(?<unit>[\w]+)\s*\/\s*)?(?<number>\d+[a-zA-Z]?(?:\s*-\s*\d+[a-zA-Z]?)?)\s+(?<street>.+)$/
  );
  if (!match) return { unit: '', number: '', street: '', baseKey: '' };
  const unit = normalizeLookup(match.groups.unit || '');
  const number = normalizeLookup(match.groups.number);
  const street = expandStreet(match.groups.street);
  return { unit, number, street, baseKey: streetKey(number, street) };
}

// Build the same baseKey from a listing's structured address parts.
export function listingKey({ streetNumber, street }) {
  return streetKey(streetNumber, street);
}

export function unitAgreement(reviewUnit, listingUnit) {
  const a = normalizeLookup(reviewUnit || '');
  const b = normalizeLookup(listingUnit || '');
  if (!a && !b) return 'none';
  if (!a || !b) return 'unknown';
  return a === b ? 'match' : 'mismatch';
}
