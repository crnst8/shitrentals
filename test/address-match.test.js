import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expandStreet,
  listingKey,
  parseAddress,
  unitAgreement
} from '../scripts/lib/address-match.js';

test('expandStreet canonicalizes street-type abbreviations', () => {
  assert.equal(expandStreet('Ipswich Rd'), 'ipswich road');
  assert.equal(expandStreet('Summerhill Road'), 'summerhill road');
  assert.equal(expandStreet('Wardell St'), 'wardell street');
  assert.equal(expandStreet('Main Pde'), 'main parade');
});

test('parseAddress splits unit, number and street', () => {
  assert.deepEqual(parseAddress('2/582 Ipswich Road'), {
    unit: '2',
    number: '582',
    street: 'ipswich road',
    baseKey: '582 ipswich road'
  });
  assert.deepEqual(parseAddress('55-57 Wardell Rd'), {
    unit: '',
    number: '55 57',
    street: 'wardell road',
    baseKey: '55 57 wardell road'
  });
  assert.equal(parseAddress('3/18 Powell').baseKey, '18 powell');
});

test('parseAddress returns empty keys for unparseable input', () => {
  assert.equal(parseAddress('').baseKey, '');
  assert.equal(parseAddress('I do not recall').baseKey, '');
});

test('DB address and structured listing address parts produce the same baseKey', () => {
  const review = parseAddress('2/582 Ipswich Rd');
  const listing = listingKey({ streetNumber: '582', street: 'Ipswich Road' });
  assert.equal(review.baseKey, listing);
});

test('unitAgreement distinguishes match, mismatch and unknown', () => {
  assert.equal(unitAgreement('2', '2'), 'match');
  assert.equal(unitAgreement('2', '5'), 'mismatch');
  assert.equal(unitAgreement('', ''), 'none');
  assert.equal(unitAgreement('2', ''), 'unknown');
});
