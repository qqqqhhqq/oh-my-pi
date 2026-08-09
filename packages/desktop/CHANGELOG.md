# Changelog

## [Unreleased]

### Added

- Added the cross-platform OMP Desktop task center with persistent task creation, search, rename, archive, delete, and session restore.
- Added live Git changes, diffs, staging, guarded discard actions, and workspace editor launching through the OMP RPC and Tauri bridges.
- Added a per-task native PTY terminal backed by `portable-pty` and xterm.js, including raw keyboard input, terminal protocol responses, resize, interrupt, stop, and restart.
- Added Windows, macOS, and Linux Tauri bundle targets with OMP block-π application icons.

### Changed

- Reused the OMP CLI dark palette, status colors, semantic icons, model labels, and block-π identity in a clean desktop-native layout.
- Added multi-platform CI coverage for the desktop frontend, native runtime, and PTY smoke contract.

### Fixed

- Added RPC protocol v2 negotiation and bounded chunk reassembly so large session responses remain lossless.
- Prevented stale PTY generations and output-window truncation from replaying or corrupting a restarted terminal.
- Made failed persisted-session restores recoverable through an explicit fresh-start choice.
