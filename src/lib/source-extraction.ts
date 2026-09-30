import type {Actor,Entry,Team} from './model.ts';
import {Problem,requireMember} from './security.ts';
import {chatFileText} from './chat-text.ts';
import {getMedia} from './media.ts';
import {mutateTeam} from './store.ts';
import {z} from 'zod';
export const extractionSourceIds=z.array(z.string().min(1)).min(1).max(30).refine(ids=>new Set(ids).size===ids.length);
// Mixed messages include both text and every attachment. OCR caches are per media ID.
export async function collectSourceText(team:Team,actor:Actor,ids:string[],dependencies={read:getMedia,extract:chatFileText,persist:async(sourceId:string,entries:Entry[])=>{await mutateTeam(actor.teamId,t=>{requireMember(t,actor);const source=t.sources.find(s=>s.id===sourceId&&s.sender===actor.memberId&&s.state==='ready');if(!source)throw new Problem(403,'资料不可用');for(const entry of entries)if(entry.kind==='text'&&!source.entries.some(e=>e.kind==='text'&&e.extractedFrom===entry.extractedFrom))source.entries.push(entry);});}}){
 requireMember(team,actor);const sources=extractionSourceIds.parse(ids).map(id=>{const source=team.sources.find(s=>s.id===id&&s.sender===actor.memberId&&s.state==='ready');if(!source)throw new Problem(403,'资料不可用或不属于你');return source;});
 let total=0;const texts:string[]=[],warnings:string[]=[];
 const add=(text:string)=>{total+=text.length;if(total>60000)throw new Problem(413,'所选资料文字超过 60000 字，请减少选择');texts.push(text);};
 for(const source of sources){
  for(const entry of source.entries)if(entry.kind==='text')add(entry.text);
  const extracted:Entry[]=[];
  for(const entry of source.entries){
   if(entry.kind!=='image'&&entry.kind!=='file')continue;
   if(source.entries.some(e=>e.kind==='text'&&e.extractedFrom===entry.mediaId))continue;
   const media=team.media.find(m=>m.id===entry.mediaId&&m.sourceId===source.id);if(!media?.key)throw new Problem(409,'附件尚不可用');
   const result=await dependencies.extract(await dependencies.read(media.key),source.uploadName??'attachment');
   if(result.warning)warnings.push(`${source.uploadName||'转发附件'}：${result.warning}`);
   if(result.text.trim()){add(result.text);extracted.push({kind:'text',text:result.text,extractedFrom:entry.mediaId});}
  }
  if(extracted.length)await dependencies.persist(source.id,extracted);
 }
 return {text:texts.join('\n'),warnings};
}
