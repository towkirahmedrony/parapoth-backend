import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * The daily quota boundary is midnight in Asia/Dhaka (UTC+6, no DST). These
 * cases pin the boundary so a server running in UTC cannot shift it by 6 hours.
 */

const require = createRequire(__filename);
const { startOfDhakaDay, endOfDhakaDay, startOfDhakaDayIso } = require('../../lib/utils/time');

test('a UTC timestamp after 18:00 belongs to the next Dhaka day', () => {
  const start = startOfDhakaDay(new Date('2026-10-22T18:30:00.000Z'));

  assert.equal(start.toISOString(), '2026-10-22T18:00:00.000Z');
});

test('a UTC timestamp before 18:00 belongs to the current Dhaka day', () => {
  const start = startOfDhakaDay(new Date('2026-10-22T17:59:59.999Z'));

  assert.equal(start.toISOString(), '2026-10-21T18:00:00.000Z');
});

test('exactly 18:00 UTC is the start of the Dhaka day', () => {
  assert.equal(startOfDhakaDayIso(new Date('2026-10-22T18:00:00.000Z')), '2026-10-22T18:00:00.000Z');
});

test('the end of the Dhaka day is the next local midnight', () => {
  const end = endOfDhakaDay(new Date('2026-10-22T03:00:00.000Z'));

  assert.equal(end.toISOString(), '2026-10-22T18:00:00.000Z');
});

test('the Dhaka day boundary is exactly 24 hours wide', () => {
  const now = new Date('2026-12-31T20:15:00.000Z');
  const start = startOfDhakaDay(now).getTime();
  const end = endOfDhakaDay(now).getTime();

  assert.equal(end - start, 24 * 60 * 60 * 1000);
});
