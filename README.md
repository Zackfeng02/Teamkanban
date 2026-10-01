# 同程 · 团队 Kanban

一个可运行的 Next.js / React / TypeScript 团队事务应用。当前接入路线是**企业微信智能机器人单聊 → 逐条转发聊天、图片和 PDF → 在新建任务中选资料 → DeepSeek 辅助填表 → 人工核对 → 团队看板**。

合并转发卡片及嵌套记录尚未打通。界面不会把引用摘要标记成完整资料，也没有用截图上传替代这一限制。此前的会话存档检查器保留为独立诊断工具，不是当前机器人路线的实现。

## 本地运行

需要 Node.js 24.14+。

```powershell
npm ci --ignore-scripts
Copy-Item .env.example .env.local
# 为 WORKER_TOKEN 设置随机长密钥；仅存在本地 .env.local
npm run bootstrap -- "我的团队"
# 用命令返回的一次性管理员邀请码，在网页“接受邀请”中创建账号
npm run dev
# 第二个终端：
npm run worker
```

本次已生成 `.env.local`，请不要覆盖；已初始化正式团队，首次管理员邀请保存在 `.data/setup.json`。网页运行地址是 http://localhost:3000。点击“体验演示空间”可试用虚构资料；演示空间与正式团队隔离。

没有 DATABASE_URL 时，本地使用持久化 PGlite（基于 PostgreSQL 的单进程引擎），数据存放于 `.data/postgres`，附件存放于 `.data/objects`。**只能由网页进程打开本地数据库**；bootstrap、prepare-smoke 等直接访问数据库的脚本须在网页停止时运行。独立 worker 通过带凭据的内部 API 工作，不直接打开 PGlite。

正式环境设置 `DATABASE_URL` 使用 PostgreSQL 服务，设置 S3 私有桶及服务账号，关闭 `LOCAL_PREVIEW` 和 `DEMO_MODE`，配置 HTTPS 的 `APP_ORIGIN`。当通过公网隧道访问时，`WORKER_INTERNAL_ORIGIN` 仍设为 `http://127.0.0.1:3000`，避免机器人请求绕公网回环。本地启动命令仅监听 127.0.0.1；手机和团队远程访问还需要部署。

## 手机流量访问

固定入口为 `https://kanban.zmservice.ca/?page=board`，通过 Cloudflare 命名隧道 `team-kanban` 连接当前 Docker 网页服务。`.env.local` 的 `APP_ORIGIN` 为 `https://kanban.zmservice.ca`。新注册域名需等待注册局委派和公共 DNS 生效；旧的 `trycloudflare.com` 临时地址不再使用。

启动临时入口前必须先确认这是有意的公网暴露，并确保正式环境已关闭 `DEMO_MODE`、使用 PostgreSQL 和私有对象存储。启动后把输出的 HTTPS 地址发给成员，停止隧道即可撤销入口。

## Supabase 连接

已创建独立 Supabase 项目 `team-kanban`，并通过迁移创建 `public.kanban_teams` 表；匿名和 authenticated 角色均无访问策略，应用使用服务端 PostgreSQL 连接。数据库密码只能由项目管理员在 Supabase 控制台设置，连接时优先使用 Connect 中的 Session pooler（IPv4）URI：

