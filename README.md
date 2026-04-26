# Groundcrew

A local stdio MCP server that gives coding agents safe, deterministic access to common local developer operations.

> **For coding agents:** See [AGENT_QUICKSTART.md](./AGENT_QUICKSTART.md) for the fastest path to using Groundcrew effectively.

## What problem it solves

Coding agents often do expensive, fragile things for simple local operations:

- Reading a file, writing the same contents elsewhere, then deleting the original instead of moving it
- Reading whole files to find one line instead of searching
- Rewriting whole files for tiny text changes
- Editing without checking git state
- Dumping huge outputs into context

Groundcrew gives them safe local primitives for those actions, saving time and tokens.

## With vs. without Groundcrew

### Example 1: Moving a file

**Without Groundcrew:**
1. Read `src/utils/old.ts` (500 lines, ~8KB context)
2. Write contents to `src/utils/new.ts` (another ~8KB output)
3. Delete `src/utils/old.ts`
4. Verify the move worked (read both paths)

**With Groundcrew:**
```json
{ "tool": "move_path", "arguments": { "from": "src/utils/old.ts", "to": "src/utils/new.ts" } }
```

Result: ~50 bytes of JSON in, ~100 bytes of JSON out. No file contents touch the context.

### Example 2: Finding a function definition

**Without Groundcrew:**
1. Read `src/server.ts` (800 lines, ~12KB context) — "Hmm, not here"
2. Read `src/routes.ts` (600 lines, ~9KB context) — "Not here either"
3. Read `src/handlers.ts` (400 lines, ~6KB context) — "Found it!"

**With Groundcrew:**
```json
{ "tool": "search_context", "arguments": { "pattern": "function handleRequest", "path": "src" } }
```

Result: Returns the exact file, line number, and surrounding context (~200 bytes per match). If results are capped, a `suggestion` field tells you how to narrow the search.

### Verifiable claims

These examples describe real patterns we see in agent traces. You can verify the difference yourself:

1. Check your agent's context window usage during file operations
2. Count how many round-trips it takes to accomplish simple tasks
3. Compare token estimates: reading a 500-line file (~4KB-8KB) vs. a 50-byte tool call

## What it is

Groundcrew is a local stdio MCP server that exposes workspace-scoped, output-capped, dry-run-friendly wrappers around common developer operations.

- TypeScript / Node.js LTS
- Distributed through npm
- stdio MCP transport only
- No HTTP server, no daemon, no background work
- Safe by default

Install and run instantly:

```bash
npm install @b7r_dev/groundcrew
npx groundcrew
```

Or run directly without installing:

```bash
npx @b7r_dev/groundcrew
```

Or run from source:

```bash
npm run dev
```

## What it intentionally does not do

- No arbitrary shell execution tool
- No network operations
- No deploy / migration / database tools
- No hidden background work
- No remote services, auth, telemetry, or web UI
- No HTTP transport or daemon mode

## Safety model

- All paths resolve against a workspace root (default: current working directory)
- Resolved paths must stay inside the workspace
- Path traversal outside the workspace is rejected
- Absolute paths outside the workspace are rejected
- Home paths (`~`) are rejected
- Binary files are refused for preview and edit tools
- Mutating tools default to dry-run
- Overwrites are refused by default
- Output is capped for every tool that can produce substantial output
- Search results are bounded
- All spawned CLI operations have timeouts

## MCP configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "groundcrew": {
      "command": "npx",
      "args": ["-y", "@b7r_dev/groundcrew"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### Generic MCP stdio config

```json
{
  "name": "groundcrew",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@b7r_dev/groundcrew"],
  "cwd": "/path/to/your/project"
}
```

## Tools

### Workspace

- **`workspace_info`** — Return basic workspace facts: cwd, workspace root, platform, available tools, limits, and safety settings. Use this before touching files to know your environment.
- **`detect_project`** — Identify project type and important files. Detects Node, Go, Python, Rust, Make, and Git.
- **`list_project_commands`** — List known project-native commands without running them. Parses `package.json` scripts and `Makefile` targets. Labels each with risk level (`safe`, `medium`, `risky`).

### Filesystem

- **`path_info`** — Return metadata for a path without reading contents: exists, type, size, modified time, binary guess. Use this to check a path before operating on it.
- **`ensure_dir`** — Create a directory (`mkdir -p`) safely scoped to workspace.
- **`move_path`** — Move or rename a file/directory using filesystem primitives. Use this instead of reading a file, writing it elsewhere, and deleting the original.
- **`copy_path`** — Copy a file or directory safely. Refuses directory copy unless `recursive: true`. Refuses overwrite by default.
- **`safe_move_path`** — Copy, verify byte equality, then delete original. Cautious move for files only.

### Search & Preview

- **`find_files`** — Find files by substring query or simple glob. Respects ignored directories (`.git`, `node_modules`, `dist`, etc.). Use this instead of dumping an entire tree.
- **`search_context`** — Search text with line context using `rg` (ripgrep). Use this to find content inside files instead of reading whole files to look for one line.
- **`preview_file`** — Read a bounded slice of a text file. Refuses binary files. Use this instead of reading entire large files into context.

### Git

- **`git_status`** — Cheap git preflight: branch, dirty state, short status entries. Use this before making edits to know the repo state.
- **`git_diff_stat`** — Compact summary of git changes.
- **`git_diff`** — Bounded git diff for review.

### Edits

- **`replace_text`** — Exact deterministic text replacement with dry-run diff preview. Defaults to `dryRun: true`. Use this instead of rewriting an entire file for tiny changes.
- **`replace_regex`** — Controlled regex replacement with dry-run diff preview. Defaults to `dryRun: true` and `maxReplacements: 1`. Use this for patterned edits.

## Default limits

| Limit | Value |
|-------|-------|
| `maxOutputBytes` | 20,000 |
| `maxResults` | 100 |
| `maxPreviewBytes` | 20,000 |
| `maxPreviewLines` | 400 |
| Spawned command timeout | 10,000 ms |

## v0.1 limitations

- Only stdio transport (no HTTP)
- No arbitrary shell execution
- `safe_move_path` supports files only, not directories
- `search_context` requires `rg` (ripgrep) to be installed
- Glob matching in `find_files` is basic (`*` and `**` only)
- No configuration file support yet
- Single workspace root per process

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run linter
npm run lint

# Run type check
npm run typecheck

# Build for distribution
npm run build
```

## Project structure

```
src/
├── index.ts          # Entry point, stdio transport
├── server.ts         # MCP server registration, tool routing
├── config.ts         # Limits, ignored dirs, workspace root
├── errors.ts         # GroundcrewError class
├── tools/
│   ├── workspace.ts  # workspace_info, detect_project, list_project_commands
│   ├── filesystem.ts # path_info, ensure_dir, move/copy/safe_move
│   ├── search.ts     # find_files, search_context
│   ├── preview.ts    # preview_file
│   ├── git.ts        # git_status, git_diff_stat, git_diff
│   ├── edits.ts      # replace_text, replace_regex
│   └── project.ts    # detect_project, list_project_commands
└── utils/
    ├── path.ts       # resolveWorkspacePath, isInsideWorkspace
    ├── limits.ts     # capOutput, capResults
    ├── spawn.ts      # runCommand with timeout/byte cap
    ├── binary.ts     # isBinaryFile, refuseBinary
    └── diff.ts       # unifiedDiff generation
test/
├── safety.test.ts
├── filesystem.test.ts
├── preview.test.ts
├── edits.test.ts
└── project.test.ts
```

## License

MIT
