# Discord UI Hybrid

SillyTavern 的混合式 Discord 布局扩展：**原生数据/事件负责功能，扩展只负责布局和少量视图状态**。

## 已实现

- 预设面板、角色面板改为全屏二级页，保留左侧 64px 导轨。
- 预设页（仅 Chat Completion）：
  - 左栏占 50%，放 Logit Bias、查看/编辑偏置预设和 Prompt Manager 提示词目录。
  - 右栏放当前预设选择器、预设操作按钮和其他原生设置。
  - 左栏字号与右栏同步：正文/提示词行跟随右栏 18.75px，标题 21.375px。
  - 内容区不再限制 1600px 居中，铺满面板可用宽度，左右各 22px；左右栏仍保持 50/50，禁止横向溢出。
  - Logit 预设下拉独占整行，较长名称不再被旁边的按钮挤掉。
  - Prompt Manager 页脚“插入提示词”链图标右侧新增锁定按钮；触屏设备默认锁定，点击切换并记忆。锁定后会禁用列表 sortable，并设置 `touch-action: pan-y`，平板滚动时不会误拖动提示词。
  - 左右两栏各自固定高度并独立滚动；窄于 860px 自动上下堆叠，避免横向溢出。
  - Prompt Manager 的编辑弹窗固定在内容区居中，四周留约 15px；底部关闭/重置/保存按钮统一尺寸并对齐。
- API 连接页：
  - 左栏 50% 保留原生 API 设置（连接配置、API、来源、密钥、模型等）。
  - 右栏 50% 放原生正则扩展；打开 API 页时会把 `#regex_container` 移过去并自动展开。
  - 内容区铺满面板，左右各 22px，两栏保持 50/50，无横向溢出。
  - 两栏独立滚动，右上角 `×` 关闭。
  - 正则控件、脚本列表和编辑弹窗仍是酒馆原生节点，事件和存储不变。
- 角色页：
  - 左侧角色列表占 1/3，搜索、标签、分页也留在左列；右侧占 2/3 显示只读角色信息，结构参考用户设定管理。
  - 内容区不再使用 1500px 居中容器，铺满整个角色面板；左右各保留 22px 边距，宽屏下不会缩在中间。
  - 原生 pin 锁移到分页栏 `#bulkEditButton` 右侧，保留锁定行为；头部只保留返回键和热切换。
  - 头部、内容、右侧关闭按钮统一 22px 边距。
  - 角色页与用户设定管理的工具按钮统一为 34px 高、图标/文字居中；标签药丸统一 30px；分页、排序、搜索控件同高对齐。
  - 点击角色卡只更新右侧信息，不切换当前聊天；点击“进入聊天”才走原生角色切换。
  - 首条消息和创建者备注默认折叠，避免宏/HTML 占满信息栏。
- 关闭：
  - 全屏页右上角 `×` 关闭。
  - `Esc` 关闭当前二级页。
- 性能：
  - 不监听聊天消息 DOM，不轮询，不在生成时重渲染。
  - 不复制/重建预设和提示词数据；只把原生偏置块与 Prompt Manager 节点移到左栏。
  - 只监听两个面板的 `class`、`#main_api` 和 SillyTavern 的角色/设置事件。
  - 关闭主题最耗性能的全局面文本阴影和大面积 `backdrop-filter`；仅给消息正文保留约 12% 不透明度的轻阴影，弹窗阴影也降到 30%。

## 安装

### 通过 GitHub URL 安装（推荐）

在 SillyTavern 的「扩展 → Install extension」中粘贴：

```text
https://github.com/suyi1379-droid/st-discord-ui
```

安装后，扩展会出现在扩展列表中；原生扩展管理项自带 **更新 / 删除** 按钮，无需另外实现一套安装器。

`auto_update` 已开启，扩展更新使用 SillyTavern 原生 GitHub 更新流程。

> 同一台酒馆如果已经有本地 junction 副本，再安装 GitHub 版会出现两份扩展；保留一种即可。

> UI 主题不是扩展，不能通过 GitHub URL 直接安装。请单独把主题 JSON 导入「用户设置 → UI 主题」；本扩展会沿用当前主题变量，并提供回退色。

### 本地/离线安装

把整个目录复制到：

```text
SillyTavern/public/scripts/extensions/third-party/discord-ui/
```

或者在本机用 junction（当前开发环境就是这种方式）：

```powershell
New-Item -ItemType Junction `
  -Path "D:\A555\SillyTavern\public\scripts\extensions\third-party\discord-ui" `
  -Target "C:\AI工作目录\st-discord-ui"
```

然后刷新 SillyTavern。扩展会自动激活；可在扩展管理里禁用。

## 依赖与兼容

- 为 SillyTavern 1.19.0 编写。
- 视觉变量优先使用当前主题的 `--secondaryBg`、`--tertiaryBg`、`--primaryBlue`、`--textColor`，没有时使用 Discord 风格的回退色。
- 原生 DOM 版本升级后如果 `#ai_response_configuration`、`#rm_characters_block` 等 ID/结构变化，需要同步调整选择器。

## 已知边界

- 角色右侧是**只读信息**，不是编辑器。编辑仍走 SillyTavern 原生创建/编辑表单。
- 角色卡点击被扩展拦截为“查看信息”；进入聊天必须点右侧按钮。这是有意的，避免点击列表就把列表换掉。
- 左栏的偏置/提示词块是从原生 OpenAI 设置中移动出来的；切到非 Chat Completion API 时左栏隐藏，切回时重新显示。
- 正则容器在首次打开 API 页时移到右栏，因此扩展面板里不再显示正则；刷新酒馆或禁用本扩展即可恢复原生位置。
- 当前预设仍是原生 `<select>` 和原生操作按钮，扩展没有复制预设目录。
- 若某个预设自身会弹出配置对话框（例如 Kemini Dramatron），那是预设/其他扩展的行为，不属于本扩展。

## 开发

- `manifest.json` 的 `js`/`css` 带 `?v=` 查询串，便于本地绕过浏览器缓存；改代码后同步提升 `version` 与两个查询串。
- 入口：`index.js` 的 `init()`。
- 样式：`style.css`，全部规则限定在 `body.cw-dx` 下。
- 核心状态类：
  - `cw-dx-panel-preset` / `cw-dx-panel-character`
  - `cw-dx-char-browse`
  - `cw-dx-editing`（预留给后续原生编辑表单双栏模式）
