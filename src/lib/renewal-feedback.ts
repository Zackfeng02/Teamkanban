import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Problem,requireMember} from './security.ts';
import type {Actor,Task,Team} from './model.ts';

export const feedbackSchema=z.object({requestId:z.string().uuid(),taskId:z.string().min(1),comparisonTaskId:z.string().min(1).optional(),version:z.number().int(),comparisonHash:z.string().length(64),
 targetKind:z.enum(['source','term']),targetId:z.string().min(1).max(160),decision:z.enum(['undecided','stay','switch','cancel']),
 channel:z.enum(['phone','email','message','in_person']),note:z.string().trim().min(1).max(4000)}).strict();
export type FeedbackInput=z.infer<typeof feedbackSchema>;
export type RenewalFeedback=Omit<FeedbackInput,'taskId'|'version'> & {memberId:string;at:string;policyNumber:string;insurer:string;brokerRevision:number};
export type CsrTask=Task & {renewalFeedback?:RenewalFeedback[]};

export function recordFeedback(team:Team,actor:Actor,input:FeedbackInput,portfolio:any) {
 requireMember(team,actor);
 if(team.demo)throw new Problem(403,'Demo spaces cannot record customer feedback.');
 const task=team.tasks.find(t=>t.id===input.taskId) as CsrTask|undefined;
 if(!task||task.type!=='renewal'||!task.customerRef||task.customerRef.clientCoreId!==portfolio.clientId)throw new Problem(404,'Renewal task does not belong to this Client.');
 const existing=task.renewalFeedback?.find(f=>f.requestId===input.requestId);
 if(existing){
  if(existing.memberId!==actor.memberId)throw new Problem(409,'This feedback request belongs to another team member.');
  for(const key of ['comparisonTaskId','comparisonHash','targetKind','targetId','decision','channel','note'] as const)if(existing[key]!==input[key])throw new Problem(409,'The saved feedback request has different content.');
  return {ok:true,replayed:true};
 }
 if(task.archived)throw new Problem(409,'This task is archived. Create a follow-up task.');
 if(task.version!==input.version)throw new Problem(409,'The task changed. Refresh and review before saving; your input is retained.');
 if(portfolio.comparisonHash!==input.comparisonHash)throw new Problem(409,'The broker updated the comparison. Refresh and review before saving; your input is retained.');
 const policy=portfolio.policies.find((p:any)=>p.targetKind===input.targetKind&&p.targetId===input.targetId);
 if(!policy)throw new Problem(404,'Policy does not belong to this Client comparison.');
 const {taskId,version,...value}=input;
 const entry:RenewalFeedback={...value,memberId:actor.memberId,at:new Date().toISOString(),policyNumber:policy.policyNumber??'',insurer:policy.insurer??'',brokerRevision:policy.broker.revision};
 (task.renewalFeedback??=[]).push(entry);
 const summary=`Customer feedback · ${entry.policyNumber} · ${entry.decision} · ${entry.channel}\n${entry.note}`;
 task.comments.push({id:input.requestId,memberId:actor.memberId,at:entry.at,text:summary});
 task.version++;task.updatedAt=entry.at;
 task.activity.push({id:randomUUID(),memberId:actor.memberId,at:entry.at,action:'Customer renewal feedback',before:null,after:entry});
 return {ok:true,replayed:false};
}
