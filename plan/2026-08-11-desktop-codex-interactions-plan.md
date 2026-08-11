# Codex-style Desktop Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing OMP Desktop worktree behave like the Codex desktop reference across primary buttons, the prompt lifecycle, and conversation presentation while preserving the real Tauri/RPC backend.

**Architecture:** Keep the existing Tauri bridge and `DesktopRpcSession` as the only backend transport. Add missing interaction state at the desktop reducer/session boundary, project richer RPC messages and agent events into stable conversation blocks, and keep React components focused on rendering and dispatching user intent. Controls without an OMP RPC capability are hidden or explicitly marked unavailable rather than pretending to work.

**Tech Stack:** React, TypeScript, Bun/Vitest, Tauri 2, Rust, `lucide-react`, `react-markdown`, `remark-gfm`.

## Global Constraints

- Work only in `D:/360MoveData/Users/11549/Desktop/oh-my-pi/.worktrees/desktop-agent-ui` on branch `codex/desktop-agent-ui`.
- Preserve all existing tracked and untracked worktree changes; do not reset, checkout, or commit.
- Use the existing `DesktopRpcSession`/Tauri bridge for live behavior; browser preview may render fixtures but must not claim native capabilities.
- Follow TDD: add one behavior-level failing test, run it red, implement the smallest change, then run it green.
- Never introduce `any`, `ReturnType<>`, dynamic imports, or duplicate Git/process helpers.
- User-visible text must be valid UTF-8 and must not contain the current mojibake placeholders.

---

### Task 1: Make conversation projection lossless for Codex-style turns

**Files:**
- Modify: `packages/desktop/src/state/desktop-state.ts`
- Modify: `packages/desktop/src/rpc/rpc-projection.ts`
- Modify: `packages/desktop/src/rpc/rpc-projection.test.ts` or create it if absent
- Modify: `packages/desktop/src/components/conversation/ConversationPane.tsx`
- Test: `packages/desktop/src/components/conversation/ConversationPane.test.tsx`

**Interfaces:**
- `projectMessages(messages)` continues to return `ConversationEntry[]` but preserves assistant streaming status, tool call identity, tool arguments, partial output, and tool results.
- `projectAgentEvent(entries, event)` upserts the same stable entry for `message_update` and tool execution updates so the transcript does not duplicate streamed content.
- `ConversationPane` renders user bubbles, assistant Markdown, notices, and grouped tool turns with explicit running/failed/completed states.

- [x] **Step 1: Write a failing projection test** for a streamed assistant message followed by a tool call update and result; assert one assistant entry, one tool entry, preserved tool id/arguments, and final statuses.
- [x] **Step 2: Run the focused projection and conversation tests** and verify the new assertion fails because the current projection drops the fields or duplicates entries.
- [x] **Step 3: Implement the minimal richer entry shape and projection updates** using the existing RPC event types and stable ids.
- [x] **Step 4: Add a failing component test** for the visible states: streaming assistant indicator, collapsed completed tool group, expanded running tool group, error notice, and a copy action.
- [x] **Step 5: Implement the Codex-style transcript rendering** with copy-to-clipboard and safe links while preserving existing Markdown behavior.
- [x] **Step 6: Run focused tests and inspect the rendered browser preview** at desktop and narrow widths.

### Task 2: Complete the prompt lifecycle controls

**Files:**
- Modify: `packages/desktop/src/components/conversation/ConversationPane.tsx`
- Modify: `packages/desktop/src/components/conversation/ConversationPane.test.tsx`
- Modify: `packages/desktop/src/rpc/use-desktop-rpc.ts`
- Modify: `packages/desktop/src/state/desktop-state.ts`
- Modify: `packages/desktop/src/state/desktop-state.test.ts`

**Interfaces:**
- Prompt submission keeps the draft until the backend acknowledges it, then clears it and focuses the composer.
- A running task exposes stop; a failed assistant turn exposes retry using the last user prompt; sending while streaming follows the existing OMP prompt/steer semantics instead of silently disabling the whole composer.
- RPC failures become transcript-visible notices and recoverable task state.

