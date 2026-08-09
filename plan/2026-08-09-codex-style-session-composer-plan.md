# Codex-style Session Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the settings-heavy new-session workspace with a Codex-like centered empty state that starts from one prompt and keeps project context visible.

**Architecture:** Keep `SessionComposer` as the main-pane route owned by `App`, but split its visual hierarchy into a centered welcome surface, a single large prompt editor, an inline context strip, and a collapsible runtime-settings disclosure. Preserve the existing `SessionComposerDraft` contract so task creation and RPC startup do not change.

**Tech Stack:** React, TypeScript, lucide-react, CSS custom properties, Bun tests, Tauri/Vite release build.

## Global Constraints

- Keep the OMP dark canvas, cyan accent, monospace metadata, and existing icon system.
- Do not reintroduce a modal for creating a session.
- Project context must be selectable inline in the main composer.
- Keep executable/provider/model/title available without dominating the initial surface.
- Verify with `bun test` and `bun run check` from `packages/desktop`.

---

### Task 1: Model the Codex-style composer surface

**Files:**
- Modify: `packages/desktop/src/components/tasks/SessionComposer.tsx`
- Test: `packages/desktop/src/components/tasks/SessionComposer.test.tsx`

**Interfaces:**
- Preserve `SessionComposerDraft` and `SessionComposerProps`.
- Add only local UI state for the inline runtime-settings disclosure; `onCreate` continues to receive trimmed context and prompt values.

- [ ] Add a failing SSR test asserting the new main surface exposes a centered welcome heading, a single prompt textarea, a project context control, a runtime-settings disclosure, and no old settings-grid labels.
- [ ] Run the focused component test and confirm it fails against the current settings-heavy markup.
- [ ] Rewrite the component markup around a `session-composer-stage`, `session-composer-card`, `session-context-strip`, and `session-runtime-settings` disclosure. Keep submit/cancel/error behavior and disable editable controls only while busy.
- [ ] Run the focused test and confirm the Codex-style structure passes.

### Task 2: Style the empty state and context composer

**Files:**
- Modify: `packages/desktop/src/styles/global.css`

**Interfaces:**
- Consume the class names produced by Task 1 without changing layout ownership in `App`.

- [ ] Replace the current two-column `.session-composer-form` rules with a centered stage and a max-width composer card.
- [ ] Style the prompt as a large, low-noise editor with a bottom toolbar, project folder context pill, inline add-context affordance, runtime settings disclosure, and cyan send action.
- [ ] Add responsive rules so the card remains usable below 860px without horizontal overflow.
- [ ] Run Biome formatting/check to validate the stylesheet and class names.

### Task 3: Verify and package the real desktop binary

**Files:**
- Test: `packages/desktop/src/components/tasks/SessionComposer.test.tsx`
- Verify: `packages/desktop/src/app/App.test.tsx`

**Interfaces:**
- No new public interfaces; task creation continues through the existing `SessionComposerDraft` path.

- [ ] Run the full desktop test suite and assert all tests pass.
- [ ] Run `bun run check` for Biome and TypeScript validation.
- [ ] Run `bun run build:native` to replace the release executable, then launch `target/release/omp-desktop.exe` and confirm the desktop and OMP backend processes are alive.
