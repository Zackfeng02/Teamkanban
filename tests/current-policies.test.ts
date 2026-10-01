import test from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentPolicy} from '../src/lib/current-policies.ts';
import {changeContext} from '../src/lib/change-intake.ts';
import {businessDate} from '../src/lib/task-workflow.ts';

test('only currently effective valid policies are selectable, with expiry exclusive',()=>{
 const policy={effectiveDate:'2026-01-01',expiryDate:'2027-01-01',status:'Active'};
 assert.equal(isCurrentPolicy(policy,'2026-09-30'),true);assert.equal(isCurrentPolicy(policy,'2026-01-01'),true);
 assert.equal(isCurrentPolicy(policy,'2027-01-01'),false);assert.equal(isCurrentPolicy(policy,'2025-12-31'),false);
 for(const status of ['Canceled','Cancelled','Lapsed','Expired','Future','Prospect','Voided','Pending Issue',''])assert.equal(isCurrentPolicy({...policy,status},'2026-09-30'),false);
 assert.equal(isCurrentPolicy({...policy,status:'Pending Cancellation'},'2026-09-30'),true);
});
test('change context filters imported and native expired/future/cancelled terms using actual native status',async()=>{
 const originalFetch=globalThis.fetch,original={...process.env},today=businessDate();
 const current={effectiveDate:today,expiryDate:'2099-01-01',status:'Active'};
 process.env.CLIENTCORE_KANBAN_API_BASE_URL='http://127.0.0.1:3199/api/';process.env.CLIENTCORE_KANBAN_API_KEY='synthetic-key';
 const queried:string[]=[];
 globalThis.fetch=async url=>{const path=new URL(String(url)).pathname;queried.push(path);
  if(path.endsWith('/workflow-targets'))return Response.json({items:[{id:'native',effective_date:today,expiry_date:'2099-01-01'},{id:'cancelled',effective_date:today,expiry_date:'2099-01-01'},{id:'expired',effective_date:'2020-01-01',expiry_date:today},{id:'future',effective_date:'2090-01-01',expiry_date:'2099-01-01'}]});
  if(path.endsWith('/policies'))return Response.json({sourcePolicies:[{...current,sourceId:'source'},{...current,sourceId:'expired-source',expiryDate:today},{...current,sourceId:'future-source',effectiveDate:'2090-01-01'},{...current,sourceId:'linked',workflowTermId:'native'}]});
  if(path.endsWith('/assets'))return Response.json({items:[]});
  if(path.includes('/policy-terms/'))return Response.json({status:path.endsWith('/cancelled')?'Canceled':'Active'});
  return Response.json({id:'synthetic'});
 };
 try{const context=await changeContext('synthetic');assert.deepEqual(context.policies.map((p:any)=>p.key),['term:native','source:source']);assert.ok(!queried.some(path=>path.endsWith('/expired')||path.endsWith('/future')));}
 finally{globalThis.fetch=originalFetch;for(const key of ['CLIENTCORE_KANBAN_API_BASE_URL','CLIENTCORE_KANBAN_API_KEY']){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});
