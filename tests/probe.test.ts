import test from 'node:test';
import assert from 'node:assert/strict';
import { isStart, messageScope, summarize, TEST_MARKER } from '../src/probe/message-summary.ts';
test('probe only arms from a text test marker and scopes sender plus chat', () => {
  assert.equal(isStart({ msgtype: 'text', text: { content: '@bot ' + TEST_MARKER } }), true);
  assert.equal(isStart({ msgtype: 'image' }), false);
  assert.equal(messageScope({ chattype: 'group', from: { userid: 'user' } }), null);
  assert.notEqual(messageScope({ chattype: 'group', from: { userid: 'user' }, chatid: 'one' }), messageScope({ chattype: 'group', from: { userid: 'user' }, chatid: 'two' }));
});
test('probe records text evidence without leaking user content, identity or media credentials', () => {
  const result = summarize({ msgid: 'private-id', msgtype: 'mixed', chattype: 'group', mixed: { msg_item: [
    { msgtype: 'text', text: { content: 'TEST-LEAD private-customer' } },
    { msgtype: 'image', image: { url: 'https://private.example', aeskey: 'private-key' } }
  ] } });
  assert.equal(result.publicSummary.content[0].testLead, true);
  assert.equal(result.imageRefs.length, 1);
  assert.equal(JSON.stringify(result.publicSummary).includes('private'), false);
  assert.equal(result.publicSummary.mergedRecordVerified, false);
});
test('quote and unknown record are visible but do not masquerade as complete merged text', () => {
  const result = summarize({ msgtype: 'text', text: { content: 'test' }, quote: { msgtype: 'chatrecord', chatrecord: { title: 'summary' } } });
  assert.equal(result.publicSummary.quotePresent, true);
  assert.equal(result.publicSummary.content[1].kind, 'chatrecord');
  assert.equal(result.publicSummary.mergedRecordVerified, false);
});