- [x] **Step 1: Write failing tests** for draft retention on failed prompt, stop dispatch while streaming, retry of the latest user turn, and recoverable error notice projection.
- [x] **Step 2: Run focused tests and verify the expected failures.**
- [x] **Step 3: Add the smallest reducer/RPC/component changes** for retry, stop, error recovery, and correct submit state.
- [x] **Step 4: Add keyboard behavior tests** for Enter submit, Shift+Enter newline, Escape stop, and disabled-submit rules.
- [x] **Step 5: Run focused and full frontend tests.**

### Task 3: Activate the composer controls that have real backend support

**Files:**
- Modify: `packages/desktop/src/components/tasks/SessionComposer.tsx`
- Modify: `packages/desktop/src/components/tasks/SessionComposer.test.tsx`
- Modify: `packages/desktop/src/components/conversation/ConversationPane.tsx`
- Modify: `packages/desktop/src/rpc/rpc-session.ts`
- Modify: `packages/desktop/src/rpc/use-desktop-rpc.ts`
- Modify: `packages/desktop/src/app/App.tsx`

**Interfaces:**
- Model, thinking, approval mode, project context, and local-folder actions have visible selected states and call the matching RPC/config path.
- Attach/context opens the native file/folder picker when Tauri is available and reports the selected context in the draft; browser preview keeps a clear unavailable state.
- No composer control remains disabled merely because it was not implemented.

- [x] **Step 1: Write failing component tests** for model menu selection, thinking slider update, approval mode cycle, and attach/context behavior.
- [x] **Step 2: Run the focused composer tests and verify they fail for the current disabled controls.**
- [x] **Step 3: Implement live control wiring through `DesktopRpcSession` and the existing Tauri dialog bridge.**
- [x] **Step 4: Add error/loading states so controls do not lose the selected value during RPC refresh.**
- [x] **Step 5: Run focused tests and verify the native build still type-checks.**

### Task 4: Make sidebar and workbench actions honest and usable

**Files:**
- Modify: `packages/desktop/src/components/tasks/TaskRail.tsx`
- Modify: `packages/desktop/src/components/tasks/TaskActionDialog.tsx`
- Modify: `packages/desktop/src/components/workbench/Workbench.tsx`
- Modify: `packages/desktop/src/app/App.tsx`
- Modify: related component tests

**Interfaces:**
- New chat, project session creation, session selection, archive/restore, favorite, rename, delete, connect/disconnect, refresh, stage, discard confirmation, editor launch, terminal actions, and workbench tab selection all have observable behavior.
- Scheduled/Plugins/Settings are either backed by a real OMP capability or removed from the active action set with a clear non-action presentation.
- Task selection preserves the selected task, composer draft, and workbench tab correctly.

- [x] **Step 1: Write failing tests** for every visible enabled action and for unavailable actions not being rendered as misleading disabled buttons.
- [x] **Step 2: Run focused component/state tests and verify failures.**
- [x] **Step 3: Implement missing handlers and accessible action labels using existing state and RPC methods.**
- [x] **Step 4: Run the task/workbench test set and exercise each action in the browser preview where possible.**

### Task 5: End-to-end verification and handoff

**Files:**
- Modify: `packages/desktop/CHANGELOG.md`
- Verify: `packages/desktop/src-tauri/src/rpc.rs`
- Verify: `packages/desktop/src/rpc/rpc-session.ts`

- [x] **Step 1: Run frontend tests, `bun --cwd=packages/desktop run check`, and production build.**
- [x] **Step 2: Run `cargo test -p omp-desktop` and `cargo check -p omp-desktop`.**
- [x] **Step 3: Start the browser preview, verify desktop and narrow layouts, and inspect console errors.**
- [x] **Step 4: Run a real `rpc-ui` backend smoke that covers ready, protocol negotiation, state, messages, and a safe Git read command.**
- [x] **Step 5: Run `git diff --check`, review the final worktree status, and report all remaining intentionally unavailable capabilities without committing.**
