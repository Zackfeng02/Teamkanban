import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authenticate,Problem } from '../../../lib/security.ts';
import { jsonBody,failure,originCheck } from '../../../lib/http.ts';
import { mutateTeam } from '../../../lib/store.ts';
import { intakeQuote } from '../../../lib/quote-intake.ts';
export const runtime='nodejs';
export async function POST(request:Request){try{
 originCheck(request);const actor=await authenticate((await cookies()).get('kanban_session')?.value);
 const body=await jsonBody(request,24000);
 if(body.honeypot)throw new Problem(400,'提交无效');
 const record={id:body.submissionId,receivedAt:new Date().toISOString(),payload:{quoteType:body.quoteType,locale:body.locale,submittedAt:body.submittedAt,fields:body.fields}};
 return NextResponse.json(await mutateTeam(actor.teamId,team=>intakeQuote(team,actor,record)),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}}
