import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTeam} from '../src/lib/seed.ts';
import {applyAction} from '../src/lib/domain.ts';
import {collectSourceText} from '../src/lib/source-extraction.ts';
import {validateFormExtraction,extractCreation} from '../src/lib/change-extraction.ts';
import {quoteFields} from '../src/lib/creation-form.ts';
import type {DraftTask,Entry} from '../src/lib/model.ts';

function fixture(){
 const team=emptyTeam('Test');team.members.push({id:'alice',name:'Alice',login:'alice',password:'',active:true,role:'admin'});
 const actor={teamId:team.id,memberId:'alice'};
 team.sources.push({id:'chat',sender:'alice',messageId:'m',receivedAt:new Date().toISOString(),state:'ready',taskIds:[],entries:[{kind:'text',text:'客户姓名 Alice Test，电话 4165550100，车辆 Honda Civic'}]});
 const task:DraftTask={title:'新客车险报价',type:'lead',customer:'Alice Test',customerRef:null,description:'',checklist:[],dueDate:null,ownerId:null};
 const form={kind:'new_customer_quote',quoteType:'auto',values:{full_name:'Alice Test',phone:'4165550100'},evidence:{full_name:'客户姓名 Alice Test'},extraction:'test-model',reviewed:true};
 return {team,actor,task,form};
}
test('new-customer quote creates an unbound task, retains reviewed form and attaches originals',()=>{
 const {team,actor,task,form}=fixture();applyAction(team,actor,{op:'createTask',task,sourceIds:['chat'],creationForm:form});
 assert.equal(team.tasks[0].customerRef,null);assert.equal(team.tasks[0].creationForm?.values.full_name,'Alice Test');assert.ok(team.tasks[0].creationForm?.reviewedAt);assert.deepEqual(team.sources[0].taskIds,[team.tasks[0].id]);
});
test('quote validation rejects a forged BMS binding, missing contact, missing review and foreign evidence',()=>{
 for(const mutation of ['binding','contact','review','evidence','unknown','date']){
  const {team,actor,task,form}=fixture();const f:any=structuredClone(form);
  if(mutation==='binding')task.customerRef={clientCoreId:'x',clientCode:'C1',displayName:'Alice Test'};
  if(mutation==='contact')delete f.values.phone;
  if(mutation==='review')f.reviewed=false;
  if(mutation==='evidence')f.evidence.full_name='another customer';
  if(mutation==='unknown')f.values.clientId='invented';
  if(mutation==='date')f.values.dob='2026-02-30';
  assert.throws(()=>applyAction(team,actor,{op:'createTask',task,sourceIds:['chat'],creationForm:f}));assert.equal(team.tasks.length,0);assert.equal(team.sources[0].taskIds.length,0);
 }
});
test('existing-customer creation requires confirmation and matching structured task fields',()=>{
 const {team,actor,task}=fixture();task.type='other';const form={kind:'existing_customer_task',values:{title:task.title,description:''},evidence:{},extraction:'manual',reviewed:true};
 assert.throws(()=>applyAction(team,actor,{op:'createTask',task,creationForm:form}),/确认/);
 task.customerRef={clientCoreId:'client',clientCode:'C1',displayName:task.customer};
 assert.throws(()=>applyAction(team,actor,{op:'createTask',task,creationForm:{...form,values:{title:'different',description:''}}}),/不一致/);
 applyAction(team,actor,{op:'createTask',task,creationForm:form});assert.equal(team.tasks[0].creationForm?.kind,'existing_customer_task');
});
test('mixed message extraction reads both text and all uncached attachments, with per-media provenance',async()=>{
 const {team,actor}=fixture();team.sources[0].entries.push({kind:'image',mediaId:'image'},{kind:'file',mediaId:'pdf'},{kind:'text',text:'cached PDF body',extractedFrom:'pdf'});
 team.media.push({id:'image',sourceId:'chat',key:'private-image'},{id:'pdf',sourceId:'chat',key:'private-pdf'});
 const reads:string[]=[],saved:Entry[]=[];
 const result=await collectSourceText(team,actor,['chat'],{read:async key=>{reads.push(key);return Buffer.from('image');},extract:async()=>({text:'VIN 12345',mime:'image/png',warning:'核对 OCR'}),persist:async(id,entries)=>{assert.equal(id,'chat');saved.push(...entries);}});
 assert.deepEqual(reads,['private-image']);assert.match(result.text,/Alice Test/);assert.match(result.text,/cached PDF body/);assert.match(result.text,/VIN 12345/);assert.deepEqual(saved,[{kind:'text',text:'VIN 12345',extractedFrom:'image'}]);assert.equal(result.warnings.length,1);
});
test('source extraction rejects other members, duplicate sources, unavailable media and excessive combined text before AI',async()=>{
 const {team,actor}=fixture();const deps={read:async()=>Buffer.from(''),extract:async()=>({text:'',mime:'image/png',warning:''}),persist:async()=>{}};
 team.sources[0].sender='bob';await assert.rejects(collectSourceText(team,actor,['chat'],deps),/不属于你/);team.sources[0].sender='alice';
 await assert.rejects(collectSourceText(team,actor,['chat','chat'],deps));
 team.sources[0].entries.push({kind:'image',mediaId:'missing'});await assert.rejects(collectSourceText(team,actor,['chat'],deps),/尚不可用/);
 team.sources[0].entries=[{kind:'text',text:'x'.repeat(60001)}];await assert.rejects(collectSourceText(team,actor,['chat'],deps),/超过/);
});
test('quote extraction accepts explicit identity with citations but never a generated customer ID',()=>{
 const text='姓名 Alice Test 电话 4165550100';const result=validateFormExtraction(quoteFields,text,{fields:[{key:'full_name',value:'Alice Test',evidence:'姓名 Alice Test'}],warnings:[]});assert.equal(result.values.full_name,'Alice Test');
 assert.throws(()=>validateFormExtraction(quoteFields,text,{fields:[{key:'clientCoreId',value:'invented',evidence:'姓名 Alice Test'}],warnings:[]}));
});
test('DeepSeek quote request contains selected source text only and permits new identity without BMS lookup',async()=>{
 const original=globalThis.fetch,old=Object.fromEntries(['AI_BASE_URL','AI_MODEL','AI_API_KEY'].map(k=>[k,process.env[k]]));
 process.env.AI_BASE_URL='https://example.test';process.env.AI_MODEL='test-model';process.env.AI_API_KEY='test-key';const calls:string[]=[];let sent:any;
 globalThis.fetch=async(url,init)=>{calls.push(String(url));if(String(url).endsWith('/models'))return Response.json({data:[{id:'test-model'}]});sent=JSON.parse(String(init?.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({fields:[{key:'full_name',value:'Alice',evidence:'姓名 Alice'}],warnings:[]})}}]});};
 try{const result=await extractCreation('new_customer_quote','姓名 Alice');assert.equal(result.values.full_name,'Alice');assert.deepEqual(calls,['https://example.test/models','https://example.test/chat/completions']);assert.equal(sent.messages[1].content,'姓名 Alice');assert.match(sent.messages[0].content,/不生成客户 ID/);assert.equal(sent.tools,undefined);}finally{globalThis.fetch=original;for(const [key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
