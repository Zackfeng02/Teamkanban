import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticate, Problem } from '../../../../lib/security.ts';
import { readTeam } from '../../../../lib/store.ts';
import { visibleSource } from '../../../../lib/domain.ts';
import { getMedia } from '../../../../lib/media.ts';
import { failure } from '../../../../lib/http.ts';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookie = (await cookies()).get('kanban_session')?.value; const actor = await authenticate(cookie); const { id } = await context.params; const team = (await readTeam(actor.teamId))!; const media = team.media.find(m => m.id === id); const source = team.sources.find(s => s.id === media?.sourceId);
    if (!media?.key || !source || !visibleSource(team, actor, source)) throw new Problem(404, '附件不可用');
    const url = new URL(request.url); const sign = (exp: string) => createHmac('sha256', cookie!).update(id + ':' + exp).digest('hex');
    if (url.searchParams.get('ticket') === 'new') { const exp = String(Date.now() + 60000); return NextResponse.json({ url: `/api/media/${id}?expires=${exp}&signature=${sign(exp)}` }, { headers: { 'Cache-Control': 'no-store' } }); }
    const exp = url.searchParams.get('expires') || ''; const signature = url.searchParams.get('signature') || ''; const expected = sign(exp);
    if (!/^\d{13}$/.test(exp) || Number(exp) < Date.now() || Number(exp) > Date.now() + 61000 || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Problem(403, '附件链接已过期，请重新打开');
    const buffer = await getMedia(media.key); return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': media.mime!, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  } catch (error) { return failure(error); }
}
