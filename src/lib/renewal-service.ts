import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readTeam,mutateTeam} from './store.ts';
import {Problem,requireMember,dateSchema} from './security.ts';
import {clientCoreRequest} from './clientcore.ts';
import {makeTask} from './domain.ts';
import {newWorkflow,visibleSteps,workflowComplete,businessDate} from './task-workflow.ts';
import {offerSchema,quoteReady,type RenewalOffer} from './renewal-comparison.ts';
import type {Actor,Task,Team} from './model.ts';

export async function renewalTask(actor:Actor,taskId:string,write=false) {
 const team=await readTeam(actor.teamId);if(!team)throw new Problem(404,'团队不存在');requireMember(team,actor,write);
 if(team.demo)throw new Problem(403,'演示空间不能读取业务资料');
 const task=team.tasks.find(t=>t.id===taskId);if(!task||(task.type!=='renewal'&&!task.billingFollowup)||!task.customerRef)throw new Problem(400,'请选择已关联客户的续保或账务任务');
 if(write&&task.archived)throw new Problem(409,'任务已归档，请建立后续任务');
 return {team,task,clientId:task.customerRef.clientCoreId};
}
const contextPath=(clientId:string,kind:string,id:string)=>`clients/${encodeURIComponent(clientId)}/renewal-context/${kind}/${encodeURIComponent(id)}`;
export async function renewalData(actor:Actor,taskId:string) {
 const {task,clientId}=await renewalTask(actor,taskId);
 if(task.billingFollowup){const context=await clientCoreRequest(contextPath(clientId,'term',task.billingFollowup.termId));return {task,billing:{context,event:context.term.events.find((e:any)=>e.id===task.billingFollowup!.eventId),originalTaskId:task.billingFollowup.renewalTaskId,pending:!!task.workflow?.pendingConfirmation}};}
 if(!task.renewal)return {task,targets:await clientCoreRequest(`clients/${encodeURIComponent(clientId)}/policies`)};
 const context=await clientCoreRequest(contextPath(clientId,task.renewal.kind,task.renewal.targetId));
 const jobs=await Promise.all(task.renewal.quotes.map(q=>clientCoreRequest(`renewal-quotes/${encodeURIComponent(q.id)}`)));
 const target=task.workflow?.targetTermId?await clientCoreRequest(contextPath(clientId,'term',task.workflow.targetTermId)):null;
 return {task,context,jobs,target};
}
function touch(task:Task,actor:Actor,action:string,after:unknown) {task.version++;task.updatedAt=new Date().toISOString();task.activity.push({id:randomUUID(),memberId:actor.memberId,at:task.updatedAt,action,before:null,after});}
function assertVersion(task:Task,version:number) {if(task.version!==version)throw new Problem(409,'任务已更新，请刷新；当前输入可保留');}
function step(task:Task,key:string,actor:Actor,evidence:string,note:string) {const node=task.workflow!.steps.find(s=>s.key===key);if(node)Object.assign(node,{state:'done',evidence,note,by:actor.memberId,at:new Date().toISOString()});}
function mutableComparison(task:Task) {if(task.renewal?.pending||task.workflow?.targetTermId||task.workflow?.steps.some(s=>s.evidence&&s.gate!=='cleanup'&&s.key!=='decision'))throw new Problem(409,'已有业务结果或待提交记录，请另建后续任务');}

