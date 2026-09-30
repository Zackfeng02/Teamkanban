import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authenticate } from '../../../lib/security.ts';
import { failure, originCheck } from '../../../lib/http.ts';
import { mutateTeam } from '../../../lib/store.ts';
import { putMedia, deleteMedia } from '../../../lib/media.ts';
import { readUploadedImage, registerUploadedImage } from '../../../lib/uploads.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    originCheck(request);
    const actor = await authenticate((await cookies()).get('kanban_session')?.value);
    const { buffer, mime } = await readUploadedImage(request);
    const id = randomUUID(); const key = actor.teamId + '/' + id;
    let name = '上传图片';
    try { name = decodeURIComponent(request.headers.get('x-file-name') || name); } catch { /* Use the generic label for malformed file names. */ }
    await putMedia(key, buffer, mime);
    try {
      const result = await mutateTeam(actor.teamId, team => registerUploadedImage(team, actor, { id, key, mime, bytes: buffer.length }, name));
      return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { await deleteMedia(key).catch(() => {}); throw error; }
  } catch (error) { return failure(error); }
}
