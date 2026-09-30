import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { listCloudProfiles, saveCloudProfile, importCloudProfiles, withQuoteTeam } from '../src/lib/insurance-cloud-store.ts';
import { blankProfile } from '../src/lib/insurance-profiles.ts';
const actor = { teamId: `quotes-qa-${randomUUID()}`, memberId: 'synthetic-member' };
const other = { teamId: `quotes-qa-${randomUUID()}`, memberId: 'synthetic-other' };
writeFileSync('.data/quotes-qa-cleanup.json', JSON.stringify([actor.teamId,other.teamId]));
try {
  const profile = { id: randomUUID(), review: blankProfile(), status: 'draft', paymentView: 'year' };
  const saved = await saveCloudProfile(actor, profile);
  assert.equal(saved.version, 1);
  assert.equal((await listCloudProfiles(actor)).length, 1);
  assert.equal((await listCloudProfiles(other)).length, 0);
  assert.equal((await withQuoteTeam(other, c => c.query('SELECT id FROM kanban_private.insurance_profiles WHERE team_id=$1', [actor.teamId]))).rows.length, 0);
  await assert.rejects(withQuoteTeam(other, c => c.query("INSERT INTO kanban_private.insurance_profiles(team_id,id,data,created_by,updated_by) VALUES($1,'denied','{}','qa','qa')", [actor.teamId])), /row-level security/);
  const concurrent = await Promise.allSettled([saveCloudProfile(actor, saved), saveCloudProfile(actor, saved)]);
  assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(x => x.status === 'rejected' && x.reason.status === 409).length, 1);
  const imp1 = await importCloudProfiles(actor, [profile]);
  const imp2 = await importCloudProfiles(actor, [profile]);
  assert.equal(imp1.imported, 1); assert.equal(imp2.skipped, 1);
  console.log('PASS: TLS, create/read, team isolation, RLS write denial, concurrent conflict, idempotent import');
} finally { await (globalThis as any).insurancePool?.end(); }
