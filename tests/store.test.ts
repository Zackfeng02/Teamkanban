import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('database survives process restart and serializes simultaneous updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanban-db-'));
  const store = pathToFileURL(resolve('src/lib/store.ts')).href; const seed = pathToFileURL(resolve('src/lib/seed.ts')).href;
  const env = { ...process.env, DATABASE_URL: '', NODE_ENV: 'test', KANBAN_DATA_DIR: join(directory, 'postgres') };
  try {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {createTeam,mutateTeam,readTeam} from ${JSON.stringify(store)}; import {emptyTeam} from ${JSON.stringify(seed)}; const team=emptyTeam('restart');await createTeam(team);await Promise.all(Array.from({length:8},(_,i)=>mutateTeam(team.id,t=>{t.sources.push({id:String(i)});})));console.log(JSON.stringify({id:team.id,count:(await readTeam(team.id)).sources.length}));process.exit(0);`], { env, encoding: 'utf8', timeout: 60000 });
    const saved = JSON.parse(output.trim()); assert.equal(saved.count, 8);
    const reread = execFileSync(process.execPath, ['--input-type=module', '-e', `import {readTeam} from ${JSON.stringify(store)}; const team=await readTeam(${JSON.stringify(saved.id)});console.log(JSON.stringify({name:team.name,count:team.sources.length}));process.exit(0);`], { env, encoding: 'utf8', timeout: 60000 });
    assert.deepEqual(JSON.parse(reread.trim()), { name: 'restart', count: 8 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
