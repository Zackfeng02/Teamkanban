import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTeam } from '../src/lib/seed.ts';
import { applyAction, ingest, issuePasswordRecovery, makeTask, resetPassword, snapshot } from '../src/lib/domain.ts';
import { claimJob } from '../src/lib/jobs.ts';
import { hash, passwordHash, checkPassword } from '../src/lib/security.ts';
function fixture() { const team = emptyTeam('Test'); team.members.push({ id: 'alice', name: 'Alice', login: 'alice', password: '', role: 'admin', active: true }, { id: 'bob', name: 'Bob', login: 'bob', password: '', role: 'member', active: true }); return { team, alice: { teamId: team.id, memberId: 'alice' }, bob: { teamId: team.id, memberId: 'bob' } }; }
const input = { title: '虚构任务', customer: '', customerRef: null, type: 'other' as const, description: '', checklist: ['联系客户'], ownerId: null, dueDate: null };
test('manual creation accepts the explicit empty source list sent by the browser', () => {
  const { team, alice } = fixture();
  applyAction(team, alice, { op: 'createTask', task: input, sourceIds: [] });
  assert.equal(team.tasks.length, 1);
  assert.deepEqual(team.tasks[0].sourceIds, []);
  assert.throws(() => applyAction(team, alice, { op: 'organize', sourceIds: [] }));
  assert.throws(() => applyAction(team, alice, { op: 'append', taskId: team.tasks[0].id, version: 1, sourceIds: [] }));
});
function message(msgid: string, text = '测试客户希望变更地址') { return { msgid, chattype: 'single', from: { userid: 'external-alice' }, msgtype: 'text', text: { content: text } }; }
test('unbound and group messages are discarded without storing sources, media or jobs', () => { const { team } = fixture(); assert.equal(ingest(team, message('1')).accepted, false); assert.equal(ingest(team, { ...message('2'), chattype: 'group' }).accepted, false); assert.equal(team.sources.length + team.media.length + team.jobs.length, 0); });
test('binding codes expire, are single use and cannot steal a sender identity', () => { const { team, alice, bob } = fixture(); const { code } = applyAction(team, alice, { op: 'binding' }) as any; assert.equal(ingest(team, message('bind', code)).reason, 'BOUND'); assert.equal(ingest(team, message('bind-again', code)).reason, 'INVALID_BINDING'); const other = applyAction(team, bob, { op: 'binding' }) as any; assert.equal(ingest(team, message('bind-other', other.code)).reason, 'SENDER_ALREADY_BOUND'); team.bindingCodes[0].expires = 0; assert.equal(ingest(team, { ...message('expire', other.code), from: { userid: 'new' } }).reason, 'INVALID_BINDING'); assert.equal(team.sources.length, 0); });
test('message IDs dedupe redelivery; separately forwarded messages remain separate', () => { const { team } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' }); ingest(team, message('1')); assert.equal(ingest(team, message('1')).reason, 'DUPLICATE'); ingest(team, message('2')); assert.equal(team.sources.length, 2); assert.notEqual(team.sources[0].id, team.sources[1].id); assert.equal(team.drafts.length, 0); });
test('quoted merged content is explicitly incomplete and cannot be organized', () => { const { team, alice } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' }); ingest(team, { ...message('1'), quote: { msgtype: 'chatrecord' } }); assert.equal(team.sources[0].state, 'unsupported'); assert.throws(() => applyAction(team, alice, { op: 'organize', sourceIds: [team.sources[0].id] }), /不完整/); });
test('media is queued separately and cannot be omitted from AI input', () => { const { team, alice } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' }); ingest(team, { ...message('image'), msgtype: 'image', image: { url: 'https://example.weixin.qq.com/a', aeskey: 'secret-media-key' } }); assert.equal(team.jobs[0].kind, 'media'); assert.equal(team.sources[0].state, 'pending'); assert.throws(() => applyAction(team, alice, { op: 'organize', sourceIds: [team.sources[0].id] }), /不完整/); assert.doesNotMatch(JSON.stringify(snapshot(team, alice)), /secret-media-key|https:\/\//); });
test('drafts and unconfirmed sources remain private, formal task sources become team visible', () => { const { team, alice, bob } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' }); ingest(team, message('1')); const sourceId = team.sources[0].id; applyAction(team, alice, { op: 'organize', sourceIds: [sourceId] }); assert.equal(snapshot(team, bob).sources.length, 0); assert.equal(snapshot(team, bob).drafts.length, 0); assert.throws(() => applyAction(team, bob, { op: 'organize', sourceIds: [sourceId] }), /不属于/); team.drafts[0].state = 'ready'; team.drafts[0].tasks = [input, { ...input, title: '第二个事项' }]; applyAction(team, alice, { op: 'confirm', draftId: team.drafts[0].id, tasks: team.drafts[0].tasks }); assert.equal(team.tasks.length, 2); assert.equal(snapshot(team, bob).sources.length, 1); assert.equal(team.sources[0].taskIds.length, 2); assert.throws(() => applyAction(team, alice, { op: 'confirm', draftId: team.drafts[0].id, tasks: [input] }), /已处理/); });
test('stale writes are rejected and audit preserves before and after values', () => { const { team, alice, bob } = fixture(); const task = makeTask(input, [], alice); team.tasks.push(task); const patch = { ...input, checklist: task.checklist, status: 'doing', waitingReason: '' }; applyAction(team, bob, { op: 'updateTask', taskId: task.id, version: 1, patch }); assert.equal(task.version, 2); assert.equal(task.activity[1].memberId, 'bob'); assert.equal((task.activity[1].before as any).status, 'todo'); assert.equal((task.activity[1].after as any).status, 'doing'); assert.throws(() => applyAction(team, alice, { op: 'updateTask', taskId: task.id, version: 1, patch }), /其他成员/); });
test('waiting requires a reason; impossible dates and removed owners are rejected', () => { const { team, alice } = fixture(); const task = makeTask(input, [], alice); team.tasks.push(task); assert.throws(() => applyAction(team, alice, { op: 'updateTask', taskId: task.id, version: 1, patch: { ...input, checklist: [], status: 'waiting', waitingReason: '' } }), /等待外部/); assert.throws(() => applyAction(team, alice, { op: 'createTask', task: { ...input, dueDate: '2026-02-30' } })); assert.throws(() => applyAction(team, alice, { op: 'createTask', task: { ...input, ownerId: 'missing' } }), /负责人/); });
test('member removal revokes membership, sessions, bindings and assignment with audit', () => { const { team, alice, bob } = fixture(); team.sessions.push({ hash: hash('token'), memberId: 'bob', expires: Date.now() + 1000 }); team.bindings.push({ externalId: 'external-bob', memberId: 'bob' }); const task = makeTask({ ...input, ownerId: 'bob' }, [], alice); team.tasks.push(task); applyAction(team, alice, { op: 'removeMember', memberId: 'bob' }); assert.equal(team.sessions.length, 0); assert.equal(team.bindings.length, 0); assert.equal(task.ownerId, null); assert.equal(task.version, 2); assert.throws(() => snapshot(team, bob), /失效/); assert.throws(() => applyAction(team, bob, { op: 'createTask', task: input }), /失效/); });
test('cross-team actors and non-admin archival are rejected', () => { const { team, alice, bob } = fixture(); const task = makeTask(input, [], alice); team.tasks.push(task); assert.throws(() => snapshot(team, { ...alice, teamId: 'other' }), /失效/); assert.throws(() => applyAction(team, bob, { op: 'archive', taskId: task.id, version: 1, archived: true }), /管理员/); applyAction(team, alice, { op: 'archive', taskId: task.id, version: 1, archived: true }); assert.equal(task.archived, true); applyAction(team, alice, { op: 'archive', taskId: task.id, version: 2, archived: false }); assert.equal(task.archived, false); });
test('appending media requires explicit selection and updates audit and visibility', () => { const { team, alice, bob } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' }); ingest(team, message('1')); ingest(team, message('2')); const task = makeTask(input, [], alice); team.tasks.push(task); applyAction(team, alice, { op: 'append', taskId: task.id, version: 1, sourceIds: [team.sources[0].id] }); assert.deepEqual(task.sourceIds, [team.sources[0].id]); assert.equal(team.sources[1].taskIds.length, 0); assert.equal(snapshot(team, bob).sources.length, 1); });
test('a member can attach image-only material to a manual task but cannot ask AI to infer it', () => { const { team, alice } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' }); ingest(team, { ...message('image'), msgtype: 'image', image: { url: 'https://example.weixin.qq.com/a', aeskey: 'secret-media-key' } }); team.sources[0].state = 'ready'; assert.throws(() => applyAction(team, alice, { op: 'organize', sourceIds: [team.sources[0].id] }), /图片只会作为附件/); const result = applyAction(team, alice, { op: 'createTask', task: input, sourceIds: [team.sources[0].id] }) as any; assert.deepEqual(team.tasks[0].sourceIds, [team.sources[0].id]); assert.deepEqual(team.sources[0].taskIds, [result.taskId]); });
test('customer references are retained when a task is created and recorded when it changes', () => { const { team, alice } = fixture(); const first = { clientCoreId: 'client-a', clientCode: 'A-100', displayName: '虚构客户 A' }; applyAction(team, alice, { op: 'createTask', task: { ...input, customer: first.displayName, customerRef: first } }); const task = team.tasks[0]; assert.deepEqual(task.customerRef, first); const patch = { ...input, customer: '', customerRef: null, checklist: task.checklist, status: 'doing' as const, waitingReason: '' }; applyAction(team, alice, { op: 'updateTask', taskId: task.id, version: task.version, patch }); assert.equal(task.customerRef, null); assert.deepEqual((task.activity.at(-1)?.before as any).customerRef, first); assert.equal((task.activity.at(-1)?.after as any).customerRef, null); });
test('leases prevent duplicate claims and allow recovery after worker restart', () => { const { team } = fixture(); team.jobs.push({ id: 'job', kind: 'media', targetId: 'image', state: 'queued', attempts: 0 }); const first = claimJob(team, 100)!; assert.equal(claimJob(team, 101), null); const recovered = claimJob(team, 180101)!; assert.notEqual(recovered.lease, first.lease); assert.equal(recovered.attempts, 2); });
test('passwords are salted and compared without accepting empty demo credentials', () => { const first = passwordHash('twelve-chars-password'); const second = passwordHash('twelve-chars-password'); assert.notEqual(first, second); assert.equal(checkPassword('twelve-chars-password', first), true); assert.equal(checkPassword('incorrect', first), false); assert.equal(checkPassword('', ''), false); });
test('admin password recovery is one-time and revokes old sessions', () => { const { team } = fixture(); team.sessions.push({ hash: hash('old-session'), memberId: 'alice', expires: Date.now() + 60_000 }); const issued = issuePasswordRecovery(team, 'ALICE'); assert.match(issued.code, /^KR-/); assert.equal(team.recoveryTokens?.length, 1); resetPassword(team, 'alice', issued.code, 'new-admin-password'); assert.equal(checkPassword('new-admin-password', team.members[0].password), true); assert.equal(team.sessions.length, 0); assert.equal(team.recoveryTokens?.length, 0); assert.throws(() => resetPassword(team, 'alice', issued.code, 'another-password'), /恢复码无效/); });
test('password recovery only issues codes for active administrators', () => { const { team } = fixture(); assert.throws(() => issuePasswordRecovery(team, 'bob'), /管理员账号不存在/); team.members[0].active = false; assert.throws(() => issuePasswordRecovery(team, 'alice'), /管理员账号不存在/); });


test('12 messages remain attached to one task, mode survives retry and confirmation rejects splitting', () => {
  const { team, alice } = fixture();
  team.bindings.push({ externalId: 'external-alice', memberId: alice.memberId });
  for (let i = 0; i < 12; i++) ingest(team, message(String(i), `同一个任务的补充资料 ${i}`));
  const sourceIds = team.sources.map(source => source.id);
  applyAction(team, alice, { op: 'organize', sourceIds, mode: 'single' });
  const draft = team.drafts[0];
  assert.equal(draft.mode, 'single');
  assert.deepEqual(draft.sourceIds, sourceIds);
  draft.state = 'failed';
  applyAction(team, alice, { op: 'retryDraft', draftId: draft.id });
  assert.equal(draft.mode, 'single');
  draft.state = 'ready'; draft.tasks = [input];
  assert.throws(() => applyAction(team, alice, { op: 'confirm', draftId: draft.id, tasks: [input, input] }), /一个任务/);
  assert.equal(team.tasks.length, 0);
  applyAction(team, alice, { op: 'confirm', draftId: draft.id, tasks: [input] });
  assert.equal(team.tasks.length, 1);
  assert.deepEqual(team.tasks[0].sourceIds, sourceIds);
  assert.ok(team.sources.every(source => source.taskIds.length === 1));
});

test('organizing rejects unknown task modes without queuing a draft', () => {
  const { team, alice } = fixture();
  team.bindings.push({ externalId: 'external-alice', memberId: alice.memberId });
  ingest(team, message('one'));
  assert.throws(() => applyAction(team, alice, { op: 'organize', sourceIds: [team.sources[0].id], mode: 'invalid' }));
  assert.equal(team.drafts.length, 0);
});

test('forwarded file messages queue attachments, preserve decryption metadata and deduplicate', () => {
  const { team } = fixture(); team.bindings.push({ externalId: 'external-alice', memberId: 'alice' });
  const body = { ...message('pdf-forward'), msgtype: 'file', file: { url: 'https://weixin.qq.com/document', aeskey: 'test-key' } };
  assert.equal(ingest(team, body).accepted, true);
  assert.equal(team.sources[0].state, 'pending'); assert.equal(team.sources[0].entries[0].kind, 'file');
  assert.equal(team.media[0].aeskey, 'test-key'); assert.equal(team.jobs[0].targetId, team.media[0].id);
  assert.equal(ingest(team, body).reason, 'DUPLICATE'); assert.equal(team.jobs.length, 1);
});
