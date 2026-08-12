# Changelog

## [Unreleased]

### Added

- Added the cross-platform OMP Desktop task center with persistent task creation, search, rename, archive, delete, and session restore.
- Added live Git changes, diffs, staging, guarded discard actions, and workspace editor launching through the OMP RPC and Tauri bridges.
- Added a per-task native PTY terminal backed by `portable-pty` and xterm.js, including raw keyboard input, terminal protocol responses, resize, interrupt, stop, and restart.
- Added Windows, macOS, and Linux Tauri bundle targets with OMP block-π application icons.
- Added session-mode controls to the new-task composer as single-entry toolbar buttons: a project popover (with an open-local-folder action that adopts the new project), a cycle-through approval-level button (annotate / editable / autonomous), and a hover-flyout model-and-reasoning menu. The model list is fetched from the connected CLI session (`get_available_models`, grouped by provider, selectable) and the new task inherits the selection; thinking strength is an ordered slider (off→max) with an auto opt-in. Task title, provider, and model are never hand-entered — the title derives from the project folder and the model resolves live from the CLI session.
- The new-task composer is a full-width center column and no longer covers the right rail: opening New chat keeps the three-pane shell (left rail / center / right workbench) intact, and the right rail closes below the wide breakpoint instead of squeezing the center column.
- Center content has layout priority: as the window narrows the right rail is first squeezed (390 → 300px) below 1400px, then closed below 1200px — the center conversation column always keeps at least 600px of width and fills the remaining space.
- The composer input and the new-task composer card now stretch with the center column instead of capping at a fixed 780px/820px, so the dialog width tracks the window width at every breakpoint.
- The shell no longer enforces a fixed minimum height: as the window gets shorter the center conversation column shrinks with it (transcript scrolls internally) instead of overflowing past the window edge.
- The center conversation column clips horizontal overflow: wide markdown tables and long content scroll inside the transcript instead of floating over the right rail when the window narrows.
- The new-task composer has no cancel/back affordance: opening New chat or a project's quick-new button shows the composer, clicking any session in the rail switches straight to that conversation, and sending a prompt auto-advances into the created session.
- Added live context usage and cost estimates below the composer and in the conversation header (tokens/window, percent, and an estimated input price from the live model rate).
- Opening a local folder now jumps straight to the native OS folder picker (`tauri-plugin-dialog`): the selected path registers as a project with the folder name as its title and is adopted as the composer's context, with no intermediate form.
- Added a Codex-style Settings center with persisted Desktop defaults, theme selection, backend schema-driven configuration, credential redaction, and OMP provider sign-in actions.

### Changed

- Reused the OMP CLI status colors, semantic icons, model labels, and block-π identity in a clean Codex-style light desktop-native layout.
- Added multi-platform CI coverage for the desktop frontend, native runtime, and PTY smoke contract.
- Selecting a persisted task now restores its OMP RPC session automatically, with connecting status and a recoverable connection dialog when restore fails.
- Settings changes now flow through the OMP RPC and are flushed by the backend, while new tasks inherit the configured Desktop defaults.

### Fixed

- Added RPC protocol v2 negotiation and bounded chunk reassembly so large session responses remain lossless.
- Prevented stale PTY generations and output-window truncation from replaying or corrupting a restarted terminal.
- Made failed persisted-session restores recoverable through an explicit fresh-start choice.
