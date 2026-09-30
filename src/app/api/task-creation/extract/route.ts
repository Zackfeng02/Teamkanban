import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authenticate,Problem} from '../../../../lib/security.ts';
import {readTeam} from '../../../../lib/store.ts';
import {failure,jsonBody,originCheck} from '../../../../lib/http.ts';
import {extractCreation} from '../../../../lib/change-extraction.ts';
import {resolveClientCoreCustomer} from '../../../../lib/clientcore.ts';
import {collectSourceText,extractionSourceIds} from '../../../../lib/source-extraction.ts';
export const runtime='nodejs';
export async function POST(request:Request){try{
 originCheck(request);const actor=await authenticate((await cookies()).get('kanban_session')?.value),team=(await readTeam(actor.teamId))!;
 if(team.demo)throw new Problem(403,'演示空间不能识别客户资料');
 const v=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('new_customer_quote'),sourceIds:extractionSourceIds}).strict(),
  z.object({kind:z.literal('existing_customer_task'),clientId:z.string().min(1),sourceIds:extractionSourceIds}).strict()
 ]).parse(await jsonBody(request));
 if(v.kind==='existing_customer_task')await resolveClientCoreCustomer(v.clientId);
 const content=await collectSourceText(team,actor,v.sourceIds),result=await extractCreation(v.kind,content.text);
 return NextResponse.json({...result,warnings:[...content.warnings,...result.warnings]},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
