# Team Kanban 设计规范

## 导航面板：必须复用的 element

所有正式工作空间页面必须使用 `src/components/workspace-shell.tsx` 的 `WorkspaceShell`。它统一拥有导航面板、顶部栏、内容偏移、桌面/手机断点及打印行为。

- **禁止复制侧栏 JSX，禁止每个页面各写一套 navigation panel。**
- `WorkspaceNavigation` 仅由 `WorkspaceShell` 渲染，桌面和手机使用同一份链接 DOM 与配置，避免顺序、名称、选中态不一致。
- 页面列表的唯一来源是 `src/lib/workspace-pages.ts`。新增页面时先登记 id、kind、href、label、shortLabel、icon（新独立页面使用 kind: route；local 仅用于看板内部视图），再将页面正文放入 `WorkspaceShell`。
- 导航的字体、颜色、尺寸、间距、断点仅在 `src/components/workspace-shell.module.css` 中定义。页面 CSS 不得覆盖导航，不得使用 `.sidebar`、`.mobile-nav` 等全局导航类，不得添加自己的导航偏移。
- 页面正文 className（例如 `app`、`ir`）由 shell 放在导航的兄弟内容区域内；导航不能放在页面专属样式容器中。
- 桌面宽度 216px，1150px 以下为 196px；720px 以下切换为底部导航。以上值由 shell 独占，正文使用 `--workspace-gutter`，不重复硬编码侧栏宽度。
- 导航链接必须有真实 href、`aria-current` 和键盘焦点；Ctrl/Cmd 点击保持浏览器原生打开方式。新页面自行提供业务数据和退出逻辑，不得在导航里添加业务数据写入。

```tsx
<WorkspaceShell page="insurance" data={navigationData} onLogout={logout}
  className="my-page" status={<span>同步状态</span>}>
  <main>页面内容</main>
</WorkspaceShell>
```

## 视觉系统

沿用 Galaxy 演示板已确认的鼠尾草绿、暖白、细边框和克制动效。页面采用 28px 标题、8–10px 卡片圆角、相同的内容边距。正式样式在 `src/app/workspace-theme.css`；导航和交互组件使用 CSS Modules 隔离。

复用 `workspace-controls.tsx` 中的 ActionButton、DensitySwitch、BookmarkButton、TaskMenu；新增使用场景不能拷贝出另一套控件 CSS。普通提交/危险操作保留真实业务语义，不套用带加号的新建按钮。

- 聚焦搜索：低饱和绿色外圈。
- 新建操作：右侧图标短距离滑动，始终保留文字。
- 任务卡：轻微悬浮；正文按钮和收藏/菜单为兄弟节点，禁止嵌套按钮。
- 收藏：仅浏览器个人偏好，key 按 team / member / task 隔离，不改变团队任务。
- 资料卡：低饱和两层叠纸，悬停收拢，资料内容始终可见。
- 减少动态效果设置必须被尊重；所有交互有键盘焦点。
- 保险极简模式的隐藏、淡化和 OPCF 显示规则保持业务逻辑独立，不用样式重写报价计算。

## 新页面验收

检查桌面和手机两种尺寸；与看板、保险对比页比较导航 bounding box、字体、字号、行高、间距。点击后检查 active 链接、内容偏移、滚动和底部安全区。检查新建/详情/筛选以及浏览器返回。运行类型检查、测试与 production build。

Galaxy 来源及 MIT 许可保存在 `docs/galaxy-sources`。`/design-demo` 是历史方案演示，不作为正式页面布局模板。
