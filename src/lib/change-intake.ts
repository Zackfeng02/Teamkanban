import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {clientCoreRequest} from './clientcore.ts';
import {changeFields,changeTypes,type ChangeBaseline,type ChangeDraft,type ChangeType} from './change-form.ts';
import {Problem,requireMember,dateSchema} from './security.ts';
import {makeTask} from './domain.ts';
import {taskTypeLabels} from './task-templates.ts';
import type {Actor,Team} from './model.ts';
function canonical(v:any):any{return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
export function digest(v:unknown){return createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
export const selectionSchema=z.object({clientId:z.string().min(1).max(160),policyKey:z.string().max(200),assetId:z.string().max(160).default(''),riskIndex:z.number().int().nonnegative().nullable().default(null),addressIndex:z.number().int().nonnegative().nullable().default(null)}).strict();
export async function changeContext(clientId:string){
 const [client,targets,policies,assets]=await Promise.all([clientCoreRequest(`clients/${encodeURIComponent(clientId)}`),clientCoreRequest(`clients/${encodeURIComponent(clientId)}/workflow-targets`),clientCoreRequest(`clients/${encodeURIComponent(clientId)}/policies`),clientCoreRequest(`clients/${encodeURIComponent(clientId)}/assets`)]);
 return {client,policies:[...targets.items.map((p:any)=>({...p,key:'term:'+p.id,label:`${p.policy_number||'Binder'} · ${p.insurer} · ${p.effective_date} — ${p.expiry_date}`})),...policies.sourcePolicies.filter((p:any)=>!p.workflowTermId&&!/VOID/i.test(p.policyNumber??'')).map((p:any)=>({...p,key:'source:'+p.sourceId,label:`${p.policyNumber||'Source'} · ${p.insurer||''} · ${p.effectiveDate||''}（导入记录）`}))],assets:assets.items};
}
export async function loadBaseline(selection:z.infer<typeof selectionSchema>):Promise<ChangeBaseline>{
 const context=await changeContext(selection.clientId);let policy:any=null;
 if(selection.policyKey){const choice=context.policies.find((p:any)=>p.key===selection.policyKey);if(!choice)throw new Problem(404,'所选保单不属于已确认客户');policy=choice.key.startsWith('term:')?{...await clientCoreRequest('policy-terms/'+encodeURIComponent(choice.id)),key:choice.key}:choice;}
 if(policy?.key?.startsWith('term:'))policy={id:policy.id,key:policy.key,policy_id:policy.policy_id,policy_number:policy.policy_number,insurer:policy.insurer,line:policy.line,revision:policy.revision,policyRevision:policy.policyRevision,effectiveDate:policy.effectiveDate,expiryDate:policy.expiryDate,status:policy.status,currentSubjects:policy.currentSubjects,currentApplicants:policy.currentApplicants,currentPremium:policy.currentPremium};
 const asset=selection.assetId?context.assets.find((a:any)=>a.id===selection.assetId):null;
 if(selection.assetId&&!asset)throw new Problem(404,'所选资产不属于已确认客户');
 const risks=policy?.currentSubjects??policy?.subjects??[];
 if(selection.riskIndex!==null&&!risks[selection.riskIndex])throw new Problem(409,'所选承保对象已变化，请重新选择');
 const risk=selection.riskIndex===null?null:risks[selection.riskIndex];
 const c=context.client;const oldValues:Record<string,string>={};
 if(selection.addressIndex!==null){const address=c.addresses?.[selection.addressIndex];if(!address)throw new Problem(409,'所选旧地址已变化');for(const [key,value] of Object.entries(address))if(typeof value==='string')oldValues[key]=value;}
 for(const [key,value] of Object.entries(asset?.details??{}))if(typeof value==='string')oldValues[key]=value;
 // Only explicitly stored fields are mapped. All original structures remain visible below.
 for(const [key,value] of Object.entries(risk??{}))if(typeof value==='string'&&!oldValues[key])oldValues[key]=value;
 if(Array.isArray(risk?.details))for(const d of risk.details){if(typeof d.label==='string'&&typeof d.value==='string')oldValues[d.label]=d.value;}
 if(risk){oldValues.coverage=String(risk.description??'');oldValues.deductible=(risk.deductibles??[]).map((d:any)=>`${d.label}: ${d.value}`).join('; ');}
 const client={id:c.id,code:c.code,display_name:c.display_name,revision:c.revision,contacts:c.contacts,addresses:c.addresses,people:c.people};
 return {client,policy,assets:context.assets,selectedRisk:asset??risk,selection,oldValues};
}
export function newChangeDraft(team:Team,actor:Actor,type:ChangeType,baseline:ChangeBaseline){requireMember(team,actor);if(team.demo)throw new Problem(403,'演示空间不能读取客户资料');const draft:ChangeDraft={id:randomUUID(),ownerId:actor.memberId,type,baseline:structuredClone(baseline),fingerprint:digest(baseline),capturedAt:new Date().toISOString()};team.changeDrafts=(team.changeDrafts??[]).filter(d=>d.taskId||Date.parse(d.capturedAt)>Date.now()-86400000);if(team.changeDrafts.filter(d=>d.ownerId===actor.memberId&&!d.taskId).length>=30)throw new Problem(409,'未保存草稿过多，请稍后重试');team.changeDrafts.push(draft);return draft;}
export const saveChangeSchema=z.object({draftId:z.string(),proposed:z.record(z.string(),z.string().max(4000)),sourceIds:z.array(z.string()).max(30),evidence:z.record(z.string(),z.string().max(2000)).default({}),extraction:z.string().max(200).default('manual'),ownerId:z.string().nullable(),priority:z.enum(['urgent','high','normal','low']),reviewed:z.literal(true)}).strict();
export function saveChangeTask(team:Team,actor:Actor,input:unknown,current:ChangeBaseline){
 requireMember(team,actor);const v=saveChangeSchema.parse(input);const draft=team.changeDrafts?.find(d=>d.id===v.draftId&&d.ownerId===actor.memberId);if(!draft)throw new Problem(404,'草稿不存在');
 const saveHash=digest(v);if(draft.taskId){if(draft.saveHash!==saveHash)throw new Problem(409,'此草稿已经建立任务');return {taskId:draft.taskId,duplicate:true};}
 if(digest(current)!==draft.fingerprint)throw new Problem(409,'ClientCoreBMS 旧信息已变化，请重新读取并核对表单');
 const fields=changeFields[draft.type];if(Object.keys(v.proposed).some(k=>!fields.some(f=>f.key===k)))throw new Problem(400,'表单包含不支持的字段');
 for(const f of fields){const val=v.proposed[f.key]?.trim()??'';if(f.required&&!val)throw new Problem(400,'请填写：'+f.label);if(val&&f.kind==='date')dateSchema.parse(val);if(val&&f.options&&!Object.hasOwn(f.options,val))throw new Problem(400,'请选择：'+f.label);}
 const start=draft.baseline.policy?.effectiveDate,end=draft.baseline.policy?.expiryDate;if(start&&end&&(v.proposed.effectiveDate<start||v.proposed.effectiveDate>end))throw new Problem(400,'变更日期不在所选保单年度内，请核对对应年度');
 if(v.proposed.year&&!/^\d{4}$/.test(v.proposed.year))throw new Problem(400,'车辆年份应为四位数字');
 if(draft.type!=='address'&&!draft.baseline.policy)throw new Problem(400,'请选择对应保单年度');
 if(draft.type==='address'&&v.proposed.scope!=='mailing'&&!draft.baseline.policy)throw new Problem(400,'承保地址变更须选择保单');
 if(draft.type==='address'&&v.proposed.scope!=='risk'&&draft.baseline.client.addresses?.length>1&&draft.baseline.selection.addressIndex===null)throw new Problem(400,'请先选择具体的旧通讯地址');
 if(draft.baseline.selectedRisk?.kind&&draft.type.startsWith('vehicle')&&draft.baseline.selectedRisk.kind!=='vehicle')throw new Problem(400,'请选择车辆对象');
 if(draft.baseline.selectedRisk?.kind&&draft.type.startsWith('property')&&draft.baseline.selectedRisk.kind!=='property')throw new Problem(400,'请选择房产对象');
 if(['vehicle_replace','vehicle_remove','property_remove'].includes(draft.type)&&!draft.baseline.selectedRisk)throw new Problem(400,'请选择要变更的旧车辆或房产');
 if(v.ownerId&&!team.members.some(m=>m.id===v.ownerId&&m.active))throw new Problem(400,'负责人不可用');
 if(new Set(v.sourceIds).size!==v.sourceIds.length)throw new Problem(400,'资料重复');
 const sources=v.sourceIds.map(id=>{const s=team.sources.find(s=>s.id===id&&s.sender===actor.memberId);if(!s||s.state!=='ready')throw new Problem(403,'资料不可用或不属于你');return s;});
 const text=sources.flatMap(s=>s.entries.filter(e=>e.kind==='text').map(e=>(e as {text:string}).text)).join('\n');
 for(const [key,quote] of Object.entries(v.evidence))if(!fields.some(f=>f.key===key)||!quote||!text.includes(quote))throw new Problem(400,'识别依据与原始聊天不符');
 const c=draft.baseline.client;const task=makeTask({title:`${taskTypeLabels[draft.type]} · ${c.display_name}`.slice(0,160),type:draft.type,customer:c.display_name,customerRef:{clientCoreId:c.id,clientCode:c.code,displayName:c.display_name},description:'已核对变更申请表；新内容为待办理申请，尚未写入 ClientCoreBMS。',dueDate:v.proposed.effectiveDate,ownerId:v.ownerId,priority:v.priority,insuranceLine:draft.type.startsWith('vehicle')?'auto':draft.type.startsWith('property')?'home':'other',checklist:[]},v.sourceIds,actor);
 task.changeForm={type:draft.type,baseline:structuredClone(draft.baseline),capturedAt:draft.capturedAt,proposed:v.proposed,evidence:v.evidence,reviewedAt:new Date().toISOString(),extraction:v.extraction};
 if(draft.baseline.policy?.key?.startsWith('term:'))task.workflow!.targetTermId=draft.baseline.policy.id;
 task.activity[0].action='核对变更表单并创建任务';team.tasks.push(task);for(const s of sources)s.taskIds.push(task.id);draft.taskId=task.id;draft.saveHash=saveHash;return {taskId:task.id,duplicate:false};
}
