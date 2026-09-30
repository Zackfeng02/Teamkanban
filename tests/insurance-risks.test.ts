import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRiskQuotes, emptyRiskRows, addRiskPlan, sameRiskComposition, canConfirmReview } from '../src/lib/insurance-risks.ts';
import { initialReview, total, planPayments, isReview, type Review } from '../src/lib/insurance-review.ts';
import { coverageLists, isAmountCoverage, isCoverageHeading } from '../src/lib/insurance-coverage.ts';
import { prepareCloudProfile } from '../src/lib/insurance-cloud-validation.ts';

function scenario(): Review {
  const data = withRiskQuotes(structuredClone(initialReview));
  const rows = () => emptyRiskRows(data.autoRows, 3);
  data.vehicles = [
    { id: 'A', name: 'A车', included: [true, true, true], premiums: ['100', '110', '120'], rows: rows() },
    { id: 'B', name: 'B车', included: [true, true, false], premiums: ['200', '210', '999'], rows: rows() },
    { id: 'C', name: 'C车', included: [false, false, true], premiums: ['', '', '300'], rows: rows() },
  ];
  data.properties = [
    { id: 'H1', name: 'H1房', type: '自住房', included: [true, true, false], premiums: ['50', '60', ''], rows: structuredClone(data.homeRows) },
    { id: 'H2', name: 'H2房', type: '出租房', included: [false, false, true], premiums: ['', '', '70'], rows: structuredClone(data.homeRows) },
  ];
  return withRiskQuotes(data);
}
test('A+B and A+C plans sum only selected vehicles and homes; OAB is never added twice', () => {
  const data = scenario();
  assert.equal(total(data, 1), 380);
  assert.equal(total(data, 2), 490);
  assert.equal(sameRiskComposition(data, 0, 1), true);
  assert.equal(sameRiskComposition(data, 1, 2), false);
  data.vehicles![0].rows!.find(r => r.en === 'Income replacement')!.values[1] = '5000';
  assert.equal(total(data, 1), 380);
  data.vehicles![2].included![1] = true;
  assert.equal(total(data, 1), null);
  data.vehicles![2].included![1] = false;
  assert.equal(total(data, 1), 380);
  assert.equal(data.vehicles![1].premiums[2], '999');
  assert.equal(isReview(JSON.parse(JSON.stringify(data))), true);
});
test('auto-only and home-only plans work, while a completely empty plan remains unquoted', () => {
  const data = scenario();
  data.properties!.forEach(p => p.included![1] = false);
  assert.equal(total(data, 1), 320);
  assert.equal(planPayments(data, 1).home?.base, 0);
  data.vehicles!.forEach(v => v.included![1] = false);
  assert.equal(total(data, 1), null);
  assert.equal(planPayments(data, 1).monthly, null);
  data.properties![0].included![1] = true;
  assert.equal(total(data, 1), 60);
});
test('per-risk and per-plan coverage edits stay independent and round-trip through cloud validation', () => {
  const data = scenario();
  data.vehicles![0].rows![0].values[1] = '3000000';
  data.vehicles![1].rows![0].values[1] = '1000000';
  data.vehicles![0].rows!.find(row => row.en === 'New vehicle replacement')!.values[1] = '24';
  data.vehicles![1].rows!.find(row => row.en === 'New vehicle replacement')!.values[1] = '48';
  data.properties![0].rows[0].values[1] = '850000';
  data.properties![0].rows.find(row => row.en === 'Personal property')!.values[1] = '410000';
  assert.equal(data.vehicles![0].rows![0].values[2], '待确认');
  const saved = prepareCloudProfile({ id: 'risk-test', review: data, status: 'draft' });
  assert.equal(saved.review.vehicles![0].rows![0].values[1], '3000000');
  assert.equal(saved.review.vehicles![1].rows![0].values[1], '1000000');
  assert.equal(saved.review.vehicles![0].rows!.find(row => row.en === 'New vehicle replacement')!.values[1], '24');
  assert.equal(saved.review.vehicles![1].rows!.find(row => row.en === 'New vehicle replacement')!.values[1], '48');
  assert.equal(saved.review.properties![0].rows.find(row => row.en === 'Personal property')!.values[1], '410000');
  assert.deepEqual(saved.review.properties![1].included, [false, false, true]);
  assert.equal(total(saved.review, 2), 490);
});
test('legacy multicar rows are preserved for reference, not guessed as each car coverage', () => {
  const data = structuredClone(initialReview);
  data.vehicles = [{ id: 'a', name: 'A', premiums: [...data.auto] }, { id: 'b', name: 'B', premiums: ['100','100','100'] }];
  const migrated = withRiskQuotes(data);
  assert.deepEqual(migrated.legacyAutoRows, data.autoRows);
  assert.ok(migrated.vehicles!.every(v => v.rows!.every(r => r.values.every(x => x === '待确认'))));
  assert.deepEqual(withRiskQuotes(migrated), migrated);
  const single = withRiskQuotes(initialReview);
  assert.deepEqual(single.vehicles![0].rows![0].values, initialReview.autoRows[0].values);
  assert.equal(single.legacyAutoRows, undefined);
});
test('confirmation requires only selected risk details but rejects missing included coverage', () => {
  const data = scenario();
  data.selected = 1; data.checks = [true, true, true];
  for (const risk of [...data.vehicles!, ...data.properties!].filter(r => r.included![1])) {
    for (const row of risk.rows!) row.values[1] = isCoverageHeading(row.en) ? '待确认' : isAmountCoverage(row.en) ? '0' : coverageLists[row.en]?.options[0].value ?? '包含';
  }
  assert.equal(canConfirmReview(data), true);
  assert.equal(prepareCloudProfile({ id: 'confirmed', review: data, status: 'confirmed' }).status, 'confirmed');
  data.vehicles![0].rows![0].values[1] = '';
  assert.equal(canConfirmReview(data), false);
  assert.throws(() => prepareCloudProfile({ id: 'incomplete', review: data, status: 'confirmed' }), /INCOMPLETE/);
});
test('adding a plan preserves prior combinations and extends all aligned arrays; invalid shapes fail', () => {
  const original = scenario();
  const next = addRiskPlan(original);
  assert.equal(isReview(next), true);
  assert.equal(total(next, 1), total(original, 1));
  assert.equal(total(next, 3), null);
  assert.ok(next.vehicles!.every(v => v.included![3] === false && v.rows!.every(r => r.values.length === 4)));
  const invalid = structuredClone(next); invalid.vehicles![0].included!.pop();
  assert.equal(isReview(invalid), false);
  const badRows = structuredClone(next); badRows.vehicles![1].rows![0].values.pop();
  assert.equal(isReview(badRows), false);
  const badHome = structuredClone(next); (badHome.properties![0].included as unknown[])![0] = 'yes';
  assert.equal(isReview(badHome), false);
});
test('unneeded OAB retains prices through save and new plans without copying exclusion to new vehicles', () => {
  const data = scenario();
  const row = data.vehicles![0].rows!.find(row => row.en === 'Income replacement')!;
  row.values[1] = '43'; row.excluded = [false, true, false];
  const saved = prepareCloudProfile({ id: 'unneeded', review: JSON.parse(JSON.stringify(data)), status: 'draft' });
  const restored = saved.review.vehicles![0].rows!.find(row => row.en === row.en && row.en === 'Income replacement')!;
  assert.equal(restored.values[1], '43');
  assert.deepEqual(restored.excluded, [false, true, false]);
  restored.excluded![1] = false;
  assert.equal(restored.values[1], '43');
  assert.equal(isReview(addRiskPlan(data)), true);
  assert.equal(emptyRiskRows(data.vehicles![0].rows!, 3).find(row => row.en === 'Income replacement')!.excluded, undefined);
  row.excluded = [true];
  assert.equal(isReview(data), false);
});
