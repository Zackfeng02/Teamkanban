import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { mutateTeam, readTeam, teamIds } from '../../../lib/store.ts';
import { ingest, issuePasswordRecovery } from '../../../lib/domain.ts';
import { jsonBody, failure } from '../../../lib/http.ts';
import { Problem } from '../../../lib/security.ts';
import { runNextJob } from '../../../lib/jobs.ts';
export const runtime = 'nodejs';
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const configured = process.env.WORKER_TOKEN; const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    if (!configured || provided.length !== configured.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(configured))) throw new Problem(401, 'Unauthorized');
    const body = await jsonBody(request, 512000);
    if (body.op === 'teams') return NextResponse.json({ teamIds: await teamIds() });
    if (typeof body.teamId !== 'string') throw new Problem(400, 'Missing team');
    if (body.op === 'listAdmins') {
      const team = await readTeam(body.teamId);
      return NextResponse.json({ admins: team?.members.filter(member => member.active && member.role === 'admin').map(member => ({ login: member.login, name: member.name })) ?? [] });
    }
    if (body.op === 'issueRecovery') {
      const login = typeof body.login === 'string' ? body.login : '';
      return NextResponse.json(await mutateTeam(body.teamId, team => issuePasswordRecovery(team, login)));
    }
    if (body.op === 'ingest') return NextResponse.json(await mutateTeam(body.teamId, t => ingest(t, body.body, typeof body.capturedAt === 'string' ? body.capturedAt : undefined)));
    if (body.op === 'bindings') { const team = await readTeam(body.teamId); return NextResponse.json({ senders: team?.bindings.filter(b => team.members.some(m => m.id === b.memberId && m.active)).map(b => b.externalId) ?? [] }); }
    if (body.op === 'tick') return NextResponse.json({ worked: await runNextJob(body.teamId) });
    throw new Problem(400, 'Unknown operation');
  } catch (error) { return failure(error); }
}
