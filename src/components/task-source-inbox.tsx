'use client';
import {useState,useEffect} from 'react';
import type {Source} from '../lib/model';
import Attachment from './image-attachment';
import styles from './task-creation.module.css';

export default function TaskSourceInbox({sources,selected,onSelect,onExtract,busy,canExtract=true,aiConfigured,onWorkingChange}:{sources:Source[];selected:string[];onSelect:(ids:string[])=>void;onExtract:(ids:string[])=>Promise<void>;busy:boolean;canExtract?:boolean;aiConfigured:boolean;onWorkingChange?:(busy:boolean)=>void}){
 const [extra,setExtra]=useState<Source[]>([]),[chat,setChat]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{onWorkingChange?.(working);return ()=>onWorkingChange?.(false);},[working,onWorkingChange]);
 const [filter,setFilter]=useState('');
 const locked=busy||working;
 const items=[...sources.filter(s=>!s.taskIds.length),...extra.filter(s=>!sources.some(v=>v.id===s.id))];
 async function retry(sourceId:string){if(locked)return;setWorking(true);setError('');try{const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'retrySource',sourceId})});const result=await response.json();if(!response.ok)throw Error(result.error||'重试失败');setNotice('已重新排队获取附件，完成后收件箱会自动更新。');}catch(e){setError(e instanceof Error?e.message:'重试失败');}finally{setWorking(false);}}
 async function add(body:File|string){
  const response=await fetch('/api/change-tasks/evidence',{method:'POST',headers:typeof body==='string'?{'Content-Type':'application/json'}:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(body.name)},body:typeof body==='string'?JSON.stringify({text:body}):body});
  const result=await response.json();if(!response.ok)throw Error(result.error||'保存资料失败');
  setExtra(v=>[...v,result.source]);if(result.warning)setNotice(result.warning);return result.sourceId as string;
 }
 async function upload(files:File[]){if(locked)return;setWorking(true);setError('');const ids=[...selected];try{if(ids.length+files.length>30)throw Error('每个任务最多选择 30 份资料');for(const file of files){if(file.size>12*1024*1024)throw Error('聊天附件限 12 MB');ids.push(await add(file));onSelect([...ids]);}}catch(e){setError(e instanceof Error?e.message:'上传失败');}finally{setWorking(false);}}
 async function paste(identify=false){if(locked)return;setWorking(true);setError('');try{const ids=[...selected];if(chat.trim()){if(ids.length>=30)throw Error('每个任务最多选择 30 份资料');ids.push(await add(chat));onSelect(ids);setChat('');}if(identify)await onExtract(ids);}catch(e){setError(e instanceof Error?e.message:'识别失败');}finally{setWorking(false);}}
 return <aside className={styles.inbox} aria-label="创建任务资料收件箱" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();}}} onDrop={e=>{e.preventDefault();e.stopPropagation();void upload(Array.from(e.dataTransfer.files));}}>
  <h3>资料收件箱 <span>{selected.length}/30</span></h3><p>选择属于这位客户的企业微信聊天、图片或 PDF。请对照姓名及内容核对，资料不会自动匹配客户。</p>
  <fieldset disabled={locked} className={styles.controls}><label>搜索资料<input type="search" placeholder="按姓名或内容筛选" onChange={e=>{const value=e.target.value.toLowerCase();setFilter(value);}}/></label>
   <div className={styles.sources}>{items.filter(s=>!filter||JSON.stringify(s.entries).toLowerCase().includes(filter)||(s.uploadName??'').toLowerCase().includes(filter)).map(source=><article className={styles.source} key={source.id}><label className={styles.check}><input type="checkbox" aria-label={'选择资料 '+source.id} disabled={source.state!=='ready'||(!selected.includes(source.id)&&selected.length>=30)} checked={selected.includes(source.id)} onChange={e=>onSelect(e.target.checked?[...selected,source.id]:selected.filter(id=>id!==source.id))}/><strong>{source.uploadName||'企业微信转发资料'}</strong></label><small>{new Date(source.receivedAt).toLocaleString('zh-CN')} · {source.state==='ready'?'可选择':source.state==='pending'?'附件获取中':source.state==='failed'?'获取失败':'无法完整展开'}</small><details><summary>查看原始资料</summary>{source.entries.map((entry,index)=>entry.kind==='text'?<pre key={index}>{entry.text}</pre>:entry.kind==='image'||entry.kind==='file'?<Attachment key={index} id={entry.mediaId}/>:<p key={index}>{entry.label}</p>)}</details>{source.state==='failed'&&<button type="button" className="secondary" onClick={()=>void retry(source.id)}>重试获取附件</button>}</article>)}{!items.length&&<p>暂无未归入任务的资料。绑定企业微信后转发资料，或在这里上传、粘贴。</p>}</div>
   <label>上传聊天、图片或 PDF<input type="file" aria-label="上传任务识别资料" accept=".txt,.pdf,image/png,image/jpeg,image/webp,image/gif" multiple onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files);}}/></label><small>每个文件最多 12 MB；原文件随任务保留。</small>
   <label>粘贴聊天原文<textarea rows={4} value={chat} onChange={e=>setChat(e.target.value)} placeholder="粘贴这位客户的聊天原文"/></label>
   <button type="button" className="secondary" disabled={!chat.trim()} onClick={()=>void paste()}>保留聊天并选中</button>
   <button type="button" className="primary" disabled={!canExtract||!aiConfigured||(!selected.length&&!chat.trim())} onClick={()=>void paste(true)}>{locked?'处理中…':'DeepSeek 识别并填写空白项'}</button>
  </fieldset>
  {!canExtract&&<p>先读取并锁定保单旧信息，再识别拟变更内容。</p>}{!aiConfigured&&<p role="status">DeepSeek 尚未配置，资料可以保留并手工填表。</p>}
  <p>识别时会将所选资料的文字（含本机 OCR 结果）发送给 DeepSeek。原图及 PDF 保留供核对；模糊或缺失内容请手工补充。</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status">{notice}</p>}
 </aside>;
}
