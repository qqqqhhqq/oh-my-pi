# OMP Desktop 下一阶段设计

## 目标

把当前桌面 UI MVP 完善为可日常使用的本地任务中心：任务可创建和恢复，Changes 展示真实 Git 状态并支持明确的 stage/discard 操作，Terminal 是真实 PTY，会话可搜索、归档和删除，应用具备 Windows、macOS、Linux 打包配置。

## 已确认约束

- 桌面壳保持 Tauri 2 + React + TypeScript，不能退回纯 Web 应用。
- 视觉继续复用 OMP CLI 的 block-π、`dark.json` 色义和 Lucide 线性语义图标。
- Git 实现必须复用 `packages/coding-agent/src/utils/git.ts`，不能在桌面包复制一套 Git runner。
- 用户内容、路径和命令使用 mono；导航和操作文字使用 UI sans。
- destructive Git 操作必须由用户明确触发并二次确认。
- 不自动打开外部 URL，不自动删除任务工作目录，不自动提交或推送 Git。
- 当前工作只留在 `codex/desktop-agent-ui` worktree，不创建 commit。

## 方案比较

### A. Local-first hybrid（采用）

Git 通过 coding-agent RPC 扩展，PTY 和 OS 文件打开通过 Tauri 原生服务，任务目录使用 WebView localStorage 的版本化数据。优点是复用 OMP 已硬化的 Git helper，同时终端不污染 agent 对话上下文；边界清晰且跨平台。

### B. 所有操作走 RPC bash

接入速度快，但 Git 解析会重复、终端命令会进入 agent session、没有持续 PTY，也难以可靠处理 resize 和 Ctrl+C，因此不采用。

### C. 独立本地 daemon

长期可扩展，但会引入额外进程协议、安装和升级面；当前阶段属于过度设计，因此不采用。

## 架构

### 任务目录与恢复

新增纯函数模块 `task-catalog.ts`，定义 `PersistedTaskCatalogV1`，只持久化任务身份、标题、workspace、启动配置、OMP session file、归档状态和最近访问时间。进程状态、stderr、PTY buffer 不持久化。应用启动时验证 JSON；损坏或未知版本 fail closed 到空目录，并显示可恢复错误，而不是加载部分错误数据。

Browser preview 继续使用 fixture，Tauri runtime 使用持久化目录。New Task dialog 创建唯一 task，立即保存并尝试连接 OMP。RPC `get_state` 返回的 `sessionFile` 写回目录；下次连接时桌面 session 先发 `switch_session`，再加载 state/messages/subagents。

### Git Changes

扩展 coding-agent RPC：

- `get_git_snapshot`：返回 branch、repo root、文件状态、staged/unstaged、additions/deletions。
- `get_git_diff { path }`：返回指定状态文件的 staged + unstaged patch。
- `stage_git_changes { paths? }`：空 paths 等价于 `git add -A`。
- `discard_git_changes { paths }`：只接受当前 status 中的精确路径；tracked 文件 restore 到 HEAD，untracked 文件使用集中 helper 的精确 clean。

`git.status.entries()` 作为集中解析能力加入 `utils/git.ts`。Changes 默认选择第一项，显示真实 diff；动作完成后刷新 snapshot。Apply changes 的产品语义明确为 Stage，按钮文案改为 `Stage all`。Discard 只作用于选中文件，并显示包含路径的确认对话。

### PTY Terminal

Tauri 管理 `TerminalProcesses`，每个 task 最多一个 `portable-pty` 会话。命令：`start_terminal`、`write_terminal`、`resize_terminal`、`stop_terminal`；事件：`omp-terminal-output`、`omp-terminal-exit`。Shell 选择 Windows PowerShell，POSIX 使用 `$SHELL` 或 `/bin/sh`。前端使用 xterm.js 渲染原始 ANSI/OSC 流，并把键盘输入、binary protocol response（包括 Windows PowerShell 启动时的 DSR 回应）、resize、Ctrl+C 和 restart 发送回 PTY。终端不进入 agent transcript。

### 任务管理

Task Rail 增加搜索模式，并按 title、workspace、branch 匹配。选中任务的 action menu 支持 rename、archive/unarchive、delete。Archive 不删除文件或 session；Delete 只删除本地目录记录并停止对应 RPC/PTY，不碰 workspace。删除需要确认。

### 打开 workspace 与打包

Tauri `open_in_editor` 只接受已存在的 workspace directory，并按 `code`、`codium`、platform file manager 的顺序直接 spawn，不经过 shell。Changes 的 Open editor 打开当前 task workspace。

Tauri bundle 启用 `targets: all` 并复用现有 ico/icns/png。beforeDev/build 使用 npm script runner，避免 GUI 环境中 Bun 不在 PATH 导致 Tauri 启动失败；仓库安装仍由 Bun 管理。

当前发布边界是“Desktop UI + 本机 OMP runtime”，不把平台相关的 OMP binary 复制为 Tauri sidecar。Release 会依次从 `OMP_DESKTOP_CLI`、GUI 进程 PATH、官方安装目录和 Bun 全局目录发现 OMP；连接对话框仍允许显式覆盖绝对路径。CI 在 Windows、macOS、Linux 上分别构建前端并执行 native runtime / PTY tests，避免跨平台声明只在单一开发机上成立。

## 错误处理

- RPC Git failure 显示在 Changes panel，不改变 conversation 状态。
- PTY 启动或退出保留最后输出和 exit code，允许 restart。
- 任务目录解析错误保留原始 storage 内容，不覆盖，UI 提示 reset catalog。
- 外部 opener 返回启动错误；不会回退到 shell 拼接。
- destructive action 失败后保留确认对话中的路径和错误，便于重试。

## 测试策略

- 纯单元测试：catalog validation、status parser、terminal UTF-8 stream decoder、state transitions、search/archive/delete。
- RPC contract：fake bridge 验证 Git 命令、session restore 顺序和响应投影。
- Rust tests：PTY shell spec、path containment、idempotent stop；使用短命令验证 output/exit 生命周期。
- 集成验证：Biome、tsgo、desktop Bun tests、focused coding-agent tests、cargo fmt/test/check、Vite build、Tauri no-bundle build。
- 视觉验证：Windows Release 原生窗口，以及 CSS 的 desktop/tablet/narrow 三档布局；检查 Changes、Terminal、New Task、search、confirm dialog 和控制台错误。

## 完成标准

上述功能全部使用真实数据，不在 live runtime 展示 fixture；自动测试和构建均通过；三档 viewport 无横向溢出；关闭测试进程并清理临时文件；不提交 Git。
