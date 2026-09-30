import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cookies } from 'next/headers';
import { authenticate } from '../../lib/security.ts';
import { failure } from '../../lib/http.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{await authenticate((await cookies()).get('kanban_session')?.value);return new Response(await readFile(join(process.cwd(),'src/assets/cantrust-quote-form.html'),'utf8'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff'}});}catch(error){return failure(error);}}