async function verifiedGates(task:Task,team:Team,clientId:string,context:any,target:any,jobs:any[]) {
 const f=task.workflow!,r=task.renewal!,evidence:Record<string,string>={},original=context.term;
 const check=async(key:string,path:string,predicate:(e:any)=>boolean=()=>true)=>{try{const e=await clientCoreRequest(path);if(predicate(e))evidence[key]=e.evidenceId;}catch(error){if(!(error instanceof Problem)||![404,409].includes(error.status))throw error;}};
 if(f.decision!=='cancel'&&target?.term) {
  await check('actual',`clients/${clientId}/workflow-evidence/${target.term.id}/actual`,e=>f.decision==='stay'?target.term.predecessor_id===original.id:e.replacesTermIds.includes(original.id));
  await check('documents',`clients/${clientId}/documents/${target.term.id}/${f.decision==='stay'?'renewal_original':'policy_original'}`);
  if(f.decision==='switch')await check('sign',`clients/${clientId}/documents/${target.term.id}/signed_application`);
 }
 if(['switch','cancel'].includes(f.decision)) {
  await check('cancellation',`clients/${clientId}/workflow-evidence/${original.id}/cancellation`);
  await check('cancel_documents',`clients/${clientId}/documents/${original.id}/cancellation_confirmation`);
  const event=original.events.filter((e:any)=>e.type==='cancellation').at(-1),followup=team.tasks.find(t=>t.id===r.billingFollowupId);
  if(event?.amount?.basis==='actual')evidence.billing=event.id;
  else if(event&&followup&&!followup.archived&&followup.ownerId&&team.members.some(m=>m.id===followup.ownerId&&m.active)&&followup.dueDate&&followup.customerRef?.clientCoreId===clientId&&followup.description.includes(event.id))evidence.billing=followup.id;
 }
 if(!r.cleanupPending&&jobs.every(j=>j.cleanedAt)&&f.steps.find(s=>s.key==='cleanup')?.evidence)evidence.cleanup=task.id;
 return evidence;
}
function applyVerified(task:Task,actor:Actor,evidence:Record<string,string>) {
 for(const node of visibleSteps(task.workflow!))if(node.gate||node.key==='sign') {
  if(evidence[node.key])step(task,node.key,actor,evidence[node.key],'已核实 ClientCoreBMS 业务事实');
  else {node.state='pending';delete node.evidence;}
 }
}

export async function startRenewal(actor:Actor,input:any) {
 const v=z.object({kind:z.enum(['source','term']),targetId:z.string(),clientId:z.string(),taskId:z.string().optional()}).parse(input);
 const context=await clientCoreRequest(contextPath(v.clientId,v.kind,v.targetId));
 return mutateTeam(actor.teamId,team=>{
  requireMember(team,actor,true);if(team.demo)throw new Problem(403,'演示空间不能创建业务任务');
  const canonical=context.term?.id??v.targetId;
  const duplicate=team.tasks.find(t=>!t.archived&&t.status!=='done'&&t.type==='renewal'&&t.id!==v.taskId&&(t.workflow?.originalTermId===canonical||t.renewal?.targetId===v.targetId&&t.renewal.kind===v.kind));
  if(duplicate)return {taskId:duplicate.id,duplicate:true};
  let task=v.taskId?team.tasks.find(t=>t.id===v.taskId):undefined;
  if(task&&(task.type!=='renewal'||task.customerRef?.clientCoreId!==v.clientId||task.workflow?.receipts.length||task.renewal))throw new Problem(409,'此任务已绑定业务结果');
  if(!task){const line=context.term?.line??context.target.policyType;task=makeTask({title:`续保 · ${context.client.display_name} · ${context.term?.policy_number??context.target.policyNumber}`,type:'renewal',customer:context.client.display_name,customerRef:{clientCoreId:v.clientId,clientCode:context.client.code,displayName:context.client.display_name},description:'快照比价与续保办理',checklist:[],dueDate:context.term?.expiryDate??context.target.expiryDate,ownerId:actor.memberId,insuranceLine:/home|habitational|property|tenant|condo/i.test(line)?'home':/auto/i.test(line)?'auto':'other',priority:'normal'},[],actor);team.tasks.push(task);}
  task.workflow=newWorkflow('renewal');if(context.term)task.workflow.originalTermId=context.term.id;
  task.renewal={kind:v.kind,targetId:v.targetId,baselineRevision:context.term?.revision??context.target.revision,baselineHash:context.baselineHash,quotes:[],offers:[],selectedId:null};
  touch(task,actor,'绑定续保原年度',{kind:v.kind,targetId:v.targetId});return {taskId:task.id};
 });
}

