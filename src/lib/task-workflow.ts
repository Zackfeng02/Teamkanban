import type { Task } from './model.ts';
export const taskTypes = ['lead','policy','other','renewal','address','vehicle_add','vehicle_replace','vehicle_remove','property_add','property_remove','coverage_change','cancellation','reinstatement','documents'] as const;
export type TaskType = typeof taskTypes[number];
export const priorities = ['urgent','high','normal','low'] as const;
export type Priority = typeof priorities[number];
export const priorityLabels = { urgent:'紧急', high:'高', normal:'普通', low:'低' };
export const lineLabels = { auto:'车险', home:'房屋险', combined:'车房组合', other:'其他' };
export type WorkflowStep = { key:string; label:string; gate?:'actual'|'change'|'cancellation'|'reinstatement'|'documents'; state:'pending'|'done'|'skipped'; note:string; by?:string; at?:string; evidence?:string; branch?:'switch' };
export type Workflow = { templateVersion:number; steps:WorkflowStep[]; decision:'undecided'|'stay'|'switch'; decisionNote:string; decisionVersion:number|null; comparisonVersion:number; comparison:string; targetTermId:string|null; replacementTermId:string|null; originalTermId?:string; pendingConfirmation?:{ id:string; payload:unknown; termId:string; stepKey:string; gate?:string }; receipts:{id:string; at:string; stepKey:string}[] };
type Definition = [string,string,WorkflowStep['gate']?,WorkflowStep['branch']?];
const needs:Definition=['needs','确认需求与日期'];
const quote:Definition=['quote','获取报价并核对保障差异'];
const consent:Definition=['consent','记录客户确认'];
const submit:Definition=['submit','提交办理并记录依据'];
const documents:Definition=['documents','收齐并核对正式文件','documents'];
const archive:Definition=['archive','更新客户及风险档案'];
const change:Definition=['change','确认批单、生效日期与调整金额','change'];
const issue:Definition=['actual','确认新保单生效','actual'];
const purchase:Definition[]=[needs,['collect','收集报价资料'],quote,consent,['sign','签署投保文件'],submit,issue,documents,archive];
const templates:Record<TaskType,Definition[]>={
 lead:purchase,
 policy:[needs,quote,consent,submit,change,documents,archive],
 other:[needs,['process','处理事项'],['result','记录处理结果']],
 renewal:[['quote','Review 续保报价及替代方案'],['discuss','向客户说明价格与保障差异'],['decision','记录客户决定'],['sign','签署新保单文件',undefined,'switch'],['submit','提交新保单申请',undefined,'switch'],['actual','确认续保或新保单生效','actual'],documents,['cancellation','确认旧保单取消','cancellation','switch'],archive],
 address:[['needs','确认地址、日期及通讯／承保风险范围'],quote,consent,submit,change,documents,archive],
 vehicle_add:[['needs','收集新增车辆及使用资料'],quote,consent,submit,change,documents,archive],
 vehicle_replace:[['needs','确认旧车、新车及替换日期'],quote,consent,submit,change,['continuity','核对新旧车辆保障衔接'],documents,archive],
 vehicle_remove:[['needs','确认移除车辆、原因及日期'],consent,submit,change,['billing','核对补收／退款'],documents,archive],
 property_add:purchase,
 property_remove:[['needs','确认房产、日期及移除风险或整单取消'],consent,submit,change,['billing','核对批单／取消及退款'],documents,archive],
 coverage_change:[needs,quote,consent,submit,change,documents,archive],
 cancellation:[['needs','确认保单及申请取消日期'],consent,['sign','准备取消材料'],submit,['cancellation','收到取消确认并核对生效日','cancellation'],['billing','核对退款／费用'],documents,archive],
 reinstatement:[['needs','确认保单与恢复申请日期'],['collect','收集恢复材料'],submit,['reinstatement','确认恢复及保障起始日期','reinstatement'],documents,archive],
 documents:[needs,['collect','获取或核对资料'],['deliver','完成交付'],['result','记录结果']],
};
export function newWorkflow(type:TaskType):Workflow { return {templateVersion:1,steps:templates[type].map(([key,label,gate,branch])=>({key,label,gate,branch,state:'pending',note:''})),decision:'undecided',decisionNote:'',decisionVersion:null,comparisonVersion:0,comparison:'',targetTermId:null,replacementTermId:null,receipts:[]}; }
export function visibleSteps(flow:Workflow) { return flow.steps.filter(s=>s.branch!=='switch'||flow.decision==='switch'); }
export function nextStep(task:Pick<Task,'workflow'>) { return task.workflow ? visibleSteps(task.workflow).find(s=>s.state==='pending')?.label : undefined; }
export function workflowComplete(flow:Workflow, type:TaskType) { return (type!=='renewal'||flow.decision!=='undecided') && visibleSteps(flow).every(s=>s.state!=='pending'); }
export function compareTasks(a:Task,b:Task) { return priorities.indexOf(a.priority??'normal')-priorities.indexOf(b.priority??'normal')||(a.dueDate??'9999').localeCompare(b.dueDate??'9999')||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id); }
export function businessDate() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
