# Desktop Task Selection Auto-Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make selecting a persisted Desktop task restore its OMP RPC session automatically, with visible connecting/error states and an explicit retry path.

**Architecture:** Keep session ownership in `useDesktopRpc`; add a small pure selection policy in `runtime/startup-task.ts` so the React shell only decides when a selected task needs a connection. The existing reducer remains the source of truth for runtime status, while App exposes a recoverable connection error instead of swallowing a failed selection connection.

**Tech Stack:** React, TypeScript, Bun tests, Tauri 2, existing `DesktopRpcSession` bridge.

## Global Constraints

- Work only in `D:/360MoveData/Users/11549/Desktop/oh-my-pi/.worktrees/desktop-agent-ui` on branch `codex/desktop-agent-ui`.
- Preserve the existing RPC protocol and task catalog format.
- Do not create multiple live sessions for one task or reconnect a task already connecting/connected.
- Follow TDD: each behavior starts with a failing contract test, then the smallest implementation.
- Use the existing central RPC and state helpers; do not add a second transport or process launcher.

---

### Task 1: Define the selection connection policy

**Files:**
- Modify: `packages/desktop/src/runtime/startup-task.ts`
- Test: `packages/desktop/src/runtime/startup-task.test.ts`

**Interface:**

```ts
export function shouldAutoConnectSelectedTask(
	available: boolean,
	task: DesktopTask | undefined,
	status: RpcConnectionStatus | undefined,
): boolean;
```

- [x] Write a failing test proving a native, disconnected persisted task should connect, while preview, archived, connecting, and connected tasks should not.
- [x] Run the focused startup-task test and confirm the new assertion fails for the missing helper.
- [x] Implement the pure policy using the existing runtime status values.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Restore a selected task from App

**Files:**
- Modify: `packages/desktop/src/app/App.tsx`
- Modify: `packages/desktop/src/components/tasks/TaskRail.tsx` only if an accessible retry action needs to be surfaced there
- Test: `packages/desktop/src/app/App.test.tsx`

**Behavior:**

- Selecting a persisted task in native Tauri dispatches selection first, then calls `rpc.connect(task.id, task.launchConfig, task.sessionPath)` when the policy allows it.
- A failed connection stores a visible, recoverable error for the selected task instead of silently discarding the error.
- A retry action reuses the same persisted launch configuration and session path.
- Browser preview keeps its fixture behavior and does not attempt native RPC.

- [x] Add a failing runtime policy contract test for the selected-task recovery and retry boundary.
- [x] Run that focused test and confirm it fails because the selection policy did not exist.
- [x] Implement a single guarded `connectSelectedTask` path and expose an explicit retry action in the existing connection surface.
- [x] Run the focused App and runtime tests.

### Task 3: Verify native behavior and handoff

**Files:**
- Update: `packages/desktop/CHANGELOG.md` under `Unreleased` if the package convention requires a user-visible entry.

- [x] Run `bun test` and `bun run check` from `packages/desktop`.
- [x] Run `bun run build` and `cargo check -p omp-desktop`.
- [x] Launch the native Tauri app, switch between two persisted tasks, and confirm the selected task enters `connecting` and then `connected` without duplicate processes.
- [x] Confirm a failed connection leaves the task selectable and the retry action visible.
- [ ] Run `git diff --check`, review the diff, commit with a Conventional Commit message, push `codex/desktop-agent-ui`, and verify the remote head.
