import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {authenticate,Problem} from '../../../lib/security.ts';
import {failure,jsonBody,originCheck} from '../../../lib/http.ts';
import {clientCoreRequest,clientCorePdf} from '../../../lib/clientcore.ts';
import {renewalData,renewalTask,startRenewal,renewalOperation} from '../../../lib/renewal-service.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  const actor=await authenticate((await cookies()).get('kanban_session')?.value),url=new URL(request.url),taskId=url.searchParams.get('taskId');
  if(!taskId){const {readTeam}=await import('../../../lib/store.ts');const team=await readTeam(actor.teamId);if(team?.demo)throw new Problem(403,'演示空间不能读取续保清单');return NextResponse.json(await clientCoreRequest('renewal-queue'),{headers:{'Cache-Control':'no-store'}});}
  const {task,clientId}=await renewalTask(actor,taskId);
  const fileId=url.searchParams.get('fileId'),jobId=url.searchParams.get('jobId');
  if(fileId||jobId) {
   if(!task.renewal)throw new Problem(400,'请先关联原保单年度');
   if(jobId&&!task.renewal.quotes.some(q=>q.id===jobId))throw new Problem(404,'报价不属于此任务');
   if(fileId){const data=await renewalData(actor,taskId);if(![...(data.context?.files??[]),...(data.target?.files??[])].some((f:any)=>f.id===fileId))throw new Problem(404,'文件不属于本次年度');}
   const bytes=await clientCorePdf(jobId?`renewal-quotes/${encodeURIComponent(jobId)}/original`:`clients/${encodeURIComponent(clientId)}/files/${encodeURIComponent(fileId!)}`);
   return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'inline; filename="Original.pdf"'}});
  }
  return NextResponse.json(await renewalData(actor,taskId),{headers:{'Cache-Control':'no-store'}});
 } catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {originCheck(request);const actor=await authenticate((await cookies()).get('kanban_session')?.value),input=await jsonBody(request,36*1024*1024);return NextResponse.json(input.op==='start'?await startRenewal(actor,input.data):await renewalOperation(actor,input));}catch(e){return failure(e);}
}
