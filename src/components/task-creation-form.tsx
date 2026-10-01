'use client';
import {useState} from 'react';
import type {Source,DraftTask} from '../lib/model';
import {quoteFields,generalFields} from '../lib/creation-fields';
import type {CreationForm} from '../lib/creation-form';
import {defaultChecklist} from '../lib/task-templates';
import TaskSourceInbox from './task-source-inbox';
import styles from './task-creation.module.css';

async function api(path:string,body:unknown){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(result.error||'请求失败');return result;}
export function SavedCreationForm({form}:{form:CreationForm}){const fields=form.kind==='new_customer_quote'?quoteFields:generalFields;return <details open className={styles.saved}><summary>{form.kind==='new_customer_quote'?'新客报价申请表':'任务创建表单'}</summary><p className={styles.hint}>已人工核对 · {new Date(form.reviewedAt).toLocaleString('zh-CN')}{form.quoteType&&' · '+{auto:'车险',home:'房屋险',both:'车房组合'}[form.quoteType]}</p><dl>{fields.filter(f=>form.values[f.key]).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.options?.[form.values[f.key]]??form.values[f.key]}</dd>{form.evidence[f.key]&&<p className={styles.evidence}>原文依据：{form.evidence[f.key]}</p>}</div>)}</dl></details>;}

export default function TaskCreationForm({sources,members,aiConfigured,onCreated}:{sources:Source[];members:{id:string;name:string;active:boolean}[];aiConfigured:boolean;onCreated:(id:string)=>Promise<void>}){
 const [quoteType,setQuoteType]=useState<'auto'|'home'|'both'>('auto');
 const [values,setValues]=useState<Record<string,string>>({}),[evidence,setEvidence]=useState<Record<string,string>>({}),[sourceIds,setSourceIds]=useState<string[]>([]),[method,setMethod]=useState('manual');
 const [inboxBusy,setInboxBusy]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [ownerId,setOwnerId]=useState(''),[priority,setPriority]=useState<DraftTask['priority']>('normal'),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[reviewed,setReviewed]=useState(false);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'请求失败');}finally{setBusy(false);}}
 function selectSources(ids:string[]){setSourceIds(ids);setEvidence({});setReviewed(false);}
 function edit(key:string,value:string){setValues(v=>({...v,[key]:value}));setEvidence(v=>{const next={...v};delete next[key];return next;});setReviewed(false);}
 async function identify(ids:string[]){await run(async()=>{const result=await api('/api/task-creation/extract',{kind:'new_customer_quote',sourceIds:ids});const next={...values},quotes={...evidence};for(const [key,value]of Object.entries(result.values))if(!next[key]){next[key]=String(value);if(result.evidence[key])quotes[key]=String(result.evidence[key]);}setValues(next);setEvidence(quotes);setMethod(result.model);setReviewed(false);setNotice(['识别结果只填空白项；请对照原始资料核对。',...result.warnings].join(' '));});}
 async function save(){await run(async()=>{
  const name=(values.full_name??'').trim();
  const task:DraftTask={title:title.trim()||`${{auto:'车险',home:'房屋险',both:'车房组合'}[quoteType]}报价 · ${name}`,type:'lead',priority,insuranceLine:quoteType==='both'?'combined':quoteType,customer:name,customerRef:null,description,dueDate:[quoteType!=='home'?values.auto_eff_date:'',quoteType!=='auto'?values.home_eff_date:''].filter(Boolean).sort()[0]||null,ownerId:ownerId||null,checklist:defaultChecklist('lead')};
  const result=await api('/api/state',{op:'createTask',task,sourceIds,creationForm:{kind:'new_customer_quote',quoteType,values:{...values,full_name:name},evidence,extraction:method,reviewed:true}});await onCreated(result.taskId);
 });}
 return <div><p className={styles.hint}>新报价用于尚未在 ClientCoreBMS 建档的客户。已有客户的保单变更（包括取消）请使用“新保单变更”。</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
 <div className={styles.flow}><div className={styles.editor}><fieldset className={styles.controls} disabled={busy||inboxBusy}>
  <p className={styles.confirmed}>选取资料或手工填写报价信息，核对后创建待办；不会自动建立 BMS 客户档案。</p>
  <label>报价险种<select aria-label="报价险种" value={quoteType} onChange={e=>{setQuoteType(e.target.value as typeof quoteType);setReviewed(false);}}><option value="auto">车险</option><option value="home">房屋险</option><option value="both">车房组合</option></select></label>
  <h3>客户及报价资料</h3><p className={styles.hint}>姓名及电话或邮箱必填。其他资料可以留空，后续补齐。</p>
  <div className={styles.quoteFields}>{quoteFields.map(f=><label key={f.key}>{f.label}{f.required?' *':''}{f.kind==='select'?<select aria-label={f.label+(f.required?' *':'')} value={values[f.key]??''} onChange={e=>edit(f.key,e.target.value)}><option value="">待确认</option>{Object.entries(f.options!).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:f.kind==='long'?<textarea aria-label={f.label+(f.required?' *':'')} rows={4} value={values[f.key]??''} onChange={e=>edit(f.key,e.target.value)}/>:<input aria-label={f.label+(f.required?' *':'')} type={f.kind==='date'?'date':f.key==='email'?'email':'text'} value={values[f.key]??''} onChange={e=>edit(f.key,e.target.value)}/>} {evidence[f.key]&&<small className={styles.evidence}>原文依据：{evidence[f.key]}</small>}</label>)}</div>
  <label>任务标题（可选）<input value={title} placeholder="默认使用险种和客户姓名" onChange={e=>{setTitle(e.target.value);setReviewed(false);}}/></label><label>补充说明<textarea value={description} rows={3} onChange={e=>{setDescription(e.target.value);setReviewed(false);}}/></label>
  <div className={styles.actions}><label>负责人<select aria-label="负责人" value={ownerId} onChange={e=>{setOwnerId(e.target.value);setReviewed(false);}}><option value="">待分配</option>{members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>优先级<select aria-label="优先级" value={priority} onChange={e=>{setPriority(e.target.value as typeof priority);setReviewed(false);}}><option value="urgent">紧急</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label></div>
  <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>我已核对客户信息、表单内容与所选资料。</label><button type="button" className="primary full" disabled={!reviewed} onClick={()=>void save()}>{busy?'处理中…':'核对后创建任务'}</button>
 </fieldset>{notice&&<p role="status" className={styles.hint}>{notice}</p>}</div><TaskSourceInbox sources={sources} selected={sourceIds} onSelect={selectSources} onExtract={identify} busy={busy} aiConfigured={aiConfigured} onWorkingChange={setInboxBusy}/></div></div>;
}
