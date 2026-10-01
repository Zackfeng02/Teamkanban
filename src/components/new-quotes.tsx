'use client';
import {useEffect,useState} from 'react';
import WorkspaceShell from './workspace-shell';
import InsuranceReview from './insurance-review';
import {quoteFields} from '../lib/creation-fields';
import {isNewQuote} from '../lib/new-quote-view';
import type {Task} from '../lib/model';
import type {NavigationData} from './workspace-navigation';
import styles from './new-quotes.module.css';
const statuses={todo:'待处理',doing:'进行中',waiting:'等待外部',done:'已完成'};
export default function NewQuotes({taskId}:{taskId?:string}) {
 const [navigation,setNavigation]=useState<(Omit<NavigationData,'members'>&{tasks:Task[];members:{id:string;name:string;active:boolean}[]})|null>(null),[detail,setDetail]=useState<any>(null),[error,setError]=useState(''),[search,setSearch]=useState(''),[archived,setArchived]=useState(false);
 useEffect(()=>{let stopped=false;void (async()=>{try{const r=await fetch('/api/state',{cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error);if(!stopped)setNavigation(body);
  if(taskId){const q=await fetch('/api/quote-review?taskId='+encodeURIComponent(taskId),{cache:'no-store'}),d=await q.json();if(!q.ok)throw Error(d.error);if(!stopped)setDetail(d);}
 }catch(e){if(!stopped)setError(e instanceof Error?e.message:'资料读取失败');}})();return()=>{stopped=true;};},[taskId]);
 async function logout(){await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'logout'})});location.href='/';}
 const tasks=(navigation?.tasks??[]).filter(t=>isNewQuote(t)&&t.archived===archived&&(t.customer+' '+t.title).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const facts=detail?.facts,task=detail?.task;
 const intro=<div className={styles.page}>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {task&&<><div className={styles.heading}><a href="/insurance-review">← 全部新客报价</a><a href="/?page=board">返回团队看板</a></div>
   <section className={styles.card}><div className={styles.heading}><div><small>新报价任务 · {task.id.slice(0,8).toUpperCase()}</small><h2>{task.title}</h2></div><span>{task.archived?'已归档 · 只读':statuses[task.status as keyof typeof statuses]}</span></div>
   <p>负责人：{navigation?.members.find(m=>m.id===task.ownerId)?.name??'未分配'} · 优先级：{task.priority==='urgent'?'紧急':task.priority==='high'?'高':task.priority==='low'?'低':'普通'} · 截止日期：{task.dueDate??'未设置'}</p>{task.description&&<p className={styles.description}>{task.description}</p>}
   <h3>客户报价资料</h3><p>{facts.reviewedAt?'已核对录入资料':'客户提供资料 · 尚待核实'} · {facts.quoteType==='both'?'车房组合':facts.quoteType==='home'?'房屋险':'车险'}</p>
   <dl className={styles.facts}>{quoteFields.map(f=>{const value=facts.values[f.key];return value?<div key={f.key}><dt>{f.label}</dt><dd>{f.options?.[value]??value}</dd></div>:null;})}</dl>
   {!Object.values(facts.values).some(Boolean)&&<p>尚未填写详细报价资料，请在看板核对客户资料。</p>}
   <details><summary>任务沟通记录 · {task.comments.length}</summary>{task.comments.map((c:any)=><article key={c.id}><p className={styles.description}>{c.text}</p><small>{navigation?.members.find(m=>m.id===c.memberId)?.name??'团队成员'} · {new Date(c.at).toLocaleString()}</small></article>)}</details>
  </section></>}
 </div>;
 if(taskId&&task)return <InsuranceReview taskId={taskId} readOnly={task.archived} intro={intro}/>;
 return <WorkspaceShell page="insurance" data={navigation} onLogout={logout} className={styles.page}><main className={styles.main}><header className={styles.heading}><div><small>NEW CUSTOMER QUOTES</small><h1>新客报价</h1><p>从团队看板打开新报价任务，查看客户资料、比较方案并保存沟通结果。</p></div><a href="/?page=board">前往看板新建报价 →</a></header>{intro}
  {!taskId&&<><div className={styles.toolbar}><input aria-label="搜索新客报价" placeholder="搜索客户或任务" value={search} onChange={e=>setSearch(e.target.value)}/><label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> 已归档报价</label><small>{tasks.length} 个任务</small></div>
  <div className={styles.list}>{tasks.map(t=><a className={styles.card} key={t.id} href={'/insurance-review?taskId='+encodeURIComponent(t.id)}><div className={styles.heading}><h2>{t.customer||t.title}</h2><span>{statuses[t.status]}</span></div><p>{t.title}</p><small>{navigation?.members.find(m=>m.id===t.ownerId)?.name??'未分配'} · {t.insuranceLine==='combined'?'车房组合':t.insuranceLine==='home'?'房屋险':'车险'} · {t.quoteReview?.status==='confirmed'?'报价已确认':t.quoteReview?'已有报价草稿':'等待报价'}</small><strong>查看资料与报价 →</strong></a>)}</div>
  {navigation&&!tasks.length&&<p className={styles.empty}>暂无{archived?'已归档的':''}新客报价任务。看板中新建的“新报价”和接收的报价表单会显示在这里。</p>}
  <details className={styles.legacy}><summary>历史独立比价记录</summary><a href="/insurance-review?mode=manual">查看原有 Profiles →</a></details></>}
  {!navigation&&!error&&<p>正在读取任务…</p>}
 </main></WorkspaceShell>;
}
