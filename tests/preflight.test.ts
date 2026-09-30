import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectSample, digest, containedPath } from '../src/preflight/inspect.ts';
import { evaluateGate, requiredCases, requiredAdminChecks } from '../src/preflight/gate.ts';

const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const envelope = (msgtype: string, body: unknown) => ({ msgid: 'private-message', action: 'send', from: 'private-forwarder', msgtype, [msgtype]: body });
const textItem = (content = 'private-customer-request') => ({ type: 'text', content: JSON.stringify({ content }) });
const imageItem = (id = 'private-media') => ({ type: 'image', content: { sdkfileid: id } });
async function setup(input: unknown, files: Record<string, string> = { 'private-media': 'image.gif' }) {
  const dir = await mkdtemp(join(tmpdir(), 'kanban-preflight-'));
  const sample = join(dir, 'sample.json');
  const media = join(dir, 'media.json');
  await writeFile(sample, JSON.stringify(input));
  await writeFile(media, JSON.stringify({ files }));
  await writeFile(join(dir, 'image.gif'), pixel);
  return { dir, sample, media };
}
const has = (report: Awaited<ReturnType<typeof inspectSample>>, code: string) => report.issues.some(i => i.code === code);

test('merged source retains actual order, resolves media, never invents original authors', async () => {
  const s = await setup(envelope('chatrecord', { item: [textItem(), imageItem(), textItem('second')] }));
  const report = await inspectSample(s.sample, s.media);
  assert.equal(report.structurallyComplete, true);
  assert.deepEqual(report.entries.map(e => e.kind), ['text', 'image', 'text']);
  assert.deepEqual(report.entries.map(e => e.path), ['$.item[0]', '$.item[1]', '$.item[2]']);
  assert.equal(report.entries[0].authorProvided, false);
  assert.equal(report.entries[0].timeProvided, false);
  assert.equal(report.liveIntegrationVerified, false);
  assert.equal(report.counts.verifiedImages, 1);
  const output = JSON.stringify(report);
  for (const secret of ['private-customer', 'private-forwarder', 'private-media', 'image.gif', 'private-message']) assert.equal(output.includes(secret), false);
});

test('preserves explicit original metadata without exposing its values', async () => {
  const s = await setup(envelope('chatrecord', { item: [{ ...textItem(), from: 'original-person', msgtime: 123 }] }));
  const report = await inspectSample(s.sample);
  assert.equal(report.entries[0].authorProvided, true);
  assert.equal(report.entries[0].timeProvided, true);
  assert.equal(JSON.stringify(report).includes('original-person'), false);
});

test('top-level image forwarding is separate from merged records', async () => {
  const s = await setup(envelope('image', { sdkfileid: 'private-media' }));
  const report = await inspectSample(s.sample, s.media);
  assert.equal(report.messageType, 'image');
  assert.equal(report.structurallyComplete, true);
  assert.equal(report.counts.text, 0);
});

test('summary-only record cannot pass', async () => {
  const s = await setup(envelope('chatrecord', { title: 'summary only' }));
  const report = await inspectSample(s.sample);
  assert.equal(report.structurallyComplete, false);
  assert.ok(has(report, 'RECORD_ITEMS_MISSING'));
});

test('nested records expand without losing order', async () => {
  const s = await setup(envelope('chatrecord', { item: [
    textItem('first'), { type: 'chatrecord', content: JSON.stringify({ item: [textItem('nested'), imageItem()] }) }
  ] }));
  const report = await inspectSample(s.sample, s.media);
  assert.equal(report.structurallyComplete, true);
  assert.equal(report.entries[2].path, '$.item[1].item[1]');
});

test('unknown nested content is explicit, not silently discarded', async () => {
  const s = await setup(envelope('chatrecord', { item: [textItem(), { type: 'secret-unknown-type', content: {} }] }));
  const report = await inspectSample(s.sample);
  assert.equal(report.structurallyComplete, false);
  assert.ok(has(report, 'MESSAGE_TYPE_UNSUPPORTED'));
  assert.equal(JSON.stringify(report).includes('secret-unknown-type'), false);
});

test('invalid nested JSON is an incomplete record even with usable siblings', async () => {
  const s = await setup(envelope('chatrecord', { item: [textItem(), { type: 'chatrecord', content: 'bad private data' }] }));
  const report = await inspectSample(s.sample);
  assert.ok(has(report, 'CONTENT_JSON_INVALID'));
  assert.equal(report.structurallyComplete, false);
});

