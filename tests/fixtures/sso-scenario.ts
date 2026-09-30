import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ssoConfig, accounts, authorizationInput, clientAuth, exchange, inspectAccess, issueCode, revokeAccess } from '../../src/lib/sso.ts';
import { createTeam, database, mutateTeam, readTeam } from '../../src/lib/store.ts';
import { emptyTeam } from '../../src/lib/seed.ts';
import { checkPassword, hash, passwordHash } from '../../src/lib/security.ts';
import { changeOwnPassword } from '../../src/lib/domain.ts';

process.env.HOUSEKEEPER_SSO_ORIGIN = 'https://housekeeper.test';
process.env.HOUSEKEEPER_SSO_SECRET = 'synthetic-secret-long-enough-for-testing';
const redirect = 'https://housekeeper.test/auth/callback';
const verifier = 'v'.repeat(43), state = 's'.repeat(43);
const input = () => authorizationInput(new URL('https://kanban.test/api/sso/authorize?' + new URLSearchParams({ client_id: 'housekeeper', redirect_uri: redirect, response_type: 'code', state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') })));
try {
  assert.throws(() => clientAuth('Basic wrong'));
  clientAuth('Basic ' + Buffer.from('housekeeper:' + process.env.HOUSEKEEPER_SSO_SECRET).toString('base64'));
  assert.throws(() => authorizationInput(new URL('https://kanban.test/api/sso/authorize?redirect_uri=https://evil.test')));
  const team = emptyTeam('Synthetic SSO');
  team.members.push({ id: 'owner', login: 'zack-test', name: 'Test', password: passwordHash('test-original-password'), active: true, role: 'admin' });
  team.sessions.push({ hash: hash('session-secret'), memberId: 'owner', expires: Date.now() + 60000 });
  await createTeam(team);
  const cookie = team.id + '.session-secret';
  const nextCode = async () => new URL(await issueCode(cookie, input())).searchParams.get('code')!;
  const exchangeCode = (code: string, proof = verifier) => exchange({ grant_type: 'authorization_code', redirect_uri: redirect, code, code_verifier: proof });
  await assert.rejects(() => issueCode(undefined, input()));
  const badCode = await nextCode();
  await assert.rejects(() => exchangeCode(badCode, 'x'.repeat(43)));
  await assert.rejects(() => exchangeCode(badCode));
  const code = await nextCode(), access = await exchangeCode(code);
  await assert.rejects(() => exchangeCode(code));
  assert.equal((await inspectAccess(access.access_token)).sub, team.id + ':owner');
  assert.equal((await accounts()).find(a => a.sub === team.id + ':owner')?.username, 'zack-test');
  assert.equal(checkPassword('test-original-password', (await readTeam(team.id))!.members[0].password), true);
  process.env.CLIENTCORE_SSO_ORIGIN = 'https://clientcore.test';
  process.env.CLIENTCORE_SSO_SECRET = 'independent-clientcore-testing-secret';
  process.env.GRADE128_SSO_ORIGIN = 'https://grade128.test';
  process.env.GRADE128_SSO_SECRET = 'independent-grade128-testing-secret';
  for (const client of ['clientcore', 'grade128']) {
    const c = ssoConfig(client);
    assert.throws(() => clientAuth('Basic ' + Buffer.from(client + ':' + process.env.HOUSEKEEPER_SSO_SECRET).toString('base64')));
    const params = new URLSearchParams({ client_id: client, redirect_uri: c.redirect, response_type: 'code', state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    const code = new URL(await issueCode(cookie, authorizationInput(new URL('https://kanban.test/api/sso/authorize?' + params)))).searchParams.get('code')!;
    await assert.rejects(() => exchangeCode(code));
    const appAccess = await exchange({ grant_type: 'authorization_code', redirect_uri: c.redirect, code, code_verifier: verifier }, c);
    await assert.rejects(() => inspectAccess(appAccess.access_token));
    await revokeAccess(appAccess.access_token); // Another client cannot revoke this session.
    assert.equal((await inspectAccess(appAccess.access_token, c)).sub, team.id + ':owner');
    await assert.rejects(() => inspectAccess(access.access_token, c));
  }
  const expired = await nextCode();
  await (await database()).query('UPDATE kanban_sso SET expires=0 WHERE hash=$1', [hash(expired)]);
  await assert.rejects(() => exchangeCode(expired));
  await mutateTeam(team.id, t => { t.members[0].active = false; });
  await assert.rejects(() => inspectAccess(access.access_token));
  await mutateTeam(team.id, t => { t.members[0].active = true; });
  await revokeAccess(access.access_token);
  assert.equal((await readTeam(team.id))!.sessions.length, 0);
  await assert.rejects(() => inspectAccess(access.access_token));
  await mutateTeam(team.id, t => { t.sessions.push({ hash: hash('session-secret'), memberId: 'owner', expires: Date.now() + 60000 }); });
  const second = await exchangeCode(await nextCode());
  await assert.rejects(() => mutateTeam(team.id, t => changeOwnPassword(t, { teamId: team.id, memberId: 'owner' }, 'wrong', 'new-test-password')));
  await mutateTeam(team.id, t => changeOwnPassword(t, { teamId: team.id, memberId: 'owner' }, 'test-original-password', 'new-test-password'));
  await assert.rejects(() => inspectAccess(second.access_token));
  assert.equal(checkPassword('new-test-password', (await readTeam(team.id))!.members[0].password), true);
  console.log('PASS SSO: client authentication, redirect/PKCE, one-time/expired codes, stable identities, disabled members, logout and password revocation');
  process.exit(0);
} catch (error) { console.error(error); process.exit(1); }
