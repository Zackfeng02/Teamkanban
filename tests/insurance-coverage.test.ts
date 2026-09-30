import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageUnneeded, optionalCoverageTotal, coverageAmount, coverageDisplay, coverageValue, coverageHasDifference, coverageComplete, coverageLists, personalPropertySuggestion, updatePropertyCoverageRows, withCoverageControls } from '../src/lib/insurance-coverage.ts';
import { initialReview, withProperties, optionalABFields, isReview } from '../src/lib/insurance-review.ts';

test('coverage controls migrate labels and missing rows without replacing old quote values', () => {
  const original = withProperties(structuredClone(initialReview));
  original.properties![0].rows[3].values[1] = '$750';
  const migrated = withCoverageControls(original);
  assert.equal(migrated.autoRows.find(r => r.en === 'Third-party liability')!.label, '责任险');
  assert.equal(migrated.autoRows.find(r => r.en === 'OPCF 47R')!.label, 'OPCF 47R 可选 OAB 价格');
  assert.deepEqual(migrated.autoRows.find(r => r.en === 'Third-party liability')!.values, original.autoRows[0].values);
  assert.equal(migrated.properties![0].rows[3].label, '房屋险起赔额');
  assert.equal(migrated.properties![0].rows[3].values[1], '$750');
  assert.equal(original.properties![0].rows[3].label, '房屋险自付额');
  for (const en of ['Rental vehicle damage', 'Conviction forgiveness', 'New vehicle replacement']) {
    assert.deepEqual(migrated.autoRows.find(r => r.en === en)!.values, ['待确认', '待确认', '待确认']);
    assert.ok(migrated.autoRows.findIndex(r => r.en === en) < migrated.autoRows.findIndex(r => r.en === 'OPCF 47R'));
  }
  assert.deepEqual(withCoverageControls(migrated), migrated);
  assert.equal(isReview(migrated), true);
});
test('old money and boolean strings map exactly without inferring unknown limits', () => {
  assert.equal(coverageDisplay('Third-party liability', '$2,000,000', 'CAD'), '2M');
  assert.equal(coverageValue('Rental vehicle damage', '75k'), '75000');
  assert.equal(coverageValue('Loss of use', '不包含'), '无');
  assert.equal(coverageValue('Accident forgiveness', '包含'), '有');
  assert.equal(coverageValue('Collision deductible', '不包含'), '无');
  assert.equal(coverageValue('Comprehensive deductible', '-'), '无');
  assert.equal(coverageValue('New vehicle replacement', '不包含'), '无');
  assert.deepEqual(coverageLists['New vehicle replacement'].options.map(option => option.value), ['无', '12', '24', '36', '48']);
  assert.equal(coverageDisplay('New vehicle replacement', '24', 'CAD'), '24');
  assert.equal(coverageValue('Third-party liability', '特殊条款'), '特殊条款');
  assert.equal(coverageValue('Third-party liability', '待确认'), '');
  assert.equal(coverageHasDifference({ en: 'Collision deductible', label: '', values: ['$1,000', '1000', '1k'] }), false);
});
test('AB empty prices default to unneeded and display a dash; heading cannot block confirmation', () => {
  const en = optionalABFields[1][1];
  for (const zero of ['0', '0.00', '$0', '不包含']) assert.equal(coverageDisplay(en, zero, 'CAD'), '-');
  for (const unknown of ['', '待确认']) {
    assert.equal(coverageDisplay(en, unknown, 'CAD'), '-');
    assert.equal(coverageComplete({ en, label: '', values: [unknown] }, 0), true);
  }
  assert.equal(coverageComplete({ en: 'OPCF 47R', label: '', values: ['待确认'] }, 0), true);
  assert.equal(coverageComplete({ en, label: '', values: ['0'] }, 0), true);
  assert.equal(coverageComplete({ en, label: '', values: ['包含'] }, 0), false);
  assert.equal(coverageAmount('$1,500.25'), '1500.25');
  assert.equal(coverageAmount('-1'), null);
  assert.equal(coverageAmount('包含 + 限额待确认'), null);
});
test('dwelling coverage suggests rounded personal property without locking manual edits', () => {
  const rows = [
    { en: 'Dwelling coverage', label: '房屋重建保额', values: ['', '', ''] },
    { en: 'Personal property', label: '个人财物', values: ['自定义金额', '原有金额', '保持不变'] },
  ];
  const suggested = updatePropertyCoverageRows(rows, 0, 1, '$750,001');
  assert.equal(suggested[0].values[1], '$750,001');
  assert.equal(suggested[1].values[1], '562501');
  assert.equal(rows[1].values[1], '原有金额');
  const manual = updatePropertyCoverageRows(suggested, 1, 1, '500000');
  assert.equal(manual[1].values[1], '500000');
  const cleared = updatePropertyCoverageRows(manual, 0, 2, '');
  assert.equal(cleared[1].values[2], '保持不变');
  assert.equal(personalPropertySuggestion('1000.50'), '750');
  assert.equal(personalPropertySuggestion(''), null);
  assert.equal(personalPropertySuggestion('无'), null);
});


test('optional totals ignore unneeded amounts, preserve real prices, and reject invalid amounts', () => {
  const en = optionalABFields[1][1];
  const blank = { en, label: '', values: ['', '待确认'], excluded: [false, false] };
  assert.equal(coverageUnneeded(blank, 0), true);
  assert.equal(coverageUnneeded(blank, 1), true);
  assert.equal(optionalCoverageTotal([blank], 0), 0);
  const priced = { en, label: '', values: ['12.34', '25.10'] };
  assert.equal(coverageUnneeded(priced, 0), false);
  assert.equal(optionalCoverageTotal([blank, priced], 0), 12.34);
  assert.equal(optionalCoverageTotal([priced, priced], 1), 50.2);
  assert.equal(optionalCoverageTotal([{ ...priced, excluded: [true, false] }], 0), 0);
  assert.equal(priced.values[0], '12.34');
  assert.equal(optionalCoverageTotal([{ ...priced, values: ['invalid'] }], 0), null);
  assert.equal(coverageDisplay('Third-party liability', '', 'CAD'), '待确认');
});
