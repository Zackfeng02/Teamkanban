import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Actor, DraftTask, Entry, Source, Task, Team } from './model.ts';
import { checkPassword, draftSchema, hash, passwordHash, Problem, requireMember, token } from './security.ts';

import { newWorkflow, workflowComplete } from './task-workflow.ts';
import { applyWorkflowAction } from './workflow-actions.ts';

const now = () => new Date().toISOString();
const idsSchema = z.array(z.string()).min(1).max(30).refine(a => new Set(a).size === a.length);
export function visibleSource(team: Team, actor: Actor, source: Source) {
  return source.sender === actor.memberId || team.tasks.some(t => t.sourceIds.includes(source.id));
}
function ownSources(team: Team, actor: Actor, ids: string[], ready: boolean) {
  return ids.map(id => { const source = team.sources.find(s => s.id === id && s.sender === actor.memberId); if (!source) throw new Problem(404, '资料不存在或不属于你'); if (ready && source.state !== 'ready') throw new Problem(409, '资料尚不完整，请先重试失败项'); return source; });
}
function validOwner(team: Team, ownerId: string | null) { if (ownerId && !team.members.some(m => m.id === ownerId && m.active)) throw new Problem(400, '负责人已离开团队'); }
function event(task: Task, actor: Actor, action: string, before: unknown, after: unknown) { task.activity.push({ id: randomUUID(), memberId: actor.memberId, at: now(), action, before, after }); task.version++; task.updatedAt = now(); }
export function issuePasswordRecovery(team: Team, login: string) {
  const member = team.members.find(item => item.active && item.role === 'admin' && item.login === login.trim().toLowerCase());
  if (!member) throw new Problem(404, '管理员账号不存在');
  const code = 'KR-' + token();
  team.recoveryTokens = (team.recoveryTokens ?? []).filter(item => item.expires > Date.now() && item.memberId !== member.id);
  team.recoveryTokens.push({ hash: hash(code), memberId: member.id, expires: Date.now() + 10 * 60_000 });
  return { code, expiresMinutes: 10, login: member.login };
}
export function resetPassword(team: Team, login: string, code: string, newPassword: string) {
  const member = team.members.find(item => item.active && item.role === 'admin' && item.login === login.trim().toLowerCase());
  const recovery = member && (team.recoveryTokens ?? []).find(item => item.memberId === member.id && item.hash === hash(code) && item.expires > Date.now());
  if (!member || !recovery) throw new Problem(400, '恢复码无效或已过期');
  member.password = passwordHash(newPassword);
  team.sessions = team.sessions.filter(session => session.memberId !== member.id);
  team.recoveryTokens = (team.recoveryTokens ?? []).filter(item => item !== recovery && item.expires > Date.now());
  return { memberId: member.id, login: member.login };
}
export function makeTask(data: DraftTask, sourceIds: string[], actor: Actor): Task {
  return { ...data, workflow:newWorkflow(data.type), priority:data.priority??'normal', insuranceLine:data.insuranceLine??'other', checklist: data.checklist.map(text => ({ id: randomUUID(), text, done: false })), id: randomUUID(), status: 'todo', waitingReason: '', sourceIds, version: 1, archived: false, createdAt: now(), updatedAt: now(), comments: [], activity: [{ id: randomUUID(), memberId: actor.memberId, at: now(), action: '创建任务', before: null, after: { title: data.title, customerRef: data.customerRef, ownerId: data.ownerId, dueDate: data.dueDate } }] };
}
export function snapshot(team: Team, actor: Actor) {
  const me = requireMember(team, actor);
  return { team: { id: team.id, name: team.name, demo: team.demo }, me: { id: me.id, name: me.name, role: me.role, bound: team.bindings.some(b => b.memberId === me.id) }, members: team.members.map(({ id, name, role, active }) => ({ id, name, role, active })), sources: team.sources.filter(s => visibleSource(team, actor, s)), media: team.media.filter(m => { const source = team.sources.find(s => s.id === m.sourceId); return source && visibleSource(team, actor, source); }).map(({ id, sourceId, key, mime, bytes, error }) => ({ id, sourceId, available: !!key, mime, bytes, error })), drafts: team.drafts.filter(d => d.ownerId === me.id && d.state !== 'confirmed'), tasks: team.tasks, workerSeenAt: team.workerSeenAt ?? null };
}
export function applyAction(team: Team, actor: Actor, input: unknown): unknown {
  requireMember(team, actor);
  const base = z.object({ op: z.string() }).passthrough().parse(input);
  if (base.op === 'binding') {
    const code = 'KB-' + token().replace(/[-_]/g, '').slice(0, 16);
    team.bindingCodes = team.bindingCodes.filter(c => c.memberId !== actor.memberId && c.expires > Date.now());
    team.bindingCodes.push({ hash: hash(code), memberId: actor.memberId, expires: Date.now() + 10 * 60_000 });
    return { code, expiresMinutes: 10 };
  }
  if (base.op === 'invite') {
    requireMember(team, actor, true); const secret = token();
    team.invitations = team.invitations.filter(i => i.expires > Date.now());
    team.invitations.push({ hash: hash(secret), role: 'member', expires: Date.now() + 86400_000 });
    return { invitation: team.id + '.' + secret };
  }
  if (base.op === 'removeMember') {
    requireMember(team, actor, true); const { memberId } = z.object({ memberId: z.string() }).parse(base);
    const member = team.members.find(m => m.id === memberId && m.active);
    if (!member || member.id === actor.memberId || member.role === 'admin') throw new Problem(400, '不能移除该成员');
    member.active = false; team.sessions = team.sessions.filter(s => s.memberId !== memberId); team.bindings = team.bindings.filter(b => b.memberId !== memberId); team.bindingCodes = team.bindingCodes.filter(c => c.memberId !== memberId);
    for (const task of team.tasks.filter(t => t.ownerId === memberId)) { task.ownerId = null; event(task, actor, '移除成员后取消分配', memberId, null); }
    for (const job of team.jobs.filter(j => j.kind === 'ai')) { const draft = team.drafts.find(d => d.id === job.targetId); if (draft?.ownerId === memberId && job.state !== 'done') { job.state = 'failed'; job.lease = undefined; draft.state = 'failed'; draft.error = '提交者已离开团队'; } }
    return {};
  }
  if (base.op === 'organize') {
    const { sourceIds, mode } = z.object({ sourceIds: idsSchema, mode: z.enum(['single', 'multiple']).optional().default('multiple') }).parse(base); const sources = ownSources(team, actor, sourceIds, true);
    if (!sources.some(source => source.entries.some(entry => entry.kind === 'text' && entry.text.trim()))) throw new Problem(400, '图片只会作为附件保存。请同时选择聊天文字，或新建任务并附加图片');
    if (team.drafts.some(d => d.ownerId === actor.memberId && ['queued', 'processing', 'ready'].includes(d.state) && d.sourceIds.some(id => sourceIds.includes(id)))) throw new Problem(409, '部分资料已有待确认草稿，请先处理该草稿');
    const id = randomUUID(); team.drafts.push({ id, ownerId: actor.memberId, sourceIds, mode, state: 'queued', tasks: [], createdAt: now() }); team.jobs.push({ id: randomUUID(), kind: 'ai', targetId: id, state: 'queued', attempts: 0 }); return { draftId: id };
  }
  if (base.op === 'retryDraft') {
    const { draftId } = z.object({ draftId: z.string() }).parse(base); const draft = team.drafts.find(d => d.id === draftId && d.ownerId === actor.memberId);
    if (!draft || draft.state !== 'failed') throw new Problem(409, '此草稿当前不能重试'); ownSources(team, actor, draft.sourceIds, true);
    draft.state = 'queued'; delete draft.error; team.jobs.push({ id: randomUUID(), kind: 'ai', targetId: draft.id, state: 'queued', attempts: 0 }); return {};
  }
  if (base.op === 'retrySource') {
    const { sourceId } = z.object({ sourceId: z.string() }).parse(base); const source = ownSources(team, actor, [sourceId], false)[0];
    if (source.state !== 'failed') throw new Problem(409, '只有下载失败的图片可以重试');
    source.state = 'pending'; for (const media of team.media.filter(m => m.sourceId === sourceId && !m.key)) { delete media.error; team.jobs.push({ id: randomUUID(), kind: 'media', targetId: media.id, state: 'queued', attempts: 0 }); } return {};
  }
  if (base.op === 'confirm') {
    const { draftId, tasks } = z.object({ draftId: z.string(), tasks: z.array(draftSchema).min(1).max(12) }).parse(base);
    const draft = team.drafts.find(d => d.id === draftId && d.ownerId === actor.memberId); if (!draft || draft.state !== 'ready') throw new Problem(409, '草稿已处理或尚未就绪'); ownSources(team, actor, draft.sourceIds, true);
    if (draft.mode === 'single' && tasks.length !== 1) throw new Problem(400, '此草稿选择了创建一个任务，请保留一个任务再确认');
    const created = tasks.map(data => { validOwner(team, data.ownerId); return makeTask(data, draft.sourceIds, actor); });
    team.tasks.push(...created); draft.state = 'confirmed'; for (const source of ownSources(team, actor, draft.sourceIds, true)) source.taskIds.push(...created.map(t => t.id)); return { taskIds: created.map(t => t.id) };
  }
  if (base.op === 'createTask') {
    const { task, sourceIds } = z.object({ task: draftSchema, sourceIds: z.array(z.string()).max(30).refine(a => new Set(a).size === a.length).optional().default([]) }).parse(base); const sources = sourceIds.length ? ownSources(team, actor, sourceIds, true) : [];
    validOwner(team, task.ownerId); const created = makeTask(task, sourceIds, actor); team.tasks.push(created); for (const source of sources) source.taskIds.push(created.id); return { taskId: created.id };
  }
  const { taskId, version } = z.object({ taskId: z.string(), version: z.number().int().positive() }).parse(base);
  const task = team.tasks.find(t => t.id === taskId); if (!task) throw new Problem(404, '任务不存在');
  if (task.version !== version) throw new Problem(409, '其他成员已更新此任务。请查看最新内容后再保存');
  if (base.op.startsWith('workflow.')) { const before=structuredClone(task.workflow??null); applyWorkflowAction(task,actor,base); event(task,actor,'更新办理节点',before,task.workflow); return {}; }
  if (base.op === 'updateTask') {
    if(task.workflow?.pendingConfirmation||task.renewal?.pending) throw new Problem(409,'请先核实待处理的业务提交，再修改任务');
    const { patch } = z.object({ patch: draftSchema.omit({ checklist: true }).extend({ status: z.enum(['todo','doing','waiting','done']), waitingReason: z.string().max(1000), checklist: z.array(z.object({ id: z.string().max(100), text: z.string().trim().min(1).max(500), done: z.boolean() })).max(40) }).strict() }).parse(base);
    if(task.changeForm&&(patch.type!==task.type||patch.customerRef?.clientCoreId!==task.customerRef?.clientCoreId))throw new Problem(409,'变更表单已锁定客户和类型，请另建任务');
    if(task.renewal&&(patch.type!==task.type||patch.customerRef?.clientCoreId!==task.customerRef?.clientCoreId))throw new Problem(409,'续保任务已绑定客户和原保单年度');
    if(task.billingFollowup&&(patch.type!==task.type||patch.customerRef?.clientCoreId!==task.customerRef?.clientCoreId||patch.status==='done'&&task.status!=='done'))throw new Problem(409,'请在账务跟进页面更新实际金额并完成任务');
    if(task.renewal&&patch.status==='done'&&task.status!=='done')throw new Problem(400,'请在续保页面核实并完成任务');
    if (patch.status === 'waiting' && !patch.waitingReason.trim()) throw new Problem(400, '请填写等待外部的原因'); validOwner(team, patch.ownerId);
    if (new Set(patch.checklist.map(c => c.id)).size !== patch.checklist.length) throw new Problem(400, '检查项重复');
    if (task.workflow && (task.workflow.pendingConfirmation || task.workflow.receipts.length || task.workflow.steps.some(s=>s.evidence)) && (patch.type!==task.type || patch.customerRef?.clientCoreId!==task.customerRef?.clientCoreId)) throw new Problem(409,'已有业务确认，不能更换任务类型或客户');
    if (patch.type!==task.type) { const flow=newWorkflow(patch.type); if(task.workflow) flow.steps=flow.steps.map(s=>task.workflow!.steps.find(old=>old.key===s.key&&old.label===s.label)??s); task.workflow=flow; }
    if (patch.status==='done' && task.workflow && !workflowComplete(task.workflow,patch.type)) throw new Problem(400,'请先完成必需办理节点');
    const before = Object.fromEntries(Object.keys(patch).map(key => [key, (task as any)[key]])); Object.assign(task, patch); event(task, actor, '更新任务', before, patch); return {};
  }
  if (base.op === 'comment') { const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(base); task.comments.push({ id: randomUUID(), memberId: actor.memberId, at: now(), text }); event(task, actor, '添加进展', null, text); return {}; }
  if (base.op === 'archive') { requireMember(team, actor, true); const { archived } = z.object({ archived: z.boolean() }).parse(base); if(archived&&(task.renewal||task.billingFollowup)&&(task.status!=='done'||task.renewal?.pending||task.workflow&&!workflowComplete(task.workflow,task.type)))throw new Problem(400,'请先在续保或账务页面核实并完成业务节点'); const before = task.archived; task.archived = archived; event(task, actor, archived ? '归档任务' : '恢复任务', before, archived); return {}; }
  if (base.op === 'append') { const { sourceIds } = z.object({ sourceIds: idsSchema }).parse(base); const sources = ownSources(team, actor, sourceIds, true); const before = [...task.sourceIds]; task.sourceIds = [...new Set([...task.sourceIds, ...sourceIds])]; for (const source of sources) if (!source.taskIds.includes(task.id)) source.taskIds.push(task.id); event(task, actor, '追加资料', before, task.sourceIds); return {}; }
  throw new Problem(400, '未知操作');
}

