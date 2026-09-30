import { verifyModel, organize } from '../src/lib/ai.ts';
import { emptyTeam } from '../src/lib/seed.ts';
try {
  const config = await verifyModel(); console.log('指定模型已在服务商列表中确认：' + config.model);
  if (process.argv.includes('--sample')) { const result = await organize(emptyTeam('synthetic-test'), [{ id: 'synthetic', sender: 'test', messageId: 'test', receivedAt: new Date().toISOString(), state: 'ready', taskIds: [], entries: [{ kind: 'text', text: '完全虚构的测试资料：测试客户 A 想更新保单通讯地址，请联系客户确认需要的材料，未约定日期。' }] }]); console.log(JSON.stringify({ model: result.model, taskCount: result.tasks.length, schemaValid: true })); }
} catch (error) { console.error(error instanceof Error ? error.message : 'AI 验证失败'); process.exitCode = 1; }
