import {cookies} from 'next/headers';
import {authenticate} from '../../../lib/security.ts';
import {failure,jsonBody,originCheck} from '../../../lib/http.ts';
import {csrQueue,csrComparison,csrPdf,saveCsrFeedback} from '../../../lib/renewal-csr.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  const actor=await authenticate((await cookies()).get('kanban_session')?.value),url=new URL(request.url),taskId=url.searchParams.get('taskId');
  if(!taskId)return Response.json(await csrQueue(actor),{headers:{'Cache-Control':'no-store'}});
  const fileId=url.searchParams.get('fileId'),jobId=url.searchParams.get('jobId');
  if(fileId||jobId)return new Response(new Uint8Array(await csrPdf(actor,taskId,jobId?'quote':'file',(jobId??fileId)!)),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'inline; filename="Snapshot.pdf"'}});
  return Response.json(await csrComparison(actor,taskId),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
export async function POST(request:Request) {
 try {originCheck(request);const actor=await authenticate((await cookies()).get('kanban_session')?.value);return Response.json(await saveCsrFeedback(actor,await jsonBody(request,12000)));}catch(error){return failure(error);}
}
