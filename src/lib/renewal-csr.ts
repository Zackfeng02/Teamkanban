import {renewalPortfolio,renewalQueue} from './renewal-portfolio.ts';
import {readTeam,mutateTeam} from './store.ts';
import {clientCoreRequest,clientCorePdf} from './clientcore.ts';
import {Problem,requireMember} from './security.ts';
import {feedbackSchema,recordFeedback,type CsrTask} from './renewal-feedback.ts';
import type {Actor} from './model.ts';

export async function csrTask(actor:Actor,taskId:string) {
 const team=await readTeam(actor.teamId);if(!team)throw new Problem(404,'Team not found.');requireMember(team,actor);
 if(team.demo)throw new Problem(403,'Demo spaces cannot access customer comparisons.');
 const task=team.tasks.find(t=>t.id===taskId) as CsrTask|undefined;
 if(!task||task.type!=='renewal'||!task.customerRef)throw new Problem(404,'Select a linked renewal task.');
 return {team,task,clientId:task.customerRef.clientCoreId};
}
export async function csrQueue(actor:Actor) {
 const team=await readTeam(actor.teamId);if(!team)throw new Problem(404,'Team not found.');requireMember(team,actor);
 if(team.demo)throw new Problem(403,'Demo spaces cannot access customer comparisons.');
 const queue=await renewalQueue();
 return {...queue,items:queue.items.map((p:any)=>({...p,taskId:team.tasks.find(t=>!t.archived&&t.type==='renewal'&&t.customerRef?.clientCoreId===p.clientId&&
  (t.renewal?.targetId===p.targetId&&t.renewal?.kind===p.targetKind||t.workflow?.originalTermId===p.targetId))?.id??null}))};
}
export async function csrComparison(actor:Actor,taskId:string) {
 const {team,task,clientId}=await csrTask(actor,taskId);
 const portfolio=await renewalPortfolio(clientId,task.renewal?{kind:task.renewal.kind,targetId:task.renewal.targetId}:task.workflow?.originalTermId?{kind:'term',targetId:task.workflow.originalTermId}:undefined);
 const feedback=team.tasks.filter(t=>t.type==='renewal'&&t.customerRef?.clientCoreId===clientId).flatMap(t=>(t as CsrTask).renewalFeedback??[]).sort((a,b)=>b.at.localeCompare(a.at));
 const policyTasks=Object.fromEntries(portfolio.policies.map((p:any)=>{const related=team.tasks.filter(t=>t.type==='renewal'&&t.customerRef?.clientCoreId===clientId&&(t.renewal?.kind===p.targetKind&&t.renewal?.targetId===p.targetId||t.renewal?.kind==='source'&&t.renewal?.targetId===p.sourceTargetId||t.workflow?.originalTermId===p.targetId));const linked=related.find(t=>!t.archived)??related[0]??task;return [p.targetKind+':'+p.targetId,{id:linked.id,version:linked.version,archived:linked.archived}];}));
 return {task,portfolio,feedback,policyTasks};
}
export async function csrPdf(actor:Actor,taskId:string,kind:string,id:string) {
 const {portfolio}=await csrComparison(actor,taskId);
 if(!portfolio.policies.some((p:any)=>Object.values(p.broker.snapshots).some((s:any)=>s?.kind===kind&&s.id===id)))throw new Problem(404,'Snapshot does not belong to this Client comparison.');
 const base=`clients/${encodeURIComponent(portfolio.clientId)}/`;
 return clientCorePdf(kind==='quote'?`${base}renewal-comparison/quotes/${encodeURIComponent(id)}`:`${base}files/${encodeURIComponent(id)}`);
}
export async function saveCsrFeedback(actor:Actor,value:unknown) {
 const input=feedbackSchema.parse(value),{portfolio}=await csrComparison(actor,input.comparisonTaskId??input.taskId);
 return mutateTeam(actor.teamId,team=>recordFeedback(team,actor,input,portfolio));
}
