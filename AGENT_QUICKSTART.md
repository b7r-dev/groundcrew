# Agent Quickstart for Groundcrew

## What This Is

Groundcrew is a local MCP stdio server that gives you safe, deterministic access to common developer operations: filesystem, search, git, and edits. It lives inside your workspace and handles path safety, output capping, and dry-run defaults automatically.

## Setup

Your MCP client (the system that launched you) needs to register groundcrew. Use this **generic stdio configuration**:

```json
{
  "name": "groundcrew",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@b7r_dev/groundcrew"],
  "cwd": "/absolute/path/to/your/workspace"
}
```

**Key points:**
- `cwd` sets the workspace root. All paths resolve relative to this directory.
- Alternatively, set the `GROUNDCREW_WORKSPACE_ROOT` environment variable.
- Requires Node.js >= 20.0.0
- Requires `git` (for git tools) and `rg` (ripgrep, for search_context)

## Tool Decision Tree

| You want to... | Use this tool |
|---|---|
| Understand your environment | `workspace_info` |
| Check if a file exists before operating | `path_info` |
| Read a file (first N lines) | `preview_file` |
| Find where something is defined | `search_context` |
| List files matching a pattern | `find_files` |
| Move or rename a file/directory | `move_path` |
| Copy a file/directory | `copy_path` |
| Make an exact text edit | `replace_text` |
| Make a patterned edit (regex) | `replace_regex` |
| Check git state before editing | `git_status` |
| See what changed | `git_diff` or `git_diff_stat` |
| Know what commands exist | `list_project_commands` |
| Understand the project structure | `detect_project` |
| Create a directory | `ensure_dir` |

## Common Workflows

### Refactoring

```
search_context → preview_file → replace_text (dryRun: true) → git_diff → replace_text (dryRun: false)
```

### Adding a Feature

```
detect_project → list_project_commands → find_files → preview_file → replace_text
```

### Bug Fix

```
search_context (error message) → preview_file → replace_text
```

## Safety Reminders

- **All mutating tools default to `dryRun: true`**. You must explicitly set `dryRun: false` to apply changes.
- **Overwrites are refused by default**. Set `overwrite: true` if you intend to replace an existing file.
- **Output is capped at 20KB**. If you see `truncated: true`, narrow your query (smaller `maxResults`, more specific `path`, etc.).
- **Paths must stay inside the workspace**. Absolute paths outside the workspace and home paths (`~`) are rejected.
- **Always check `git_status` before making changes** to understand the current repo state.

## Error Quick Reference

| Error Code | Meaning | What to do |
|---|---|---|
| `FILE_MISSING` | File doesn't exist | Check the path or create the file first |
| `DESTINATION_EXISTS` | Target already exists | Add `overwrite: true` if intended |
| `PATH_TRAVERSAL` | Path is outside workspace | Use a relative path inside the workspace |
| `ABSOLUTE_PATH` | Absolute path outside workspace | Use a relative path |
| `HOME_PATH` | Path starts with `~` | Use a relative path |
| `IS_DIRECTORY` | Expected a file, got a directory | Check the path |
| `NOT_A_DIRECTORY` | Expected a directory, got a file | Check the path |
| `SOURCE_MISSING` | Source file doesn't exist | Check the `from` path |
| `EMPTY_SEARCH` | Search string is empty | Provide a non-empty search string |
| `INVALID_REGEX` | Regex pattern is invalid | Fix the pattern |
| `UNKNOWN_TOOL` | Tool name doesn't exist | Check the tool name |
| `VALIDATION_ERROR` | Missing required argument | Check the schema and provide required fields |
| `CROSS_DEVICE` | Move across filesystems | Use `safe_move_path` instead |

**Note:** When a tool returns `truncated: true`, it will also include a `suggestion` field with specific guidance on how to get the rest of the results (e.g., use `startLine`/`lineCount`, narrow your search, specify a path, etc.).

## Anti-Patterns (What NOT to Do)

- **Don't** read an entire 1000-line file to find one function. Use `search_context` instead.
- **Don't** simulate a file move by reading, writing elsewhere, then deleting. Use `move_path`.
- **Don't** rewrite an entire file to change one line. Use `replace_text`.
- **Don't** guess that a command exists. Use `list_project_commands` to discover available scripts.
- **Don't** dump huge directory listings into context. Use `find_files` with a `query` or `glob`.

## Troubleshooting

### "npx command not found"

Ensure Node.js >= 20.0.0 is installed and `npx` is in the PATH.

### "rg failed" or search_context returns an error

Install ripgrep (`rg`):
- macOS: `brew install ripgrep`
- Ubuntu/Debian: `sudo apt-get install ripgrep`
- Other: see https://github.com/BurntSushi/ripgrep#installation

### "git failed" or git tools return errors

Ensure `git` is installed and the workspace is inside a git repository (or initialize one with `git init`).

### Output is truncated

Groundcrew caps output at 20KB by default. If you see `truncated: true`:
- Use a more specific `pattern` in `search_context`
- Reduce `maxResults`
- Narrow the `path` scope
- For `preview_file`, use `startLine` and `lineCount` to read specific sections

### "Path is outside the workspace"

All paths must resolve inside the workspace root. Use relative paths (e.g., `src/utils/helpers.ts` instead of `/Users/name/project/src/utils/helpers.ts`).

## Default Limits

| Limit | Value |
|---|---|
| `maxOutputBytes` | 20,000 |
| `maxResults` | 100 |
| `maxPreviewBytes` | 20,000 |
| `maxPreviewLines` | 400 |
| Spawned command timeout | 10,000 ms |

## Tool Examples

### workspace_info
```json
{
  "tool": "workspace_info",
  "arguments": {}
}
```

### path_info
```json
{
  "tool": "path_info",
  "arguments": {
    "path": "src/utils/helpers.ts"
  }
}
```

### preview_file
```json
{
  "tool": "preview_file",
  "arguments": {
    "path": "src/utils/helpers.ts",
    "startLine": 1,
    "lineCount": 50
  }
}
```

### search_context
```json
{
  "tool": "search_context",
  "arguments": {
    "pattern": "function handle",
    "path": "src",
    "maxResults": 10
  }
}
```

### find_files
```json
{
  "tool": "find_files",
  "arguments": {
    "glob": "src/**/*.ts",
    "maxResults": 20
  }
}
```

### replace_text (dry run first)
```json
{
  "tool": "replace_text",
  "arguments": {
    "path": "config.ts",
    "search": "port: 3000",
    "replacement": "port: 8080",
    "dryRun": true
  }
}
```

### replace_text (apply)
```json
{
  "tool": "replace_text",
  "arguments": {
    "path": "config.ts",
    "search": "port: 3000",
    "replacement": "port: 8080",
    "dryRun": false
  }
}
```

### move_path
```json
{
  "tool": "move_path",
  "arguments": {
    "from": "old.ts",
    "to": "new.ts"
  }
}
```

### git_status
```json
{
  "tool": "git_status",
  "arguments": {}
}
```

### detect_project
```json
{
  "tool": "detect_project",
  "arguments": {}
}
```

### list_project_commands
```json
{
  "tool": "list_project_commands",
  "arguments": {}
}
```
