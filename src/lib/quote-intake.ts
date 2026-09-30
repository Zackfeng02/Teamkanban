import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Actor, Team } from './model.ts';
import { makeTask } from './domain.ts';
import { Problem, requireMember } from './security.ts';

const payloadSchema=z.object({quoteType:z.enum(['auto','home','both']),locale:z.enum(['zh','en']).default('zh'),submittedAt:z.iso.datetime({offset:true}),fields:z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()]))}).strict();
export const submissionSchema=z.object({id:z.string().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/),receivedAt:z.iso.datetime({offset:true}),payload:payloadSchema}).strict();
export type QuoteSubmission=z.infer<typeof submissionSchema>;
export const quoteLabels={auto:'车险',home:'房屋险',both:'车房组合'};
function fingerprint(record:QuoteSubmission) { return createHash('sha256').update(JSON.stringify({quoteType:record.payload.quoteType,locale:record.payload.locale,submittedAt:record.payload.submittedAt,fields:Object.fromEntries(Object.entries(record.payload.fields).sort(([a],[b])=>a.localeCompare(b)))})).digest('hex'); }
function validDate(value:unknown):string|null { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const d=new Date(value);return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value?value:null; }
export function intakeQuote(team:Team,actor:Actor,input:unknown) {
 requireMember(team,actor);
 if(team.demo)throw new Problem(403,'演示空间不能接收客户表单');
 const record=submissionSchema.parse(input), f=record.payload.fields;
 if(Buffer.byteLength(JSON.stringify(record))>24000||Object.keys(f).length>80)throw new Problem(413,'报价资料过大');
 const name=String(f.full_name??'').trim();
 if(!name||name.length>160||!String(f.email??f.phone??'').trim()&&!String(f.phone??'').trim())throw new Problem(400,'请提供客户姓名及至少一种联系方式');
 const messageId='cantrust:'+record.id, old=team.sources.find(s=>s.messageId===messageId);
 if(old){if(!old.quoteSubmission||fingerprint(old.quoteSubmission)!==fingerprint(record))throw new Problem(409,'同一提交编号的内容不一致，请核对原始提交');return {ok:true,taskId:old.taskIds[0],duplicate:true};}
 const kind=record.payload.quoteType;
 const dates=[kind!=='home'?validDate(f.auto_eff_date):null,kind!=='auto'?validDate(f.home_eff_date):null].filter((d):d is string=>!!d).sort();
 const sourceId=randomUUID();
 const task=makeTask({title:`${quoteLabels[kind]}报价 · ${name}`.slice(0,160),type:'lead',insuranceLine:kind==='both'?'combined':kind,priority:'normal',customer:name,customerRef:null,description:`来自 CanTrust 报价表单。客户填写内容尚待核实；请先确认身份、报价需求及生效日期。${dates.length?' 期望生效：'+dates.join(' / ')+'。':''}`,checklist:[],dueDate:dates[0]??null,ownerId:null},[sourceId],actor);
 task.activity[0].action='接收 CanTrust 表单并创建报价任务';
 team.sources.push({id:sourceId,origin:'quote_form',sender:actor.memberId,messageId,receivedAt:record.receivedAt,entries:[{kind:'text',text:`CanTrust ${quoteLabels[kind]}报价申请 · ${name}`}],quoteSubmission:record,state:'ready',taskIds:[task.id]});
 team.tasks.push(task);
 return {ok:true,taskId:task.id,duplicate:false};
}
export function verifyIntakeSignature(raw:string,timestamp:string|null,signature:string|null,secret:string|undefined,now=Date.now()) {
 if(!secret||secret.length<32||!timestamp||!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300000||!signature||!/^[a-f0-9]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',secret).update(timestamp+'\nPOST\n/api/integrations/cantrust\n'+raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
