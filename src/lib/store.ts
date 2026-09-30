import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { resolve } from 'node:path';
import type { Team } from './model.ts';

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
type Store = { query: Query; transaction: <T>(fn: (query: Query) => Promise<T>) => Promise<T> };
const globals = globalThis as unknown as { kanbanStore?: Promise<Store> };
function normalizeTeam(team: Team): Team {
  team.recoveryTokens ??= [];
  for (const task of team.tasks) if (!Object.hasOwn(task, 'customerRef')) task.customerRef = null;
  for (const draft of team.drafts) for (const task of draft.tasks) if (!Object.hasOwn(task, 'customerRef')) task.customerRef = null;
  return team;
}
async function createStore(): Promise<Store> {
  if (process.env.NODE_ENV === 'production' && process.env.LOCAL_PREVIEW !== 'true') {
    if (!process.env.APP_ORIGIN?.startsWith('https://') || process.env.DEMO_MODE === 'true' || (process.env.WORKER_TOKEN?.length ?? 0) < 32) throw new Error('PRODUCTION_CONFIGURATION_REQUIRED');
  }
  let store: Store;
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    store = { query: (sql, params) => pool.query(sql, params), transaction: async fn => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const value = await fn((sql, params) => client.query(sql, params)); await client.query('COMMIT'); return value; }
      catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } };
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.LOCAL_PREVIEW !== 'true') throw new Error('DATABASE_URL_REQUIRED');
    const db = new PGlite(process.env.KANBAN_DATA_DIR || resolve('.data/postgres'));
    store = { query: (sql, params) => db.query(sql, params), transaction: fn => db.transaction(tx => fn((sql, params) => tx.query(sql, params))) };
  }
  await store.query('CREATE TABLE IF NOT EXISTS kanban_teams (id text PRIMARY KEY, data jsonb NOT NULL)');
  return store;
}
export async function database() { return globals.kanbanStore ??= createStore(); }
export async function teamIds(): Promise<string[]> { return (await (await database()).query('SELECT id FROM kanban_teams')).rows.map(r => r.id); }
export async function readTeam(id: string): Promise<Team | null> { const team = (await (await database()).query('SELECT data FROM kanban_teams WHERE id=$1', [id])).rows[0]?.data as Team | undefined; return team ? normalizeTeam(team) : null; }
export async function createTeam(team: Team) { await (await database()).query('INSERT INTO kanban_teams(id,data) VALUES($1,$2::jsonb)', [team.id, JSON.stringify(team)]); }
export async function mutateTeam<T>(id: string, fn: (team: Team) => Promise<T> | T): Promise<T> {
  return (await database()).transaction(async query => {
    const row = (await query('SELECT data FROM kanban_teams WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row) throw new Error('TEAM_NOT_FOUND');
    const team = normalizeTeam(row.data as Team);
    const result = await fn(team);
    await query('UPDATE kanban_teams SET data=$2::jsonb WHERE id=$1', [id, JSON.stringify(team)]);
    return result;
  });
}
