import AiBot from '@wecom/aibot-node-sdk';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { TEST_MARKER, isStart, messageScope, summarize } from './message-summary.ts';

const botId = process.env.WECOM_TEST_BOT_ID;
const secret = process.env.WECOM_TEST_SECRET;
const requiredChatType = process.env.WECOM_TEST_CHAT_TYPE ?? null;
if (requiredChatType !== null && !['single', 'group'].includes(requiredChatType)) { console.error('INVALID_TEST_CHAT_TYPE'); process.exit(1); }
delete process.env.WECOM_TEST_BOT_ID;
delete process.env.WECOM_TEST_SECRET;
if (!botId || !secret) { console.error('MISSING_TEST_CREDENTIALS'); process.exit(1); }

const folder = resolve('evidence', 'wecom-probe', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(folder, { recursive: true });
const report = join(folder, 'events.jsonl');
let closed = false;
let scope: string | null = null;
let accepted = 0;
let images = 0;
let chain = Promise.resolve();
const seen = new Set<string>();
const record = async (event: string, detail: Record<string, unknown> = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), event, ...detail });
  console.log(line);
  await appendFile(report, line + '\n');
};
const safeError = (error: any) => {
  const code = String(error?.code ?? '');
  const authCode = String(error?.message ?? '').match(/\(code: (\d+)\)/)?.[1];
  return authCode ? { category: 'AUTH_ERROR', code: authCode } : { category: 'CONNECTION_OR_PROCESSING_ERROR', code: /^[A-Z_0-9]{1,40}$/.test(code) ? code : 'UNSPECIFIED' };
};
const client = new AiBot.WSClient({
  botId, secret, maxReconnectAttempts: 0, maxAuthFailureAttempts: 0,
  wsOptions: { handshakeTimeout: 15000 }, requestTimeout: 15000,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
});
const finish = async (reason: string) => {
  if (closed) return;
  closed = true;
  clearTimeout(authTimeout);
  clearTimeout(expiry);
  client.disconnect();
  await chain.catch(() => {});
  await record('STOPPED', { reason, acceptedMessages: accepted, downloadedImages: images });
  process.exit(0);
};
const authTimeout = setTimeout(() => void finish('AUTH_TIMEOUT'), 25000);
const expiry = setTimeout(() => void finish('TEN_MINUTE_LIMIT'), 10 * 60 * 1000);
client.on('connected', () => { chain = chain.then(() => record('SOCKET_CONNECTED')); });
client.on('authenticated', () => {
  clearTimeout(authTimeout);
  chain = chain.then(() => record('AUTHENTICATED', { marker: TEST_MARKER, reportFolder: folder }));
});
client.on('error', error => {
  chain = chain.then(() => record('SDK_ERROR', safeError(error)));
  void finish('SDK_ERROR');
});
client.on('event.disconnected_event', () => void finish('REPLACED_BY_ANOTHER_CONNECTION'));
client.on('disconnected', () => { if (!closed) void finish('CONNECTION_CLOSED'); });
client.on('message', frame => {
  if (closed) return;
  chain = chain.then(async () => {
    const body = frame?.body;
    if (!body) return;
    const incomingScope = messageScope(body);
    if (!incomingScope || (requiredChatType && body.chattype !== requiredChatType)) return;
    if (!scope) {
      if (!isStart(body)) return;
      scope = incomingScope;
      await record('TEST_SCOPE_ARMED', { chatType: body.chattype });
      return;
    }
    if (scope !== incomingScope || accepted >= 12) return;
    if (typeof body.msgid !== 'string' || seen.has(body.msgid)) return;
    seen.add(body.msgid);
    accepted++;
    const { publicSummary, imageRefs } = summarize(body);
    await record('TEST_MESSAGE', { number: accepted, ...publicSummary });
    for (const media of imageRefs.slice(0, 4)) {
      try {
        const url = new URL(media.url);
        const trusted = ['weixin.qq.com', 'qpic.cn', 'myqcloud.com'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
        if (url.protocol !== 'https:' || !trusted || url.username || url.password) {
          await record('IMAGE_NOT_DOWNLOADED', { reason: 'UNRECOGNIZED_MEDIA_HOST' }); continue;
        }
        const { buffer } = await client.downloadFile(media.url, media.aeskey);
        if (!buffer.length || buffer.length > 25 * 1024 * 1024) {
          await record('IMAGE_NOT_DOWNLOADED', { reason: 'UNSUPPORTED_SIZE' }); continue;
        }
        const extension = buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'png'
          : buffer[0] === 255 && buffer[1] === 216 ? 'jpg'
          : ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)) ? 'gif'
          : buffer.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : 'bin';
        const file = 'test-image-' + (++images) + '.' + extension;
        await writeFile(join(folder, file), buffer);
        await record('IMAGE_DOWNLOADED', { file, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), visualComparisonPending: true });
      } catch (error) { await record('IMAGE_DOWNLOAD_FAILED', safeError(error)); }
    }
  }).catch(async error => { await record('PROCESSING_FAILED', safeError(error)); });
});
process.on('SIGINT', () => void finish('USER_STOP'));
process.on('SIGTERM', () => void finish('USER_STOP'));
await record('STARTING', { marker: TEST_MARKER, automaticReplies: false, reconnect: false, expiresMinutes: 10, requiredChatType });
client.connect();


