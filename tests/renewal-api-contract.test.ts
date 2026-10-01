import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renewalPortfolio,reviewedRenewalContext,renewalQueue} from '../src/lib/renewal-portfolio.ts';
test('current BMS renewal APIs load queue, reviews, in-force portfolio and guard Client ownership',async()=>{
 const fetcher=globalThis.fetch,oldBase=process.env.CLIENTCORE_KANBAN_API_BASE_URL,oldKey=process.env.CLIENTCORE_KANBAN_API_KEY;
 process.env.CLIENTCORE_KANBAN_API_BASE_URL='http://127.0.0.1:3199/api/integrations/team-kanban/v1/';process.env.CLIENTCORE_KANBAN_API_KEY='synthetic';
 const calls:string[]=[],source={sourceId:'s',clientId:'c',policyNumber:'TEST-HOME',insurer:'Test Carrier',policyType:'Home',effectiveDate:'2026-01-01',expiryDate:'2099-01-01',status:'Active',revision:1,termPremiumCents:null,subjects:[{kind:'property',name:'1 Fictional Lane'}]},term={id:'t',policy_number:'TEST-AUTO',insurer:'Test Carrier',line:'Auto',effectiveDate:'2026-01-01',expiryDate:'2099-01-01',status:'Active',premium_cents:100000,currentSubjects:[]};let foreign=false;
 globalThis.fetch=async url=>{const path=new URL(String(url)).pathname.split('/v1/')[1];calls.push(path);
  if(path==='renewal-reviews')return Response.json({asOf:'2026-09-30',items:[{clientId:'c',targetKind:'source',targetId:'s'}]});
  if(path==='clients/c')return Response.json({id:'c',code:'SYNTH',display_name:'Synthetic Renewal Customer'});
  if(path==='clients/c/policies')return Response.json({policies:[{line:'Auto',terms:[{...term},{id:'expired',effectiveDate:'2020-01-01',expiryDate:'2021-01-01'},{id:'future',effectiveDate:'2090-01-01',expiryDate:'2091-01-01'}]}],sourcePolicies:[source,{...source,sourceId:'canceled',status:'Canceled'},{...source,sourceId:'adopted',workflowTermId:'t'}]});
  if(path==='renewal-reviews/source/s')return Response.json({clientId:foreign?'foreign':'c',revision:1,currentSnapshot:source,review:{revision:2,data:{renewal:{insurer:'Test',premiumCents:140000},alternative:{insurer:'Other',premiumCents:120000},comparison:[{label:'Liability',current:'1M',renewal:'2M',alternative:'2M'}],recommendation:'switch',reason:'Synthetic reviewed comparison'}}});
  if(path==='renewal-reviews/term/t')return Response.json({clientId:'c',revision:1,currentSnapshot:term,review:null});
  if(path==='renewal-reviews/source/adopted')return Response.json({clientId:'c',revision:1,currentSnapshot:{...source,sourceId:'adopted',workflowTermId:'t'},review:null});
  throw Error('Unsupported legacy route: '+path);
 };
 try{const queue=await renewalQueue();assert.equal(queue.items.length,1);assert.ok(calls.includes('renewal-reviews'));
  const portfolio=await renewalPortfolio('c',{kind:'source',targetId:'s'});assert.equal(portfolio.policies.length,2);assert.equal(portfolio.policies.find(p=>p.targetId==='s').currentPremiumCents,null);assert.equal(portfolio.policies.find(p=>p.targetId==='s').broker.alternative.premiumCents,120000);assert.equal(portfolio.policies.find(p=>p.targetId==='s').broker.comparison.length,1);assert.equal(portfolio.comparisonHash.length,64);assert.deepEqual(portfolio,await renewalPortfolio('c',{kind:'source',targetId:'s'}));
  assert.equal((await reviewedRenewalContext('c','source','s')).target.policyNumber,'TEST-HOME');const adopted=await renewalPortfolio('c',{kind:'source',targetId:'adopted'});assert.equal(adopted.policies.find(p=>p.targetId==='adopted').isCurrent,false);foreign=true;await assert.rejects(renewalPortfolio('c'),/does not belong/);assert.ok(!calls.some(p=>p.includes('renewal-queue')||p.includes('renewal-comparison')));
 }finally{globalThis.fetch=fetcher;if(oldBase===undefined)delete process.env.CLIENTCORE_KANBAN_API_BASE_URL;else process.env.CLIENTCORE_KANBAN_API_BASE_URL=oldBase;if(oldKey===undefined)delete process.env.CLIENTCORE_KANBAN_API_KEY;else process.env.CLIENTCORE_KANBAN_API_KEY=oldKey;}
});