export function ingest(team: Team, body: any, capturedAt?: string): { accepted: boolean; reason?: string } {
  if (body?.chattype !== 'single' || typeof body?.from?.userid !== 'string' || typeof body.msgid !== 'string') return { accepted: false, reason: 'ONLY_DIRECT_CHAT' };
  const externalId = body.from.userid;
  const text = body.msgtype === 'text' && typeof body.text?.content === 'string' ? body.text.content.trim() : '';
  if (/^KB-[a-zA-Z0-9]{16}$/.test(text)) {
    const code = team.bindingCodes.find(c => c.hash === hash(text) && c.expires > Date.now());
    if (!code || !team.members.some(m => m.id === code.memberId && m.active)) return { accepted: false, reason: 'INVALID_BINDING' };
    // A sender cannot take another member's binding; explicit unbinding is required first.
    if (team.bindings.some(b => b.externalId === externalId && b.memberId !== code.memberId)) return { accepted: false, reason: 'SENDER_ALREADY_BOUND' };
    team.bindings = team.bindings.filter(b => b.memberId !== code.memberId); team.bindings.push({ externalId, memberId: code.memberId }); team.bindingCodes = team.bindingCodes.filter(c => c !== code); return { accepted: true, reason: 'BOUND' };
  }
  const binding = team.bindings.find(b => b.externalId === externalId && team.members.some(m => m.id === b.memberId && m.active));
  if (!binding) return { accepted: false, reason: 'UNBOUND' };
  if (team.sources.some(s => s.messageId === body.msgid)) return { accepted: false, reason: 'DUPLICATE' };
  const id = randomUUID(); const entries: Entry[] = [];
  const parse = (part: any) => {
    if (part?.msgtype === 'text' && typeof part.text?.content === 'string' && part.text.content.length <= 20000) entries.push({ kind: 'text', text: part.text.content });
    else if (['image', 'file'].includes(part?.msgtype) && typeof part[part.msgtype]?.url === 'string' && part[part.msgtype].url.length <= 4000) { const attachment = part[part.msgtype]; const mediaId = randomUUID(); team.media.push({ id: mediaId, sourceId: id, url: attachment.url, aeskey: typeof attachment.aeskey === 'string' ? attachment.aeskey : undefined }); entries.push({ kind: part.msgtype === 'file' ? 'file' : 'image', mediaId }); team.jobs.push({ id: randomUUID(), kind: 'media', targetId: mediaId, state: 'queued', attempts: 0 }); }
    else entries.push({ kind: 'unsupported', label: '此消息类型无法展开，请逐条转发文字、图片或 PDF' });
  };
  if (body.msgtype === 'mixed' && Array.isArray(body.mixed?.msg_item) && body.mixed.msg_item.length <= 30) body.mixed.msg_item.forEach(parse); else parse(body);
  if (body.quote || body.chatrecord) entries.push({ kind: 'unsupported', label: '引用或合并记录未展开，不能视为完整资料' });
  if (!entries.length) entries.push({ kind: 'unsupported', label: '空消息' });
  const receivedAt = capturedAt && /^\d{4}-\d{2}-\d{2}T/.test(capturedAt) && Number.isFinite(Date.parse(capturedAt)) ? capturedAt : now();
  team.sources.push({ id, sender: binding.memberId, messageId: body.msgid, receivedAt, entries, state: entries.some(e => e.kind === 'unsupported') ? 'unsupported' : entries.some(e => e.kind === 'image' || e.kind === 'file') ? 'pending' : 'ready', taskIds: [] });
  return { accepted: true };
}

export function changeOwnPassword(team: Team, actor: Actor, current: string, password: string) {
  const member = requireMember(team, actor);
  if (!checkPassword(current, member.password)) throw new Problem(400, '当前密码不正确');
  if (password.length < 12 || password.length > 128) throw new Problem(400, '新密码须为 12–128 位');
  member.password = passwordHash(password);
  team.sessions = team.sessions.filter(s => s.memberId !== actor.memberId);
  team.recoveryTokens = team.recoveryTokens?.filter(t => t.memberId !== actor.memberId);
}
