# 从 GitHub 合并到现有 AWS 发布版本

本次改动统一新客报价、已有客户一般任务及保单变更的创建流程，加入表单右侧资料收件箱和本机 OCR。生产服务为 `https://kanban.zmservice.ca/`。

## 本地合并

当前 GitHub `main` 的基线是 `81af824`。运维记录显示，AWS 已部署的版本另有统一 `/login` 路由和 Supabase 私有 schema 接入，这些改动尚未出现在此基线中。因此，应把本次提交合并到实际生产源码分支；不要把本次云端完整工作目录或测试镜像覆盖到生产。

1. 在本地实际发布目录检查 `git status`，先提交并备份现有生产代码，保留统一登录、数据库适配及所有已有本地改动。生产 `.env`、密钥、数据库和附件保持在原有私有位置。
2. 获取本次分支，并将其提交应用到现有生产分支：

   ```bash
   git fetch origin codex/unify-task-creation
   git cherry-pick origin/codex/unify-task-creation
   ```

   若有冲突，结合两边的功能逐项合并，尤其检查 `kanban.tsx`、`domain.ts` 和客户查询接口。当前生产版本中的 `/login`、Supabase schema、TLS 校验及 SSO 功能必须保留。
3. 在合并后的完整生产源码中验证：

   ```bash
   npm ci --ignore-scripts
   npm test
   npm run build
   npm run typecheck
   ```

4. 合并后的代码推回实际生产分支，以便下次云端任务从最新版本开始。

## 生产运行条件

- 已有客户及保单变更需要可用的新版 BMS v1 API。使用现有生产 Compose 覆盖配置指定 `CLIENTCORE_KANBAN_API_BASE_URL` 和专用服务端密钥；核对 BMS 授权的团队、成员及已有客户 ID。仓库旧的 `compose.yaml` 默认指向本机旧桥接，不应替换当前 AWS 部署配置。
- 新客报价不需要 BMS 客户档案。AI 填表使用服务端 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`；发布服务器的现有密钥通过原有安全配置加载。缺少密钥时仍可手工填写。
- Dockerfile 已加入 Tesseract 简体、繁体中文及英文语言包。构建并替换应用镜像即可带入 OCR 依赖；保留原有数据库、附件卷、worker spool、网络和生产配置。不要将云端 `.env.local`、`.data` 或虚构联调数据库复制到 AWS。
- 保留现有 Supabase 连接、私有 schema、CA 校验、应用角色和统一登录配置。本次表单保存新增 JSON 字段，不包含生产数据迁移。

## 构建、发布和回滚

在本地按现有发布流程构建新镜像；不要在 2 GB AWS 主机上运行构建。保留当前线上镜像及 Compose 配置备份，再将合并后的镜像发布到现有主机。worker 使用现有顺序停启，避免两个机器人连接同时运行。

发布后检查 `/login`、看板登录、数据库/worker 健康、新客报价的无 BMS 流程、已有客户确认、保单变更旧信息锁定、图片/PDF 原件及手机页面。使用专门的测试资料，避免向真实客户发送通知或提交 BMS 业务确认。

若应用回归，回退应用镜像和部署配置，并保持当前生产数据库及附件。已有生产数据库不能直接切回早期 PGlite 快照，因为云端已有新写入。

## 当前验证范围

云端已有 127 项测试、Next.js 生产构建、类型检查、桌面/手机创建流程以及虚构 BMS 联调验证。图片及扫描 PDF 的本机 OCR 已实测。DeepSeek 填表的浏览器验证使用明确的测试响应；真实服务仍需生产密钥和在线验证。

本次 Docker 构建尝试被 Docker Hub registry 访问的 HTTP 403 阻断，容器镜像尚未验证或发布。请在本地完成合并后的 Docker 构建和运行验证。当前 AWS 服务未被本次云端任务更新。
