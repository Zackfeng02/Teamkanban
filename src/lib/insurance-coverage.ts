import { optionalABFields, withOptionalAB, type Coverage, type Review } from './insurance-review.ts';

const amounts = (values: number[]) => values.map(value => ({ value: String(value), label: String(value) }));
export const coverageLists: Record<string, { label: string; options: { value: string; label: string }[] }> = {
  'Third-party liability': { label: '责任险', options: [1, 2, 3].map(n => ({ value: String(n * 1_000_000), label: `${n}M` })) },
  'Collision deductible': { label: '碰撞险起赔', options: [{ value: '无', label: '无' }, ...amounts([500, 1000, 1500, 2000, 2500, 3000, 4000, 5000]) ] },
  'Comprehensive deductible': { label: '综合险起赔', options: [{ value: '无', label: '无' }, ...amounts([500, 1000, 1500, 2000, 2500, 3000, 4000, 5000]) ] },
  'New vehicle replacement': { label: '新车险', options: [{ value: '无', label: '无' }, ...amounts([12, 24, 36, 48])] },
  'Loss of use': { label: '租车服务', options: [{ value: '无', label: '无' }, ...amounts([1000, 1500, 2000, 2500, 3000])] },
  'Rental vehicle damage': { label: '租车险', options: [{ value: '无', label: '无' }, ...[50, 75, 100].map(n => ({ value: String(n * 1000), label: `${n}k` }))] },
  'Accident forgiveness': { label: '首次有责免涨', options: [{ value: '无', label: '无' }, { value: '有', label: '有' }] },
  'Conviction forgiveness': { label: '首次罚单免涨', options: [{ value: '无', label: '无' }, { value: '有', label: '有' }] },
  'Sewer backup': { label: '下水道倒灌', options: amounts([500, 1000, 2000, 2500, 3000, 4000, 5000]) },
  'Overland water': { label: '地表水保障', options: amounts([500, 1000, 2000, 2500, 3000, 4000, 5000]) },
  'Property deductible': { label: '房屋险起赔额', options: amounts([500, 1000, 2000, 2500, 3000, 4000, 5000]) },
};
const abAmounts = new Set(optionalABFields.slice(1).map(([, en]) => en));
export const isCoverageHeading = (en: string) => en === 'OPCF 47R';
export const isAmountCoverage = (en: string) => abAmounts.has(en);
export const isUnknownCoverage = (value: string) => !value.trim() || value.trim() === '待确认';
export const coverageUnneeded = (row: Coverage, index: number) => isAmountCoverage(row.en) && (!!row.excluded?.[index] || isUnknownCoverage(row.values[index]));
export function optionalCoverageTotal(rows: Coverage[], index: number): number | null {
  const amounts = rows.filter(row => isAmountCoverage(row.en)).map(row => coverageUnneeded(row, index) ? '0' : coverageAmount(row.values[index]));
  if (!amounts.length || amounts.some(amount => amount === null)) return null;
  return amounts.reduce((sum, amount) => sum + Math.round(Number(amount) * 100), 0) / 100;
}
export function coverageAmount(value: string): string | null {
  const raw = value.trim();
  if (['-', '无', '不包含'].includes(raw)) return '0';
  const unprefixed = raw.replace(/^\$\s*/, '');
  if (unprefixed.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?([kKmM])?$/.test(unprefixed)) return null;
  const clean = unprefixed.replace(/,/g, '');
  const match = clean.match(/^(\d+(?:\.\d{1,2})?)([kKmM])?$/);
  if (!match) return null;
  const number = Number(match[1]) * (match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1000 : 1);
  return Number.isSafeInteger(Math.round(number * 100)) ? String(number) : null;
}
export function coverageValue(en: string, value: string): string {
  if (isUnknownCoverage(value)) return '';
  const raw = value.trim();
  const options = coverageLists[en]?.options;
  if (options) {
    if (['无', '不包含', '-'].includes(raw) && options.some(o => o.value === '无')) return '无';
    if (['包含', '有'].includes(raw) && options.some(o => o.value === '有')) return '有';
    return coverageAmount(raw) ?? raw;
  }
  return isAmountCoverage(en) ? coverageAmount(raw) ?? raw : raw;
}
export function coverageDisplay(en: string, value: string, currency: string): string {
  const normalized = coverageValue(en, value);
  if (!normalized) return isAmountCoverage(en) ? '-' : '待确认';
  if (isAmountCoverage(en)) {
    const amount = coverageAmount(normalized);
    if (amount !== null) return Number(amount) === 0 ? '-' : new Intl.NumberFormat('en-CA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount));
  }
  return coverageLists[en]?.options.find(o => o.value === normalized)?.label ?? value;
}
export const coverageHasDifference = (row: Coverage) => new Set(row.values.map(value => coverageValue(row.en, value))).size > 1;
export function coverageComplete(row: Coverage, index: number): boolean {
  if (isCoverageHeading(row.en)) return true;
  if (coverageUnneeded(row, index)) return true;
  const value = coverageValue(row.en, row.values[index]);
  if (!value) return false;
  if (isAmountCoverage(row.en)) return coverageAmount(value) !== null;
  return true;
}
export function personalPropertySuggestion(dwellingCoverage: string): string | null {
  const raw = dwellingCoverage.trim();
  if (!raw || ['-', '无', '不包含'].includes(raw)) return null;
  const amount = coverageAmount(raw);
  if (amount === null) return null;
  const suggested = Math.round(Number(amount) * 0.75);
  return Number.isSafeInteger(suggested) ? String(suggested) : null;
}
export function updatePropertyCoverageRows(rows: Coverage[], rowIndex: number, plan: number, value: string): Coverage[] {
  const next = structuredClone(rows);
  const changed = next[rowIndex];
  if (!changed || !Number.isInteger(plan) || plan < 0 || plan >= changed.values.length) return next;
  changed.values[plan] = value;
  if (changed.en !== 'Dwelling coverage') return next;
  const personalProperty = next.find(row => row.en === 'Personal property');
  const suggested = personalPropertySuggestion(value);
  if (personalProperty && suggested !== null && plan < personalProperty.values.length) personalProperty.values[plan] = suggested;
  return next;
}
export function withCoverageControls(review: Review): Review {
  const next = withOptionalAB(review);
  const rename = (rows: Coverage[]) => rows.map(row => ({
    ...row,
    label: coverageLists[row.en]?.label ?? optionalABFields.find(([, en]) => row.en === en)?.[0] ?? row.label,
  }));
  const autoRows = rename(next.autoRows);
  const missing = ['Rental vehicle damage', 'Conviction forgiveness', 'New vehicle replacement'].filter(en => !autoRows.some(row => row.en === en))
    .map(en => ({ en, label: coverageLists[en].label, values: next.carriers.map(() => '待确认') }));
  const index = autoRows.findIndex(row => isCoverageHeading(row.en));
  autoRows.splice(index < 0 ? autoRows.length : index, 0, ...missing);
  const order = ['Third-party liability', 'Collision deductible', 'Comprehensive deductible', 'New vehicle replacement', 'Loss of use', 'Rental vehicle damage', 'Accident forgiveness', 'Conviction forgiveness'];
  const ordered = [...order.flatMap(en => autoRows.filter(row => row.en === en)), ...autoRows.filter(row => !order.includes(row.en))];
  return { ...next, autoRows: ordered, homeRows: rename(next.homeRows), properties: next.properties?.map(p => ({ ...p, rows: rename(p.rows) })) };
}
