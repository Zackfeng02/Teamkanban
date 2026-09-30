import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorkflow,compareTasks,workflowComplete } from '../src/lib/task-workflow.ts';
import { applyWorkflowAction } from '../src/lib/workflow-actions.ts';
import type {Task} from '../src/lib/model.ts';
test('priority precedes deadlines with stable ordering and missing dates last',()=>{const task={createdAt:'2026-01-01',id:'a',priority:'normal',dueDate:'2026-01-01'} as Task;assert.ok(compareTasks({...task,priority:'urgent',dueDate:null},task)<0);assert.ok(compareTasks({...task,dueDate:null},task)>0);});
test('renewal confirmation is invalidated by changed comparison; business gates cannot be checked',()=>{const task={type:'renewal',workflow:newWorkflow('renewal')} as Task,actor={teamId:'t',memberId:'m'};applyWorkflowAction(task,actor,{op:'workflow.comparison',text:'A 1200 / B 1100; higher deductible'});applyWorkflowAction(task,actor,{op:'workflow.decision',decision:'switch',note:'Client call 2026-09-28'});assert.equal(task.workflow!.decision,'switch');applyWorkflowAction(task,actor,{op:'workflow.comparison',text:'B 1300'});assert.equal(task.workflow!.decision,'undecided');assert.throws(()=>applyWorkflowAction(task,actor,{op:'workflow.step',key:'actual',state:'done',note:'checked'}));assert.equal(workflowComplete(task.workflow!,'renewal'),false);});
