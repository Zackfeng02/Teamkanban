import { z } from 'zod';
import type { Actor,Task } from './model.ts';
import { newWorkflow } from './task-workflow.ts';
import { Problem } from './security.ts';
export function applyWorkflowAction(task:Task,actor:Actor,input:unknown) {
 const base=z.object({op:z.string()}).passthrough().parse(input);
 if(base.op==='workflow.start') { if(task.workflow) throw new Problem(409,'办理节点已存在'); task.workflow=newWorkflow(task.type); return; }
 const flow=task.workflow; if(!flow) throw new Problem(400,'请先添加办理节点');
 if(task.renewal?.pending)throw new Problem(409,'请先核实待处理提交');
 if(task.billingFollowup)throw new Problem(400,'请通过账务跟进页面的 BMS 回执完成节点');
 if(task.renewal&&['workflow.comparison','workflow.decision'].includes(base.op))throw new Problem(400,'请在快照比价页面记录方案和决定');
 if(flow.pendingConfirmation) throw new Problem(409,'有待核实的业务提交，请先重试原提交');
 if(base.op==='workflow.comparison') {
  const {text}=z.object({text:z.string().trim().min(1).max(8000)}).parse(base);
  if(flow.comparison===text)return;
  if(flow.receipts.length||flow.steps.some(s=>s.evidence))throw new Problem(409,'已有生效业务结果，请另建变更任务');
  flow.comparison=text; flow.comparisonVersion++; flow.decision='undecided';flow.decisionVersion=null;
  for(const s of flow.steps) if(['decision','sign','submit'].includes(s.key)){s.state='pending';delete s.by;delete s.at;}
 } else if(base.op==='workflow.decision') {
  const value=z.object({decision:z.enum(['stay','switch','cancel']),note:z.string().trim().min(1).max(2000)}).parse(base);
  if(value.decision!=='cancel'&&!flow.comparisonVersion)throw new Problem(400,'请先保存已 Review 的比较方案');
  if(flow.receipts.length||flow.steps.some(s=>s.evidence))throw new Problem(409,'已有业务结果，请另建任务');
  if(flow.decision!==value.decision)for(const s of flow.steps)if(['sign','submit'].includes(s.key)){s.state='pending';delete s.by;delete s.at;}
  flow.decision=value.decision;flow.decisionNote=value.note;flow.decisionVersion=flow.comparisonVersion;
  const step=flow.steps.find(s=>s.key==='decision');if(step)Object.assign(step,{state:'done',by:actor.memberId,at:new Date().toISOString(),note:value.note});
 } else if(base.op==='workflow.step') {
  const value=z.object({key:z.string(),state:z.enum(['pending','done','skipped']),note:z.string().trim().max(2000)}).parse(base);
  const step=flow.steps.find(s=>s.key===value.key);if(!step)throw new Problem(404,'节点不存在');
  if(task.renewal&&['archive','sign'].includes(step.key))throw new Problem(400,'请在续保页面上传文件并核实归档');
  if(task.renewal&&value.state==='done'&&!value.note)throw new Problem(400,'请记录办理依据');
  if((step.gate&&!(task.type==='address'&&step.key==='change'&&value.state==='skipped'&&value.note))||step.key==='decision')throw new Problem(400,'此节点必须通过业务确认完成');
  if(value.state==='skipped'&&!value.note)throw new Problem(400,'请填写不适用原因');
  if(task.type==='renewal'&&['sign','submit'].includes(step.key)&& (flow.decision!=='switch'||flow.decisionVersion!==flow.comparisonVersion)) throw new Problem(400,'请先取得当前方案的客户确认');
  Object.assign(step,{state:value.state,note:value.note,by:actor.memberId,at:new Date().toISOString()});
 } else throw new Problem(400,'未知办理操作');
}
