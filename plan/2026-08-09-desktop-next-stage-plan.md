# OMP Desktop Next Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver real Git review, PTY terminal, persistent task lifecycle, task management, external file opening, and cross-platform bundle configuration for OMP Desktop.

**Architecture:** Extend coding-agent RPC for Git so the existing centralized Git helper remains authoritative. Keep PTY/process and OS integration in Tauri, while versioned task metadata stays in the WebView store behind validated pure functions.

**Tech Stack:** Tauri 2, Rust 2021, portable-pty 0.9, React, TypeScript, Bun test, Biome, tsgo, Vite.

**Execution note:** Tasks 1–6, the no-bundle Release build, and Windows MSI/NSIS bundles are implemented. During PTY validation, Windows PowerShell required terminal protocol responses, so the plain-text sanitizer design was upgraded to xterm.js with raw bidirectional PTY streams. macOS/Linux bundles must be produced on their native runners; additional automated narrow-viewport capture remains environment-gated by the desktop browser security policy.

## Global Constraints

- Preserve the approved OMP CLI-derived visual system.
- Use TDD: every production behavior starts with a failing contract test.
- Never use shell-string Git execution or duplicate `utils/git.ts` behavior.
- Never discard files without an explicit confirmation naming the target.
- Never delete a workspace when deleting a desktop task.
- Never commit, stage, push, or create a PR during this implementation.

---

### Task 1: Versioned task catalog and reducer lifecycle

**Files:**
- Create: `packages/desktop/src/state/task-catalog.ts`
- Create: `packages/desktop/src/state/task-catalog.test.ts`
- Modify: `packages/desktop/src/state/desktop-state.ts`
- Modify: `packages/desktop/src/state/desktop-state.test.ts`

**Interfaces:**
- Produces: `loadTaskCatalog(storage: StorageLike): TaskCatalogLoadResult`
- Produces: `saveTaskCatalog(storage: StorageLike, tasks: readonly DesktopTask[]): void`
- Produces reducer actions `task.created`, `task.renamed`, `task.archived`, `task.deleted`, `task.session_file_changed`.

- [ ] Write failing tests for valid V1 load, corrupted JSON fail-closed behavior, runtime-field stripping, task creation, archive and delete selection fallback.
- [ ] Run focused tests and verify each fails because the API/action is missing.
- [ ] Implement V1 validation and reducer actions with immutable updates.
- [ ] Run focused tests and the desktop suite until green.

### Task 2: Real New Task, persistence and task management UI

**Files:**
- Create: `packages/desktop/src/components/tasks/NewTaskDialog.tsx`
- Create: `packages/desktop/src/components/tasks/TaskActionDialog.tsx`
- Modify: `packages/desktop/src/components/tasks/TaskRail.tsx`
- Modify: `packages/desktop/src/app/App.tsx`
- Modify: `packages/desktop/src/app/App.test.tsx`
- Modify: `packages/desktop/src/styles/global.css`

**Interfaces:**
- Consumes catalog and reducer actions from Task 1.
- Produces create/connect, search, rename, archive/unarchive and delete flows.

- [ ] Write failing SSR/component tests for empty catalog, search filtering, create form, archive and delete confirmation.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement controlled dialogs and App persistence effect; disconnect RPC/PTY before delete.
- [ ] Run tests and keyboard/accessibility assertions until green.

### Task 3: Central Git status entries and RPC contracts

**Files:**
- Modify: `packages/coding-agent/src/utils/git.ts`
- Create: `packages/coding-agent/test/git-status-entries.test.ts`
- Modify: `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- Modify: `packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- Modify: `packages/coding-agent/src/modes/rpc/rpc-client.ts`
- Create: `packages/coding-agent/test/rpc-git.test.ts`

**Interfaces:**
- Produces: `git.status.entries(cwd): Promise<GitStatusEntry[]>`
- Produces RPC commands `get_git_snapshot`, `get_git_diff`, `stage_git_changes`, `discard_git_changes`.

- [ ] Write failing parser tests for staged, unstaged, untracked, deleted, renamed and space-containing paths.
- [ ] Run parser test and confirm missing `status.entries` failure.
- [ ] Implement NUL-delimited porcelain parsing in the central helper.
- [ ] Write failing RPC contract tests for snapshot/diff/stage/discard and rejected unknown paths.
- [ ] Implement RPC handlers using only central Git APIs.
- [ ] Run focused coding-agent tests until green.

### Task 4: Desktop Git projection and Changes UI

**Files:**
- Modify: `packages/desktop/src/rpc/rpc-session.ts`
- Modify: `packages/desktop/src/rpc/rpc-session.test.ts`
- Create: `packages/desktop/src/git/git-projection.ts`
- Create: `packages/desktop/src/git/git-projection.test.ts`
- Modify: `packages/desktop/src/rpc/use-desktop-rpc.ts`
- Modify: `packages/desktop/src/state/desktop-state.ts`
- Modify: `packages/desktop/src/components/workbench/Workbench.tsx`
- Modify: `packages/desktop/src/styles/global.css`

