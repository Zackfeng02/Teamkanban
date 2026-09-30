# 管理员接入验证手册

## 要证明的链路

普通微信／企业微信 → 合并转发至专用企业微信联系人 → 已授权的存档接口 → 实际文字和图片。

用户已确认当前组织尚未开通会话存档；先核实试用／开通条件，再决定测试方式。目前未获得组织接口配置及真实设备测试证据。候选联系人不是“自建应用”或“智能机器人”；不能用它们的 API 收到图片来替代本路线的验证。

核实项：组织资格、已开通产品及版本、原生或服务商接口、接收联系人、存档席位及报价、授权和告知要求、实际采集范围、消息和媒体处理地区、解密方法、媒体获取方法、保留及拉取时限。不要将“应用只保留某联系人消息”表述成“平台只采集这些消息”。

用户已授权评估条件及费用，没有授权购买或扩大采集范围。先给出具体配置和报价；需要付费或改变范围时单独确认。不要把 Secret、私钥、access token 粘贴到聊天或提交到代码。

## 实测步骤

1. 管理员确认组织可用产品和对应的当前官方／服务商接口文档。若只有专区分析能力而无法导出所需内容，记录具体限制。
2. 使用专用测试接收联系人和虚构内容。操作人员按平台实际要求完成授权流程。
3. 在微信源会话准备至少两条文字、两张不同测试图片；包含不同发言者和清晰顺序。不要只发送聊天记录标题。
4. 用 iOS 普通微信合并转发至接收联系人，再单独转发一张图片。重复 Android 普通微信、iOS 企业微信、Android 企业微信，共八个场景。
5. 通过已获授权的接口获取这些消息并解密，取得对应媒体字节。只检查本次主动转发的虚构测试内容；不扩大检索到其他会话。
6. 对照源会话检查正文、图片数量、图片内容和顺序。记录实际提供的作者与时间；接口没有给出的字段标记缺失，不能从转发者推测。
7. 将脱敏后的虚构消息、图片和观察记录放入 evidence/。不要修改内容或结构来迎合检查器。若当前接口形状不同，应根据真实文档调整适配器及测试。
8. 补测嵌套记录、多事项、多张图片、重复转发、媒体获取失败；无法展开的内容必须明确记录。服务重启／断点恢复属于之后真实同步器的验收，当前工具不声称覆盖它。

## 离线样本输入

目前只实现一个**待真实样本校准的候选原生存档形状**，不声称兼容所有存档产品：

```json
{
  "msgid": "synthetic-message-id",
  "action": "send",
  "from": "synthetic-forwarder",
  "msgtype": "chatrecord",
  "chatrecord": {
    "title": "虚构记录",
    "item": [
      { "type": "text", "content": "{\"content\":\"虚构文字\"}" },
      { "type": "image", "content": "{\"sdkfileid\":\"synthetic-media-id\"}" }
    ]
  }
}
```

检查器支持正文为 JSON 字符串或对象的 text、image、chatrecord、mixed 条目，按数组顺序保留路径，可递归到 8 层；最多访问 500 个条目。未知类型、只有摘要的记录、加密输入、损坏 JSON、缺失图片均不标记完整。撤回及其他非 send 事件也不标记为可建卡资料。

只有 child.from / child.msgtime 实际存在时才报告作者／时间可用，不继承外层转发者。输出中的正文长度与摘要用于比对，报告不输出正文。

若真实接口字段或封装不同，检查失败代表本适配器未校准，不直接代表微信产品不支持。不要为了通过检查而手工编造原始消息字段。

图片映射文件，例如 evidence/media.json：

```json
{ "files": { "synthetic-media-id": "media/test-image.png" } }
```

路径相对于映射文件，不能逃出该目录（包括符号链接），不允许 URL。图片须已由授权接口取得。检查文件存在、大小上限 25 MiB、常用图片文件签名，并在样本提供时核对 filesize 和 md5sum；输出 SHA-256 供记录核对。**文件签名检查不能证明图片可解码或内容正确，必须人工打开图片与来源对照。** 其他图片格式需要实测后补充支持。

```powershell
npm run preflight -- inspect evidence/sample.json --media evidence/media.json
```

保存报告中的 sampleSha256 到该真机场景记录，用来锁定被检查样本。

## 验收表

复制 docs/acceptance.template.json 到 evidence/acceptance.json。每个场景填写：
- tester、testedAt（ISO 时间）、clientVersion、steps。
- sample、media：相对于验收表目录的路径。
- sampleSha256：检查器报告中的样本摘要；imageSha256：按条目顺序填写图片 SHA-256 数组，锁定人工核对过的图片。
- expectedTextCount、expectedImageCount：人工对照源会话得到的数量。
- forwardedWithoutUpload：确实通过转发完成。
- sourceContentCompared、sourceOrderCompared、imagesOpenedAndCompared：实际对照后的结论。

merged 场景至少两条文字和两张图片；image 场景为独立图片。模板中不能仅勾选结果，必须留下原始证据供管理员审阅。

```powershell
npm run gate
```

BLOCKED 表示缺材料或检查不完整；READY_FOR_ADMIN_REVIEW 仅表示可供管理员复核。该工具不会证明证据真实性，也不会批准开发、付费或变更授权。

管理员复核后在 docs/status.md 留下日期、测试记录引用、能力限制和批准结论，才可进入完整开发。转发接口尚未通过验证时，不把截图上传作为替代入口。

## 参考与证据状态

- [企业微信官方机器人 SDK](https://github.com/WecomTeam/aibot-node-sdk)：本次已读取，支持图片等消息；未列出 chatrecord，不能证明合并转发可接入。
- [候选会话存档官方文档入口](https://developer.work.weixin.qq.com/document/path/91774)：本次环境未能读取，不能据此宣称已验证字段、当前价格或海外主体资格。
- 真实接口、媒体获取、客户端操作、当前费用和区域条件：待管理员验证。不要复用网络旧报价作为当前报价。



