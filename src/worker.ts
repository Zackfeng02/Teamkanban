import AiBot from '@wecom/aibot-node-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Keep worker-to-web traffic on the local loopback when APP_ORIGIN is a public
// tunnel URL. This avoids an unnecessary public round trip and keeps the
// worker usable when the tunnel is restarted or temporarily unavailable.
const origin = process.env.WORKER_INTERNAL_ORIGIN || process.env.APP_ORIGIN || 'http://localhost:3000';
const secret = process.env.WORKER_TOKEN;
if (!secret) throw new Error('WORKER_TOKEN_REQUIRED');
const spool = resolve('.data/spool'); await mkdir(spool, { recursive: true });
const api = async (body: unknown) => { const result = await fetch(origin + '/api/worker', { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(160000) }); if (!result.ok) throw new Error('WORKER_API_UNAVAILABLE'); return result.json(); };
let stopping = false; let connected = false; let senders = new Set<string>(); let chain = Promise.resolve();
let sequence = 0;
const teamId = process.env.WECOM_TEAM_ID;
let bot: InstanceType<typeof AiBot.WSClient> | undefined;
async function refreshBindings() { if (teamId) senders = new Set((await api({ op: 'bindings', teamId })).senders); }
await refreshBindings();
if (process.env.WECOM_BOT_ID && process.env.WECOM_BOT_SECRET && teamId && !process.argv.includes('--jobs-only')) {
  bot = new AiBot.WSClient({ botId: process.env.WECOM_BOT_ID, secret: process.env.WECOM_BOT_SECRET, maxReconnectAttempts: 5, maxAuthFailureAttempts: 0, logger: { debug() {}, info() {}, warn() {}, error() {} } });
  bot.on('authenticated', () => { connected = true; console.log('机器人已连接；仅接收已绑定成员的单聊资料，不自动回复'); });
  bot.on('disconnected', () => { connected = false; console.log('机器人连接已断开'); });
  bot.on('event.disconnected_event', () => { stopping = true; bot?.disconnect(); console.error('连接被替换，请确认只运行一个接入进程'); });
  bot.on('error', () => console.error('机器人连接异常，请检查配置')); // Never log SDK frames, URLs or secrets.
  bot.on('message', frame => {
    const capturedAt = new Date().toISOString();
    chain = chain.then(async () => {
      const body: any = frame.body;
      if (body?.chattype !== 'single' || typeof body.from?.userid !== 'string' || typeof body.msgid !== 'string') return;
      if (body.msgtype === 'text' && /^KB-[a-zA-Z0-9]{16}$/.test(String(body.text?.content || '').trim())) { await api({ op: 'ingest', teamId, body }); await refreshBindings(); return; }
      if (!senders.has(body.from.userid)) return;
      const encoded = JSON.stringify({ teamId, body, capturedAt }); if (Buffer.byteLength(encoded) > 500000) { console.error('资料超过接入大小限制，请分批转发'); return; }
      const file = Date.parse(capturedAt) + '-' + String(sequence++).padStart(8, '0') + '-' + createHash('sha256').update(teamId + ':' + body.msgid).digest('hex') + '.json'; const temp = join(spool, randomUUID() + '.tmp');
      await writeFile(temp, encoded, { mode: 0o600 }); await rename(temp, join(spool, file));
    }).catch(() => console.error('接收持久化失败；请确认收件箱内是否出现资料，缺失时重新转发'));
  });
  bot.connect();
} else console.log('任务队列进程已启动；机器人连接未配置');
async function intakeLoop() {
  while (!stopping) {
    try {
      await refreshBindings();
      for (const file of (await readdir(spool)).sort()) { if (!/^\d{13}-\d{8}-[a-f0-9]{64}\.json$/.test(file)) continue; const path = join(spool, file); const item = JSON.parse(await readFile(path, 'utf8')); await api({ op: 'ingest', ...item }); await unlink(path); }
    } catch { console.error('资料同步暂时失败，本地待同步资料已保留'); }
    await new Promise(r => setTimeout(r, 3000));
  }
}
async function jobsLoop() {
  while (!stopping) {
    try { const { teamIds } = await api({ op: 'teams' }); for (const id of teamIds) { if (stopping) break; await api({ op: 'tick', teamId: id }); } }
    catch { console.error('任务队列暂时不可用，将稍后重试'); }
    await new Promise(r => setTimeout(r, 3000));
  }
}
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { stopping = true; bot?.disconnect(); });
await Promise.all([intakeLoop(), jobsLoop()]); await chain;
console.log(connected ? '接入进程已停止' : '任务队列已停止');
