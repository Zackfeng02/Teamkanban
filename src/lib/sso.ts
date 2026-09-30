import { createHash, timingSafeEqual } from 'node:crypto';
import { database, mutateTeam, readTeam, teamIds } from './store.ts';
import { authenticate, hash, Problem, token } from './security.ts';

// Explicit first-party registrations; each app has its own secret and fixed callback.
export function ssoConfig(client = 'housekeeper') {
  if (!['housekeeper', 'clientcore', 'grade128'].includes(client)) throw new Problem(400, 'Invalid client');
  const prefix = client.toUpperCase();
  const origin = process.env[prefix + '_SSO_ORIGIN'] || '';
  const secret = process.env[prefix + '_SSO_SECRET'] || '';
  if (!/^https:\/\/[^/?#]+$/.test(origin) || new URL(origin).origin !== origin || secret.length < 32) throw new Problem(503, 'SSO is not configured');
  return { origin, secret, redirect: origin + '/auth/callback', client };
}
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function clientAuth(header: string | null) {
  const name = header?.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8').split(':')[0] : '';
  const c = ssoConfig(name);
  const expected = 'Basic ' + Buffer.from(c.client + ':' + c.secret).toString('base64');
  if (!header || !equal(header, expected)) throw new Problem(401, 'Invalid client');
  return c;
}
export function authorizationInput(url: URL) {
  const p = url.searchParams, c = ssoConfig(p.get('client_id') || '');
  if (p.get('client_id') !== c.client || p.get('redirect_uri') !== c.redirect || p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256') throw new Problem(400, 'Invalid authorization request');
  const state = p.get('state') || '', challenge = p.get('code_challenge') || '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Problem(400, 'Invalid state or PKCE');
  return { state, challenge, redirect: c.redirect, client: c.client };
}
async function records() {
  const db = await database();
  await db.query(process.env.DATABASE_URL ? 'SELECT hash FROM kanban_sso LIMIT 0' : 'CREATE TABLE IF NOT EXISTS kanban_sso (hash text PRIMARY KEY, kind text NOT NULL, data jsonb NOT NULL, expires bigint NOT NULL)');
  return db;
}
type Grant = { client?: string; teamId: string; memberId: string; session: string; challenge: string; redirect: string };
async function identity(grant: Grant) {
  const team = await readTeam(grant.teamId);
  const session = team?.sessions.find(s => s.hash === grant.session && s.memberId === grant.memberId && s.expires > Date.now());
  const member = team?.members.find(m => m.id === grant.memberId && m.active);
  if (team?.demo) throw new Problem(403, '演示账号不能用于统一登录');
  if (!team || !session || !member) throw new Problem(401, '登录已失效，请重新登录');
  return { sub: team.id + ':' + member.id, username: member.login, name: member.name, expires: session.expires };
}
export async function issueCode(cookie: string | undefined, input: ReturnType<typeof authorizationInput>) {
  const actor = await authenticate(cookie);
  const grant: Grant = { ...actor, client: input.client, session: hash(cookie!.split('.')[1]), challenge: input.challenge, redirect: input.redirect };
  await identity(grant);
  const code = token(), db = await records();
  await db.query('DELETE FROM kanban_sso WHERE expires <= $1', [Date.now()]);
  await db.query('INSERT INTO kanban_sso VALUES($1,$2,$3::jsonb,$4)', [hash(code), 'code', JSON.stringify(grant), Date.now() + 60000]);
  const target = new URL(input.redirect); target.searchParams.set('code', code); target.searchParams.set('state', input.state);
  return target.toString();
}
export async function exchange(input: Record<string, unknown>, c = ssoConfig()) {
  if (input.grant_type !== 'authorization_code' || input.redirect_uri !== c.redirect || typeof input.code !== 'string' || typeof input.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier)) throw new Problem(400, 'Invalid grant');
  const db = await records();
  // Consume the code atomically; failed/replayed exchanges cannot reuse it.
  const row = (await db.query("DELETE FROM kanban_sso WHERE hash=$1 AND kind='code' AND expires>$2 AND COALESCE(data->>'client','housekeeper')=$3 RETURNING data", [hash(input.code), Date.now(), c.client])).rows[0];
  const grant = row?.data as Grant | undefined;
  const challenge = createHash('sha256').update(input.code_verifier).digest('base64url');
  if (!grant || !equal(grant.challenge, challenge) || grant.redirect !== c.redirect) throw new Problem(400, 'Invalid grant');
  const user = await identity(grant), access = token();
  await db.query('INSERT INTO kanban_sso VALUES($1,$2,$3::jsonb,$4)', [hash(access), 'access', JSON.stringify(grant), user.expires]);
  return { access_token: access, token_type: 'Bearer', expires_in: Math.max(0, Math.floor((user.expires - Date.now()) / 1000)), ...user };
}
export async function inspectAccess(access: string, c = ssoConfig()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(access)) throw new Problem(401, 'Invalid token');
  const db = await records();
  const row = (await db.query("SELECT data FROM kanban_sso WHERE hash=$1 AND kind='access' AND expires>$2 AND COALESCE(data->>'client','housekeeper')=$3", [hash(access), Date.now(), c.client])).rows[0];
  if (!row) throw new Problem(401, '登录已失效，请重新登录');
  return identity(row.data as Grant);
}
export async function revokeAccess(access: string, c = ssoConfig()) {
  const db = await records();
  const row = (await db.query("DELETE FROM kanban_sso WHERE hash=$1 AND kind='access' AND COALESCE(data->>'client','housekeeper')=$2 RETURNING data", [hash(access), c.client])).rows[0];
  if (row) { const grant = row.data as Grant; await mutateTeam(grant.teamId, t => { t.sessions = t.sessions.filter(s => s.hash !== grant.session); }); }
}
export async function accounts() {
  const result = [];
  for (const id of await teamIds()) {
    const team = await readTeam(id); if (!team || team.demo) continue;
    for (const m of team.members) if (m.active) result.push({ sub: team.id + ':' + m.id, username: m.login, name: m.name, team: team.name });
  }
  return result;
}
