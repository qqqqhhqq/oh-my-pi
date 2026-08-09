# OMP Desktop 无边框与自动 Backend 启动实施计划

**Goal:** 让 OMP Desktop 使用无边框窗口、静默启动 Windows backend，并在应用启动时自动连接一个任务 backend。

**Architecture:** Tauri 保留每 task 一个 RPC CLI 子进程；前端启动协调器只选择一个持久化任务或创建默认任务。窗口操作封装在前端标题栏组件，Windows 子进程隐藏逻辑封装在 Rust command 配置。

**Tech Stack:** Tauri 2、Rust、React、TypeScript、Bun test、Biome、tsgo。

## 约束

- 不创建全局 daemon 或 sidecar；继续发现并复用用户已安装的 OMP CLI。
- Browser preview 不调用 native Window API 或启动 CLI。
- 每个新增行为先写可观察的失败测试。
- 不暂存、提交或推送 Git。

### Task 1：无边框标题栏

**Files:** `tauri.conf.json`、`src/components/runtime/AppTitlebar.tsx`、对应测试、`App.tsx`、`global.css`。

- [ ] 写标题栏渲染与 native 控制失败测试。
- [ ] 运行测试确认因组件缺失而失败。
- [ ] 添加无边框 Tauri 配置、拖拽区和最小化/最大化/关闭控制。
- [ ] 运行组件与桌面测试。

### Task 2：静默子进程与自动连接

**Files:** `src-tauri/src/rpc.rs`、`src-tauri/src/lib.rs`、`src/app/App.tsx`、启动协调器模块及测试。

- [ ] 写启动任务选择和单次自动连接失败测试。
- [ ] 运行测试确认因协调器缺失而失败。
- [ ] 实现平台 command 配置、选择持久化任务/默认任务、一次性连接与错误投影。
- [ ] 运行 Rust、桌面和集成测试。

### Task 3：交付验证

- [ ] 运行 Biome、tsgo、Vite、cargo fmt/test/check、Tauri no-bundle build。
- [ ] 在 Windows Release 启动应用，确认无 console window 且 backend 自动连接。