async function deliver(actor:Actor,taskId:string,version:number,operation:string,data:any,path:string,payload:any) {
 await mutateTeam(actor.teamId,team=>{const t=team.tasks.find(t=>t.id===taskId)!;assertVersion(t,version);if(t.renewal!.pending)throw new Problem(409,'请先重试原提交');t.renewal!.pending={id:payload.confirmationId??payload.idempotencyKey,payload:{path,body:payload},operation,data};touch(t,actor,'保存待提交',{operation});});
 return retryPending(actor,taskId);
}
export async function retryPending(actor:Actor,taskId:string) {
 const {task}=await renewalTask(actor,taskId,true),pending=task.renewal?.pending;if(!pending)throw new Problem(400,'没有待提交记录');
 let result:any;
 try {result=await clientCoreRequest(pending.payload.path,pending.payload.body);}
 catch(error){if(error instanceof Problem&&error.status>=400&&error.status<500)await mutateTeam(actor.teamId,team=>{const t=team.tasks.find(t=>t.id===taskId)!;if(t.renewal?.pending?.id===pending.id){delete t.renewal.pending;touch(t,actor,'提交未应用',{operation:pending.operation});}});throw error;}
 if(pending.payload.path==='confirmations'){if(typeof result?.receipt?.id!=='string'||!Array.isArray(result.receipt.results)||result.receipt.results.length!==pending.payload.body.actions.length)throw new Problem(503,'提交回执不完整，请保留原提交并重试');}
 else if(typeof result?.id!=='string'||typeof result.type!=='string'||pending.operation==='cleanup'&&!Number.isInteger(result.cleanup?.pending))throw new Problem(503,'提交回执不完整，请重试原提交');
 await mutateTeam(actor.teamId,team=>{
  const t=team.tasks.find(t=>t.id===taskId)!;if(t.renewal?.pending?.id!==pending.id)throw new Problem(409,'提交状态已改变');
  const f=t.workflow!,r=t.renewal!,d=pending.data,results=result.receipt?.results??[];
  if(pending.operation==='adopt'){const created=results.find((x:any)=>x.type==='policy');f.originalTermId=created.termId;r.kind='term';r.targetId=created.termId;r.baselineRevision=1;}
  if(pending.operation==='comparison'){r.offers=d.offers;r.selectedId=d.selectedId;r.comparisonNote=d.note;r.baselineRevision=d.baselineRevision;r.baselineHash=d.baselineHash;f.comparisonVersion++;f.decision='undecided';f.decisionVersion=null;for(const s of f.steps)if(['decision','sign','submit'].includes(s.key)){s.state='pending';delete s.evidence;}}
  if(pending.operation==='decision'){f.decision=d.decision;f.decisionVersion=f.comparisonVersion;f.decisionNote=d.note;r.baselineRevision=d.baselineRevision;r.baselineHash=d.baselineHash;step(t,'decision',actor,result.receipt.id,d.note);}
  if(pending.operation==='quote'){r.quotes.push({id:result.id,key:pending.id});f.comparisonVersion++;}
  if(pending.operation==='create'){const created=results.find((x:any)=>x.type==='policy'||x.type==='term');f.targetTermId=created.termId??created.id;}
  if(pending.operation==='actual')step(t,'actual',actor,result.receipt.id,d.note);
  if(pending.operation==='billing')step(t,'billing',actor,result.receipt.id,d.note);
  if(pending.operation==='cleanup'){step(t,'cleanup',actor,result.id,'临时报价删除已排队');r.cleanupPending=result.cleanup?.pending>0;}
  if(result.receipt)f.receipts.push({id:result.receipt.id,at:new Date().toISOString(),stepKey:pending.operation});
  delete r.pending;touch(t,actor,'业务提交已确认',{operation:pending.operation,id:result.receipt?.id??result.id});
 });
 return {ok:true};
}

