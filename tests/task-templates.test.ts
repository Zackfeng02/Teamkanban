import test from 'node:test';
import assert from 'node:assert/strict';
import { changeTaskType, defaultChecklist } from '../src/lib/task-templates.ts';
import type { DraftTask } from '../src/lib/model.ts';
const task = (): DraftTask => ({ title: '测试', customer: '', customerRef: null, type: 'lead', description: '', checklist: defaultChecklist('lead'), ownerId: null, dueDate: null });
test('type switches replace untouched templates but preserve customized action items', () => {
  const first = task();
  assert.deepEqual(changeTaskType(first, 'policy').checklist, defaultChecklist('policy'));
  first.checklist[0] = '客户已补充资料，请先核对';
  assert.deepEqual(changeTaskType(first, 'policy').checklist, first.checklist);
  assert.deepEqual(changeTaskType({ ...first, checklist: [] }, 'policy').checklist, defaultChecklist('policy'));
  assert.deepEqual(changeTaskType(task(), 'other').checklist, []);
});
test('editing a default checklist does not mutate later tasks', () => {
  const first = defaultChecklist('lead'); first.pop();
  assert.equal(defaultChecklist('lead').length, first.length + 1);
  assert.ok(defaultChecklist('policy').length > 0);
});
