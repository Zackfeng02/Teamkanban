import test from 'node:test';
import assert from 'node:assert/strict';
import { readUploadedImage, registerUploadedImage, maxImageBytes } from '../src/lib/uploads.ts';
import { emptyTeam } from '../src/lib/seed.ts';
import { applyAction, snapshot } from '../src/lib/domain.ts';
const image = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
test('uploads determine image type from bytes, not the browser supplied content type', async () => {
  const result = await readUploadedImage(new Request('http://localhost/upload', { method: 'POST', body: image, headers: { 'Content-Type': 'image/png' } }));
  assert.equal(result.mime, 'image/gif'); assert.deepEqual(result.buffer, image);
  await assert.rejects(readUploadedImage(new Request('http://localhost/upload', { method: 'POST', body: '<script>alert(1)</script>', headers: { 'Content-Type': 'image/png' } })), /仅支持/);
  await assert.rejects(readUploadedImage(new Request('http://localhost/upload', { method: 'POST', body: new Uint8Array() })), /仅支持/);
});
test('image size is bounded for both declared and streamed bodies', async () => {
  await assert.rejects(readUploadedImage(new Request('http://localhost/upload', { method: 'POST', body: image, headers: { 'Content-Length': String(maxImageBytes + 1) } })), /25 MB/);
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(maxImageBytes)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  await assert.rejects(readUploadedImage(new Request('http://localhost/upload', { method: 'POST', body, duplex: 'half' } as RequestInit)), /25 MB/);
});
test('uploaded images stay private until attached, retain image-only semantics, and require active membership', () => {
  const team = emptyTeam('upload-test');
  team.members.push({ id: 'a', name: 'A', login: 'a', password: '', role: 'admin', active: true }, { id: 'b', name: 'B', login: 'b', password: '', role: 'member', active: true });
  const actor = { teamId: team.id, memberId: 'a' }; const other = { teamId: team.id, memberId: 'b' };
  const { sourceId } = registerUploadedImage(team, actor, { id: 'media', key: team.id + '/media', mime: 'image/gif', bytes: image.length }, 'photo.gif');
  assert.equal(snapshot(team, other).sources.length, 0);
  assert.equal(team.sources[0].origin, 'upload'); assert.equal(team.sources[0].uploadName, 'photo.gif');
  assert.equal(team.sources[0].entries[0].kind, 'image'); assert.equal(team.jobs.length, 0);
  assert.throws(() => applyAction(team, actor, { op: 'organize', sourceIds: [sourceId] }), /图片只会作为附件/);
  assert.throws(() => applyAction(team, other, { op: 'createTask', sourceIds: [sourceId], task: { title: 'test', type: 'lead', customer: '', description: '', checklist: [], dueDate: null, ownerId: null } }), /不属于/);
  applyAction(team, actor, { op: 'createTask', sourceIds: [sourceId], task: { title: 'test', type: 'lead', customer: '', description: '', checklist: [], dueDate: null, ownerId: null } });
  assert.deepEqual(team.tasks[0].sourceIds, [sourceId]); assert.equal(snapshot(team, other).sources.length, 1);
  team.members[0].active = false;
  assert.throws(() => registerUploadedImage(team, actor, { id: 'invalid', key: team.id + '/invalid', mime: 'image/gif', bytes: 1 }, 'invalid.gif'), /失效/);
  assert.equal(team.sources.length, 1);
});

test('PDF bytes upload privately and append to an existing task with version and visibility checks', async () => {
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const result = await readUploadedImage(new Request('http://localhost/upload', { method: 'POST', body: pdf }));
  assert.equal(result.mime, 'application/pdf'); assert.deepEqual(result.buffer, pdf);
  const team = emptyTeam('pdf-test');
  team.members.push({ id: 'a', name: 'A', login: 'a', password: '', role: 'admin', active: true }, { id: 'b', name: 'B', login: 'b', password: '', role: 'member', active: true });
  const actor = { teamId: team.id, memberId: 'a' }; const other = { teamId: team.id, memberId: 'b' };
  applyAction(team, actor, { op: 'createTask', sourceIds: [], task: { title: 'PDF task', type: 'other', customer: '', description: '', checklist: [], dueDate: null, ownerId: null } });
  const task = team.tasks[0];
  const { sourceId } = registerUploadedImage(team, actor, { id: 'pdf', key: team.id + '/pdf', mime: result.mime, bytes: pdf.length }, '资料.pdf');
  assert.equal(team.sources[0].entries[0].kind, 'file'); assert.equal(snapshot(team, other).sources.length, 0);
  assert.throws(() => applyAction(team, other, { op: 'append', taskId: task.id, version: task.version, sourceIds: [sourceId] }));
  applyAction(team, actor, { op: 'append', taskId: task.id, version: task.version, sourceIds: [sourceId] });
  assert.deepEqual(task.sourceIds, [sourceId]); assert.equal(snapshot(team, other).sources.length, 1);
  assert.equal(task.activity.at(-1)?.action, '追加资料');
  assert.throws(() => applyAction(team, actor, { op: 'append', taskId: task.id, version: task.version - 1, sourceIds: [sourceId] }));
});
