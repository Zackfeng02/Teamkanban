import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('maintenance requires the worker credential and preserves every logical record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kanban-maintenance-'));
  const module = pathToFileURL(resolve('src/lib/maintenance.ts')).href;
  const store = pathToFileURL(resolve('src/lib/store.ts')).href;
  try {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import {maintainLocalDatabase} from ${JSON.stringify(module)};
      import {database} from ${JSON.stringify(store)};
      await assert.rejects(()=>maintainLocalDatabase(null));
      await assert.rejects(()=>maintainLocalDatabase('Bearer wrong'));
      const db=await database();
      await db.query("INSERT INTO kanban_teams VALUES('synthetic','{}')");
      for(let i=0;i<20;i++) await db.query("UPDATE kanban_teams SET data=jsonb_build_object('n',$1::int)",[i]);
      const before=await db.query('SELECT * FROM kanban_teams');
      await maintainLocalDatabase('Bearer '+process.env.WORKER_TOKEN);
      assert.deepEqual(await db.query('SELECT * FROM kanban_teams'),before);
      process.env.DATABASE_URL='postgres://synthetic';
      await assert.rejects(()=>maintainLocalDatabase('Bearer '+process.env.WORKER_TOKEN));
      console.log('PASS');process.exit(0);
    `], {env:{...process.env,NODE_ENV:'test',DATABASE_URL:'',WORKER_TOKEN:'synthetic-worker-secret-long-enough',KANBAN_DATA_DIR:join(dir,'db')},encoding:'utf8',timeout:60000});
    assert.match(output,/PASS/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