test('missing images block completeness and can be retried after files arrive', async () => {
  const s = await setup(envelope('image', { sdkfileid: 'private-media' }), {});
  assert.ok(has(await inspectSample(s.sample, s.media), 'MEDIA_BYTES_MISSING'));
  await writeFile(s.media, JSON.stringify({ files: { 'private-media': 'image.gif' } }));
  assert.equal((await inspectSample(s.sample, s.media)).structurallyComplete, true);
});

test('a missing media reference is not usable evidence', async () => {
  const s = await setup(envelope('image', {}));
  assert.ok(has(await inspectSample(s.sample, s.media), 'MEDIA_REFERENCE_MISSING'));
});

test('media must have image bytes, not an HTML error response', async () => {
  const s = await setup(envelope('image', { sdkfileid: 'private-media' }));
  await writeFile(join(s.dir, 'image.gif'), '<html>expired media</html>');
  assert.ok(has(await inspectSample(s.sample, s.media), 'IMAGE_FORMAT_UNVERIFIED'));
});

test('provided media size and digest must match downloaded bytes', async () => {
  for (const extra of [{ filesize: 1000 }, { md5sum: '0'.repeat(32) }]) {
    const s = await setup(envelope('image', { sdkfileid: 'private-media', ...extra }));
    assert.equal((await inspectSample(s.sample, s.media)).structurallyComplete, false);
  }
  const s = await setup(envelope('image', { sdkfileid: 'private-media', filesize: pixel.length, md5sum: digest(pixel, 'md5') }));
  assert.equal((await inspectSample(s.sample, s.media)).structurallyComplete, true);
});

test('media cannot escape its root or fetch remote URLs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kanban-path-'));
  const inside = join(root, 'inside');
  await mkdir(inside);
  await writeFile(join(root, 'outside.gif'), pixel);
  await assert.rejects(containedPath(inside, '../outside.gif'));
  await assert.rejects(containedPath(inside, 'https://example.com/image'));
  await assert.rejects(containedPath(inside, join(root, 'outside.gif')));
});

test('realpath confinement also rejects a directory junction escape', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kanban-link-'));
  const inside = join(root, 'inside');
  const outside = join(root, 'outside');
  await mkdir(inside); await mkdir(outside);
  await writeFile(join(outside, 'image.gif'), pixel);
  await symlink(outside, join(inside, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(containedPath(inside, 'link/image.gif'));
});

test('encrypted input requires an actual adapter, not synthetic parsing', async () => {
  const s = await setup({ msgid: 'id', encrypt_chat_msg: 'ciphertext' });
  const report = await inspectSample(s.sample);
  assert.equal(report.structurallyComplete, false);
  assert.ok(has(report, 'ENCRYPTED_INPUT_REQUIRES_APPROVED_ADAPTER'));
});

test('revoke and malformed identity do not qualify as new source content', async () => {
  for (const patch of [{ action: 'revoke' }, { msgid: '' }, { from: '' }]) {
    const s = await setup({ ...envelope('text', { content: 'text' }), ...patch });
    assert.equal((await inspectSample(s.sample)).structurallyComplete, false);
  }
});

test('excess nesting and oversized item arrays produce explicit limits', async () => {
  let body: any = { item: [textItem()] };
  for (let i = 0; i < 10; i++) body = { item: [{ type: 'chatrecord', content: body }] };
  for (const input of [body, { item: Array.from({ length: 501 }, () => textItem()) }]) {
    const s = await setup(envelope('chatrecord', input));
    assert.ok(has(await inspectSample(s.sample), 'RECORD_LIMIT_EXCEEDED'));
  }
});

test('re-inspection has stable source digest and makes no source mutations', async () => {
  const s = await setup(envelope('text', { content: 'request' }));
  const before = await readFile(s.sample);
  const one = await inspectSample(s.sample); const two = await inspectSample(s.sample);
  assert.equal(one.sampleSha256, two.sampleSha256);
  assert.deepEqual(await readFile(s.sample), before);
});

test('gate stays blocked with missing devices and simulated evidence', async () => {
  const s = await setup({});
  const path = join(s.dir, 'acceptance.json');
  await writeFile(path, JSON.stringify({ evidenceMode: 'fixture', cases: [] }));
  const result = await evaluateGate(path);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.cases.length, 8);
  assert.equal(result.fullDevelopmentApproved, false);
});

