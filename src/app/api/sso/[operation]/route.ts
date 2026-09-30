import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authorizationInput, issueCode, clientAuth, exchange, inspectAccess, revokeAccess, accounts } from '../../../../lib/sso.ts';
import { failure, jsonBody } from '../../../../lib/http.ts';
import { Problem } from '../../../../lib/security.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
export async function GET(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const { operation } = await context.params;
    if (operation === 'accounts') { clientAuth(request.headers.get('authorization')); return NextResponse.json({ accounts: await accounts() }, { headers }); }
    if (operation !== 'authorize') throw new Problem(404, 'Not found');
    const url = new URL(request.url), input = authorizationInput(url);
    try { return new NextResponse(null, { status: 303, headers: { ...headers, Location: await issueCode((await cookies()).get('kanban_session')?.value, input) } }); }
    catch (error) {
      if (!(error instanceof Problem) || error.status !== 401) throw error;
      // Return only to this fixed endpoint after the existing login succeeds.
      return new NextResponse(null, { status: 303, headers: { ...headers, Location: '/login?sso=' + encodeURIComponent('/api/sso/authorize' + url.search) } });
    }
  } catch (error) { const response = failure(error); Object.entries(headers).forEach(([k,v]) => response.headers.set(k,v)); return response; }
}
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const client = clientAuth(request.headers.get('authorization'));
    const { operation } = await context.params, input = await jsonBody(request, 4096);
    if (operation === 'token') return NextResponse.json(await exchange(input, client), { headers });
    if (typeof input.token !== 'string') throw new Problem(400, 'Missing token');
    if (operation === 'introspect') return NextResponse.json(await inspectAccess(input.token, client), { headers });
    if (operation === 'revoke') { await revokeAccess(input.token, client); return NextResponse.json({ ok: true }, { headers }); }
    throw new Problem(404, 'Not found');
  } catch (error) { const response = failure(error); Object.entries(headers).forEach(([k,v]) => response.headers.set(k,v)); return response; }
}
