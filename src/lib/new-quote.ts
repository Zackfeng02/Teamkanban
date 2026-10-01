import {isNewQuote} from './new-quote-view.ts';
export {isNewQuote} from './new-quote-view.ts';
import {randomUUID} from 'node:crypto';
import type {Actor,Task,Team} from './model.ts';
import {Problem,requireMember} from './security.ts';
import {visibleSource} from './domain.ts';
import {blankProfile,type SavedProfile} from './insurance-profiles.ts';
import {prepareCloudProfile} from './insurance-cloud-validation.ts';
import {withRiskQuotes,emptyRiskRows,REVIEW_VERSION} from './insurance-risks.ts';

export function quoteFacts(team:Team,actor:Actor,task:Task) {
 const submissions=team.sources.filter(s=>task.sourceIds.includes(s.id)&&visibleSource(team,actor,s)&&s.quoteSubmission).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
 const submitted=submissions[0]?.quoteSubmission?.payload;
 // The reviewed intake owns its values, including intentionally cleared blanks.
 const form=task.creationForm?.kind==='new_customer_quote'?task.creationForm:null;
 return {values:form?.values??Object.fromEntries(Object.entries(submitted?.fields??{}).map(([k,v])=>[k,v==null?'':String(v)])),quoteType:form?.quoteType??submitted?.quoteType??(task.insuranceLine==='home'?'home':task.insuranceLine==='combined'?'both':'auto'),reviewedAt:form?.reviewedAt??null};
}
export function initialQuoteProfile(task:Task,facts:ReturnType<typeof quoteFacts>):SavedProfile {
 const review=blankProfile(),f=facts.values,n=review.carriers.length;
 review.name=f.full_name||task.customer;review.phone=f.phone||'';
 // Two different requested dates remain distinct in intake, without inventing one shared date.
 review.effective=facts.quoteType==='both'?(f.auto_eff_date===f.home_eff_date?f.auto_eff_date||'':''):facts.quoteType==='home'?f.home_eff_date||'':f.auto_eff_date||'';
 review.vehicles=facts.quoteType==='home'?[]:[{id:'intake-vehicle',name:[f.vehicle_year,f.make,f.model].filter(Boolean).join(' '),premiums:Array(n).fill(''),included:Array(n).fill(false),rows:emptyRiskRows(review.autoRows,n)}];
 review.properties=facts.quoteType==='auto'?[]:[{id:'intake-property',name:f.prop_address||'',type:'',premiums:Array(n).fill(''),included:Array(n).fill(false),rows:emptyRiskRows(review.homeRows,n)}];
 return {id:'quote-'+task.id,version:0,calculationVersion:REVIEW_VERSION,status:'draft',savedAt:task.updatedAt,review:withRiskQuotes(review)};
}
export function quoteTask(team:Team,actor:Actor,id:string) {
 requireMember(team,actor);const task=team.tasks.find(t=>t.id===id);
 if(!task||!isNewQuote(task))throw new Problem(404,'请选择新客报价任务；已有客户的续保请使用续保任务页面。');
 return task;
}
export function saveQuoteReview(team:Team,actor:Actor,id:string,input:unknown) {
 const task=quoteTask(team,actor,id);
 if(task.archived)throw new Problem(409,'任务已归档，报价仅可查看。');
 let profile:SavedProfile;try{profile=prepareCloudProfile(input);}catch(e){if(e instanceof Error&&e.message==='INCOMPLETE_CONFIRMATION')throw new Problem(400,'请补全报价资料并完成确认');throw e;}
 if(profile.id!=='quote-'+task.id)throw new Problem(400,'报价记录不属于当前任务');
 if(profile.version!==(task.quoteReview?.version??0))throw new Problem(409,'报价已由其他成员更新。当前修改保留，请导出并刷新核对。');
 profile.version=(profile.version??0)+1;task.quoteReview=profile;
 task.version++;task.updatedAt=profile.savedAt;
 task.activity.push({id:randomUUID(),memberId:actor.memberId,at:profile.savedAt,action:profile.status==='confirmed'?'确认新客报价方案':'保存新客报价草稿',before:null,after:{quoteVersion:profile.version,status:profile.status}});
 return profile;
}
