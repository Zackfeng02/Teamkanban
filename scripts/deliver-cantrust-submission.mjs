// Server-side adapter only. Never ship the intake secret to the browser.
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
const url=new URL(process.env.CANTRUST_KANBAN_URL||'http://127.0.0.1:3018/api/integrations/cantrust');
if(url.pathname!=='/api/integrations/cantrust'||(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('HTTPS or loopback endpoint required');
const secret=process.env.CANTRUST_INTAKE_SECRET;
if(!secret||secret.length<32||!process.argv[2])throw new Error('Provide server secret and a relay record JSON file');
const record=JSON.parse(await readFile(process.argv[2],'utf8')),body=JSON.stringify(record),timestamp=String(Date.now());
const signature=createHmac('sha256',secret).update(timestamp+'\nPOST\n/api/integrations/cantrust\n'+body).digest('hex');
const response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-cantrust-timestamp':timestamp,'x-cantrust-signature':signature},body,signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error(`Intake returned ${response.status}; retain original record for retry`);
const result=await response.json();if(result.ok!==true||!result.taskId)throw new Error('No durable receipt; retain original record');
console.log(JSON.stringify({ok:true,taskId:result.taskId,duplicate:result.duplicate}));
