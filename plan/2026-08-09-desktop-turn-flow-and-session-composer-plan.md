# Desktop Turn Flow and Session Composer Implementation Plan

**Goal:** Deliver one expandable, scrolling tool execution flow per agent turn and replace the New session modal with an in-window configured session composer.

**Architecture:** Keep durable project/session persistence in the existing catalog and reducer. Add a pure turn-group projection for conversation entries, then render it in the transcript. Add a transient `SessionComposer` view owned by App for drafting configuration and the first prompt before creating a task.

**Tech Stack:** React, TypeScript, Bun tests, Tauri desktop runtime, existing OMP RPC bridge.

## Constraints

- Preserve the existing `DesktopTask` catalog and project ownership invariant.
- Do not add a new backend API or dependency.
- Completed execution flows are collapsed; active and failed flows are open.
- Use `bun run check`, focused tests, full desktop tests, and native build for validation.

### Task 1: Project tool calls into turn-scoped execution flows

**Files:**
- Modify: `packages/desktop/src/state/desktop-state.ts`
- Modify: `packages/desktop/src/rpc/rpc-projection.ts`
- Test: `packages/desktop/src/rpc/rpc-projection.test.ts`

- [ ] Write a failing projection test with two `tool_execution_*` events under one `turn_start`/`turn_end`; assert both entries share one turn id and preserve their individual status.
- [ ] Run `bun test src/rpc/rpc-projection.test.ts`; confirm the new assertion fails because tool entries lack a turn id.
- [ ] Add an optional `turnId` to `ConversationEntry`; track the active turn in projection and attach it to tool events, falling back to a stable historic turn id for restored tool results.
- [ ] Run the focused projection test and confirm it passes.

### Task 2: Render one scrolling execution card per turn

**Files:**
- Modify: `packages/desktop/src/components/conversation/ConversationPane.tsx`
- Modify: `packages/desktop/src/styles/global.css`
- Test: `packages/desktop/src/components/conversation/ConversationPane.test.tsx`

- [ ] Write a failing rendering test asserting two tool entries for one turn produce one execution card with two step disclosures, and a completed card has no `open` attribute.
- [ ] Run the focused rendering test; confirm it fails against independent per-tool cards.
- [ ] Group adjacent tool transcript entries by `turnId`; render the group through an execution card with an auto-scrolling steps container and per-step details for raw output.
- [ ] Run focused conversation tests and confirm the completed card is collapsed and active cards remain expanded.

### Task 3: Replace NewTaskDialog with an in-window session composer

**Files:**
- Create: `packages/desktop/src/components/tasks/SessionComposer.tsx`
- Modify: `packages/desktop/src/app/App.tsx`
- Modify: `packages/desktop/src/components/tasks/TaskRail.tsx`
- Modify: `packages/desktop/src/styles/global.css`
- Test: `packages/desktop/src/components/tasks/SessionComposer.test.tsx`
- Test: `packages/desktop/src/app/App.test.tsx`

- [ ] Write a failing composer rendering test asserting project, folder context, launch selectors, first-prompt editor, cancel, and start-task actions are present.
- [ ] Run the test; confirm it fails because the component does not exist.
- [ ] Implement a controlled `SessionComposer` that submits `projectId`, task configuration, and first prompt without creating a modal.
- [ ] Replace `newTaskOpen` with an App workspace mode; use the existing task factory and RPC connection, then invoke `rpc.prompt` after successful connection. Keep typed state and errors in the composer on failure.
- [ ] Update the rail action to enter the composer and tests to assert no NewTaskDialog markup exists.
- [ ] Run focused composer and App tests; confirm they pass.

### Task 4: Validate the integrated desktop application

**Files:**
- Modify only if validation identifies a defect.

- [ ] Run `bun run check` in `packages/desktop`.
- [ ] Run `bun test --parallel=8` in `packages/desktop`.
- [ ] Run `cargo fmt --check`, `cargo test`, and `cargo check` in `packages/desktop/src-tauri`.
- [ ] Run `bun run build:native` in `packages/desktop`, launch the produced executable, and verify it creates a direct `omp.exe --mode rpc-ui` child process.
- [ ] Perform final code review before handoff.
