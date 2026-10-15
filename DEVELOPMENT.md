# 开发与维护规范

本文面向 Byteiq Browser 的日常开发、代码审查和长期维护。它描述当前仓库的结构，并规定新增和修改代码时应遵循的约定。`MUST` 表示必须遵守，`SHOULD` 表示通常应遵守；如需例外，应在 PR 中说明原因和后续安排。

## 1. 项目基线

- 应用使用 Electron，入口为 `src/main/main.js`，界面由 `src/renderer` 提供。
- 当前主要支持 Windows 10/11；打包配置在 `package.json`，目标为 Windows NSIS 安装包。
- 当前 README 要求 Node.js 18 或更高版本、npm 9 或更高版本。依赖和命令以 `package.json` 为准，格式以 `.prettierrc` 和 `eslint.config.js` 为准。
- 新增依赖前 MUST 先确认标准库或现有依赖不能满足需求；在 PR 中说明用途、维护状态和运行时影响。
- 当前 `.gitignore` 排除了 npm lockfile，仓库没有跟踪 `package-lock.json`。因此安装结果目前无法由仓库锁定。维护者 SHOULD 单独确定并记录 lockfile 策略；在此之前，依赖变更的 PR MUST 写明包名、版本和验证方式。

## 2. 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/main/main.js` | Electron 主进程启动、窗口创建和功能注册入口 |
| `src/main/modules/` | 主进程业务逻辑、网络请求、持久化和 IPC 注册模块 |
| `src/main/modules/ipc/` | 按功能组织的 IPC handler |
| `src/main/preloads/` | 为渲染上下文提供受限能力的 preload 脚本 |
| `src/renderer/index.html` | 渲染进程 HTML 入口 |
| `src/renderer/layout-loader.js`、`fragments/` | 页面布局片段加载与组织 |
| `src/renderer/renderer.js` | 渲染进程界面初始化入口 |
| `src/renderer/modules/` | UI、标签页、AI、翻译、存储等功能模块 |
| `src/renderer/styles.css`、`styles/` | 样式入口与分功能样式表 |
| `src/renderer/locales/` | 界面文案翻译 JSON 文件 |
| `tests/` | Jest 自动化测试，配置见 `jest.config.js` |
| `assets/` | 应用静态资源 |

新增功能 SHOULD 放到相应领域目录中。只有在确实承担应用启动或跨领域编排职责时，才修改入口文件；避免把更多业务实现堆入 `main.js` 或 `renderer.js`。

## 3. 进程边界与安全

Electron 主进程负责系统能力、窗口、持久化和特权操作；渲染进程负责界面和用户交互。新增跨进程能力 SHOULD 通过职责明确的 IPC handler 提供，不应把文件、shell、凭据或任意系统访问能力直接交给页面代码。

新增或修改 IPC 时 MUST：

1. 定义稳定且范围最小的 channel、参数和返回值。
2. 在主进程校验来自渲染进程的参数；不能仅依赖界面校验。
3. 对失败情况返回可处理的结果或抛出有边界的错误，不泄露凭据和本地敏感路径。
4. 对流式或可取消任务维护任务标识，并在成功、失败、取消及窗口销毁时清理监听器和活动请求。
5. 为新的 handler 添加覆盖正常路径和错误路径的测试。

### 现有主窗口安全债务

当前 `src/main/main.js` 创建的主窗口启用了 `nodeIntegration` 并关闭了 `contextIsolation`，渲染代码也依赖这一兼容方式。该配置是现存架构，不是新增窗口应采用的标准。新建窗口 MUST 使用 `nodeIntegration: false`、`contextIsolation: true`，并通过最小化的 preload API 暴露所需能力。迁移主窗口配置前，维护者 MUST 盘点渲染代码的 Node.js 直接依赖，分阶段迁移并覆盖主要流程；不得只切换开关后留下不可用功能。

处理网页、扩展页面或其他不受信任内容时，MUST 按不可信输入对待。不得向网页暴露主进程对象、密钥或不必要的 IPC；不得使用 `eval`、`new Function` 或拼接可执行脚本来规避模块边界。

## 4. 代码与界面约定