export async function renewalOperation(actor:Actor,input:any) {
 const v=z.object({taskId:z.string(),version:z.number().int(),op:z.string(),data:z.any().optional()}).parse(input);
 const {team,task,clientId}=await renewalTask(actor,v.taskId,true);assertVersion(task,v.version);
 if(task.billingFollowup&&['completeBilling','retryBilling'].includes(v.op))return completeBilling(actor,task,v.data??{},v.op==='retryBilling');
 if(!task.renewal)throw new Problem(400,'先选择原保单年度');if(v.op==='retry')return retryPending(actor,v.taskId);
 if(task.renewal.pending)throw new Problem(409,'请先核实或重试原提交');
 const {context,target,jobs}=await renewalData(actor,v.taskId),f=task.workflow!,r=task.renewal,d=v.data??{},original=context.term;
 const confirm=(operation:string,actions:any[],after:any=d)=>deliver(actor,task.id,v.version,operation,after,'confirmations',{teamId:actor.teamId,taskId:task.id,confirmationId:randomUUID(),confirmedBy:actor.memberId,confirmedAt:new Date().toISOString(),confirmed:true,clientId,actions});
 const instruction=(decision:string)=>({type:'renewal.instruction',data:{termId:original.id,expectedRevision:context.instruction?.revision??0,termExpectedRevision:original.revision,baselineHash:context.baselineHash,decision}});
 const note=()=>z.string().trim().min(1).max(2000).parse(d.note);
 if(v.op==='adopt') {
  if(original||r.kind!=='source')throw new Problem(409,'原年度已经建立');
  if(d.confirmed!==true)throw new Problem(400,'请核对目前已签发保单及金额');
  const premium=z.number().int().nonnegative().parse(d.premiumCents);
  return confirm('adopt',[{type:'source-policy.adopt',data:{sourceId:r.targetId,expectedRevision:context.target.revision,confirmedPolicy:true,confirmedCurrent:true,insurer:context.target.insurer,line:context.target.policyType,effectiveDate:context.target.effectiveDate,expiryDate:context.target.expiryDate,premiumCents:premium,basis:z.enum(['annual','term']).parse(d.basis),source:note()}}]);
 }
 if(v.op==='quote') {
  mutableComparison(task);return deliver(actor,task.id,v.version,'quote',{},'renewal-quotes',{clientId,kind:r.kind,targetId:r.targetId,taskId:task.id,name:d.name,base64:d.base64,slot:d.slot??'alternative',idempotencyKey:d.key??randomUUID()});
 }
 if(v.op==='retryQuote') {
  if(!r.quotes.some(q=>q.id===d.jobId))throw new Problem(404,'报价不属于此任务');
  return deliver(actor,task.id,v.version,'retryQuote',{},`renewal-quotes/${encodeURIComponent(d.jobId)}/retry`,{expectedRevision:z.number().int().parse(d.revision),idempotencyKey:randomUUID()});
 }
 if(v.op==='comparison') {
  mutableComparison(task);if(!original)throw new Problem(400,'先核对并建立原保单年度');
  const offers=z.array(offerSchema).max(50).parse(d.offers),selectedId=z.string().nullable().parse(d.selectedId);
  if(selectedId&&!offers.some(o=>o.id===selectedId))throw new Problem(400,'所选报价不存在');
  for(const offer of offers){if(!r.quotes.some(q=>q.id===offer.jobId))throw new Problem(400,'报价不属于此任务');const job=await clientCoreRequest(`renewal-quotes/${encodeURIComponent(offer.jobId)}`);if(offer.pages.some(p=>p>(job.result?.pageCount??0)))throw new Problem(400,'报价页码超出原件');}
  return confirm('comparison',[instruction('undecided')],{offers,selectedId,note:z.string().max(2000).parse(d.note??''),baselineRevision:original.revision,baselineHash:context.baselineHash});
 }
 if(v.op==='decision') {
  mutableComparison(task);if(!original)throw new Problem(400,'先建立原保单年度');
  const decision=z.enum(['stay','switch','cancel']).parse(d.decision),offer=r.offers.find(o=>o.id===r.selectedId);
  if(decision!=='cancel'){
   if(!quoteReady(offer)||!f.comparisonVersion||!context.files.some((x:any)=>['policy_original','renewal_original'].includes(x.document_kind)))throw new Problem(400,'请核对目前快照和选中报价的金额及期间');
   if((decision==='stay')!==(offer!.insurer.toLowerCase()===original.insurer.toLowerCase()))throw new Problem(400,'请选择与原公司或换公司决定相符的报价');
   if(r.baselineHash!==context.baselineHash)throw new Problem(409,'目前保单或快照已改变，请先刷新比较基线');
  }
  return confirm('decision',[instruction(decision)],{decision,note:note(),baselineRevision:original.revision,baselineHash:context.baselineHash});
 }
 if(v.op==='rebase') {
  mutableComparison(task);if(!original)throw new Problem(400,'先建立原年度');
  return confirm('comparison',[instruction('undecided')],{offers:r.offers,selectedId:r.selectedId,note:r.comparisonNote??'',baselineRevision:original.revision,baselineHash:context.baselineHash});
 }
 if(v.op==='file') {
  const termId=z.string().parse(d.termId);if(![original?.id,f.targetTermId].includes(termId))throw new Problem(400,'文件必须关联本次原年度或新年度');
  return deliver(actor,task.id,v.version,'file',{},'renewal-documents',{clientId,taskId:task.id,termId,name:d.name,base64:d.base64,documentKind:d.documentKind,idempotencyKey:d.key??randomUUID()});
 }
 if(!original||f.decision==='undecided'||(f.decision!=='cancel'&&f.decisionVersion!==f.comparisonVersion))throw new Problem(400,'请先取得当前版本的客户决定');
 if(v.op==='attachRenewal') {
  if(f.decision!=='stay'||f.targetTermId||!context.successorTermId)throw new Problem(409,'没有可关联的已创建续保年度');
  const next=await clientCoreRequest(contextPath(clientId,'term',context.successorTermId));
  if(next.term.predecessor_id!==original.id)throw new Problem(409,'续保年度关系不符');
  return mutateTeam(actor.teamId,current=>{const t=current.tasks.find(t=>t.id===task.id)!;assertVersion(t,v.version);t.workflow!.targetTermId=next.term.id;touch(t,actor,'关联已创建续保年度',{termId:next.term.id});return {ok:true};});
 }
 if(v.op==='create') {
  if(f.targetTermId)throw new Problem(409,'新年度已建立，请使用现有年度');
  if(r.baselineHash!==context.baselineHash)throw new Problem(409,'客户确认后原保单资料或快照发生变化，请重新核对客户决定');
  const offer=r.offers.find(o=>o.id===r.selectedId);if(!quoteReady(offer)||f.decision==='cancel'||d.carrierConfirmed!==true)throw new Problem(400,'请核对保险公司确认结果');
  const premium=z.number().int().nonnegative().parse(d.premiumCents);const source=note();
  const periods={effectiveDate:offer!.effectiveDate,expiryDate:offer!.expiryDate,premiumCents:premium};
  return confirm('create',[instruction(f.decision),...(f.decision==='stay'?[{type:'policy.renew',data:{termId:original.id,expectedRevision:original.revision,...periods,source,policyNumber:d.policyNumber?.trim()||original.policy_number}}]:[{type:'policy.create',data:{...periods,insurer:offer!.insurer,line:original.line,policyNumber:d.pendingIssue?undefined:z.string().trim().min(1).parse(d.policyNumber),pendingIssue:d.pendingIssue===true,confirmedPolicy:true,subjects:original.currentSubjects,applicants:original.currentApplicants}}])]);
 }
 if(v.op==='issue') {if(!target?.term)throw new Problem(400,'先建立新保单');return confirm('issue',[{type:'policy.issue',data:{policyId:target.term.policy_id,expectedRevision:target.term.policyRevision,policyNumber:z.string().trim().min(1).parse(d.policyNumber)}}]);}
 if(v.op==='actual') {
  if(!target?.term||d.carrierConfirmed!==true)throw new Problem(400,'请选择已确认的新年度');
  if(target.term.effectiveDate>businessDate())throw new Problem(409,'已保存待生效，请在生效日后核实');
  const offer=r.offers.find(o=>o.id===r.selectedId),actions:any[]=[{type:'premium.record',data:{termId:target.term.id,expectedRevision:target.term.revision,stage:'actual',basis:offer?.basis==='annual'?'annual':'term',premiumCents:z.number().int().nonnegative().parse(d.premiumCents),effectiveDate:target.term.effectiveDate,observedDate:businessDate(),source:note(),description:'Carrier confirmed in Kanban'}}];
  if(f.decision==='switch'&&!original.replacements.some((x:any)=>x.new_term_id===target.term.id))actions.push({type:'policy.linkReplacement',data:{termId:original.id,expectedRevision:original.revision,replacementPolicyId:target.term.policy_id,replacementExpectedRevision:target.term.policyRevision,effectiveDate:target.term.effectiveDate,description:note(),confirmedReplacement:true}});
  return confirm('actual',actions);
 }
 if(v.op==='cancel') {
  if(!['cancel','switch'].includes(f.decision)||d.carrierConfirmed!==true)throw new Problem(400,'核对保险公司取消确认');
  if(f.decision==='switch'&&!original.replacements.length)throw new Problem(400,'先确认新保单及替换关系');
  return confirm('cancel',[{type:'policy.change',data:{termId:original.id,expectedRevision:original.revision,type:'cancellation',effectiveDate:dateSchema.unwrap().parse(d.effectiveDate),description:note(),amount:null}}]);
 }
 if(v.op==='billing') {
  if(d.carrierConfirmed!==true)throw new Problem(400,'请核实保险公司实际账务结果');
  const event=original.events.filter((e:any)=>e.type==='cancellation').at(-1);if(!event)throw new Problem(400,'先记录实际取消事件');
  return confirm('billing',[{type:'policy.billing',data:{termId:original.id,eventId:event.id,expectedRevision:event.revision,amount:{kind:z.enum(['charge','refund']).parse(d.kind),cents:z.number().int().nonnegative().parse(d.cents),basis:'actual'},amountSource:note()}}]);
 }
 if(v.op==='followup') {
  const due=dateSchema.unwrap().parse(d.dueDate),ownerId=z.string().parse(d.ownerId),event=original.events.filter((e:any)=>e.type==='cancellation').at(-1);if(!event)throw new Problem(400,'先记录取消事件');
  return mutateTeam(actor.teamId,current=>{const t=current.tasks.find(t=>t.id===task.id)!;assertVersion(t,v.version);if(t.renewal!.billingFollowupId)return {ok:true};if(!current.members.some(m=>m.id===ownerId&&m.active))throw new Problem(400,'负责人不存在');const followup=makeTask({title:'取消账务跟进 · '+t.customer,type:'other',customer:t.customer,customerRef:t.customerRef,description:`取消事件 ${event.id}；原任务 ${t.id}；${note()}`,checklist:['核实保险公司实际退款／费用并更新取消事件'],dueDate:due,ownerId,insuranceLine:t.insuranceLine,priority:'normal'},[],actor);followup.billingFollowup={renewalTaskId:t.id,termId:original.id,eventId:event.id};current.tasks.push(followup);t.renewal!.billingFollowupId=followup.id;step(t,'billing',actor,followup.id,'已建立账务跟进任务');touch(t,actor,'账务后续任务',{id:followup.id});return {ok:true};});
 }
 if(v.op==='verify') {
  const evidence=await verifiedGates(task,team,clientId,context,target,jobs??[]);
  await mutateTeam(actor.teamId,current=>{const t=current.tasks.find(t=>t.id===task.id)!;assertVersion(t,v.version);applyVerified(t,actor,evidence);touch(t,actor,'核实生效及文件',{nodes:Object.keys(evidence)});});return {ok:true};
 }
 if(v.op==='cleanup')return deliver(actor,task.id,v.version,'cleanup',{},'renewal-quotes/cleanup',{clientId,taskId:task.id,originalTermId:original.id,targetTermId:f.targetTermId,idempotencyKey:randomUUID()});
 if(v.op==='finish') {
  if(r.cleanupPending)throw new Problem(409,'报价删除仍待重试');
  const evidence=await verifiedGates(task,team,clientId,context,target,jobs??[]);
  return mutateTeam(actor.teamId,current=>{const t=current.tasks.find(t=>t.id===task.id)!;assertVersion(t,v.version);applyVerified(t,actor,evidence);step(t,'archive',actor,'reviewed','档案和后续事项已核对');if(!workflowComplete(t.workflow!,'renewal'))throw new Problem(400,'请先完成所有必需节点');if(t.status!=='done')t.completedAt=new Date().toISOString();t.status='done';touch(t,actor,'完成续保任务',{});return {ok:true};});
 }
 throw new Problem(400,'未知续保操作');
}

