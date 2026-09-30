import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authenticate,Problem} from '../../../lib/security.ts';
import {readTeam,mutateTeam} from '../../../lib/store.ts';
import {failure,jsonBody,originCheck} from '../../../lib/http.ts';
import {changeContext,loadBaseline,newChangeDraft,saveChangeSchema,saveChangeTask,selectionSchema} from '../../../lib/change-intake.ts';
import {changeTypes} from '../../../lib/change-form.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function context(){const actor=await authenticate((await cookies()).get('kanban_session')?.value),team=(await readTeam(actor.teamId))!;if(team.demo)throw new Problem(403,'演示空间不能读取客户资料');return {actor,team};}
export async function GET(request:Request){try{await context();const id=z.string().min(1).max(160).parse(new URL(request.url).searchParams.get('clientId'));return NextResponse.json(await changeContext(id),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{originCheck(request);const {actor,team}=await context();const body=await jsonBody(request);
 if(body.op==='snapshot'){const v=z.object({op:z.literal('snapshot'),type:z.enum(changeTypes),selection:selectionSchema,confirmedClient:z.literal(true)}).strict().parse(body);const baseline=await loadBaseline(v.selection);return NextResponse.json(await mutateTeam(actor.teamId,t=>newChangeDraft(t,actor,v.type,baseline)),{headers:{'Cache-Control':'no-store'}});}
 const v=z.object({op:z.literal('save'),data:saveChangeSchema}).strict().parse(body);const draft=team.changeDrafts?.find(d=>d.id===v.data.draftId&&d.ownerId===actor.memberId);if(!draft)throw new Problem(404,'草稿不存在');const current=draft.taskId?draft.baseline:await loadBaseline(draft.baseline.selection);return NextResponse.json(await mutateTeam(actor.teamId,t=>saveChangeTask(t,actor,v.data,current)),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}}
