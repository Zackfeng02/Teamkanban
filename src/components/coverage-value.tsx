'use client';
import type { Coverage } from '../lib/insurance-review';
import { coverageLists, coverageValue, coverageAmount, coverageDisplay, isAmountCoverage, isUnknownCoverage } from '../lib/insurance-coverage';

export default function CoverageValue({ row, value, label, editing, currency, onChange }: { row: Coverage; value: string; label: string; editing: boolean; currency: string; onChange: (value: string) => void }) {
  if (!editing) return <>{coverageDisplay(row.en, value, currency)}</>;
  const list = coverageLists[row.en];
  const normalized = coverageValue(row.en, value);
  if (list) return <select className="ir-coverage-select" aria-label={label} value={normalized} onChange={event => onChange(event.target.value)}>
    <option value="">待确认</option>
    {normalized && !list.options.some(option => option.value === normalized) && <option value={normalized}>{value}（原记录）</option>}
    {list.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
  if (isAmountCoverage(row.en)) {
    const amount = coverageAmount(value);
    return <div className="ir-coverage-amount"><input type="number" min="0" step="0.01" inputMode="decimal" aria-label={label} placeholder="-" value={amount ?? ''} onChange={event => onChange(event.target.value)}/>{amount === null && !isUnknownCoverage(value) && <small>原记录：{value}（填写保险价格后替换）</small>}</div>;
  }
  return <input aria-label={label} value={value} onChange={event => onChange(event.target.value)}/>;
}
