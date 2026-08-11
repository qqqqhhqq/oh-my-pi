# OMP Desktop

OMP Desktop is the cross-platform graphical task center for the existing OMP coding-agent runtime. The UI owns task
catalogs, RPC projection, Git review, extension dialogs, and native PTY terminals; model execution and credentials stay
inside the local OMP CLI.

## Runtime prerequisite

Install OMP before launching a packaged desktop build:

- macOS / Linux: `curl -fsSL https://omp.sh/install | sh`
- Windows PowerShell: `irm https://omp.sh/install.ps1 | iex`

The desktop resolves `OMP_DESKTOP_CLI` first, then the current `PATH`, followed by the official install locations
(`%LOCALAPPDATA%\omp\omp.exe` on Windows and `~/.local/bin/omp` on macOS/Linux). The OMP executable is managed by the
desktop itself, never chosen per session; source `cli.ts` entries in debug builds require Bun, and
`OMP_DESKTOP_BUN` overrides Bun discovery. A packaged desktop build will resolve the agent backend bundled with the
application.

The packaged application does not bundle provider credentials. It reuses the same local OMP configuration and secret
stores as the CLI.

## Development

```sh
bun install
bun --cwd packages/desktop test
bun --cwd packages/desktop run check
bun --cwd packages/desktop run tauri dev
```

Native verification:

```sh
cargo test -p omp-desktop
cargo check -p omp-desktop
```
