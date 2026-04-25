# Quickstart

## Run locally

```bash
npm install
npm run dev
```

Or build and run the binary:

```bash
npm run build
./dist/index.js
```

This starts the MCP stdio server. It expects to be launched by an MCP client, not run directly in an interactive shell.

## Claude Desktop configuration

Add this to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "groundcrew": {
      "command": "npx",
      "args": ["groundcrew"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Generic MCP stdio configuration

```json
{
  "name": "groundcrew",
  "transport": "stdio",
  "command": "npx",
  "args": ["groundcrew"],
  "cwd": "/path/to/your/project"
}
```

## Local development

```bash
git clone <repo>
cd groundcrew
npm install
npm run dev
```

Or run the built binary directly:

```bash
npm run build
./dist/index.js
```

## What agents should use it for

**Instead of simulating a file move:**

```json
{ "tool": "move_path", "arguments": { "from": "old.ts", "to": "new.ts" } }
```

**Instead of reading a whole file to find one line:**

```json
{ "tool": "search_context", "arguments": { "pattern": "function handle", "path": "src" } }
```

**Instead of rewriting a whole file for a small change:**

```json
{ "tool": "replace_text", "arguments": { "path": "config.ts", "search": "port: 3000", "replacement": "port: 8080", "dryRun": true } }
```

**Before editing, check git state:**

```json
{ "tool": "git_status", "arguments": {} }
```

**Preview a large file without dumping it all into context:**

```json
{ "tool": "preview_file", "arguments": { "path": "log.txt", "startLine": 1, "lineCount": 50 } }
```

## Requirements

- Node.js >= 20.0.0
- `git` for git tools
- `rg` (ripgrep) for `search_context`
