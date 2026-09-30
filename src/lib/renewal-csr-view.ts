import {paymentAmounts} from './renewal-comparison.ts';
export const policyKey=(p:any)=>p.targetKind+':'+p.targetId;
export const decisionLabel={undecided:'Decision pending',stay:'Renew with current insurer',switch:'Switch insurer',cancel:'Cancel policy'};
export function clientGroups(items:any[]) {
 const groups=new Map<string,{clientId:string;code:string;name:string;policies:any[]}>();
 for(const p of items){if(!groups.has(p.clientId))groups.set(p.clientId,{clientId:p.clientId,code:p.clientCode,name:p.clientName,policies:[]});groups.get(p.clientId)!.policies.push(p);}
 return [...groups.values()];
}
function fullYear(start:string,end:string) {
 if(!start||!end)return false;
 const date=new Date(start);if(!Number.isFinite(+date))return false;
 const next=new Date(Date.UTC(date.getUTCFullYear()+1,date.getUTCMonth(),1));next.setUTCDate(Math.min(date.getUTCDate(),new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));
 return next.toISOString().slice(0,10)===end;
}
export function shownPremium(p:any,slot:'current'|'renewal'|'alternative',frequency:'annual'|'monthly') {
 const quote=slot==='current'?{premiumCents:p.currentPremiumCents,effectiveDate:p.effectiveDate,expiryDate:p.expiryDate,basis:p.premiumBasis}:p.broker[slot];
 const cents=quote?.premiumCents;
 if(!Number.isSafeInteger(cents)||cents<0)return null;
 if(frequency==='annual')return cents;
 const line=/home|habitational|property|tenant|condo/i.test(p.line??'')?'home':/auto/i.test(p.line??'')?'auto':'other';
 const basis=quote.basis==='annual'||(!quote.basis||quote.basis==='term')&&fullYear(quote.effectiveDate,quote.expiryDate)?'annual':'unknown';
 return paymentAmounts(cents,line,basis)?.monthly??null;
}
export function portfolioTotal(policies:any[],slot:'current'|'renewal'|'alternative',frequency:'annual'|'monthly') {
 const current=policies.filter(p=>p.isCurrent!==false),prices=current.map(p=>shownPremium(p,slot,frequency)),known=prices.filter((n):n is number=>n!==null);
 return {cents:known.reduce((a,b)=>a+b,0),known:known.length,missing:current.length-known.length};
}
