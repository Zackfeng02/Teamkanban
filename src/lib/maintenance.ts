import { timingSafeEqual } from 'node:crypto';
import { database } from './store.ts';
import { Problem } from './security.ts';

// Use the running connection to reclaim dead rows without opening a second PGlite instance.
export async function maintainLocalDatabase(authorization: string | null) {
  const expected = process.env.WORKER_TOKEN || '';
  const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const a = Buffer.from(expected), b = Buffer.from(provided);
  if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) throw new Problem(401, 'Unauthorized');
  if (process.env.DATABASE_URL) throw new Problem(409, 'Local database maintenance only');
  const db = await database();
  await db.query('VACUUM ANALYZE');
  await db.query('CHECKPOINT');
  return { ok: true };
}

