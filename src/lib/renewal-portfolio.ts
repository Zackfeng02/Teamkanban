import {createHash} from 'node:crypto';
import {clientCoreRequest} from './clientcore.ts';
import {Problem} from './security.ts';
import {businessDate} from './task-workflow.ts';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const premium=(value:unknown)=>value!=null&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
export const renewalQueue=()=>clientCoreRequest('renewal-reviews');
export async function reviewedRenewalContext(clientId:string,kind:string,id:string) {
 const [client,detail]=await Promise.all([clientCoreRequest('clients/'+encodeURIComponent(clientId)),clientCoreRequest(`renewal-reviews/${kind}/${encodeURIComponent(id)}`)]);
 if(detail.clientId!==clientId)throw new Problem(404,'Renewal policy does not belong to this Client.');
 const snapshot=detail.currentSnapshot;
 return {client,target:kind==='source'?snapshot:null,term:kind==='term'?snapshot:null,baselineHash:hash(snapshot),review:detail.review};
}
export async function renewalPortfolio(clientId:string,selected?:{kind:string;targetId:string}) {
 const date=businessDate(),base='clients/'+encodeURIComponent(clientId);
 const [client,portfolio]=await Promise.all([clientCoreRequest(base),clientCoreRequest(base+'/policies?asOf='+date)]);
 const targets:any[]=[];
 for(const policy of portfolio.policies??[])for(const term of policy.terms??[]){
  if(term.effectiveDate<=date&&date<term.expiryDate||selected?.kind==='term'&&selected.targetId===term.id)targets.push({kind:'term',id:term.id,policy,line:policy.line});
 }
 for(const source of portfolio.sourcePolicies??[]){
  if(!source.workflowTermId&&(source.effectiveDate<=date&&date<source.expiryDate&&['Active','PendingCancellation'].includes(source.status)||selected?.kind==='source'&&selected.targetId===source.sourceId))targets.push({kind:'source',id:source.sourceId,line:source.policyType});
 }
 // An old task target may have been adopted since it was opened. Keep its identity explicit.
 if(selected&&!targets.some(t=>t.kind===selected.kind&&t.id===selected.targetId))targets.push({kind:selected.kind,id:selected.targetId});
 const policies=(await Promise.all(targets.map(async target=>{
  const detail=await clientCoreRequest(`renewal-reviews/${target.kind}/${encodeURIComponent(target.id)}`);
  if(detail.clientId!==clientId)throw new Problem(404,'Renewal policy does not belong to this Client.');
  const s=detail.currentSnapshot,review=detail.review,data=review?.data??{},line=s.line??s.policyType??target.line??'Unconfirmed',effectiveDate=s.effectiveDate??s.effective_date,expiryDate=s.expiryDate??s.expiry_date;
  const isCurrent=effectiveDate<=date&&date<expiryDate&&['Active','PendingCancellation'].includes(s.status)&&!(target.kind==='source'&&s.workflowTermId);
  if(!isCurrent&&!(target.kind===selected?.kind&&target.id===selected?.targetId))return null;
  const annual=s.annualPremiumCents!=null,amount=target.kind==='source'?(s.annualPremiumCents??s.termPremiumCents):s.currentPremium?.premiumCents??s.premium_cents;
  return {targetKind:target.kind,targetId:target.id,sourceTargetId:s.sourceId??null,policyNumber:s.policyNumber??s.policy_number,insurer:s.insurer,line,effectiveDate,expiryDate,isCurrent,
   currentPremiumCents:premium(amount),premiumBasis:annual?'annual':s.currentPremium?.basis??'term',
   subjects:s.currentSubjects??s.subjects??[],broker:{revision:review?.revision??0,reviewedAt:review?.created_at??null,recommendation:data.recommendation??'undecided',reason:data.reason??'',renewal:data.renewal??null,alternative:data.alternative??null,comparison:data.comparison??[],snapshots:{current:null,renewal:null,alternative:null}}};
 }))).filter(Boolean) as any[];
 // Group by recorded policy subjects; no guessed asset or ownership associations.
 const groups=policies.map(p=>({id:p.targetKind+':'+p.targetId,kind:'policy',name:p.subjects.map((s:any)=>s.name).filter(Boolean).join(' · ')||p.policyNumber||'Policy',policyKeys:[p.targetKind+':'+p.targetId]}));
 return {clientId,asOf:date,client:{code:client.code,name:client.display_name,contacts:client.contacts??[],people:client.people??[],addresses:client.addresses??[],notes:client.notes??''},policies,groups,comparisonHash:hash({client,policies})};
}
