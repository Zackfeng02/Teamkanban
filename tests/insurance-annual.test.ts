import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualPayable, initialReview, planPayments, planTitle, isReview } from '../src/lib/insurance-review.ts';
import { withRiskQuotes, addRiskPlan } from '../src/lib/insurance-risks.ts';
import { prepareCloudProfile } from '../src/lib/insurance-cloud-validation.ts';

test('annual payment includes home tax once and excludes installment fees', () => {
  const review = withRiskQuotes(structuredClone(initialReview));
  review.vehicles![0].premiums[1] = '1000';
  review.properties![0].premiums[1] = '100';
  assert.equal(annualPayable(review, 1), 1108);
  assert.equal(planPayments(review, 1).home?.annual, 111);
  review.properties![0].included![1] = false;
  assert.equal(annualPayable(review, 1), 1000);
  review.vehicles![0].premiums[1] = '';
  assert.equal(annualPayable(review, 1), null);
});
test('plan names persist independently from carriers and extend with new plans', () => {
  const review = withRiskQuotes(structuredClone(initialReview));
  review.planNames = ['', 'A车和B车', 'A车和C车'];
  const saved = prepareCloudProfile({ id: 'names', review, status: 'draft' });
  assert.equal(planTitle(saved.review, 1), 'A车和B车');
  assert.equal(saved.review.carriers[1], initialReview.carriers[1]);
  const next = addRiskPlan(saved.review);
  assert.equal(isReview(next), true);
  assert.equal(planTitle(next, 3), '方案3');
});
