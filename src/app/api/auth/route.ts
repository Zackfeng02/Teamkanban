import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, checkPassword, hash, passwordHash, Problem, token } from '../../../lib/security.ts';
import { createTeam, mutateTeam, readTeam, teamIds } from '../../../lib/store.ts';
import { changeOwnPassword, resetPassword } from '../../../lib/domain.ts';
import { seedDemo } from '../../../lib/seed.ts';
import { failure, jsonBody, originCheck } from '../../../lib/http.ts';
export const runtime = 'nodejs';
const globals = globalThis as unknown as { authAttempts?: Map<string, { count: number; reset: number }> };
export async function POST(request: Request) {
  try {
    originCheck(request); const body = await jsonBody(request, 8000);
    if (body.op === 'logout') { const cookie = (await cookies()).get('kanban_session')?.value; const actor = await authenticate(cookie); await mutateTeam(actor.teamId, t => { t.sessions = t.sessions.filter(s => s.hash !== hash(cookie!.split('.')[1])); }); const response = NextResponse.json({ ok: true }); response.cookies.delete('kanban_session'); return response; }
    const passwordActor = body.op === 'changePassword' ? await authenticate((await cookies()).get('kanban_session')?.value) : null;
    const attempts = globals.authAttempts ??= new Map(); const key = `${String(body.op || 'unknown')}:${String(passwordActor ? passwordActor.teamId + ':' + passwordActor.memberId : body.teamId || body.invitation || body.login || 'demo')}`.slice(0, 180); const rate = attempts.get(key); if (rate && rate.reset > Date.now() && rate.count >= 12) throw new Problem(429, '尝试次数过多，请 10 分钟后再试'); if (!rate || rate.reset < Date.now()) attempts.set(key, { count: 1, reset: Date.now() + 600000 }); else rate.count++;
    // Bounded, process-local protection for local preview; production also needs gateway rate limiting.
    if (attempts.size > 1000) { for (const [k, v] of attempts) if (v.reset < Date.now()) attempts.delete(k); if (attempts.size > 1000) throw new Problem(429, '请求过多，请稍后重试'); }
    if (body.op === 'changePassword') {
      const input = z.object({ current: z.string().max(128), password: z.string().min(12).max(128) }).parse(body);
      await mutateTeam(passwordActor!.teamId, team => changeOwnPassword(team, passwordActor!, input.current, input.password));
      attempts.delete(key);
      const response = NextResponse.json({ ok: true }); response.cookies.delete('kanban_session'); return response;
    }
    let teamId: string; let memberId: string;
    if (body.op === 'demo') { if (process.env.DEMO_MODE !== 'true') throw new Problem(403, '演示入口未启用'); const demo = seedDemo(); await createTeam(demo.team); teamId = demo.team.id; memberId = demo.memberId; }
    else if (body.op === 'join') {
      const input = z.object({ invitation: z.string().max(200), name: z.string().trim().min(1).max(60), login: z.string().trim().min(3).max(80), password: z.string().min(12).max(128) }).parse(body); const [id, secret] = input.invitation.split('.'); if (!id || !secret) throw new Problem(400, '邀请码无效'); teamId = id; memberId = randomUUID(); const encoded = passwordHash(input.password);
      await mutateTeam(teamId, team => { const invite = team.invitations.find(i => i.hash === hash(secret) && i.expires > Date.now()); if (!invite) throw new Problem(400, '邀请码已失效'); if (team.members.filter(m => m.active).length >= 20) throw new Problem(400, '团队已达到 20 人'); if (team.members.some(m => m.login.toLowerCase() === input.login.toLowerCase())) throw new Problem(400, '此账号名称已使用'); team.members.push({ id: memberId, name: input.name, login: input.login.toLowerCase(), password: encoded, role: invite.role, active: true }); team.invitations = team.invitations.filter(i => i !== invite); });
    } else if (body.op === 'login') {
      const input = z.object({ login: z.string().trim().min(3).max(80), password: z.string().max(128) }).parse(body);
      const matches = (await Promise.all((await teamIds()).map(async id => { const team = await readTeam(id); const member = team?.members.find(item => item.active && item.login === input.login.toLowerCase() && checkPassword(input.password, item.password)); return member ? { teamId: id, memberId: member.id } : null; }))).filter((item): item is { teamId: string; memberId: string } => !!item);
      if (matches.length !== 1) throw new Problem(401, '账号或密码不正确');
      ({ teamId, memberId } = matches[0]);
    }
    else if (body.op === 'recover') {
      const input = z.object({ teamId: z.string().max(100), login: z.string().trim().min(3).max(80), recoveryCode: z.string().trim().min(10).max(200), password: z.string().min(12).max(128) }).parse(body);
      const team = await readTeam(input.teamId); if (!team) throw new Problem(400, '恢复码无效或已过期');
      const result = await mutateTeam(input.teamId, current => resetPassword(current, input.login, input.recoveryCode, input.password));
      teamId = input.teamId; memberId = result.memberId;
    }
    else throw new Problem(400, '未知操作');
    const secret = token(); await mutateTeam(teamId, team => { team.sessions = team.sessions.filter(s => s.expires > Date.now()).slice(-100); team.sessions.push({ hash: hash(secret), memberId, expires: Date.now() + 7 * 86400000 }); }); attempts.delete(key);
    const response = NextResponse.json({ ok: true }); response.cookies.set('kanban_session', teamId + '.' + secret, { httpOnly: true, sameSite: 'lax', secure: (process.env.APP_ORIGIN || '').startsWith('https:'), path: '/', maxAge: 7 * 86400 }); return response;
  } catch (error) { return failure(error); }
}
export async function GET() { return NextResponse.json({ demoEnabled: process.env.DEMO_MODE === 'true' }); }