```dotenv
DATABASE_URL=postgresql://postgres.<project-ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

设置后重启网页进程并运行 `npm run build`、`npm run typecheck`；首次启动会幂等创建应用表。切换数据库前请先备份 `.data/postgres` 和 `.data/objects`，本地既有资料不会自动迁移到新项目。

## 机器人接入

设置 `WECOM_TEAM_ID`、`WECOM_BOT_ID`、`WECOM_BOT_SECRET`，然后运行 `npm run worker`。同一机器人只运行一个连接，旧的诊断监听器需先停止。

1. 网页接受邀请、登录，打开“团队成员”并生成绑定码。
2. 将完整绑定码发送给机器人单聊；网页自动刷新绑定状态。
3. 在单聊中逐条转发文字或图片，不需要 @、引用、截图或保存到相册。
4. 打开收件箱，勾选同一事项的资料，整理或追加至已有任务。

未绑定身份不保存业务资料，不进入 AI。群聊被过滤。已绑定的单聊消息会进入收件箱，**并不是只采集带某个标记的消息**。不自动按时间拼接客户资料。转发接收时间不会冒充原始发言时间。

工作进程先将已绑定消息落入 `.data/spool`，后台确认写库后移除待同步文件。数据库按消息标识去重；任务队列采用持久化状态和租约，异常重启后可重新领取。断线期间平台没有提供历史回放承诺，**不能保证补回机器人离线时未收到的消息**，缺失消息需重新转发。图片链接过期也需要重新转发。

## DeepSeek V4.1 Flash

已实现 OpenAI 兼容的服务端适配层、严格 JSON 校验、持久化整理队列和失败重试。根据 DeepSeek 2026-09-10 的官方公告，V4.1 Flash 的 API 型号为 `deepseek-flash`。本机配置使用该型号，仍会先通过 `/models` 验证再处理任何资料。AI 只接收成员显式选中的文字及本机 OCR 提取结果；原图和 PDF 作为私有任务附件保存。新建表单使用同步逐字段识别，历史整理草稿仍由队列处理。

在 `.env.local` 设置：

```dotenv
AI_BASE_URL=https://所选服务商的兼容API根路径
AI_MODEL=deepseek-flash
AI_API_KEY=仅保存在本地的密钥
```

`AI_BASE_URL` 可包含 `/v1`，代码在其后追加 `/models`、`/chat/completions`。密钥不会自动从 SCNET_API_KEY 读取，避免把其他服务的凭据发到错误的域名。

```powershell
npm run ai:verify
npm run ai:verify -- --sample
```

第一条只核验模型列表，第二条才发送一份内置的虚构文字测试资料。图片及 PDF 原文件不会发送给 DeepSeek，其可读文字／OCR 结果用于辅助填表；没有识别出文字的附件请手工补充。所有结果在创建任务前人工核对，负责人由成员选择。聊天资料作为不可信输入，不提供工具执行权限。

## ClientCore 客户确认

AI 可从文字中提取客户名称或编号作为建议，但绝不自动绑定。已有客户任务先查找并明确确认 BMS 候选；新客报价无需查询 BMS，保持未关联。任务详情仍可手动查找并建立关联。只有明确确认过的候选才保存 `clientCoreId`、客户编号和显示名快照。名称只用于候选；图片、手机号和邮箱都不参与匹配。

Team Kanban 调用新版 ClientCoreBMS 的受限服务端接口，浏览器不会接触连接密钥或 ClientCore 登录令牌。在两个应用中配置同一个专用随机密钥（至少 32 个字符），并在 ClientCoreBMS 指定启用的成员及授权的 Kanban 团队：

```dotenv
# Team Kanban .env.local
CLIENTCORE_KANBAN_API_BASE_URL=https://clientcore.zmservice.ca/api/integrations/team-kanban/v1/
CLIENTCORE_KANBAN_API_KEY=同一个专用随机密钥

