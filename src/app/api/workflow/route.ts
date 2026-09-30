import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, Problem, requireMember } from '../../../lib/security.ts';
import { readTeam,mutateTeam } from '../../../lib/store.ts';
import { clientCoreRequest } from '../../../lib/clientcore.ts';
import { failure,jsonBody,originCheck } from '../../../lib/http.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function context(taskId:string) {
 const actor=await authenticate((await cookies()).get('kanban_session')?.value),team=(await readTeam(actor.teamId))!;
 if(team.demo)throw new Problem(403,'演示空间不能读取业务档案');
 const task=team.tasks.find(t=>t.id===taskId);if(!task?.customerRef)throw new Problem(400,'请先保存并关联 ClientCore 客户');
 return {actor,team,task,clientId:task.customerRef.clientCoreId};
}
export async function GET(request:Request) {try {const {clientId}=await context(new URL(request.url).searchParams.get('taskId')??'');return NextResponse.json(await clientCoreRequest(`clients/${encodeURIComponent(clientId)}/workflow-targets`));}catch(e){return failure(e);}}
export async function POST(request:Request) {try {
 originCheck(request);
 const input=z.object({taskId:z.string(),version:z.number().int(),stepKey:z.string(),termId:z.string(),originalTermId:z.string().optional(),mode:z.enum(['verify','record','retry']),effectiveDate:z.string().optional(),premiumCents:z.number().int().nonnegative().optional(),source:z.string().trim().max(2000).optional(),wholePolicyCancellation:z.boolean().optional()}).strict().parse(await jsonBody(request));
 const {actor,team,task,clientId}=await context(input.taskId);requireMember(team,actor,true);
 const flow=task.workflow,step=flow?.steps.find(s=>s.key===input.stepKey);
 if(!flow||!step?.gate)throw new Problem(400,'请选择业务确认节点');
 if(task.version!==input.version)throw new Problem(409,'任务已更新，请重新加载');
 if(task.type==='renewal'&&flow.decision==='undecided')throw new Problem(400,'请先记录客户决定');
 if(task.type==='renewal'&&flow.decisionVersion!==flow.comparisonVersion)throw new Problem(409,'客户尚未确认当前方案');
 if(flow.pendingConfirmation&&input.mode!=='retry')throw new Problem(409,'请先重试待核实提交');
 const targets=await clientCoreRequest(`clients/${encodeURIComponent(clientId)}/workflow-targets`);
 const target=targets.items.find((t:any)=>t.id===input.termId);if(!target)throw new Problem(404,'目标保单不属于此客户');
 if(flow.pendingConfirmation&&(flow.pendingConfirmation.termId!==input.termId||flow.pendingConfirmation.stepKey!==input.stepKey))throw new Problem(409,'重试必须使用原保单和节点');
 const originalId=flow.originalTermId??input.originalTermId;
 if(task.type==='renewal'&&step.gate==='actual'){
  const original=targets.items.find((t:any)=>t.id===originalId);
  if(!original||original.id===target.id)throw new Problem(400,'请选择本次续保的原保单年度，不能用原年度确认下一期生效');
  if(flow.decision==='stay'&&target.predecessor_id!==original.id)throw new Problem(400,'请选择原保单的下一续保年度');
  if(flow.decision==='switch'&&target.policy_id===original.policy_id)throw new Problem(400,'切换须选择另一张保单');
 }
 if(task.type==='renewal'&&step.gate==='cancellation'&&input.termId!==flow.originalTermId)throw new Problem(400,'取消节点必须对应本次换保的旧保单年度');
 const gate=flow.pendingConfirmation?.gate??(task.type==='property_remove'&&step.gate==='change'&&input.wholePolicyCancellation?'cancellation':step.gate);
 const path=`clients/${encodeURIComponent(clientId)}/workflow-evidence/${encodeURIComponent(input.termId)}/${gate}`;
 let receiptId:string|null=null;let submissionId:string|undefined=flow.pendingConfirmation?.id;
 if(step.gate==='documents'&&input.mode!=='verify')throw new Problem(400,'请先在 ClientCoreBMS 归档正式文件，再核实完整性');
 if(task.changeForm&&step.gate==='change'&&input.mode==='record')throw new Problem(409,'此任务包含结构化变更申请，请先在 ClientCoreBMS 记录实际变更，再核实已有业务记录；不会仅凭说明完成字段更新');
 if(input.mode!=='verify') {
  let pending=flow.pendingConfirmation;
  if(!pending) {
   if(!input.effectiveDate||!input.source)throw new Problem(400,'请填写生效日期和确认依据');
   if(input.effectiveDate>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date()))throw new Problem(400,'未来生效事实请先在 ClientCoreBMS 记录，生效后再核实此节点');
   if(step.gate==='actual'&&input.premiumCents===undefined)throw new Problem(400,'请填写税前实际保费');
   const data=step.gate==='actual'?{termId:target.id,expectedRevision:target.revision,stage:'actual',basis:'term',premiumCents:input.premiumCents,effectiveDate:input.effectiveDate,observedDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date()),source:input.source,description:'Confirmed in Team Kanban'}:{termId:target.id,expectedRevision:target.revision,type:gate,effectiveDate:input.effectiveDate,description:input.source,amount:null};
   const actions:any[]=[{type:step.gate==='actual'?'premium.record':'policy.change',data}];
   if(task.type==='renewal'&&flow.decision==='switch'&&step.gate==='actual'){const original=targets.items.find((t:any)=>t.id===originalId);actions.push({type:'policy.linkReplacement',data:{termId:original.id,expectedRevision:original.revision,replacementPolicyId:target.policy_id,replacementExpectedRevision:target.policy_revision,effectiveDate:input.effectiveDate,description:input.source,confirmedReplacement:true}});}
   const id=crypto.randomUUID();pending={id,termId:input.termId,stepKey:input.stepKey,gate,payload:{teamId:actor.teamId,taskId:task.id,confirmationId:id,confirmedBy:actor.memberId,confirmedAt:new Date().toISOString(),confirmed:true,clientId,actions}};
   const saved=pending;
   await mutateTeam(actor.teamId,current=>{const t=current.tasks.find(t=>t.id===task.id)!;if(t.version!==input.version)throw new Problem(409,'任务已更新');t.workflow!.pendingConfirmation=saved;if(originalId)t.workflow!.originalTermId=originalId;t.version++;});
  }
  submissionId=pending.id;
  try {const result=await clientCoreRequest('confirmations',pending.payload);receiptId=result.receipt.id;}
  catch(e) {if(e instanceof Problem&&e.status>=400&&e.status<500){await mutateTeam(actor.teamId,current=>{const t=current.tasks.find(t=>t.id===task.id)!;if(t.workflow?.pendingConfirmation?.id===pending!.id){delete t.workflow.pendingConfirmation;t.version++;}});}throw e;}
 }
 const evidence=await clientCoreRequest(path);
 if(input.mode==='verify'&&step.gate==='actual'&&task.type==='renewal'&&flow.decision==='switch'&&!evidence.replacesTermIds?.includes(originalId))throw new Problem(409,'请先在 ClientCoreBMS 关联新旧保单替换关系');
 if(step.gate==='documents'&&!input.source?.trim())throw new Problem(400,'请填写已核对文件完整性的依据');
 if(input.mode==='verify'&&['change','cancellation','reinstatement'].includes(step.gate)&&input.effectiveDate!==evidence.effectiveDate)throw new Problem(400,'请输入与本次已确认事件相符的生效日期');
 await mutateTeam(actor.teamId,current=>{
  const t=current.tasks.find(t=>t.id===task.id)!;
  if(input.mode==='verify'&&t.version!==input.version)throw new Problem(409,'任务已更新');
  const f=t.workflow!,s=f.steps.find(s=>s.key===input.stepKey)!;
  if(input.mode!=='verify'&&f.pendingConfirmation?.id!==submissionId)throw new Problem(409,'提交已变更');
  Object.assign(s,{state:'done',by:actor.memberId,at:new Date().toISOString(),evidence:evidence.evidenceId,note:input.source??'已核实 ClientCoreBMS 记录'});
  f.targetTermId=input.termId;if(originalId)f.originalTermId=originalId;
  if(receiptId)f.receipts.push({id:receiptId,at:new Date().toISOString(),stepKey:s.key});
  delete f.pendingConfirmation;t.version++;t.updatedAt=new Date().toISOString();t.activity.push({id:crypto.randomUUID(),memberId:actor.memberId,at:t.updatedAt,action:'核实业务节点',before:null,after:{step:s.key,evidence:evidence.evidenceId,termId:input.termId}});
 });
 return NextResponse.json({ok:true});
 }catch(e){return failure(e);}}
