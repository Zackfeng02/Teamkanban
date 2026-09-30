import { z } from 'zod';
export const offerSchema=z.object({id:z.string().max(160),jobId:z.string().max(160),insurer:z.string().trim().min(1).max(200),premiumCents:z.number().int().nonnegative().nullable(),effectiveDate:z.string().nullable(),expiryDate:z.string().nullable(),quoteDate:z.string().nullable().optional(),basis:z.enum(['annual','term','unknown']),amountKind:z.enum(['pre_tax','total','unknown']),pages:z.array(z.number().int().positive()).min(1).max(100)}).strict();
export type RenewalOffer=z.infer<typeof offerSchema>;
export type RenewalTaskData={kind:'source'|'term';targetId:string;baselineRevision:number;baselineHash?:string;quotes:{id:string;key:string}[];offers:RenewalOffer[];selectedId:string|null;pending?:{id:string;payload:any;operation:string;data:any};cleanupPending?:boolean;billingFollowupId?:string;comparisonNote?:string};
export function quoteReady(offer:RenewalOffer|undefined) {
 const valid=(s:string|null)=>!!s&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 return !!offer&&offer.premiumCents!==null&&offer.amountKind==='pre_tax'&&offer.basis!=='unknown'&&valid(offer.effectiveDate)&&valid(offer.expiryDate)&&offer.effectiveDate!<offer.expiryDate!;
}
export function paymentAmounts(premiumCents:number|null,line:string,basis:string) {
 if(premiumCents===null||basis!=='annual'||!Number.isSafeInteger(premiumCents)||premiumCents<0||!['auto','home'].includes(line))return null;
 const rate=(n:number)=>Number((BigInt(premiumCents)*BigInt(n)+5000n)/10000n);
 const tax=line==='home'?rate(800):0,fee=rate(line==='home'?300:130),annual=premiumCents+tax,monthlyTotal=annual+fee,regular=Math.floor(monthlyTotal/12);
 if(!Number.isSafeInteger(annual)||!Number.isSafeInteger(monthlyTotal))return null;
 return {annual,monthly:regular,lastMonth:monthlyTotal-regular*11,tax,fee,monthlyTotal};
}
