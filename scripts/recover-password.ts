import { readFile } from 'node:fs/promises';

function value(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const setupPath = '.data/setup.json';
let teamId = value('--team');
if (!teamId) {
  try { teamId = (JSON.parse(await readFile(setupPath, 'utf8')) as { teamId?: string }).teamId; } catch { /* an explicit --team can be used for deployed spaces */ }
}
let login = value('--login');
const name = value('--name');
const origin = (process.env.WORKER_INTERNAL_ORIGIN || 'http://127.0.0.1:3000').replace(/\/$/, '');
const workerToken = process.env.WORKER_TOKEN;
if (!teamId || (!login && !name) || (login && name) || !workerToken) throw new Error('用法：npm run recover-password -- --team <团队编号> --login <管理员账号> 或 --name <管理员显示名>');
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)) throw new Error('WORKER_INTERNAL_ORIGIN 必须指向本机网页地址');
const request = async (body: unknown) => fetch(origin + '/api/worker', { method: 'POST', headers: { Authorization: 'Bearer ' + workerToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
if (name) {
  const listing = await request({ op: 'listAdmins', teamId });
  if (!listing.ok) throw new Error('无法查找管理员账号，请检查团队编号和网页进程');
  const result = await listing.json() as { admins?: { login: string; name: string }[] };
  const matches = (result.admins ?? []).filter(item => item.name.trim() === name.trim());
  if (matches.length !== 1) throw new Error('管理员显示名未唯一匹配，请改用 --login 指定登录账号');
  login = matches[0].login;
}
const response = await request({ op: 'issueRecovery', teamId, login });
if (!response.ok) throw new Error('无法生成恢复码，请检查团队编号、管理员账号和网页进程');
const result = await response.json() as { code?: string; expiresMinutes?: number };
if (!result.code) throw new Error('恢复码生成失败');
console.log(`恢复码（${result.expiresMinutes ?? 10} 分钟内有效，仅可使用一次）：${result.code}`);
console.log('请在网页“忘记密码”中输入团队编号、管理员账号、恢复码和新密码。');
