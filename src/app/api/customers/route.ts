import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canQueryClientCoreCustomers, searchClientCoreCustomers } from '../../../lib/clientcore.ts';
import { failure } from '../../../lib/http.ts';
import { authenticate, Problem } from '../../../lib/security.ts';
import { readTeam } from '../../../lib/store.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await authenticate((await cookies()).get('kanban_session')?.value);
    const team = await readTeam(actor.teamId);
    if (!team || !canQueryClientCoreCustomers(team)) throw new Problem(403, '演示空间不能查询 ClientCore 客户');
    const query = z.string().trim().min(2).max(100).parse(new URL(request.url).searchParams.get('q') ?? '');
    return NextResponse.json({ items: await searchClientCoreCustomers(query) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
