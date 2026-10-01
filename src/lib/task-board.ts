import type {Task,Team,Status} from './model.ts';
import {compareTasks,workflowComplete} from './task-workflow.ts';

export const COMPLETED_RETENTION_MS=7*24*60*60*1000;
export function completionTime(task:Task):string|null {
  if(task.status!=='done')return null;
  if(task.completedAt&&Number.isFinite(Date.parse(task.completedAt)))return task.completedAt;
  const transition=task.activity.findLast(entry=>(entry.after as any)?.status==='done'&&(entry.before as any)?.status!=='done');
  return transition&&Number.isFinite(Date.parse(transition.at))?transition.at:null;
}
export function archiveCompletedTasks(team:Team,time=Date.now()):number {
  let count=0;
  for(const task of team.tasks){
    if(task.archived||task.status!=='done')continue;
    // Legacy completions without a reliable transition receive a full grace week.
    task.completedAt=completionTime(task)??new Date(time).toISOString();
    if(time-Date.parse(task.completedAt)<=COMPLETED_RETENTION_MS||task.renewal?.pending||task.workflow&&!workflowComplete(task.workflow,task.type))continue;
    task.archived=true;task.version++;task.updatedAt=new Date(time).toISOString();
    task.activity.push({id:crypto.randomUUID(),memberId:'system',at:task.updatedAt,action:'完成超过一周后自动归档',before:false,after:true});count++;
  }
  return count;
}
export function compareBoardTasks(a:Task,b:Task,order:Team['taskOrder']={}) {
  if(a.status!==b.status)return a.status.localeCompare(b.status);
  const ids=order?.[a.status]??[],ai=ids.indexOf(a.id),bi=ids.indexOf(b.id);
  if(ai!==bi&&(ai>=0||bi>=0))return (ai<0?Infinity:ai)-(bi<0?Infinity:bi);
  return compareTasks(a,b);
}
export function reorderedColumn(team:Team,status:Status,taskId:string,beforeTaskId:string|null) {
  const ids=team.tasks.filter(task=>task.status===status).sort((a,b)=>compareBoardTasks(a,b,team.taskOrder)).map(task=>task.id).filter(id=>id!==taskId);
  const index=beforeTaskId===null?ids.length:ids.indexOf(beforeTaskId);
  ids.splice(index,0,taskId);return ids;
}