async function completeBilling(actor:Actor,task:Task,data:any,retry:boolean) {
 let pending=task.workflow?.pendingConfirmation;
 if(!retry){
  if(pending)throw new Problem(409,'请先核实原账务提交');
  if(data.carrierConfirmed!==true)throw new Problem(400,'请确认保险公司实际账务结果');
  const context=await clientCoreRequest(contextPath(task.customerRef!.clientCoreId,'term',task.billingFollowup!.termId));
  const event=context.term.events.find((e:any)=>e.id===task.billingFollowup!.eventId&&e.type==='cancellation');
  if(!event)throw new Problem(409,'关联取消事件不存在');
  const id=randomUUID(),payload={teamId:actor.teamId,taskId:task.id,confirmationId:id,confirmedBy:actor.memberId,confirmedAt:new Date().toISOString(),confirmed:true,clientId:task.customerRef!.clientCoreId,actions:[{type:'policy.billing',data:{termId:context.term.id,eventId:event.id,expectedRevision:event.revision,amount:{kind:z.enum(['charge','refund']).parse(data.kind),cents:z.number().int().nonnegative().parse(data.cents),basis:'actual'},amountSource:z.string().trim().min(1).max(2000).parse(data.note)}}]};
  pending={id,payload,termId:context.term.id,stepKey:'result'};
  await mutateTeam(actor.teamId,team=>{const t=team.tasks.find(t=>t.id===task.id)!;assertVersion(t,task.version);t.workflow!.pendingConfirmation=pending;touch(t,actor,'保存待提交账务',{});});
 }
 if(!pending)throw new Problem(400,'没有待核实的账务提交');
 let result:any;
 try{result=await clientCoreRequest('confirmations',pending.payload);}catch(error){if(error instanceof Problem&&error.status>=400&&error.status<500)await mutateTeam(actor.teamId,team=>{const t=team.tasks.find(t=>t.id===task.id)!;if(t.workflow?.pendingConfirmation?.id===pending!.id){delete t.workflow.pendingConfirmation;touch(t,actor,'账务提交被拒绝',{});}});throw error;}
 if(typeof result?.receipt?.id!=='string'||!Array.isArray(result.receipt.results)||result.receipt.results.length!==1)throw new Problem(503,'账务回执不完整，请重试原提交');
 await mutateTeam(actor.teamId,team=>{const t=team.tasks.find(t=>t.id===task.id)!;if(t.workflow?.pendingConfirmation?.id!==pending!.id)throw new Problem(409,'提交状态已更新');for(const node of t.workflow.steps)step(t,node.key,actor,result.receipt.id,'保险公司实际账务结果已存入 BMS');t.workflow.receipts.push({id:result.receipt.id,stepKey:'result',at:new Date().toISOString()});delete t.workflow.pendingConfirmation;t.checklist.forEach(c=>c.done=true);if(t.status!=='done')t.completedAt=new Date().toISOString();t.status='done';touch(t,actor,'完成取消账务跟进',{receiptId:result.receipt.id});});
 return {ok:true};
}
