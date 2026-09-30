import {randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {authenticate,Problem,requireMember} from '../../../../lib/security.ts';
import {failure,originCheck,jsonBody} from '../../../../lib/http.ts';
import {readTeam,mutateTeam} from '../../../../lib/store.ts';
import {chatFileText} from '../../../../lib/chat-text.ts';
import {putMedia,deleteMedia} from '../../../../lib/media.ts';
export const runtime='nodejs';
export async function POST(request:Request){let key:string|undefined;try{originCheck(request);const actor=await authenticate((await cookies()).get('kanban_session')?.value);const team=(await readTeam(actor.teamId))!;if(team.demo)throw new Problem(403,'演示空间不能上传客户资料');
 let text='',mime='text/plain',buffer:Buffer|undefined,name='粘贴聊天记录',warning='';
 if(request.headers.get('content-type')?.includes('application/json')){const body=await jsonBody(request,100000);if(typeof body.text!=='string'||!body.text.trim()||body.text.length>60000)throw new Problem(400,'请提供不超过 60000 字的聊天原文');text=body.text;}
 else{try{name=decodeURIComponent(request.headers.get('x-file-name')??'聊天附件');}catch{throw new Problem(400,'文件名无效');}const reader=request.body?.getReader();if(!reader)throw new Problem(400,'请选择文件');let size=0;const chunks=[];try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024)throw new Problem(413,'聊天附件限 12 MB');chunks.push(value);}}finally{await reader.cancel();}buffer=Buffer.concat(chunks);({text,mime,warning}=await chatFileText(buffer,name));}
 const sourceId=randomUUID(),mediaId=randomUUID();if(buffer&&mime!=='text/plain'){key=actor.teamId+'/'+mediaId;await putMedia(key,buffer,mime);}
 await mutateTeam(actor.teamId,t=>{requireMember(t,actor);const entries:any[]=[];if(text.trim())entries.push({kind:'text',text,...(key?{extractedFrom:mediaId}:{})});if(key){entries.push({kind:mime==='application/pdf'?'file':'image',mediaId});t.media.push({id:mediaId,sourceId,key,mime,bytes:buffer!.length});}t.sources.push({id:sourceId,origin:'upload',uploadName:name.slice(0,180),sender:actor.memberId,messageId:'change-chat:'+sourceId,receivedAt:new Date().toISOString(),entries,state:'ready',taskIds:[]});});
 const source=(await readTeam(actor.teamId))!.sources.find(s=>s.id===sourceId);
 return NextResponse.json({sourceId,text,warning,source},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){if(key)await deleteMedia(key).catch(()=>{});return failure(e);}}
