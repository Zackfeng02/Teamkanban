import { withCoverageControls, coverageComplete } from './insurance-coverage.ts';
import { withProperties, withVehicles, vehicleQuotes, propertyQuotes, riskIncluded, total, type Review, type Coverage } from './insurance-review.ts';

export const REVIEW_VERSION = 9;
export const emptyRiskRows = (rows: Coverage[], count: number): Coverage[] => rows.map(r => ({ ...r, excluded: undefined, values: Array.from({ length: count }, () => '待确认') }));

export function withRiskQuotes(review: Review): Review {
  const next = withCoverageControls(withProperties(withVehicles(review)));
  const vehicles = next.vehicles!;
  const ambiguous = vehicles.length > 1 && vehicles.some(v => !v.rows);
  return {
    ...next,
    ...(ambiguous && !next.legacyAutoRows ? { legacyAutoRows: structuredClone(review.autoRows) } : {}),
    vehicles: vehicles.map(v => ({ ...v, included: v.included ?? next.carriers.map(() => true),
      rows: withCoverageControls({ ...next, autoRows: v.rows ?? (vehicles.length === 1 ? structuredClone(next.autoRows) : emptyRiskRows(next.autoRows, next.carriers.length)) }).autoRows })),
    properties: next.properties!.map(p => ({ ...p, included: p.included ?? next.carriers.map(() => true) })),
  };
}
export function includedRiskIds(review: Review, index: number): string[] {
  return [...vehicleQuotes(review).filter(v => riskIncluded(v, index)).map(v => 'auto:' + v.id),
    ...propertyQuotes(review).filter(p => riskIncluded(p, index)).map(p => 'home:' + p.id)].sort();
}
export const sameRiskComposition = (review: Review, a: number, b: number) => JSON.stringify(includedRiskIds(review, a)) === JSON.stringify(includedRiskIds(review, b));
export function riskSummary(review: Review, index: number): string {
  const names = [...vehicleQuotes(review).filter(v => riskIncluded(v, index)).map(v => v.name || '未命名车辆'),
    ...propertyQuotes(review).filter(p => riskIncluded(p, index)).map(p => p.name || '未命名房屋')];
  return names.length ? names.join('、') : '尚未选择车辆或房屋';
}
export function canConfirmReview(review: Review): boolean {
  const index = review.selected;
  if (index === null || !review.carriers[index]?.trim() || total(review, index) === null || !review.name.trim() || !review.checks.every(Boolean)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.effective) || Number.isNaN(Date.parse(review.effective)) || new Date(review.effective).toISOString().slice(0, 10) !== review.effective) return false;
  return vehicleQuotes(review).filter(v => riskIncluded(v, index)).every(v => !!v.name.trim() && !!v.rows && v.rows.every(r => coverageComplete(r, index))) &&
    propertyQuotes(review).filter(p => riskIncluded(p, index)).every(p => !!p.name.trim() && !!p.type && p.rows.every(r => coverageComplete(r, index)));
}
export function addRiskPlan(review: Review): Review {
  const data = withRiskQuotes(review);
  const extendRows = (rows: Coverage[]) => rows.map(r => ({ ...r, excluded: r.excluded ? [...r.excluded, false] : undefined, values: [...r.values, '待确认'] }));
  return withRiskQuotes({ ...data, carriers: [...data.carriers, '新保险公司'], selected: data.selected, checks: [false, false, false],
    planNames: data.planNames ? [...data.planNames, ''] : undefined,
    auto: [...data.auto, ''], home: [...data.home, ''], autoRows: extendRows(data.autoRows), homeRows: extendRows(data.homeRows),
    legacyAutoRows: data.legacyAutoRows ? extendRows(data.legacyAutoRows) : undefined,
    vehicles: data.vehicles!.map(v => ({ ...v, included: [...v.included!, false], premiums: [...v.premiums, ''], rows: extendRows(v.rows!) })),
    properties: data.properties!.map(p => ({ ...p, included: [...p.included!, false], premiums: [...p.premiums, ''], rows: extendRows(p.rows) })),
  });
}


export type ComparisonScope = 'all' | 'auto' | 'home';
// Display-only projection; do not persist as the customer's review.
export function comparisonReview(review: Review, scope: ComparisonScope): Review {
  return { ...review, vehicles: scope === 'home' ? [] : vehicleQuotes(review),
    properties: scope === 'auto' ? [] : propertyQuotes(review) };
}
export function copyRiskPlan(review: Review, source: number): Review {
  if (!Number.isInteger(source) || source < 0 || source >= review.carriers.length) throw new RangeError('Invalid source plan');
  const data = structuredClone(withRiskQuotes(review));
  const copyRows = (rows: Coverage[]) => rows.map(r => ({ ...r,
    values: [...r.values, r.values[source]],
    excluded: r.excluded ? [...r.excluded, r.excluded[source]] : undefined }));
  return withRiskQuotes({ ...data, carriers: [...data.carriers, data.carriers[source]],
    planNames: [...data.carriers.map((_, i) => data.planNames?.[i] ?? ''), ''],
    checks: [false, false, false],
    auto: [...data.auto, data.auto[source]], home: [...data.home, data.home[source]],
    autoRows: copyRows(data.autoRows), homeRows: copyRows(data.homeRows),
    legacyAutoRows: data.legacyAutoRows ? copyRows(data.legacyAutoRows) : undefined,
    vehicles: data.vehicles!.map(v => ({ ...v, included: [...v.included!, v.included![source]], premiums: [...v.premiums, v.premiums[source]], rows: copyRows(v.rows!) })),
    properties: data.properties!.map(p => ({ ...p, included: [...p.included!, p.included![source]], premiums: [...p.premiums, p.premiums[source]], rows: copyRows(p.rows) })),
  });
}
