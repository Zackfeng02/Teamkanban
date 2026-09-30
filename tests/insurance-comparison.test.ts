import test from 'node:test';
import assert from 'node:assert/strict';
import { initialReview, annualPayable, planPayments, isReview } from '../src/lib/insurance-review.ts';
import { comparisonReview, copyRiskPlan, withRiskQuotes, sameRiskComposition } from '../src/lib/insurance-risks.ts';
import { prepareCloudProfile } from '../src/lib/insurance-cloud-validation.ts';

test('comparison scope isolates unknown premiums and preserves annual tax and monthly fees', () => {
  const data = withRiskQuotes(structuredClone(initialReview));
  const original = structuredClone(data);
  assert.equal(annualPayable(comparisonReview(data, 'all'), 1), 3715.2);
  assert.equal(annualPayable(comparisonReview(data, 'auto'), 1), 2160);
  assert.equal(annualPayable(comparisonReview(data, 'home'), 1), 1555.2);
  assert.equal(planPayments(comparisonReview(data, 'auto'), 1).monthly, 182.34);
  assert.equal(planPayments(comparisonReview(data, 'home'), 1).monthly, 133.2);
  assert.deepEqual(data, original);
  data.properties![0].premiums[1] = '';
  assert.equal(annualPayable(comparisonReview(data, 'all'), 1), null);
  assert.equal(annualPayable(comparisonReview(data, 'auto'), 1), 2160);
  data.vehicles![0].included![1] = false;
  assert.equal(annualPayable(comparisonReview(data, 'auto'), 1), null);
  assert.equal(planPayments(comparisonReview(data, 'auto'), 1).monthly, null);
});

test('comparison differences consider only risks of the displayed kind', () => {
  const data = withRiskQuotes(structuredClone(initialReview));
  data.properties![0].included![1] = false;
  assert.equal(sameRiskComposition(data, 0, 1), false);
  assert.equal(sameRiskComposition(comparisonReview(data, 'auto'), 0, 1), true);
  assert.equal(sameRiskComposition(comparisonReview(data, 'home'), 0, 1), false);
});

test('every source plan can be copied with coverage, exclusions and inclusion intact and edits independent', () => {
  const data = withRiskQuotes(structuredClone(initialReview));
  data.selected = 1;
  data.checks = [true, true, true];
  data.vehicles![0].rows![0].excluded = [false, true, false];
  data.properties![0].included![2] = false;
  data.legacyAutoRows = structuredClone(data.autoRows);
  const original = structuredClone(data);
  for (const source of [0, 1, 2]) {
    const copy = copyRiskPlan(data, source);
    const index = data.carriers.length;
    assert.equal(isReview(copy), true);
    assert.equal(copy.selected, data.selected);
    assert.deepEqual(copy.checks, [false, false, false]);
    assert.equal(copy.carriers[index], data.carriers[source]);
    assert.equal(annualPayable(copy, index), annualPayable(data, source));
    for (const [i, risk] of [...copy.vehicles!, ...copy.properties!].entries()) {
      const prior = [...data.vehicles!, ...data.properties!][i];
      assert.equal(risk.included![index], prior.included![source]);
      assert.equal(risk.premiums[index], prior.premiums[source]);
      for (const [j, row] of risk.rows!.entries()) {
        assert.equal(row.values[index], prior.rows![j].values[source]);
        assert.equal(row.excluded?.[index], prior.rows![j].excluded?.[source]);
      }
    }
    assert.equal(prepareCloudProfile({id:'copy-test',review:copy,status:'draft'}).review.carriers.length, 4);
    copy.vehicles![0].premiums[index] = '9999';
    copy.vehicles![0].rows![0].values[index] = 'changed';
    assert.equal(copy.vehicles![0].premiums[source], data.vehicles![0].premiums[source]);
    assert.equal(copy.vehicles![0].rows![0].values[source], data.vehicles![0].rows![0].values[source]);
    assert.deepEqual(data, original);
  }
  assert.throws(() => copyRiskPlan(data, -1), RangeError);
  assert.throws(() => copyRiskPlan(data, 3), RangeError);
});