- JavaScript 使用 `.prettierrc` 的实际设置：2 空格缩进、单引号、分号，格式化宽度为 100 列。格式化配置优先于旧文档中的手写示例。
- `eslint.config.js` 中的错误级规则 MUST 修复；新增 lint 忽略或规则例外时，应说明范围和原因。
- 函数和模块 SHOULD 保持单一职责，优先使用显式参数和返回值，避免依赖隐式全局状态。
- 用户可见文案 MUST 通过 `src/renderer/locales/` 和 `i18n.js` 管理，不应散落硬编码在界面逻辑中。
- 新增翻译 key 时 MUST 更新所有现有语言文件：`en-US`、`ja-JP`、`ko-KR`、`ru-RU`、`zh-CN`、`zh-TW`。插值参数名应在各语言保持一致。
- 样式 SHOULD 放在对应的 `styles/` 文件中；新增样式时同步检查 `styles.css` 的加载关系，并兼顾深色主题及现有面板布局。
- DOM 文本 SHOULD 使用 `textContent` 或安全的 DOM API。只有经过明确清洗的内容才可作为 HTML 渲染。

## 5. 数据、设置与兼容

- 修改已有设置 key 或存储格式前，MUST 搜索所有读写方，保留旧数据兼容或提供迁移路径。
- AI 历史使用 IndexedDB。调整对象仓库或索引时，MUST 更新 `src/renderer/modules/storage/ai-history/schema.js` 的数据库版本和升级逻辑，并验证旧数据库可打开。
- 从旧格式迁移数据时，迁移 SHOULD 可重复执行，单条数据失败不应无声地丢弃其余数据；日志不得包含明文凭据或敏感用户内容。
- 对外可见的 IPC 参数、持久化字段和 AI 工具参数都视为接口。重命名或删除前 MUST 检查调用方，并在 PR 中说明兼容策略。

## 6. 测试与本地检查

测试使用 Jest，测试文件匹配 `tests/**/*.test.js` 和 `__tests__/**/*.js`。新增业务行为 SHOULD 添加可重复的自动化测试；测试优先验证行为和边界条件，不应只验证实现细节。

提交前按改动范围运行适用检查：

```bash
npm test
npm run lint
npm run format:check
```

`npm run format` 会改写 `src/**/*.js`，只应在有意格式化时运行。涉及界面、浏览器窗口、IPC 或打包配置的改动，还 SHOULD 在开发环境启动应用并手动检查相应流程。PR 描述 MUST 记录实际运行的检查和未运行的检查及原因。

## 7. 功能变更流程

1. **界定范围**：说明用户可见行为、受影响模块、持久化数据和 IPC 接口。
2. **追踪依赖**：搜索调用方、事件监听器、文案 key 和配置读写点；跨进程改动同时检查两端契约。
3. **小步实现**：沿用已有模块边界；避免把无关重构混入功能变更。
4. **验证行为**：新增或更新测试，运行适用的 lint、格式检查和手动流程。
5. **同步文档**：若入口命令、目录结构、接口、数据格式、安全边界或支持平台发生变化，更新本文以及 README/CONTRIBUTING 中对应说明。
6. **提交审查**：PR 说明目的、实现范围、兼容影响、验证结果和关联问题。涉及用户界面的改动附上截图或录屏；涉及数据迁移的改动写明升级和回滚风险。

分支类型和提交格式沿用 [CONTRIBUTING.md](CONTRIBUTING.md)。提交信息使用 `<type>(<scope>): <subject>`，例如 `fix(tabs): 修复标签页关闭后的焦点恢复`。

## 8. 重要设计记录

当架构、存储格式、IPC 契约或安全策略的决定会影响后续维护时，SHOULD 新增一份简短的设计记录。每份记录应包含：

- 背景和要解决的问题；
- 选定方案及未选方案的原因；
- 对数据兼容、安全、性能和维护成本的影响；
- 迁移步骤、验证方式和责任人（如有）。

设计记录使用 `decisions/NNNN-简短主题.md` 命名；决定被替代时保留旧记录，并在新记录中注明替代关系，避免历史约定失去上下文。

## 9. 维护本文

本文以仓库实际配置和代码为准。维护以下内容时，应在同一 PR 中更新本规范：

- `package.json` 命令、Node/Electron 版本和打包目标；
- `src/main`、`src/renderer` 的入口或目录职责；
- IPC、设置、AI 工具和持久化数据契约；
- locale 列表、测试配置、lint/format 规则；
- Electron 安全配置或支持平台。

发现本文与代码不一致时，先确认是代码已演进还是文档过期，再同步更新两者；不要通过复制新旧规则来掩盖冲突。
