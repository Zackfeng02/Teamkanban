import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTeam} from '../src/lib/seed.ts';
import {makeTask,applyAction,snapshot} from '../src/lib/domain.ts';
import {archiveCompletedTasks,completionTime,compareBoardTasks,COMPLETED_RETENTION_MS} from '../src/lib/task-board.ts';

function fixture(){
 const team=emptyTeam('Synthetic board');team.members.push({id:'a',name:'Test Owner',login:'a',password:'',role:'admin',active:true},{id:'b',name:'Test Member',login:'b',password:'',role:'member',active:true});
 const actor={teamId:team.id,memberId:'a'},input={title:'Synthetic task',customer:'',customerRef:null,type:'other' as const,description:'',checklist:[],ownerId:null,dueDate:null};
 const task=makeTask(input,[],actor);delete task.workflow;team.tasks.push(task);return {team,actor,task,input};
}
test('completed tasks retain a full week and archive once with recoverable history',()=>{
 const {team,task}=fixture();const time=Date.parse('2026-09-30T12:00:00Z');task.status='done';task.completedAt=new Date(time).toISOString();task.comments.push({id:'comment',memberId:'a',text:'Keep evidence',at:task.completedAt});
 assert.equal(archiveCompletedTasks(team,time+COMPLETED_RETENTION_MS),0);
 assert.equal(archiveCompletedTasks(team,time+COMPLETED_RETENTION_MS+1),1);
 assert.equal(task.archived,true);assert.equal(task.comments[0].text,'Keep evidence');assert.equal(task.version,2);
 assert.equal(archiveCompletedTasks(team,time+COMPLETED_RETENTION_MS*2),0);assert.match(task.activity.at(-1)!.action,/自动归档/);
});
test('completion changes are timed, ordinary edits do not reset, reopening and restoration grant a new week',()=>{
 const {team,task,actor,input}=fixture();const patch={...input,checklist:[],status:'done',waitingReason:''};
 applyAction(team,actor,{op:'updateTask',taskId:task.id,version:task.version,patch});assert.ok(task.completedAt);
 const old='2026-01-01T00:00:00Z';task.completedAt=old;
 applyAction(team,actor,{op:'comment',taskId:task.id,version:task.version,text:'A later comment'});
 applyAction(team,actor,{op:'updateTask',taskId:task.id,version:task.version,patch:{...patch,title:'Edited title'}});assert.equal(task.completedAt,old);
 applyAction(team,actor,{op:'updateTask',taskId:task.id,version:task.version,patch:{...patch,status:'doing'}});assert.equal(task.completedAt,null);
 applyAction(team,actor,{op:'updateTask',taskId:task.id,version:task.version,patch});assert.notEqual(task.completedAt,old);
 task.archived=true;task.completedAt=old;applyAction(team,actor,{op:'archive',taskId:task.id,version:task.version,archived:false});assert.notEqual(task.completedAt,old);
});
test('legacy timing uses actual completion transitions, gives unknown records grace, and guards pending work',()=>{
 const {team,task}=fixture(),time=Date.parse('2026-09-30T12:00:00Z');task.status='done';delete task.completedAt;
 task.activity.push({id:'completion',memberId:'a',at:'2026-09-20T12:00:00Z',action:'Update',before:{status:'doing'},after:{status:'done'}});
 task.activity.push({id:'edit',memberId:'a',at:'2026-09-29T12:00:00Z',action:'Update',before:{status:'done'},after:{status:'done'}});
 assert.equal(completionTime(task),'2026-09-20T12:00:00Z');assert.equal(archiveCompletedTasks(team,time),1);
 const unknown=structuredClone(task);unknown.id='unknown';unknown.archived=false;delete unknown.completedAt;unknown.activity=[];team.tasks.push(unknown);
 assert.equal(archiveCompletedTasks(team,time),0);assert.equal(unknown.completedAt,new Date(time).toISOString());
 const pending=structuredClone(task);pending.id='pending';pending.archived=false;pending.workflow={templateVersion:1,steps:[{key:'confirm',label:'Confirm',state:'pending',note:'',gate:'cancellation'}],decision:'undecided',decisionNote:'',decisionVersion:null,comparisonVersion:0,comparison:'',targetTermId:null,replacementTermId:null,receipts:[]};team.tasks.push(pending);
 assert.equal(archiveCompletedTasks(team,time),0);assert.equal(pending.archived,false);
});
test('member ordering overrides priorities, persists in snapshot, and retains tasks hidden by filters',()=>{
 const {team,task,actor,input}=fixture();task.id='urgent';task.priority='urgent';
 const hidden=makeTask({...input,title:'Hidden task'},[],actor);hidden.id='hidden';
 const low=makeTask({...input,priority:'low'},[],actor);low.id='low';team.tasks.push(hidden,low);
 applyAction(team,{...actor,memberId:'b'},{op:'reorderTask',taskId:low.id,version:low.version,beforeTaskId:task.id,orderVersion:0});
 const saved=snapshot(team,actor);assert.deepEqual([...saved.tasks].sort((a,b)=>compareBoardTasks(a,b,saved.taskOrder)).map(t=>t.id),['low','urgent','hidden']);
 assert.equal(saved.taskOrderVersion,1);assert.equal(low.priority,'low');assert.equal(low.status,'todo');
 assert.ok(saved.taskOrder.todo?.includes('hidden'));
 assert.throws(()=>applyAction(team,actor,{op:'reorderTask',taskId:low.id,version:low.version,beforeTaskId:'hidden',orderVersion:0}),/顺序已更新/);
});
test('ordering rejects foreign tasks, stale versions and movement between states',()=>{
 const {team,task,actor,input}=fixture();const other=makeTask(input,[],actor);other.status='doing';team.tasks.push(other);
 const action={op:'reorderTask',taskId:task.id,version:task.version,beforeTaskId:other.id,orderVersion:0};
 assert.throws(()=>applyAction(team,actor,action),/同一状态列/);
 assert.throws(()=>applyAction(team,actor,{...action,beforeTaskId:'foreign'}),/同一状态列/);
 assert.throws(()=>applyAction(team,actor,{...action,version:99}),/其他成员/);
 assert.throws(()=>applyAction(team,{teamId:'foreign',memberId:'a'},action),/失效/);
});