# ClientCoreBMS 服务端环境（该应用不会自动加载 .env）
BMS_KANBAN_SECRET=同一个专用随机密钥
BMS_KANBAN_MEMBER_ID=已启用的 ClientCoreBMS 成员 ID
BMS_KANBAN_TEAM_ID=授权的 Kanban 团队 ID
```

接口最多返回 10 条 `{id, clientCode, displayName, matchTypes}`，不会返回电话、邮箱、备注、附件或完整客户档案。成员选中后 Team Kanban 会以 ID 再回查一次，再保存关联；ClientCore 未配置时仍可创建未关联的新客报价；已有客户任务须先恢复连接。

新版 v1 接口还提供保单年度、资产、变更前信息及确认回执。客户查询可使用 Viewer；确认业务写入需要 ClientCoreBMS Owner，并由 Kanban 管理员明确提交。普通建卡、编辑草稿和拖动看板不会写入客户业务事实。已有旧版客户关联必须先核对 ID 映射，不能仅切换地址后沿用旧 ID。

本云端环境运行独立的虚构联调数据，未迁移已有真实客户。保险方案对比使用独立的共享存储；本地可通过 `LOCAL_PREVIEW=true` 和 `LOCAL_INSURANCE_DATABASE_URL` 指向 loopback PostgreSQL，保持团队 RLS 隔离。AI 与企业微信仍各自需要配置，连接 ClientCoreBMS 不会自动启用它们。

资料收件箱已并入新建任务表单的右侧，按任务种类区分新客和已有客户的流程；旧 `/?page=inbox` 链接打开统一新建窗口。旧版待处理草稿保留在历史草稿区。

体验演示空间不会调用 ClientCore 客户查询。请登录真实团队账号后再进行客户确认，避免演示账号接触实际客户候选。

参考：[DeepSeek 官方 API 文档](https://api-docs.deepseek.com/)、[企业微信官方机器人 SDK](https://github.com/WecomTeam/aibot-node-sdk)。

## 已实现

- 邀请制账号和密码登录、成员管理、一次性绑定码；移除成员使已有会话立即失效。
- 管理员密码恢复：在网页点击“忘记密码”，使用本机 `npm run recover-password -- --team <团队编号> --name <管理员显示名>`（或 `--login <管理员账号>`）生成 10 分钟、一次性恢复码；恢复成功会让该管理员的旧会话失效。恢复码只在命令行显示，不通过机器人或前端返回。
- 新建表单内的私人收件箱、逐项资料选择、带原文依据的 AI 填表和人工核对。
- 四列看板、负责人/类型/日期筛选、标题/客户搜索、手机状态标签。
- 负责人、截止日期、等待原因、行动清单、评论、操作人与前后值记录。
- 任务版本校验、10 秒可见页同步、管理员归档/恢复。
- 私有图片、60 秒签名链接；每次读取仍验证当前成员权限，移除成员后未过期链接也失效。

当前账号采用邀请加密码；普通登录只需账号和密码，首次注册时由邀请码绑定团队。密码恢复使用本机管理员一次性恢复码，未接入邮件验证码。SQL 用每个团队一条 JSONB 聚合记录，并通过行锁串行修改，适合当前 2–20 人范围；正式数据增长后应拆分任务/资料表并增加分页。

## 验证与边界

```powershell
npm test
npm run typecheck
npm run build
# 停止网页后准备虚构 HTTP 验收资料：
node --env-file=.env.local scripts/prepare-smoke.ts
# 启动网页后：
node --env-file=.env.local scripts/http-smoke.ts
```

历史诊断：`npm run demo`、`npm run preflight -- ...`、`npm run gate`。`gate` 只检查原先的存档/合并转发验收，不会因为本轮单聊开发而自动通过。

真实资料上线前尚需确认供应商、处理/存储地区、保留期限，完成 PostgreSQL/S3 备份恢复和 iOS/Android 真机全链路验收。当前为本机开发预览，不是已部署生产服务。

### 保险方案沟通台

入口：看板导航「保险方案对比」，或 `/insurance-review`。独立于 ClientCore，不读取或回写客户资料。

支持现有车房保险与任意数量的报价方案对比、保险公司名称编辑、原始年度保费和含税费月付、保项差异筛选、电话沟通清单、草稿和确认记录保存、JSON 导出。新增方案默认空白；所选方案必须补全公司、价格和保项并勾选确认清单后才能确认。

Profile 记录保存在访问浏览器的 localStorage，支持多客户独立保存、搜索与切换。切换或新建会先将未保存修改保存为草稿；旧单份记录作为第一个 Profile 保留。不会跨设备或团队同步；初始数据为虚构示例。更换公网域名后浏览器存储不互通，请先导出需要保留的记录。确认只保存沟通结果，不创建保单。

月付规则：车险分期费为原始年保费的 1.3%，无税；房险分期费为原始年保费的 3%，税为原始年保费的 8%，分别按 12 期估算。费用先四舍五入至分，月付按险种分别取分后合计；尾期可有分币调整。OPCF 47R 字段参考 FSRA AF-162E (2026)，不自动推断已投保或限额。旧记录加载后新增保项均为待确认，旧确认需重新核对。
车辆信息支持新增、编辑和移除（至少保留一辆）。逐车、逐方案输入原始年保费，汇总后按车险总保费计算 1.3% 分期费。缺少任一车辆报价时合计为待确认；原单车数据迁移到第一辆车。保障表仍为方案级记录，车辆保项差异可在保项值中注明车辆编号。

## Docker 运行（本机迁移）

Docker Desktop 启动后，双击 docker-start.bat 启动/更新网页和 worker。
双击 docker-stop.bat 会先停止 worker，再停止网页。
网页仍在 http://localhost:3000/；Docker 的 tunnel 服务通过 http://web:3000 提供固定公网入口。
隧道配置为 config/cloudflared.yml，专用凭据只读挂载自 .data/cloudflared/credentials.json，不进入 Git 或镜像。新机器需安全恢复此凭据。隧道随 Docker 自动重启，域名保持不变；本机和 Docker 必须保持运行。

配置沿用 .env.local，以只读文件挂载，密钥和业务数据不进入镜像。
网页单独挂载实际使用的 .data/postgres-restored-20260911 至 /data/postgres，
并挂载 .data/objects；worker 只挂载 .data/spool，通过 http://web:3000 调用网页，
不直接打开 PGlite。Supabase 保险方案继续使用原数据库和 config 下的 CA。
ClientCore 仍在宿主机运行，容器通过 host.docker.internal 访问；只有显式开启
CLIENTCORE_ALLOW_DOCKER_HOST=true 时才允许此精确主机名使用 HTTP。
固定域名使用原有账号登录。浏览器 localStorage 按域名隔离；旧域名中仍需保留的保险方案应先从原页面导出，再在新域名导入。

在本目录执行：
~~~powershell
docker compose ps
docker compose logs --tail 100 -f
docker compose up -d --build --wait
docker compose stop worker
docker compose stop web
~~~

容器配置了 unless-stopped 重启策略。Docker Desktop 必须先运行；
登录自动启动由 Docker Desktop 设置控制。网页健康检查验证带鉴权的数据库读取，
不只检查端口。worker 日志中的“机器人已连接”才表示机器人鉴权成功。
这不是合并转发或真实消息收取的端到端验收。

迁移前备份位于 .data/backups/pre-docker-*，实际路径记录在
.data/docker-backup-path.txt；包含原数据库、附件、待同步队列和配置。
备份含敏感数据，不应上传或加入版本控制。
不要让原生网页和容器同时打开同一个 PGlite 目录，也不要同时启动两个机器人 worker。
需要备份时先停 worker，再停 web，随后复制上述持久化目录和 .env.local。

回退：先 docker compose down，再在本目录执行 npm run start，
另一个终端执行 npm run worker。原来的 .env.local 未改动，仍指向同一个
宿主机数据库目录，正常回退无需恢复旧备份。原生回退时需另外配置隧道指向宿主机端口；当前隧道配置仅适用于 Docker 网页。
当前 LOCAL_PREVIEW / DEMO_MODE 配置保持原样；容器化未改变部署模式。

已有界面修改包含在镜像中；以后改动源码后需重新构建镜像。

## 统一任务创建

看板只提供“新报价”和“新保单变更”两个按钮入口。“新报价”仅用于尚未在 ClientCoreBMS 建档的客户；已有客户的保单变更（包括取消）使用“新保单变更”。暂不提供新建其他任务入口，历史任务保留。报价与一般变更的资料收件箱位于表单右侧：

- 新客报价没有 BMS 档案，直接选择资料，提取客户姓名、联系方式及车险／房屋险报价字段。任务保持未关联 BMS 客户，不自动建档。
- 已有客户的保单变更先查找并明确确认 BMS 姓名和编号，再显示资料收件箱。保存时重新向 BMS 校验客户；取消申请使用下述简洁表单。
- 保单变更先确认客户并读取、锁定旧信息，再提取拟变更字段；保存仍检查旧信息版本。

资料须由当前成员手动选择，单次最多 30 份。AI 仅填空白项；每项识别值须有原文引用。修改字段或资料选择后须重新核对。已填写内容不会被 AI 覆盖。报价表单、引用和原始附件随任务持久保存；详情中可查看创建时的完整表单。历史 AI 草稿保留在新建窗口的历史草稿区；不再提供新的“资料拆分任务”入口。外部 CanTrust 表单的原有接收接口保留。

TXT、文字 PDF、图片及扫描 PDF 支持提取；每个上传文件最多 12 MB，PDF 最多 25 页，其中最多识别 5 个扫描页。Linux 需要 Tesseract 及中文／英文语言包，使用 `OCR_COMMAND`、`OCR_LANGUAGES`、`OCR_TESSDATA_DIR` 配置。OCR 文字由本机生成，原图与 PDF 保留。点击识别后，仅所选资料的文字及 OCR 结果发送给配置的 DeepSeek 服务。缺少 AI 密钥或 OCR 无法识别时，可手动填写，不会伪造识别结果。


## 本地与 AWS 共用 ClientCoreBMS 连接

默认地址是 `https://clientcore.zmservice.ca/api/integrations/team-kanban/v1/`，本地 Node、Docker 和 AWS 都可使用；`CLIENTCORE_KANBAN_API_BASE_URL` 可显式覆盖。Compose 不再强制使用旧的本机 5174 桥接，因此发布应用代码不必另改 API 链接。旧 `.env.local` 若仍指定本机地址，应一次性更新；服务端专用 `CLIENTCORE_KANBAN_API_KEY` 仍须与 BMS 已授权配置一致。已有 AWS 覆盖配置可继续使用私有地址。

