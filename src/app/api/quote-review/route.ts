import {cookies} from 'next/headers';
import {authenticate,Problem} from '../../../lib/security.ts';
import {failure,jsonBody,originCheck} from '../../../lib/http.ts';
import {readTeam,mutateTeam} from '../../../lib/store.ts';
import {quoteTask,quoteFacts,initialQuoteProfile,saveQuoteReview} from '../../../lib/new-quote.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  const actor=await authenticate((await cookies()).get('kanban_session')?.value),team=await readTeam(actor.teamId);
  if(!team)throw new Problem(404,'团队不存在');
  const task=quoteTask(team,actor,new URL(request.url).searchParams.get('taskId')??''),facts=quoteFacts(team,actor,task);
  return Response.json({task,facts,profiles:[task.quoteReview??initialQuoteProfile(task,facts)]},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {originCheck(request);const actor=await authenticate((await cookies()).get('kanban_session')?.value),body=await jsonBody(request,2_000_000);
  return Response.json({profile:await mutateTeam(actor.teamId,team=>saveQuoteReview(team,actor,body.taskId,body.profile))});
 }catch(e){return failure(e);}
}
