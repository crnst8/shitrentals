import assert from 'node:assert/strict';
import test from 'node:test';
import { dateTimeValue, formatDate, formatRelativeDate } from '../src/date.js';

test('formats recent dates relative to the current calendar day', () => {
  const now = new Date('2026-06-14T12:00:00.000Z');

  assert.equal(formatRelativeDate('2026-06-14T01:00:00.000Z', now), 'today');
  assert.equal(formatRelativeDate('2026-06-13T12:00:00.000Z', now), 'yesterday');
  assert.equal(formatRelativeDate('2026-06-12T12:00:00.000Z', now), '2 days ago');
});

test('uses larger relative units for older dates', () => {
  const now = new Date('2026-06-14T12:00:00.000Z');

  assert.equal(formatRelativeDate('2026-05-31T12:00:00.000Z', now), '2 weeks ago');
  assert.equal(formatRelativeDate('2026-03-14T12:00:00.000Z', now), '3 months ago');
  assert.equal(formatRelativeDate('2024-06-14T12:00:00.000Z', now), '2 years ago');
});

test('retains exact and machine-readable dates', () => {
  const value = '2026-06-12T12:00:00.000Z';

  assert.match(formatDate(value), /12 June? 2026|12 Jun 2026/);
  assert.equal(dateTimeValue(value), value);
  assert.equal(formatRelativeDate('not-a-date'), 'Unknown date');
  assert.equal(dateTimeValue('not-a-date'), undefined);
});
