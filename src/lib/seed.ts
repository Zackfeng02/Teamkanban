import { randomUUID } from 'node:crypto';
import type { Team } from './model.ts';
import { makeTask } from './domain.ts';
export function emptyTeam(name: string, demo = false): Team { return { id: randomUUID(), name, demo, members: [], sessions: [], invitations: [], bindings: [], bindingCodes: [], sources: [], media: [], drafts: [], tasks: [], jobs: [] }; }
export function seedDemo() {
  const team = emptyTeam('协作事务所', true); const memberId = randomUUID();
  team.members.push({ id: memberId, name: '林悦', login: 'demo', password: '', role: 'admin', active: true }, { id: randomUUID(), name: '陈浩', login: 'demo-chen', password: '', role: 'member', active: true }, { id: randomUUID(), name: '许宁', login: 'demo-xu', password: '', role: 'member', active: true });
  const actor = { teamId: team.id, memberId }; const today = new Date().toISOString().slice(0, 10); const next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const samples = [
    { title: '为苏女士准备家庭保障方案', type: 'lead', customer: '苏女士', description: '首次了解家庭保障，希望比较不同预算的方案。先确认家庭成员和现有保障。', checklist: ['确认家庭成员与现有保障','准备两档预算方案','安排一次需求沟通'], ownerId: memberId, dueDate: next, status: 'todo' },
    { title: '更新周先生的通讯地址', type: 'policy', customer: '周先生', description: '客户搬家，需要更新保单上的通讯地址。', checklist: ['确认新地址','提交保险公司变更表'], ownerId: team.members[1].id, dueDate: today, status: 'doing' },
    { title: '确认续保资料是否齐全', type: 'policy', customer: '方女士', description: '等待客户补充最新资料，收到后核对续保信息。', checklist: ['收到客户补充资料','核对续保信息'], ownerId: team.members[2].id, dueDate: null, status: 'waiting' },
    { title: '预约首次咨询', type: 'lead', customer: '何先生', description: '新客户希望下周了解保障范围，待分配同事联系。', checklist: ['联系客户确认方便的时间'], ownerId: null, dueDate: null, status: 'todo' },
    { title: '发送电子保单副本', type: 'other', customer: '叶女士', description: '电子副本已发送，客户已确认收到。', checklist: ['发送电子副本','确认客户收到'], ownerId: memberId, dueDate: null, status: 'done' },
  ];
  for (const sample of samples) { const task = makeTask(sample as any, [], actor); task.status = sample.status as any; if (task.status === 'waiting') task.waitingReason = '等待客户补充资料'; if (task.status === 'done') task.checklist.forEach(c => c.done = true); team.tasks.push(task); }
  for (const text of ['测试客户许女士：想了解一家三口的保障方案，预算还没确定，请先联系我。', '测试客户林先生：我的通讯地址有变化，需要更新保单资料，请告知要提供哪些材料。']) team.sources.push({ id: randomUUID(), sender: memberId, messageId: 'demo-' + randomUUID(), receivedAt: new Date().toISOString(), entries: [{ kind: 'text', text }], state: 'ready', taskIds: [] });
  return { team, memberId };
}
