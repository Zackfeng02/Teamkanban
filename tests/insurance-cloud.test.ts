import { withCoverageControls, isAmountCoverage, coverageLists, isCoverageHeading } from '../src/lib/insurance-coverage.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareCloudProfile } from '../src/lib/insurance-cloud-validation.ts';
import { blankProfile } from '../src/lib/insurance-profiles.ts';
import { initialReview, withProperties, withVehicles, withOptionalAB } from '../src/lib/insurance-review.ts';
const input = () => ({ id: 'test', status: 'draft', review: blankProfile(), paymentView: 'year' });
test('cloud payload validates version and review; server owns totals and timestamp', () => {
  const result = prepareCloudProfile({ ...input(), payments: [{ monthly: 1 }], savedAt: 'fake' });
  assert.equal(result.version, 0);
  assert.equal(result.payments![0].monthly, null);
  assert.ok(Number.isFinite(Date.parse(result.savedAt)));
  assert.throws(() => prepareCloudProfile({ ...input(), version: -1 }));
  assert.throws(() => prepareCloudProfile({ ...input(), review: {} }));
  assert.throws(() => prepareCloudProfile({ ...input(), id: '' }));
});
test('cloud confirmation cannot be forged; legacy import preserves content as draft', () => {
  assert.throws(() => prepareCloudProfile({ ...input(), status: 'confirmed' }), /INCOMPLETE/);
  const legacy = prepareCloudProfile({ ...input(), review: initialReview, status: 'confirmed' }, true);
  assert.equal(legacy.status, 'draft');
  assert.deepEqual(legacy.review.properties![0].premiums, initialReview.home);
  assert.deepEqual(legacy.review.properties![0].rows.map(r => ({ en: r.en, values: r.values })), initialReview.homeRows.map(r => ({ en: r.en, values: r.values })));
  assert.equal(legacy.review.properties![0].type, '');
});
test('complete confirmation supports multiple properties and calculates all plan payments', () => {
  const review = withCoverageControls(withProperties(withVehicles(withOptionalAB(structuredClone(initialReview)))));
  review.selected = 1; review.checks = [true,true,true]; review.properties![0].type = '自住房';
  [...review.autoRows, ...review.properties![0].rows].forEach(r => r.values[1] = isCoverageHeading(r.en) ? '待确认' : isAmountCoverage(r.en) ? '1000' : coverageLists[r.en]?.options[0].value ?? '包含');
  const result = prepareCloudProfile({ ...input(), review, status: 'confirmed' });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.payments![1].monthly, 315.54);
  review.effective = '2026-02-30';
  assert.throws(() => prepareCloudProfile({ ...input(), review, status: 'confirmed' }), /INCOMPLETE/);
});
