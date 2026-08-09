# OMP Desktop 无边框与自动 Backend 启动设计

## 目标

在不改变 OMP CLI 的工作区和会话隔离模型前提下，实现以下启动体验：

- Windows、macOS、Linux 使用无原生标题栏的主窗口；应用 UI 提供可拖拽的自定义标题区和可访问的最小化、最大化/还原、关闭按钮。
- Windows 启动 OMP CLI backend 时不显示命令行窗口。
- 桌面应用启动后自动连接上次选中的未归档任务；没有任务时，创建默认工作区任务并自动连接其 OMP RPC backend。

## 范围与边界

OMP backend 继续是每个任务独立的 `rpc-ui` CLI 子进程，不引入全局 daemon，也不将 CLI 打进 Tauri sidecar。这样每个任务继续拥有独立的 `cwd`、session、模型选择和生命周期。

自动连接只作用于一个启动任务：优先使用持久化目录中上次选中的未归档任务；若无可用任务，则使用 `get_runtime_info` 的 `defaultWorkspace` 创建一个 direct task。其他任务仍由用户显式连接。Backend 启动失败不会关闭主窗口，而是将失败状态和诊断展示在当前任务中，保留重试连接入口。

## 架构

### 窗口壳

Tauri 窗口配置启用 `decorations: false`。前端增加语义化 `AppTitlebar`：中央/空白区域带 `data-tauri-drag-region`，右侧包含最小化、最大化/还原和关闭按钮。按钮调用 Tauri Window API；在浏览器预览中不渲染或禁用。Linux/Windows/macOS 均使用同一 UI 壳，保留系统级窗口操作。

### 静默 CLI 子进程

`rpc.rs` 的 `start_rpc` 按平台配置 `std::process::Command`：Windows 设置 `CREATE_NO_WINDOW`，其他平台不修改创建标志。stdout、stderr、stdin 管道、退出码和 RPC 限制保持不变，因此不会产生新的 shell 或改变协议。

### 启动自动连接

App 首次取得 `runtimeInfo` 后执行一次启动协调：

1. 读取持久化 catalog 并选择已记录的 selected task；若它归档、缺失或工作区不存在，选择最近打开的未归档任务。
2. 若没有任务，根据默认工作区创建 task，先写入 catalog，再使用其 `launchConfig` 连接。
3. 调用现有 `rpc.connect`；如 task 保存了 `sessionPath`，沿用现有恢复流程。
4. 连接错误被 reducer 投影为该 task 的 error，不重复重试、不覆盖 catalog，也不阻塞 UI。

协调器以 ref 保证 Tauri runtime 中仅运行一次；浏览器预览保持 fixture/离线行为，不启动 CLI。

## 测试与验收

- React 测试：无边框标题栏有可访问控制、浏览器预览不调用原生 Window API、自动连接选中的持久化任务、空目录创建默认任务、失败可恢复且只尝试一次。
- Rust 测试：Windows command creation flag 的平台封装在 Windows target 上可验证；CLI launch spec 和现有 RPC 管道回归继续通过。
- 验证：desktop Bun tests、Biome、tsgo、cargo fmt/test/check、Vite build、Tauri no-bundle build；在 Windows Release 中确认 backend 启动不产生 console window。

## 非目标

- 不创建全局 OMP daemon。
- 不绑定、复制或升级用户已安装的 OMP CLI。
- 不自动连接所有任务，也不在启动时执行用户 prompt。
