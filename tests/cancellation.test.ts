import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTeam} from '../src/lib/seed.ts';
import {newChangeDraft,saveChangeTask,selectionSchema} from '../src/lib/change-intake.ts';
import {workflowComplete} from '../src/lib/task-workflow.ts';
import {assertCancellationTarget,policySummary} from '../src/lib/cancellation.ts';
import {applyWorkflowAction} from '../src/lib/workflow-actions.ts';
import {applyAction} from '../src/lib/domain.ts';
import type {ChangeBaseline} from '../src/lib/change-form.ts';

function fixture(){
 const team=emptyTeam('Synthetic cancellation');team.members.push({id:'alice',name:'Alice',login:'alice',password:'',active:true,role:'admin'});
 const actor={teamId:team.id,memberId:'alice'};
 const policies=[{id:'a',key:'term:a',policy_number:'TEST-AUTO',line:'Auto',effectiveDate:'2026-01-01',expiryDate:'2027-01-01',currentSubjects:[{kind:'vehicle',id:'car1',name:'Test Car 1'},{kind:'vehicle',id:'car2',name:'Test Car 2'}]},
 {sourceId:'h',key:'source:h',policyNumber:'TEST-HOME',policyType:'Home',effectiveDate:'2026-01-01',expiryDate:'2027-01-01',subjects:[{kind:'property',id:'house',name:'1 Fictional Lane'}]}];
 const baseline:ChangeBaseline={client:{id:'client',code:'SYNTH',display_name:'Synthetic Client',revision:1,addresses:[{line1:'Do not show mailing address'}]},policy:policies[0],policies,assets:[],selectedRisk:null,selection:{clientId:'client',policyKey:'term:a',policyKeys:['term:a','source:h'],assetId:'',riskIndex:null,addressIndex:null},oldValues:{}};
 const draft=newChangeDraft(team,actor,'cancellation',baseline);
 const input={draftId:draft.id,proposed:{effectiveDate:'2026-10-03'},sourceIds:[],ownerId:'alice',priority:'high',reviewed:true};
 return {team,actor,baseline,draft,input};
}
test('whole-policy cancellation only needs a reviewed date, retains every risk and starts pending',()=>{
 const {team,actor,baseline,input}=fixture(),before=structuredClone(baseline);
 saveChangeTask(team,actor,input,baseline);const task=team.tasks[0];
 assert.equal(task.insuranceLine,'combined');assert.equal(task.status,'todo');assert.equal(task.dueDate,'2026-10-03');
 assert.deepEqual(task.changeForm?.baseline.policies,before.policies);assert.deepEqual(baseline,before);
 assert.equal(task.workflow?.steps.filter(s=>s.gate==='cancellation').length,2);
 assert.equal(task.workflow?.steps.filter(s=>s.gate==='documents').length,2);
 assert.ok(task.workflow?.steps.every(s=>s.state==='pending'));
 assert.equal(saveChangeTask(team,actor,input,baseline).duplicate,true);assert.equal(team.tasks.length,1);
});
test('both policies must independently satisfy confirmation and document gates',()=>{
 const {team,actor,baseline,input}=fixture();saveChangeTask(team,actor,input,baseline);const task=team.tasks[0],flow=task.workflow!;
 for(const step of flow.steps)if(!step.gate||step.policyKey==='term:a')step.state='done';
 assert.equal(workflowComplete(flow,'cancellation'),false);
 assert.throws(()=>applyAction(team,actor,{op:'archive',taskId:task.id,version:task.version,archived:true}),/必需业务节点/);
 assert.throws(()=>applyWorkflowAction(task,actor,{op:'workflow.step',key:'cancellation:1',state:'done',note:'Manual'}),/业务确认/);
 for(const step of flow.steps)step.state='done';assert.equal(workflowComplete(flow,'cancellation'),true);
});
test('changes to the second policy and dates outside either term reject the entire save',()=>{
 const {team,actor,baseline,input}=fixture();const current=structuredClone(baseline);current.policies![1].revision=2;
 assert.throws(()=>saveChangeTask(team,actor,input,current),/旧信息已变化/);
 baseline.policies![1].effectiveDate='2026-11-01';const second=newChangeDraft(team,actor,'cancellation',baseline);
 assert.throws(()=>saveChangeTask(team,actor,{...input,draftId:second.id},baseline),/TEST-HOME/);assert.equal(team.tasks.length,0);
});
test('policy confirmation cannot substitute another term, including imported source records',()=>{
 assert.doesNotThrow(()=>assertCancellationTarget('term:a','a',[]));assert.throws(()=>assertCancellationTarget('term:a','b',[]));
 assert.throws(()=>assertCancellationTarget('source:h','b',[]),/尚未关联/);
 assert.doesNotThrow(()=>assertCancellationTarget('source:h','h-term',[{sourceId:'h',workflowTermId:'h-term'}]));
 assert.throws(()=>assertCancellationTarget('source:h','a',[{sourceId:'h',workflowTermId:'h-term'}]));
});
test('summary shows all policy risks and explicit occupancy without inventing address/type',()=>{
 const {baseline}=fixture();const auto=policySummary(baseline.policies![0]);assert.equal(auto.risks.length,2);assert.equal(auto.address,'未记录');
 const home=policySummary({...baseline.policies![1],propertyType:'condo',use:'owner_occupied',policyAddress:{line1:'1 Fictional Lane',city:'Testville'}});
 assert.equal(home.propertyType,'Condo');assert.equal(home.use,'自住');assert.match(home.address,/Testville/);
 const unknown=policySummary({...baseline.policies![1],description:'Tenant has moved',mailingAddress:'Do not infer'});
 assert.equal(unknown.propertyType,'未记录');assert.equal(unknown.use,'未记录');assert.equal(unknown.address,'未记录');
});
test('duplicate policy selections and multi-policy snapshots for other changes are rejected',()=>{
 const {team,actor,baseline}=fixture();assert.throws(()=>selectionSchema.parse({...baseline.selection,policyKeys:['term:a','term:a']}));
 assert.throws(()=>newChangeDraft(team,actor,'address',baseline),/整单取消/);
});

test('source detail objects show recorded vehicles and property facts without reviving superseded risks',()=>{
 const source={vehicleDetails:{vehicles:[{year:2024,make:'Test',model:'Sedan',vin:'SYNTHETIC',garaging:'1 Fictional Lane'}]}};
 const auto=policySummary(source);assert.equal(auto.risks.length,1);assert.equal(auto.risks[0].name,'2024 Test Sedan');assert.equal(auto.risks[0].address,'1 Fictional Lane');
 assert.equal(policySummary({...source,currentSubjects:[]}).risks.length,0);
 const home=policySummary({riskDetails:{propertyType:'condo',occupancy:'owner_occupied',propertyAddress:'1 Fictional Lane'}});
 assert.equal(home.propertyType,'Condo');assert.equal(home.use,'自住');assert.equal(home.address,'1 Fictional Lane');
 assert.equal(policySummary({propertyType:'unknown',use:'unknown'}).propertyType,'未记录');
});
