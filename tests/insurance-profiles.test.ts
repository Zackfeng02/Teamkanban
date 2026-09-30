import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankProfile, readProfiles, upsertProfile, type SavedProfile } from '../src/lib/insurance-profiles.ts';
const make = (id: string): SavedProfile => ({ id, review: blankProfile(), status: 'draft', savedAt: new Date().toISOString() });
test('profiles save independently and survive serialization', () => {
  const a = make('a'); a.review.name = 'Alice';
  const b = make('b'); b.review.name = 'Bob';
  const store = upsertProfile(upsertProfile(null, a), b);
  const changed = structuredClone(a); changed.review.note = 'Updated';
  const next = readProfiles(JSON.stringify(upsertProfile(store, changed)))!;
  assert.equal(next.profiles.length, 2);
  assert.equal(next.profiles.find(p => p.id === 'b')?.review.name, 'Bob');
  assert.equal(next.profiles.find(p => p.id === 'b')?.review.note, '');
  assert.equal(next.activeId, 'a');
  assert.equal(a.review.note, '');
});
test('new profile contains no prior client, premium, or confirmation data', () => {
  const a = blankProfile(); a.vehicles![0].premiums[0] = '100';
  const b = blankProfile();
  assert.equal(b.name, ''); assert.equal(b.phone, ''); assert.equal(b.effective, '');
  assert.equal(b.selected, null); assert.ok(b.checks.every(v => !v));
  assert.ok(b.vehicles![0].premiums.every(v => v === ''));
});
test('invalid profile stores fail closed', () => {
  const a = make('a');
  assert.equal(readProfiles(null), null);
  assert.throws(() => readProfiles('{'));
  assert.throws(() => readProfiles(JSON.stringify({ version: 1, activeId: 'b', profiles: [a] })));
  assert.throws(() => readProfiles(JSON.stringify({ version: 1, activeId: 'a', profiles: [a, a] })));
});
