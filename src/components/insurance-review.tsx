'use client';
import InsuranceRiskTable from './insurance-risk-table';
import { withRiskQuotes, canConfirmReview, emptyRiskRows, addRiskPlan, copyRiskPlan, comparisonReview, type ComparisonScope, sameRiskComposition, riskSummary, REVIEW_VERSION } from '../lib/insurance-risks';
import { withCoverageControls, coverageComplete, coverageHasDifference, coverageValue, isCoverageHeading } from '../lib/insurance-coverage';
import type { NavigationData } from './workspace-navigation';
import WorkspaceShell from './workspace-shell';
import { ActionButton, DensitySwitch } from './workspace-controls';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, CheckCheck, ChevronRight, CarFront, House, Phone, ShieldCheck, SlidersHorizontal, Download, Pencil, Save, X, FileCheck2 } from 'lucide-react';
import { propertyTypes, propertyQuotes, withProperties, type PropertyQuote, initialReview, isReview, STORAGE_KEY, annualPayable, planTitle, total, withOptionalAB, planPayments, withVehicles, vehicleQuotes, type VehicleQuote, type Review } from '../lib/insurance-review';


import { PROFILES_KEY, readProfiles, blankProfile, type SavedProfile as Saved } from '../lib/insurance-profiles';
export default function InsuranceReview() {
  const [navigationData, setNavigationData] = useState<NavigationData | null>(null);
  useEffect(() => { void fetch('/api/state', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setNavigationData).catch(() => {}); }, []);
  async function logout() { const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'logout' }) }); if (response.ok || response.status === 401) location.href = '/'; }

  const [data, setData] = useState<Review>(() => withRiskQuotes(blankProfile()));
  const titles = data.carriers.map((_, i) => planTitle(data, i));
  const [saved, setSaved] = useState<Saved | null>(null);
  const [profiles, setProfiles] = useState<Saved[]>([]);
  const [profileId, setProfileId] = useState('legacy-profile');
  const [profileSearch, setProfileSearch] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [localProfiles, setLocalProfiles] = useState<Saved[]>([]);
  const begin = () => { busyRef.current = true; setBusy(true); };
  const finish = () => { busyRef.current = false; setBusy(false); };
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [tab, setTab] = useState<ComparisonScope>('all');
  const [period, setPeriod] = useState('year');
  const [message, setMessage] = useState('');
  async function cloud(body?: unknown) {
    const response = await fetch('/api/insurance-profiles', { method: body ? 'POST' : 'GET', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '云端请求失败');
    return result;
  }
  async function refreshCloud(preferredId?: string) {
    const result = await cloud();
    const records: Saved[] = result.profiles;
    setProfiles(records); setReady(true);
    const target = records.find(p => p.id === preferredId) ?? records[0];
    if (target) loadProfile(target);
    else { setData(withRiskQuotes(blankProfile())); setSaved(null); setProfileId(crypto.randomUUID()); setDirty(false); }
  }
  useEffect(() => {
    try {
      const store = readProfiles(localStorage.getItem(PROFILES_KEY));
      if (store) setLocalProfiles(store.profiles);
      else {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const record = JSON.parse(raw);
          if (!isReview(record.review) || !['draft', 'confirmed'].includes(record.status) || typeof record.savedAt !== 'string') throw Error();
          setLocalProfiles([{ ...record, id: 'legacy-profile' }]);
        }
      }
    } catch { setMessage('本地旧记录无法读取，原记录未改动。'); }
    begin();
    void refreshCloud().catch(e => setMessage(`云端加载失败：${e.message}。请登录后重试。`)).finally(finish);
  }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  function update(patch: Partial<Review>) { setData(previous => withRiskQuotes({ ...previous, ...patch, checks: patch.checks ?? [false, false, false] })); setDirty(true); setMessage(''); }
  const vehicles = vehicleQuotes(data);
  const properties = propertyQuotes(data);
  function changeProperty(id: string, patch: Partial<PropertyQuote>) { update({ properties: properties.map(p => p.id === id ? { ...p, ...patch } : p) }); }
  function addProperty() { update({ properties: [...properties, { id: crypto.randomUUID(), name: '', type: '', included: data.carriers.map(() => false), premiums: data.carriers.map(() => ''), rows: data.homeRows.map(r => ({ ...r, values: data.carriers.map(() => '待确认') })) }] }); setEditing(true); }

  function changeVehicle(id: string, patch: Partial<VehicleQuote>) { update({ vehicles: vehicles.map(v => v.id === id ? { ...v, ...patch } : v) }); }
  function addVehicle() { update({ vehicles: [...vehicles, { id: crypto.randomUUID(), name: '', included: data.carriers.map(() => false), premiums: data.carriers.map(() => ''), rows: emptyRiskRows(data.autoRows, data.carriers.length) }] }); setEditing(true); }
  const money = (amount: number | null) => amount === null ? '待确认' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: data.currency, maximumFractionDigits: 2 }).format(amount);
  const totals = data.carriers.map((_, i) => i).map(i => annualPayable(data, i));
  const payments = data.carriers.map((_, i) => planPayments(data, i));
  const comparison = comparisonReview(data, tab);
  const displayTotals = data.carriers.map((_, i) => period === 'month' ? planPayments(comparison, i).monthly : annualPayable(comparison, i));
  const selectedTotal = data.selected === null ? null : totals[data.selected];
  const saving = selectedTotal !== null && totals[0] !== null && sameRiskComposition(data, 0, data.selected!) ? Math.round((totals[0] - selectedTotal) * 100) / 100 : null;

  const canConfirm = canConfirmReview(data);
  function loadProfile(record: Saved) {
    const migrated = withRiskQuotes(record.review);
    const changed = migrated.autoRows.length !== record.review.autoRows.length || record.calculationVersion !== REVIEW_VERSION;
    setData(changed ? { ...migrated, checks: [false, false, false] } : migrated);
    setSaved(record); setProfileId(record.id); setDirty(changed); setEditing(false); setOnlyDiff(false); setTab('all'); setPeriod(record.paymentView === 'month' ? 'month' : 'year');
    setMessage(changed ? '计算规则已更新，年付总额包含房险 8% 税，请核对后保存。' : '');
  }
  async function writeProfile(record: Saved): Promise<Saved> {
    const result = await cloud({ profile: { ...record, version: record.version ?? 0 } });
    const stored: Saved = result.profile;
    setProfiles(previous => [stored, ...previous.filter(p => p.id !== stored.id)]);
    setSaved(stored); setDirty(false);
    return stored;
  }
  async function persist(status: Saved['status']): Promise<boolean> {
    if (!ready || busyRef.current || (status === 'confirmed' && !canConfirm)) return false;
    begin();
    const record: Saved = { id: profileId, version: saved?.version ?? 0, review: structuredClone(data), status, savedAt: new Date().toISOString(), calculationVersion: REVIEW_VERSION, paymentView: period, payments };
    try { await writeProfile(record); setMessage(status === 'confirmed' ? '确认结果已保存到 Supabase。' : '草稿已保存到 Supabase。'); return true; }
    catch (e) { setMessage(`保存失败：${e instanceof Error ? e.message : '请稍后重试'}。当前修改仍在页面，可导出备份。`); return false; }
    finally { finish(); }
  }
  async function switchProfile(id: string) {
    if (id === profileId || busyRef.current) return;
    if (dirty && !await persist('draft')) return;
    begin();
    try { await refreshCloud(id); }
    catch (e) { setMessage(`切换失败：${e instanceof Error ? e.message : '请重试'}`); }
    finally { finish(); }
  }
  async function newProfile() {
    if (!ready || busyRef.current) return;
    if (dirty && !await persist('draft')) return;
    setData(withRiskQuotes(blankProfile())); setSaved(null); setProfileId(crypto.randomUUID()); setDirty(false);
    setEditing(true); setProfileSearch(''); setMessage('新 Profile 尚未保存，请填写后保存到云端。');
  }
  async function importLocal() {
    if (!ready || busyRef.current) return;
    if (dirty && !await persist('draft')) return;
    begin();
    try {
      const result = await cloud({ op: 'import', profiles: localProfiles.map(p => ({ ...p, version: 0 })) });
      await refreshCloud();
      setLocalProfiles([]);
      setMessage(`已导入 ${result.imported} 条记录，跳过 ${result.skipped} 条已导入记录。本地原件保留。`);
    } catch (e) { setMessage(`导入失败：${e instanceof Error ? e.message : '请重试'}。本地原件保留。`); }
    finally { finish(); }
  }
  async function reload() {
    if (busyRef.current) return;
    if (dirty) { setMessage('当前有未保存修改，请先保存或导出。'); return; }
    begin();
    try { await refreshCloud(profileId); }
    catch (e) { setMessage(`刷新失败：${e instanceof Error ? e.message : '请重试'}`); }
    finally { finish(); }
  }
  function download() {
    const record = !dirty && saved ? saved : { id: profileId, review: data, status: 'draft', savedAt: new Date().toISOString(), calculationVersion: REVIEW_VERSION, paymentView: period, payments };
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `insurance-review-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  function addPlan() { update(addRiskPlan(data)); setEditing(true); }
  const confirmed = !dirty && saved?.status === 'confirmed';
  return <WorkspaceShell className="ir" page="insurance" data={navigationData} onLogout={() => void logout()} status={<span>{busy ? '正在同步…' : ready ? '云端已连接' : '云端未连接'}</span>}>
    <main className="ir-main" aria-busy={busy}><fieldset className="ir-cloud-fields" disabled={busy}>
      <div className="ir-title"><div><h1>保险方案对比</h1></div></div>
      <section className="ir-profiles" aria-label="已保存的 Profiles">
        <div className="ir-profiles-toolbar"><h2>客户 Profiles <small>{profiles.length}</small></h2><input aria-label="搜索 Profile" placeholder="搜索客户 / 电话" value={profileSearch} onChange={e => setProfileSearch(e.target.value)}/><ActionButton disabled={!ready} onClick={newProfile}>新建 Profile</ActionButton><button className="ir-btn" disabled={!ready} onClick={() => persist('draft')}><Save size={14}/>保存当前</button></div>
        <div className="ir-cloud-actions"><button className="ir-btn" onClick={() => void reload()}>刷新云端记录</button>{localProfiles.length > 0 && <button className="ir-btn" disabled={!ready} onClick={() => void importLocal()}>将本机 {localProfiles.length} 条旧记录导入当前团队</button>}</div><div className="ir-profile-list">{profiles.filter(p => `${p.review.name} ${p.review.phone}`.toLowerCase().includes(profileSearch.toLowerCase())).map(p => <button key={p.id} className={p.id === profileId ? 'ir-profile active' : 'ir-profile'} aria-pressed={p.id === profileId} onClick={() => switchProfile(p.id)}><strong>{p.id === profileId ? data.name || '未命名客户' : p.review.name || '未命名客户'}</strong><span>{p.review.phone || '未填写电话'} · {vehicleQuotes(p.review).length} 辆车 · {p.review.carriers.length - 1} 个方案</span><small>{p.id === profileId && dirty ? '未保存修改' : p.status === 'confirmed' ? '已确认' : '草稿'} · {new Date(p.savedAt).toLocaleString('zh-CN')}</small></button>)}{!profiles.length && <p>保存后显示在此列表。</p>}{profiles.length > 0 && !profiles.some(p => `${p.review.name} ${p.review.phone}`.toLowerCase().includes(profileSearch.toLowerCase())) && <p>没有匹配的 Profile。</p>}</div>
        <p className="ir-profile-hint">记录保存在 Supabase，当前团队成员登录后可查看与编辑。切换或新建前自动保存修改；刷新云端可读取其他成员的最新记录。</p>
      </section>
      <section className="ir-client"><div className="ir-avatar">{data.name.slice(0,1) || '客'}</div><div><h2>{data.name || '未填写客户'} <span className="ir-badge">NEW LEAD</span></h2><p><Phone size={12}/>{data.phone || '未填写电话'}</p></div><div className="ir-client-risk"><span><CarFront size={15}/>{vehicles.length} 辆车</span><span><House size={15}/>{properties.length} 处房屋</span></div><div className="ir-client-date"><small>拟生效日期</small><strong>{data.effective || '待确认'}</strong></div><span className={`ir-status ${confirmed ? 'done' : ''}`}>{confirmed ? '已确认并保存' : dirty ? '有未保存修改' : '待沟通确认'}</span><button className="ir-btn" onClick={() => setEditing(!editing)}>{editing ? <Check size={15}/> : <Pencil size={15}/>} {editing ? '完成编辑' : '编辑报价资料'}</button></section>
      {editing && <section className="ir-editor" aria-label="编辑报价资料"><h2>客户与报价资料</h2><p>填写未含税费的原始年保费；币种与保障期间需一致。留空表示待确认。</p><div className="ir-fields">{(['name','phone','effective'] as const).map((key,i) => <label key={key}>{['客户姓名','联系电话','拟生效日期'][i]}<input type={key === 'effective' ? 'date' : 'text'} value={data[key]} onChange={e => update({ [key]: e.target.value })}/></label>)}<label>统一币种<select value={data.currency} onChange={e => update({ currency: e.target.value })}><option>CAD</option><option>USD</option></select></label></div><p>下方表格中的承保公司、保费与保项均可直接编辑。</p></section>}
      <div className="ir-workspace"><div className="ir-comparison">
        <div className="ir-section-head"><div><span className="ir-step">01</span><h2>价格与保障对比</h2><span className="ir-demo">团队共享比价记录</span><button className="ir-add" onClick={addPlan}>＋ 添加方案</button></div><div className="ir-segment">{[['year','年保费'],['month','月付金额']].map(([key,label]) => <button key={key} aria-pressed={period === key} className={period === key ? 'active' : ''} onClick={() => setPeriod(key)}>{label}</button>)}</div></div>
        <p className="ir-scroll-hint">年付：车险原价 + 房险原价 × 1.08。月付：车险年保费 × 1.013 ÷ 12 · 房险：年保费 × 1.11 ÷ 12（3% 分期费 + 8% 税均按原始保费）</p><div className="ir-table-scroll"><div className="ir-matrix" style={{ width: `${220 + titles.length * 205}px`, minWidth: '100%', ['--plans' as string]: titles.length }}>
          <div className="ir-price-grid"><div className="ir-price-label"><h3>{tab === 'all' ? '方案总保费' : tab === 'auto' ? '车险保费合计' : '房屋险保费合计'}</h3><small>{data.currency} · {period === 'year' ? (tab === 'auto' ? '车险年付总额' : '年付总额（含房险 8% 税）') : '含分期费及税 · 12 期'}<br/>按 12 期估算，尾期可能有分币调整</small></div>{titles.map((title,i) => <article key={i} className={`ir-price ${i === data.selected ? 'selected' : ''} ${i === 0 ? 'baseline' : ''}`}><div className="ir-plan-title">{editing && i > 0 ? <input aria-label={`方案${i}名称`} maxLength={80} placeholder={title} value={data.planNames?.[i] ?? ''} onChange={e => { const planNames = data.carriers.map((_, index) => data.planNames?.[index] ?? ''); planNames[i] = e.target.value; update({ planNames }); }}/> : <h3>{title}</h3>}{i === 0 ? <span>对比基准</span> : <span>{String(i).padStart(2, '0')}</span>}</div>{editing ? <input aria-label={`${title}承保公司`} value={data.carriers[i]} onChange={e => { const carriers = [...data.carriers] as Review['carriers']; carriers[i] = e.target.value; update({ carriers }); }}/> : <p>{data.carriers[i]}</p>}<strong className="ir-amount">{money(displayTotals[i])}</strong><small>/{period === 'year' ? '年' : '月'}</small><p className="ir-plan-composition">{riskSummary(comparison, i)}</p><div className="ir-saving">{i > 0 && !sameRiskComposition(comparison, 0, i) ? '组合不同，请逐项比较' : i === 0 ? '本方案所选项目合计' : displayTotals[i] === null || displayTotals[0] === null ? '价格待确认' : <><ArrowDown size={12}/>{displayTotals[0]! >= displayTotals[i]! ? (period === 'month' ? '每月少付' : '年保费少付') : (period === 'month' ? '每月多付' : '年保费多付')} {money(Math.abs(displayTotals[0]! - displayTotals[i]!))}</>}</div>{i > 0 && <button className="ir-select" aria-pressed={data.selected === i} onClick={() => update({ selected: i })}>{data.selected === i ? <><Check size={14}/> 已选此方案</> : <>选择此方案 <ChevronRight size={14}/></>}</button>}{editing && <button className="ir-select" onClick={() => { update(copyRiskPlan(data, i)); setMessage('已复制' + title + '为新方案，可独立修改。'); }}>复制{title}</button>}</article>)}</div>
          <div className="ir-filter"><div>{[['all','全部'],['auto','车险'],['home','房屋险']].map(([key,label]) => <button key={key} className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => setTab(key as ComparisonScope)}>{label}</button>)}</div><DensitySwitch label="极简模式" checked={onlyDiff} onChange={setOnlyDiff}/></div>
          {(['auto', 'home'] as const).filter(key => tab === 'all' || tab === key).map(key => <InsuranceRiskTable
            key={key} kind={key} risks={key === 'auto' ? vehicles : properties} titles={titles} editing={editing} onlyDiff={onlyDiff}
            selected={data.selected} currency={data.currency} period={period} money={money}
            onAdd={key === 'auto' ? addVehicle : addProperty}
            onChange={(id, patch) => key === 'auto' ? changeVehicle(id, patch) : changeProperty(id, patch)}
            onRemove={id => key === 'auto' ? update({ vehicles: vehicles.filter(v => v.id !== id) }) : update({ properties: properties.filter(p => p.id !== id) })}
          />)}
          {data.legacyAutoRows && <details className="ir-legacy-coverages"><summary>旧记录的共用车险明细（供逐车核对）</summary><p>旧资料无法确定属于哪辆车，已保留原文。请在各车明细中核对填写。</p><table><thead><tr><th>原项目</th>{titles.map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.legacyAutoRows.map((row, i) => <tr key={i}><th>{row.label}</th>{row.values.map((value, j) => <td key={j}>{value || '待确认'}</td>)}</tr>)}</tbody></table></details>}
        </div></div><p className="ir-footnote"><span/> 绿色底纹标记与现有保险不同的内容，不代表保障一定更优。起赔额是客户出险时自行承担的金额。</p>
      </div><aside className="ir-confirm"><div className="ir-confirm-heading"><span className="ir-step">02</span><h2>通话确认</h2><Phone size={16}/></div><div className="ir-selection-summary"><small>客户意向方案</small><h3>{data.selected === null ? '等待客户选择' : titles[data.selected]}{data.selected !== null && <ShieldCheck size={20}/>}</h3><p>{data.selected === null ? '点击左侧方案，开始确认' : data.carriers[data.selected]}</p>{data.selected !== null && <p className="ir-plan-composition">{riskSummary(data, data.selected)}{!sameRiskComposition(data, 0, data.selected) && <strong> · 与现有保险组合不同</strong>}</p>}<div><span>所选项目年保费</span><strong>{money(selectedTotal)}</strong></div>{data.selected !== null && <div className="ir-summary-monthly"><span>含税费月付</span><strong>{money(payments[data.selected].monthly)}</strong></div>}{saving !== null && <div className="ir-summary-saving"><span>{saving >= 0 ? '含税年保费减少' : '含税年保费增加'}</span><b>{money(Math.abs(saving))}</b></div>}</div><div className="ir-checklist"><h3>与客户逐项确认</h3>{['已说明价格、币种与付款安排','已说明保额、起赔额及保障差异','客户同意所选方案及拟生效日期'].map((label,i) => <label key={label}><input type="checkbox" checked={data.checks[i]} onChange={e => { const checks = [...data.checks]; checks[i] = e.target.checked; update({ checks }); }}/><span>{label}</span></label>)}</div><label className="ir-notes">沟通记录 <span>选填</span><textarea placeholder="记录客户关注点、付款安排，或仍需跟进的问题…" rows={5} value={data.note} onChange={e => update({ note: e.target.value })}/></label><div className="ir-confirm-date"><span>确认方式</span><strong><Phone size={12}/> 电话沟通</strong></div><button className="ir-primary" disabled={!ready || !canConfirm || !!confirmed} onClick={() => persist('confirmed')}><CheckCheck size={17}/>{confirmed ? '确认结果已保存' : '确认方案并保存'}</button>{!canConfirm && <p className="ir-hint">先在各方案中纳入车辆或房屋，补全所选项目的价格与保障，并完成三项确认。</p>}<button className="ir-draft" disabled={!ready} onClick={() => persist('draft')}><Save size={14}/> 保存沟通草稿</button><p className="ir-local-note">保存成功后可跨设备访问。确认记录不代表保单已生效。</p>{saved && <div className="ir-saved"><FileCheck2 size={14}/><span>最近保存：{new Date(saved.savedAt).toLocaleString('zh-CN')}</span></div>}</aside></div>
      <footer className="ir-footer"><button onClick={download}><Download size={14}/> 导出当前记录</button></footer>
      {message && <div className="ir-toast" role="status">{message}<button aria-label="关闭提示" onClick={() => setMessage('')}><X size={15}/></button></div>}
    </fieldset></main>
  </WorkspaceShell>;
}
