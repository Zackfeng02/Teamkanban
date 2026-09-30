'use client';
import { useState } from 'react';
import { CarFront, House } from 'lucide-react';
import CoverageValue from './coverage-value';
import { coverageAmount, coverageUnneeded, optionalCoverageTotal, isUnknownCoverage, coverageValue, isAmountCoverage, isCoverageHeading, updatePropertyCoverageRows } from '../lib/insurance-coverage';
import { propertyTypes, riskIncluded, paymentBreakdown, type Coverage, type VehicleQuote, type PropertyQuote } from '../lib/insurance-review';

const coreCoverages = new Set(['Collision deductible', 'Comprehensive deductible', 'Dwelling coverage', 'Personal property', 'Personal liability', 'Property deductible', 'Sewer backup', 'Overland water']);
type Risk = VehicleQuote | PropertyQuote;
export default function InsuranceRiskTable({ kind, risks, titles, editing, onlyDiff, selected, currency, period, money, onAdd, onChange, onRemove }: {
  kind: 'auto' | 'home'; risks: Risk[]; titles: string[]; editing: boolean; onlyDiff: boolean; selected: number | null; currency: string; period: string;
  money: (n: number | null) => string; onAdd: () => void; onChange: (id: string, patch: Partial<PropertyQuote & VehicleQuote>) => void; onRemove: (id: string) => void;
}) {
  const noun = kind === 'auto' ? '车辆' : '房屋';
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return <section className="ir-coverage">
    <div className="ir-coverage-title">{kind === 'auto' ? <CarFront size={18}/> : <House size={18}/>}<h3>{kind === 'auto' ? '汽车保险' : '房屋保险'}</h3><span>{risks.length} {kind === 'auto' ? '辆车' : '处房屋'} · 逐项比较价格与保障</span><button className="ir-add ir-add-vehicle" onClick={onAdd}>＋ 添加{noun}</button></div>
    <p className="ir-risk-help">在各方案列勾选要报价的{noun}。取消纳入会保留填写内容，该项目不计入方案总价。</p>
    {risks.map((risk, riskIndex) => {
      const cellClass = (i: number) => onlyDiff && !riskIncluded(risk, i) ? 'ir-risk-muted' : selected === i ? 'chosen' : '';
      const excludedContent = <span className="ir-excluded">未纳入此方案</span>;
      const rows = risk.rows ?? [];
      const patchRows = (rowIndex: number, plan: number, value: string) => {
        const changed = kind === 'home' ? updatePropertyCoverageRows(rows, rowIndex, plan, value) : structuredClone(rows);
        if (kind !== 'home') changed[rowIndex].values[plan] = value;
        if (isAmountCoverage(rows[rowIndex].en)) changed[rowIndex].excluded = titles.map((_, i) => i === plan ? isUnknownCoverage(value) : coverageUnneeded(rows[rowIndex], i));
        onChange(risk.id, { rows: changed });
      };
      const comparisonValue = (row: Coverage, i: number) => !riskIncluded(risk, i) ? '__excluded__' : coverageUnneeded(row, i) ? '__unneeded__' : coverageValue(row.en, row.values[i]);
      const differs = (row: Coverage) => new Set(titles.map((_, i) => comparisonValue(row, i))).size > 1;
      const premiumDiffers = new Set(titles.map((_, i) => riskIncluded(risk, i) ? coverageAmount(risk.premiums[i]) ?? risk.premiums[i] : '__excluded__')).size > 1;
      const abRows = rows.filter(row => isAmountCoverage(row.en));
      const abDiffers = abRows.some(differs);


      return <table key={risk.id} className={`ir-risk-table ${onlyDiff ? 'ir-diff-compact' : ''}`} aria-label={`${noun}${riskIndex + 1}独立比价`}>
        <colgroup><col/>{titles.map((t, i) => <col key={i}/>)}</colgroup>
        <thead><tr><th scope="col">{noun} {riskIndex + 1}</th>{titles.map((t, i) => <th scope="col" key={i} className={onlyDiff && !riskIncluded(risk, i) ? 'ir-risk-muted' : ''}>{t}</th>)}</tr></thead>
        <tbody>
          <tr className="ir-vehicle-row"><th scope="row"><span className="ir-vehicle-label">{noun} {riskIndex + 1}</span>
            {editing ? <><input aria-label={`${noun}${riskIndex + 1}信息`} placeholder={kind === 'auto' ? '年份 / 品牌 / 型号 / 车牌' : '地址 / 房屋名称'} value={risk.name} onChange={e => onChange(risk.id, { name: e.target.value })}/>
              {'type' in risk && <select aria-label={`房屋${riskIndex + 1}类型`} value={risk.type} onChange={e => onChange(risk.id, { type: e.target.value as PropertyQuote['type'] })}><option value="">请选择房屋类型</option>{propertyTypes.map(type => <option key={type}>{type}</option>)}</select>}
              <button className="ir-remove-vehicle" disabled={risks.length === 1} onClick={() => onRemove(risk.id)}>移除{noun} {riskIndex + 1}</button>
            </> : <span className="ir-vehicle-name">{risk.name || `待填写${noun}信息`}{'type' in risk && ` · ${risk.type || '类型待确认'}`}</span>}
          </th>{titles.map((title, i) => <td key={i} className={cellClass(i)}><label className="ir-risk-include"><input type="checkbox" aria-label={`${title}纳入${noun}${riskIndex + 1}`} checked={riskIncluded(risk, i)} disabled={!editing} onChange={e => { const included = titles.map((_, j) => riskIncluded(risk, j)); included[i] = e.target.checked; onChange(risk.id, { included }); }}/>{riskIncluded(risk, i) ? '纳入此方案' : excludedContent}</label></td>)}</tr>
          {true && <tr className="ir-premium"><th scope="row">{noun} {riskIndex + 1} 年保费<small>已含各可选项目价格 · 未含税费</small></th>{titles.map((title, i) => <td key={i} className={cellClass(i)}>{!riskIncluded(risk, i) ? excludedContent : editing ? <input type="number" min="0" step="0.01" aria-label={`${title}${noun}${riskIndex + 1}年保费`} value={risk.premiums[i]} onChange={e => { const premiums = [...risk.premiums]; premiums[i] = e.target.value; onChange(risk.id, { premiums }); }}/> : money(paymentBreakdown(risk.premiums[i], kind)?.base ?? null)}</td>)}</tr>}
          {period === 'month' && true && <tr className="ir-payment-row"><th scope="row">单项月付估算<small>含税费 · 汇总后舍入可能相差分币</small></th>{titles.map((title, i) => <td key={i} className={cellClass(i)}>{riskIncluded(risk, i) ? money(paymentBreakdown(risk.premiums[i], kind)?.monthly ?? null) : excludedContent}</td>)}</tr>}
          {rows.map((row, r) => isCoverageHeading(row.en) ? true && <tr key={row.en} className="ir-ab-start"><th><button type="button" aria-expanded={!!expanded[risk.id]} onClick={() => setExpanded(current => ({ ...current, [risk.id]: !current[risk.id] }))}>{expanded[risk.id] ? '▾' : '▸'} OPCF 47R 合计</button><small>已包含在总价中 · 点击展开明细</small></th>{titles.map((title, i) => <td key={i} className={cellClass(i)}>{riskIncluded(risk, i) ? (optionalCoverageTotal(rows, i) ? money(optionalCoverageTotal(rows, i)) : '-') : excludedContent}</td>)}</tr> : (!isAmountCoverage(row.en) || expanded[risk.id]) && (!onlyDiff || coreCoverages.has(row.en)) && <tr key={row.en}>
            <th scope="row">{row.label}{!onlyDiff && <small>{row.en}{isAmountCoverage(row.en) ? ' · 保险价格' : ''}</small>}</th>
            {row.values.map((value, i) => <td key={i} className={`${cellClass(i)} ${riskIncluded(risk, i) && i > 0 && comparisonValue(row, i) !== comparisonValue(row, 0) ? 'ir-cell-different' : ''} ${riskIncluded(risk, i) && !coverageUnneeded(row, i) && !coverageValue(row.en, value) ? 'unknown' : ''}`}>
              {!riskIncluded(risk, i) ? excludedContent : <span className={!editing && i > 0 && riskIncluded(risk, 0) && coverageValue(row.en, value) !== coverageValue(row.en, row.values[0]) ? 'ir-different' : ''}>{editing && isAmountCoverage(row.en) && <label className="ir-ab-unneeded"><input type="checkbox" aria-label={`${titles[i]}${noun}${riskIndex + 1}${row.label}不需要`} checked={coverageUnneeded(row, i)} onChange={event => {
                const changed = structuredClone(rows);
                changed[r].excluded = titles.map((_, plan) => plan === i ? event.target.checked : coverageUnneeded(row, plan));
                onChange(risk.id, { rows: changed });
              }}/>不需要</label>}{coverageUnneeded(row, i) && !(editing && isUnknownCoverage(value)) ? <span>-</span> : <CoverageValue row={row} value={value} label={`${titles[i]}${noun}${riskIndex + 1}${row.label}`} editing={editing} currency={currency} onChange={v => patchRows(r, i, v)}/>}</span>}
            </td>)}
          </tr>)}
        </tbody>
      </table>;
    })}
  </section>;
}