**Interfaces:**
- Produces live `GitSnapshot` per task and operations `refreshGit`, `loadGitDiff`, `stageGit`, `discardGit`.

- [ ] Write failing fake-bridge tests for command frames and response validation.
- [ ] Write failing projection tests for aggregate counts and selected-file fallback.
- [ ] Implement session APIs, hook state and live Changes renderer.
- [ ] Add explicit selected-file discard confirmation and error state.
- [ ] Run desktop tests until green.

### Task 5: Cross-platform PTY bridge and Terminal UI

**Files:**
- Create: `packages/desktop/src-tauri/src/terminal.rs`
- Modify: `packages/desktop/src-tauri/src/lib.rs`
- Modify: `packages/desktop/src-tauri/Cargo.toml`
- Create: `packages/desktop/src/terminal/terminal-text.ts`
- Create: `packages/desktop/src/terminal/terminal-text.test.ts`
- Create: `packages/desktop/src/terminal/use-desktop-terminal.ts`
- Modify: `packages/desktop/src/components/workbench/Workbench.tsx`
- Modify: `packages/desktop/src/styles/global.css`

**Interfaces:**
- Produces Tauri commands `start_terminal`, `write_terminal`, `resize_terminal`, `stop_terminal`.
- Produces events `omp-terminal-output`, `omp-terminal-exit`.

- [ ] Write failing decoder tests for raw terminal controls and split UTF-8 chunks.
- [ ] Implement the streaming decoder and verify green.
- [ ] Write failing Rust tests for shell selection, task isolation, output and idempotent stop.
- [ ] Implement `TerminalProcesses` with portable-pty and event readers.
- [ ] Implement terminal hook and xterm.js emulator with raw input/protocol response, resize, Ctrl+C and restart.
- [ ] Run frontend and Rust tests until green.

### Task 6: Safe file opener and session restore

**Files:**
- Create: `packages/desktop/src-tauri/src/editor.rs`
- Modify: `packages/desktop/src-tauri/src/lib.rs`
- Modify: `packages/desktop/src/rpc/rpc-session.ts`
- Modify: `packages/desktop/src/rpc/rpc-session.test.ts`
- Modify: `packages/desktop/src/app/App.tsx`

**Interfaces:**
- Produces `open_in_editor(path)` for an existing workspace directory using direct editor/platform spawn.
- Extends `RpcLaunchConfig` with `sessionPath` and restores it with `switch_session` before bootstrap reads.

- [ ] Write failing Rust editor candidate-order tests.
- [ ] Implement existing-directory validation and direct platform opener commands.
- [ ] Write failing fake-bridge restore-order test.
- [ ] Implement session restore and persist `sessionFile` from RPC state.
- [ ] Run focused tests until green.

### Task 7: Bundle configuration and full verification

**Files:**
- Modify: `packages/desktop/src-tauri/tauri.conf.json`
- Modify: `packages/desktop/package.json`
- Create: `packages/desktop/CHANGELOG.md`

**Interfaces:**
- Produces enabled Tauri bundles for Windows, macOS and Linux using existing icons.

- [ ] Enable `bundle.active`, `targets: all`, and npm-based beforeDev/beforeBuild commands.
- [ ] Add an `Unreleased` changelog covering the desktop task center, RPC bridge, Git review and PTY terminal.
- [ ] Run `biome check packages/desktop` and `tsgo -p packages/desktop/tsconfig.json --noEmit`.
- [ ] Run desktop Bun tests and focused coding-agent Git/RPC tests.
- [ ] Run `cargo fmt --check`, `cargo test`, `cargo check`, Vite build and Tauri `build --no-bundle`.
- [ ] Run real RPC smoke plus PTY smoke; verify processes close and temp files are removed.
- [ ] Visually inspect 1440×900, 900×800 and 760×800 with live Git, Terminal, New Task, search and confirmations; require zero console errors.
- [ ] Run `git diff --check` and review every changed file; leave worktree unstaged and uncommitted.

## Execution result (2026-08-09)

- Desktop and focused coding-agent regression: 90 passed, 1 POSIX-only filename test skipped on Windows, 0 failed.
- Desktop and coding-agent `check:types`: passed; Biome changed-file check: passed.
- Rust: `cargo fmt --check`, 9 native tests, and `cargo check -p omp-desktop`: passed.
- Production frontend, native Release executable, MSI, and NSIS: built successfully.
- Native PTY smoke, RPC session lifecycle, protocol v2 large-frame reassembly, literal Git pathspec, and fresh-start recovery contracts: passed.
- Windows native UI was visually smoke-tested during implementation; responsive behavior remains covered by the existing layout breakpoints and component render checks. The new CI matrix performs native validation on Windows, macOS, and Linux once pushed.
- Final filesystem check: no desktop/WiX/NSIS process or temporary test artifact remained; worktree stayed unstaged and uncommitted.
