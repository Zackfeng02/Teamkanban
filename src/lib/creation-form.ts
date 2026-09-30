import {z} from 'zod';
import type {Field} from './change-form.ts';
import type {Source, DraftTask} from './model.ts';
import {Problem} from './security.ts';

import {quoteFields,generalFields} from './creation-fields.ts';
export {quoteFields,generalFields} from './creation-fields.ts';
export const creationFormSchema=z.object({kind:z.enum(['new_customer_quote','existing_customer_task']),quoteType:z.enum(['auto','home','both']).optional(),values:z.record(z.string(),z.string().max(4000)),evidence:z.record(z.string(),z.string().min(1).max(2000)),extraction:z.string().max(160),reviewed:z.literal(true)}).strict();
export type CreationForm=z.infer<typeof creationFormSchema>&{reviewedAt:string};
export function validateFieldValue(field:Field,value:string){
 if(field.options&&!Object.hasOwn(field.options,value))throw new Problem(422,'表单选项无效');
 if(field.kind==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new Problem(422,'表单日期无效');
}
export function validateCreationForm(raw:unknown,task:DraftTask,sources:Source[]):CreationForm{
 const form=creationFormSchema.parse(raw),fields=form.kind==='new_customer_quote'?quoteFields:generalFields;
 if(form.kind==='new_customer_quote'){
  if(task.type!=='lead'||task.customerRef)throw new Problem(400,'新客报价不关联已有 BMS 客户');
  if(!form.quoteType||!form.values.full_name?.trim()||form.values.full_name.length>160||!(form.values.phone?.trim()||form.values.email?.trim()))throw new Problem(400,'新客报价请填写姓名及至少一种联系方式');
  if(task.customer!==form.values.full_name.trim())throw new Problem(400,'任务客户须与报价表单姓名一致');
 }else if(!task.customerRef)throw new Problem(400,'请先确认 ClientCoreBMS 客户');
 for(const [key,value]of Object.entries(form.values)){const field=fields.find(f=>f.key===key);if(!field)throw new Problem(400,'表单字段无效');if(value)validateFieldValue(field,value);}
 const text=sources.flatMap(s=>s.entries.flatMap(e=>e.kind==='text'?[e.text]:[])).join('\n');
 for(const [key,quote]of Object.entries(form.evidence))if(!form.values[key]||!fields.some(f=>f.key===key)||!text.includes(quote))throw new Problem(422,'识别依据与所选资料不一致，请重新核对');
 if(form.kind==='existing_customer_task'&&(form.values.title!==task.title||form.values.description!==task.description||(form.values.dueDate||null)!==task.dueDate))throw new Problem(400,'表单与任务内容不一致');
 return {...form,reviewedAt:new Date().toISOString()};
}
