# Desktop Turn Flow and Session Composer Design

## Goal

Make OMP Desktop present tool activity as one progressive execution flow per assistant turn, and replace the New session dialog with an in-window task composer that creates a configured project session and sends its first prompt.

## Tool execution flow

`projectAgentEvent` will attach a stable `turnId` to tool entries. A turn begins when the agent emits `turn_start` and ends on `turn_end` or the matching assistant completion. The conversation projection will group adjacent tool entries with the same turn id into one `ToolTurn` view model.

`ConversationPane` will render one `<details>` execution card for each tool turn. The card stays open while any child tool is active or failed, scrolls its internal step list to the newest active item, and becomes collapsed once every child completed successfully. Each child step has its own details disclosure for raw arguments and result text.

Historic tool-result messages without a live turn id are shown as a single completed execution card so restored sessions keep a readable transcript.

## New session workspace

The rail's New session action switches the main content from a selected conversation to a `SessionComposer` screen. The rail and project hierarchy remain visible. The composer includes project selection, optional task title, OMP executable/provider/model, and a large first-prompt editor. It shows the chosen project folder as context.

Submitting creates one `DesktopTask`, persists it through the existing catalog effect, connects the RPC runtime with the chosen launch config, and sends the first prompt only after connect succeeds. A visible inline error preserves the typed prompt and configuration. Cancel returns to the previously selected task, or the empty project view when no task is selected.

## State and error boundaries

The composer owns only transient draft state. Durable task state remains in `DesktopState`, and project membership remains `projectId`. The App owns the create/connect/send sequence so it can reuse existing RPC error handling. It must not leave a task selected if creating it fails before connection; a failed post-create connection remains a visible selected task for retry.

## Tests

- Projection tests prove tool events in the same turn group into one execution flow and preserve per-step status.
- Conversation rendering tests prove one turn card contains multiple tool steps and completed cards are collapsed.
- Session composer tests prove the main-window form exposes project/context controls and submits one draft.
- App-level tests prove the modal NewTaskDialog is no longer rendered and the in-window composer is reachable.

## Scope

This change does not add file attachments, project editing, or a native folder-picker. It reuses the existing project catalog and RPC configuration controls.
