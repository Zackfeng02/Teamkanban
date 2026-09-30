# Supabase 比价存储

比价 Profiles 位于 `team-kanban` (ofkpympfqwlirsnfmyuq, ca-central-1) 的 `kanban_private.insurance_profiles`，不在公开 Data API schema 中。现有账号/看板数据库保持原有连接。

- 服务端变量：`INSURANCE_DATABASE_URL`（独立 kanban_quotes_app 账号）和 `INSURANCE_DATABASE_CA`（官方根证书）。不要将凭据放入 NEXT_PUBLIC 变量。连接字符串不要附加覆盖驱动 CA 的 sslmode 参数。
- schema 参考 `insurance-profiles.sql`；已通过 Supabase migration 应用。文件中的密码占位符必须替换为随机秘密后才能在新环境执行。
- GET/POST `/api/insurance-profiles` 每次验证当前有效成员，写入还检查 Origin。团队 ID 来自登录会话。
- 数据库账号只有此表的 SELECT/INSERT/UPDATE 权限；RLS 使用事务内 `kanban.team_id` 隔离数据。成员不接触数据库账号。
- 新记录 version=0；更新必须匹配数据库 version，否则返回409并保留网页修改。
- 浏览器旧记录通过导入按钮迁移，不删除本地原件。相同成员重复导入相同内容不会覆盖云端；不同内容作为另一份记录保留。旧确认记录缺少新字段时转为草稿。
- 记录按当前团队共享。云端保存成功后，其他设备登录同一团队并打开/刷新比价页即可读取。编辑中断网不会声称保存成功，请导出未保存修改。
- 67项测试及真实Supabase合成数据验证：TLS证书校验、读写、RLS跨团队隔离/拒绝写入、并发冲突、重复导入。`scripts/verify-insurance-cloud.ts` 用独立合成团队，生成的清理目标在 `.data/quotes-qa-cleanup.json`，测试后由管理员按这些精确ID删除测试行。
- 生产完整备份/恢复演练尚不在本次验收中。

参考：https://supabase.com/docs/guides/database/connecting-to-postgres 和 https://supabase.com/docs/guides/platform/ssl-enforcement
