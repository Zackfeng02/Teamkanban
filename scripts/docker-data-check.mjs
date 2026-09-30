import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const db = new PGlite(process.env.KANBAN_DATA_DIR);
try {
  const { rows } = await db.query('SELECT id,data FROM kanban_teams ORDER BY id');
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const summary = { digest, teams: rows.length, members: rows.reduce((n,r)=>n+r.data.members.length,0), tasks: rows.reduce((n,r)=>n+r.data.tasks.length,0) };
  if (process.argv[2] === 'save') writeFileSync(process.argv[3], JSON.stringify(summary));
  else if (JSON.parse(readFileSync(process.argv[3],'utf8')).digest !== digest) throw new Error('DATABASE_CONTENT_MISMATCH');
  console.log(JSON.stringify(summary));
} finally { await db.close(); }
