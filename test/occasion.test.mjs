import test from 'node:test';
import assert from 'node:assert/strict';
import { getOccasion } from '../lib/occasion.mjs';

test('gives birthdays priority over other dashboard occasions without exposing a name', () => {
  const occasion = getOccasion({ now: new Date('2026-03-03T16:00:00.000Z'), members: [{ name: 'Colin', birthday: '03-03', active: true }] });
  assert.equal(occasion.type, 'birthday');
  assert.doesNotMatch(occasion.prompt, /Colin/);
});

test('recognizes a major Chinese festival in the local dashboard timezone', () => {
  const occasion = getOccasion({ now: new Date('2026-02-17T17:00:00.000Z') });
  assert.equal(occasion.type, 'holiday');
  assert.match(occasion.prompt, /Lunar New Year/);
});
