import { randomUUID } from 'node:crypto';
import { mutateTeam, readTeam } from './store.ts';
import { downloadMedia, putMedia } from './media.ts';
import { organize } from './ai.ts';
import type { Job, Team } from './model.ts';
export function claimJob(team: Team, time = Date.now()): Job | null {
  const job = team.jobs.find(j => j.state === 'queued' || j.state === 'running' && (j.leaseUntil ?? 0) < time);
  if (!job) return null;
  job.state = 'running'; job.attempts++; job.lease = randomUUID(); job.leaseUntil = time + 180000;
  if (job.kind === 'ai') { const draft = team.drafts.find(d => d.id === job.targetId); if (draft) draft.state = 'processing'; }
  return structuredClone(job);
}
export async function runNextJob(teamId: string) {
  const job = await mutateTeam(teamId, team => { team.workerSeenAt = new Date().toISOString(); return claimJob(team); });
  if (!job) return false;
  let result: any; let error: string | undefined;
  try {
    const team = (await readTeam(teamId))!;
    if (job.kind === 'media') {
      const media = team.media.find(m => m.id === job.targetId); if (!media) throw new Error('附件记录不存在');
      const downloaded = await downloadMedia(media); const key = teamId + '/' + media.id; await putMedia(key, downloaded.buffer, downloaded.mime); result = { key, mime: downloaded.mime, bytes: downloaded.buffer.length };
    } else {
      const draft = team.drafts.find(d => d.id === job.targetId); if (!draft || !team.members.some(m => m.id === draft.ownerId && m.active)) throw new Error('提交者已离开团队');
      result = await organize(team, draft.sourceIds.map(id => { const source = team.sources.find(s => s.id === id && s.sender === draft.ownerId); if (!source) throw new Error('资料不可用'); return source; }), draft.mode);
    }
  } catch (err) { error = job.kind === 'media' ? '附件获取失败，请重试；若下载链接已过期，请重新转发' : err instanceof Error && !/https?:|Bearer|key=/i.test(err.message) ? err.message.slice(0, 250) : 'AI 整理失败，请检查服务配置后重试'; }
  await mutateTeam(teamId, team => {
    const current = team.jobs.find(j => j.id === job.id); if (!current || current.state !== 'running' || current.lease !== job.lease) return;
    current.state = error ? 'failed' : 'done'; current.error = error; delete current.leaseUntil;
    if (job.kind === 'media') {
      const media = team.media.find(m => m.id === job.targetId)!; if (error) media.error = error; else { Object.assign(media, result); delete media.url; delete media.aeskey; delete media.error; }
      const source = team.sources.find(s => s.id === media.sourceId)!;
      if (source.state !== 'unsupported') { const related = team.media.filter(m => m.sourceId === source.id); source.state = related.some(m => m.error) ? 'failed' : related.every(m => m.key) ? 'ready' : 'pending'; }
    } else { const draft = team.drafts.find(d => d.id === job.targetId)!; draft.state = error ? 'failed' : 'ready'; draft.error = error; if (!error) { draft.tasks = result.tasks; draft.model = result.model; } }
  });
  return true;
}
