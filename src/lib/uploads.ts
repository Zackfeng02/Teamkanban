import { randomUUID } from 'node:crypto';
import type { Actor, Team } from './model.ts';
import { mediaMime } from './media.ts';
import { Problem, requireMember } from './security.ts';
export const maxImageBytes = 25 * 1024 * 1024;
export async function readUploadedImage(request: Request) {
  if (Number(request.headers.get('content-length')) > maxImageBytes) throw new Problem(413, '每个附件不能超过 25 MB');
  const reader = request.body?.getReader(); if (!reader) throw new Problem(400, '请选择附件');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxImageBytes) throw new Problem(413, '每个附件不能超过 25 MB'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const buffer = Buffer.concat(chunks);
  let mime: string;
  try { mime = mediaMime(buffer); } catch { throw new Problem(415, '仅支持 JPG、PNG、GIF、WebP 图片或 PDF，请转换格式后上传'); }
  return { buffer, mime };
}
export function registerUploadedImage(team: Team, actor: Actor, media: { id: string; key: string; mime: string; bytes: number }, name: string) {
  requireMember(team, actor);
  const sourceId = randomUUID();
  team.sources.push({ id: sourceId, sender: actor.memberId, origin: 'upload', uploadName: name.slice(0, 180), messageId: 'upload-' + media.id, receivedAt: new Date().toISOString(), entries: [{ kind: media.mime === 'application/pdf' ? 'file' : 'image', mediaId: media.id }], state: 'ready', taskIds: [] });
  team.media.push({ ...media, sourceId });
  return { sourceId };
}
