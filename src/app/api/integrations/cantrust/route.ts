import { NextResponse } from 'next/server';
import { jsonBody,failure } from '../../../../lib/http.ts';
import { Problem } from '../../../../lib/security.ts';
import { mutateTeam } from '../../../../lib/store.ts';
import { intakeQuote,verifyIntakeSignature } from '../../../../lib/quote-intake.ts';
export const runtime='nodejs';
export async function POST(request:Request) { try {
 // Browser form keys are public and cannot authorize this server-to-server route.
 const body=await jsonBody(request,24000),raw=JSON.stringify(body);
 if(!verifyIntakeSignature(raw,request.headers.get('x-cantrust-timestamp'),request.headers.get('x-cantrust-signature'),process.env.CANTRUST_INTAKE_SECRET))throw new Problem(401,'接收签名无效');
 const teamId=process.env.CANTRUST_INTAKE_TEAM_ID,memberId=process.env.CANTRUST_INTAKE_MEMBER_ID;
 if(!teamId||!memberId)throw new Problem(503,'报价接收尚未配置');
 const result=await mutateTeam(teamId,team=>intakeQuote(team,{teamId,memberId},body));
 return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);} }
