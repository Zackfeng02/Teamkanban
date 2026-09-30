import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialReview, total, isReview, paymentBreakdown, planPayments, withOptionalAB, withVehicles, autoPremium } from '../src/lib/insurance-review.ts';
test('annual totals use cents and incomplete quotes stay unknown', () => {
  assert.equal(total(initialReview, 0), 4320);
  const data = structuredClone(initialReview);
  data.auto[1] = '0.10'; data.home[1] = '0.20';
  assert.equal(total(data, 1), 0.3);
  for (const invalid of ['', '-20', 'abc', '10.001']) { data.auto[1] = invalid; assert.equal(total(data, 1), null); }
});
test('saved records support any number of complete aligned plans', () => {
  const data = structuredClone(initialReview);
  for (let i = 0; i < 12; i++) {
    data.carriers.push(`Carrier ${i}`); data.auto.push('1000'); data.home.push('500');
    [...data.autoRows, ...data.homeRows].forEach(row => row.values.push('待确认'));
  }
  data.selected = 14;
  assert.equal(isReview(JSON.parse(JSON.stringify(data))), true);
  assert.equal(total(data, 14), 1500);
  data.autoRows[0].values.pop();
  assert.equal(isReview(data), false);
  assert.equal(isReview({}), false);
});

test('monthly auto uses 1.3 percent fee without tax; home adds 3 percent fee and 8 percent base tax', () => {
  assert.deepEqual(paymentBreakdown('2400', 'auto'), { base: 2400, fee: 31.2, tax: 0, annual: 2431.2, monthly: 202.6 });
  assert.deepEqual(paymentBreakdown('1200', 'home'), { base: 1200, fee: 36, tax: 96, annual: 1332, monthly: 111 });
  assert.equal(planPayments(initialReview, 1).monthly, 315.54);
  assert.equal(paymentBreakdown('', 'home'), null);
  assert.equal(paymentBreakdown('-1', 'auto'), null);
  assert.equal(paymentBreakdown('0', 'auto')?.monthly, 0);
  assert.equal(paymentBreakdown('1000.01', 'home')?.monthly, 92.5);
});
test('Optional AB migration preserves old coverages and supports added plans without invented benefits', () => {
  const original = structuredClone(initialReview);
  const migrated = withOptionalAB(original);
  assert.equal(original.autoRows.length, 5);
  assert.equal(migrated.autoRows.length, 20);
  assert.deepEqual(migrated.autoRows.slice(0, 5), original.autoRows);
  assert.ok(migrated.autoRows.slice(5).every(row => row.values.every(value => value === '待确认')));
  assert.deepEqual(withOptionalAB(migrated), migrated);
  assert.equal(isReview(migrated), true);
});

test('legacy vehicle migration preserves quoted premiums and is idempotent', () => {
  const migrated = withVehicles(initialReview);
  assert.equal(migrated.vehicles?.length, 1);
  assert.equal(migrated.vehicles?.[0].name, initialReview.vehicle);
  assert.deepEqual(migrated.vehicles?.[0].premiums, initialReview.auto);
  assert.equal(total(migrated, 1), 3600);
  assert.deepEqual(withVehicles(migrated), migrated);
});
test('multiple vehicles sum in cents before applying the auto installment fee', () => {
  let data = withVehicles(initialReview);
  data.vehicles!.push({ id: 'second', name: '2024 Honda Civic', premiums: ['1200', '1000', '1100'] });
  data = withVehicles(data);
  assert.equal(autoPremium(data, 1), '3160.00');
  assert.equal(total(data, 1), 4600);
  assert.equal(planPayments(data, 1).auto?.fee, 41.08);
  assert.equal(planPayments(data, 1).monthly, 399.96);
  assert.equal(isReview(JSON.parse(JSON.stringify(data))), true);
  data.vehicles![1].premiums[1] = '';
  assert.equal(total(data, 1), null);
  assert.equal(planPayments(data, 1).monthly, null);
  data.vehicles!.pop();
  assert.equal(total(data, 1), 3600);
});
test('saved vehicles must retain unique identities and align with every plan', () => {
  const data = withVehicles(initialReview);
  data.vehicles![0].premiums.pop();
  assert.equal(isReview(data), false);
  assert.equal(isReview({ ...withVehicles(initialReview), vehicles: [] }), false);
});
import { propertyQuotes, withProperties, homePremium } from '../src/lib/insurance-review.ts';
test('legacy home migrates without guessing type or losing coverage', () => {
  const data = withProperties(initialReview);
  assert.deepEqual(propertyQuotes(data)[0].rows, initialReview.homeRows);
  assert.equal(propertyQuotes(data)[0].type, '');
  assert.equal(total(data, 1), 3600);
  assert.deepEqual(withProperties(data), data);
});
test('multiple homes retain independent coverage, aggregate premiums and reject incomplete records', () => {
  const data = withProperties(initialReview);
  data.properties!.push({ id: 'rental', name: 'Second home', type: '出租condo', premiums: ['100', '200', '300'], rows: structuredClone(initialReview.homeRows) });
  data.properties![1].rows[0].values[1] = '不适用';
  assert.notEqual(data.properties![0].rows[0].values[1], '不适用');
  assert.equal(homePremium(data, 1), '1640.00');
  assert.equal(total(data, 1), 3800);
  assert.equal(planPayments(data, 1).home?.monthly, 151.7);
  assert.equal(isReview(JSON.parse(JSON.stringify(data))), true);
  data.properties![1].premiums[1] = '';
  assert.equal(total(data, 1), null);
  data.properties![1].rows[0].values.pop();
  assert.equal(isReview(data), false);
  data.properties!.pop();
  assert.equal(total(data, 1), 3600);
});