凭据只放在私有环境文件/服务器运行配置，不能提交到 Git 或传到浏览器。实际服务连通性和签名授权是两个独立检查；源码默认地址不等于已配置密钥。不增加自动部署、数据库复制或公共访问权限。

## 整单取消申请

确认已有客户后可同时选择最多八张对应年度保单，点击“读取信息”。简洁表单展示各保单全部车辆/房产、已有承保地址、明确的房产类型/用途及起止日期；缺失信息显示未记录，不以通讯地址或资产所有权推断保障。只需填写取消日期、负责人、优先级并勾选核对；不要求选择某个资产、填写变更原因或替代保障。保存按钮文字为白色。

申请快照仍由服务端保留，保存时复核每张保单，任一记录过时或日期不属于某个所选年度均拒绝整个保存。创建不会执行保险公司取消或更改 BMS 保单事实。每张保单有独立的提交、取消确认、账务和文件步骤；确认端拒绝换成另一张保单年度，完成全部必要步骤后才可关闭或归档。

导入保单可以建立申请；正式确认仍需 BMS 中经过核对的 source-to-term 关联。界面明确提示尚未关联的年度，不自动采用源记录、建单或猜测号码匹配。此前创建的任务与历史快照不自动迁移。


## 看板排序与完成保留期

任务卡可按住鼠标左键，在同一状态列内拖到另一任务之前或之后。手动顺序为团队共享，刷新后保留；筛选时排序不会删除隐藏任务。拖动不改变任务状态或优先级标签；排序图标也可点击或通过键盘将任务移到本列顶部。

进入已完成状态时记录完成时间，超过连续七天后自动归档；普通编辑和评论不延长保留期。重新打开后再次完成会重新计时；管理员恢复已归档的完成任务后可再保留一周。归档保留任务、附件和历史，可恢复。现有 worker 自动处理；打开看板也会检查，无需新增定时服务。旧完成任务优先沿用已记录的状态转换时间，无法确定完成时间的记录从首次检查起获得完整七天，待核实提交或未完成办理节点不会自动归档。续保和账务完成后也使用相同保留期。

新建保单变更只列出当前已生效、未到期且状态仍有效的保单（到期日当天不再列出）。未来年度和已取消/失效/未签发保单不列出；历史任务快照保留。对应保单的有效期仍显示供核对。期望生效日期单独填写，不与数据库旧值比较；原始字符串摘要默认折叠，展开仍可核对。
