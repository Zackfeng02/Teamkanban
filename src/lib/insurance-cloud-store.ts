import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Actor } from './model.ts';
import type { SavedProfile } from './insurance-profiles.ts';
import { Problem } from './security.ts';
import { prepareCloudProfile } from './insurance-cloud-validation.ts';

const globals = globalThis as unknown as { insurancePool?: pg.Pool };
function pool() {
  const local=process.env.LOCAL_INSURANCE_DATABASE_URL;
  if(local){
    const url=new URL(local);
    if(process.env.LOCAL_PREVIEW!=='true'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash)throw new Problem(503,'本地比价存储只允许本机 PostgreSQL');
    return globals.insurancePool??=new pg.Pool({connectionString:local,ssl:false,max:3,connectionTimeoutMillis:10000});
  }
  if (!process.env.INSURANCE_DATABASE_URL || !process.env.INSURANCE_DATABASE_CA) throw new Problem(503, 'Supabase 比价存储尚未配置');
  return globals.insurancePool ??= new pg.Pool({ connectionString: process.env.INSURANCE_DATABASE_URL,
    ssl: { ca: readFileSync(process.env.INSURANCE_DATABASE_CA, 'utf8'), rejectUnauthorized: true },
    max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 15000 });
}
export async function withQuoteTeam<T>(actor: Actor, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('kanban.team_id',$1,true)", [actor.teamId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function listCloudProfiles(actor: Actor): Promise<SavedProfile[]> {
  return withQuoteTeam(actor, async client => (await client.query(
    'SELECT data,version FROM kanban_private.insurance_profiles WHERE team_id=$1 ORDER BY updated_at DESC,id', [actor.teamId]
  )).rows.map(row => ({ ...row.data, version: row.version })));
}
export async function saveCloudProfile(actor: Actor, input: unknown) {
  let profile: SavedProfile;
  try { profile = prepareCloudProfile(input); }
  catch (error) { if (error instanceof Error && error.message === 'INCOMPLETE_CONFIRMATION') throw new Problem(400, '请补全比价资料并完成确认'); throw error; }
  return withQuoteTeam(actor, async client => {
    const values = [actor.teamId, profile.id, JSON.stringify(profile), actor.memberId];
    const result = profile.version === 0
      ? await client.query('INSERT INTO kanban_private.insurance_profiles(team_id,id,data,created_by,updated_by) VALUES($1,$2,$3::jsonb,$4,$4) ON CONFLICT DO NOTHING RETURNING version', values)
      : await client.query('UPDATE kanban_private.insurance_profiles SET data=$3::jsonb,updated_by=$4,updated_at=now(),version=version+1 WHERE team_id=$1 AND id=$2 AND version=$5 RETURNING version', [...values, profile.version]);
    if (!result.rows.length) throw new Problem(409, '此记录已被其他成员更新。当前修改已保留，请先导出，再刷新云端记录进行核对。');
    return { ...profile, version: result.rows[0].version };
  });
}
export async function importCloudProfiles(actor: Actor, inputs: unknown[]) {
  const profiles = inputs.map(input => prepareCloudProfile(input, true));
  return withQuoteTeam(actor, async client => {
    let imported = 0;
    for (const profile of profiles) {
      // A repeated import by the same member cannot overwrite subsequent cloud edits.
      profile.id = 'import-' + createHash('sha256').update(JSON.stringify([actor.teamId, actor.memberId, profile.id, profile.review])).digest('hex');
      profile.version = 1;
      const result = await client.query('INSERT INTO kanban_private.insurance_profiles(team_id,id,data,created_by,updated_by) VALUES($1,$2,$3::jsonb,$4,$4) ON CONFLICT DO NOTHING RETURNING id', [actor.teamId, profile.id, JSON.stringify(profile), actor.memberId]);
      imported += result.rows.length;
    }
    return { imported, skipped: profiles.length - imported };
  });
}