async function gateFixture() {
  const s = await setup(envelope('chatrecord', { item: [textItem(), imageItem(), textItem(), imageItem()] }));
  const merged = await inspectSample(s.sample, s.media);
  const imagePath = join(s.dir, 'standalone.json');
  await writeFile(imagePath, JSON.stringify(envelope('image', { sdkfileid: 'private-media' })));
  const image = await inspectSample(imagePath, s.media);
  const manifest: any = {
    evidenceMode: 'live-synthetic-data', organizationReviewer: 'synthetic-reviewer',
    adminChecks: Object.fromEntries(requiredAdminChecks.map(key => [key, { confirmed: true, notes: 'test assertion, not real evidence' }])),
    cases: requiredCases.map(id => {
      const mergedCase = id.endsWith('-merged');
      return {
        id, tester: 'synthetic-tester', clientVersion: 'synthetic-version', steps: 'test only',
        testedAt: '2026-01-01T00:00:00Z',
        sample: mergedCase ? 'sample.json' : 'standalone.json', media: 'media.json',
        sampleSha256: mergedCase ? merged.sampleSha256 : image.sampleSha256,
        imageSha256: (mergedCase ? merged : image).entries.filter(e => e.kind === 'image').map(e => e.media?.sha256),
        expectedTextCount: mergedCase ? 2 : 0, expectedImageCount: mergedCase ? 2 : 1,
        forwardedWithoutUpload: true, sourceContentCompared: true, imagesOpenedAndCompared: true, sourceOrderCompared: true,
      };
    })
  };
  const path = join(s.dir, 'acceptance.json');
  await writeFile(path, JSON.stringify(manifest));
  return { s, manifest, path };
}

test('even complete declared evidence never auto-approves live development', async () => {
  const f = await gateFixture();
  const result = await evaluateGate(f.path);
  assert.equal(result.status, 'READY_FOR_ADMIN_REVIEW');
  assert.equal(result.fullDevelopmentApproved, false);
});

test('gate binds observation to actual sample and compares source counts', async () => {
  const f = await gateFixture();
  f.manifest.cases[0].sampleSha256 = 'wrong';
  f.manifest.cases[1].expectedImageCount = 2;
  await writeFile(f.path, JSON.stringify(f.manifest));
  const result = await evaluateGate(f.path);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.cases[0].issues.includes('SAMPLE_DIGEST_MISMATCH'));
  assert.ok(result.cases[1].issues.includes('SOURCE_ITEM_COUNTS_MISMATCH'));
});

test('gate rejects duplicate cases and absent visual observations', async () => {
  const f = await gateFixture();
  f.manifest.cases.push(f.manifest.cases[0]);
  f.manifest.cases[1].imagesOpenedAndCompared = false;
  await writeFile(f.path, JSON.stringify(f.manifest));
  const result = await evaluateGate(f.path);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.cases[0].issues.includes('EXACTLY_ONE_CASE_REQUIRED'));
  assert.ok(result.cases[1].issues.includes('IMAGESOPENEDANDCOMPARED_REQUIRED'));
});

test('CLI returns failure on invalid JSON without leaking private payload', async () => {
  const s = await setup({});
  await writeFile(s.sample, '{"private-customer-data":invalid}');
  const result = spawnSync(process.execPath, ['src/preflight/cli.ts', 'inspect', s.sample], { cwd: resolve('.'), encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes('private-customer-data'), false);
});

test('CLI distinguishes incomplete evidence from malformed input', async () => {
  const s = await setup(envelope('chatrecord', { title: 'summary' }));
  const result = spawnSync(process.execPath, ['src/preflight/cli.ts', 'inspect', s.sample], { cwd: resolve('.'), encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).structurallyComplete, false);
});


test('gate detects media replacement after a visual observation', async () => {
  const f = await gateFixture();
  const changed = Buffer.from(pixel);
  changed[changed.length - 2] ^= 1;
  await writeFile(join(f.s.dir, 'image.gif'), changed);
  const result = await evaluateGate(f.path);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.cases[0].issues.includes('IMAGE_DIGESTS_MISMATCH'));
});

test('global item limit stops a wide nested record without flooding reports', async () => {
  const s = await setup(envelope('chatrecord', { item: Array.from({ length: 100 }, () => ({
    type: 'chatrecord', content: { item: Array.from({ length: 100 }, () => textItem()) }
  })) }));
  const result = await inspectSample(s.sample);
  assert.equal(result.structurallyComplete, false);
  assert.ok(result.entries.length < 500);
  assert.ok(result.issues.length < 10);
});
