import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceInfo } from './tools/workspace.js';
import { pathInfo, ensureDir, movePath, copyPath, safeMovePath } from './tools/filesystem.js';
import { findFiles, searchContext } from './tools/search.js';
import { previewFile } from './tools/preview.js';
import { gitStatus, gitDiffStat, gitDiff } from './tools/git.js';
import { replaceText, replaceRegex } from './tools/edits.js';
import { detectProject, listProjectCommands } from './tools/project.js';
import { GroundcrewError, isGroundcrewError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));

const toolSchemas = {
  workspace_info: z.object({
    includeTools: z.boolean().optional(),
  }),
  path_info: z.object({
    path: z.string(),
  }),
  ensure_dir: z.object({
    path: z.string(),
    dryRun: z.boolean().optional(),
  }),
  move_path: z.object({
    from: z.string(),
    to: z.string(),
    createParents: z.boolean().optional(),
    overwrite: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  copy_path: z.object({
    from: z.string(),
    to: z.string(),
    createParents: z.boolean().optional(),
    overwrite: z.boolean().optional(),
    recursive: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  safe_move_path: z.object({
    from: z.string(),
    to: z.string(),
    createParents: z.boolean().optional(),
    overwrite: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  find_files: z.object({
    query: z.string().optional(),
    glob: z.string().optional(),
    type: z.enum(['file', 'directory', 'any']).optional(),
    maxResults: z.number().optional(),
    includeHidden: z.boolean().optional(),
  }),
  search_context: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    contextLines: z.number().optional(),
    includeGlob: z.string().optional(),
    excludeGlob: z.string().optional(),
    maxResults: z.number().optional(),
    maxOutputBytes: z.number().optional(),
    fixedStrings: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
  }),
  preview_file: z.object({
    path: z.string(),
    startLine: z.number().optional(),
    lineCount: z.number().optional(),
    maxBytes: z.number().optional(),
  }),
  git_status: z.object({
    path: z.string().optional(),
  }),
  git_diff_stat: z.object({
    path: z.string().optional(),
    staged: z.boolean().optional(),
  }),
  git_diff: z.object({
    path: z.string().optional(),
    staged: z.boolean().optional(),
    maxOutputBytes: z.number().optional(),
  }),
  replace_text: z.object({
    path: z.string(),
    search: z.string(),
    replacement: z.string(),
    maxReplacements: z.number().optional(),
    dryRun: z.boolean().optional(),
  }),
  replace_regex: z.object({
    path: z.string(),
    pattern: z.string(),
    replacement: z.string(),
    flags: z.string().optional(),
    maxReplacements: z.number().optional(),
    dryRun: z.boolean().optional(),
  }),
  detect_project: z.object({
    path: z.string().optional(),
  }),
  list_project_commands: z.object({
    path: z.string().optional(),
  }),
};

const toolDescriptions: Record<keyof typeof toolSchemas, string> = {
  workspace_info: 'Return basic workspace facts: cwd, workspace root, platform, available tools, limits, and safety settings. Use this before touching files to know your environment.',
  path_info: 'Return metadata for a path without reading contents: exists, type, size, modified time, binary guess. Use this to check a path before operating on it.',
  ensure_dir: 'Create a directory (mkdir -p) safely scoped to workspace. Use this instead of simulating directory creation through file writes.',
  move_path: 'Move or rename a file/directory using filesystem primitives. Use this instead of reading a file, writing it elsewhere, and deleting the original.',
  copy_path: 'Copy a file or directory safely. Refuses directory copy unless recursive: true. Refuses overwrite by default.',
  safe_move_path: 'Copy, verify byte equality, then delete original. Cautious move for files only. Use this when you want extra safety for important files.',
  find_files: 'Find files by substring query or simple glob. Respects ignored directories. Use this instead of dumping an entire tree to look for a file.',
  search_context: 'Search text with line context using ripgrep. Use this to find content inside files instead of reading whole files to look for one line.',
  preview_file: 'Read a bounded slice of a text file. Refuses binary files. Use this instead of reading entire large files into context.',
  git_status: 'Cheap git preflight: branch, dirty state, short status entries. Use this before making edits to know the repo state.',
  git_diff_stat: 'Compact summary of git changes. Use this for a quick overview of what changed.',
  git_diff: 'Bounded git diff for review. Use this to see actual changes before committing.',
  replace_text: 'Exact deterministic text replacement with dry-run diff preview. Defaults to dryRun: true. Use this instead of rewriting an entire file for tiny changes.',
  replace_regex: 'Controlled regex replacement with dry-run diff preview. Defaults to dryRun: true and maxReplacements: 1. Use this for patterned edits.',
  detect_project: 'Identify project type and important files. Detects Node, Go, Python, Rust, Make, and Git.',
  list_project_commands: 'List known project-native commands without running them. Parses package.json scripts and Makefile targets. Labels each with risk level.',
};

export function createServer(): Server {
  const server = new Server(
    {
      name: 'groundcrew',
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = Object.entries(toolSchemas).map(([name, schema]) => ({
      name,
      description: toolDescriptions[name as keyof typeof toolSchemas],
      inputSchema: zodToJsonSchema(schema),
    }));
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result: Record<string, unknown>;

      switch (name) {
        case 'workspace_info': {
          const parsed = toolSchemas.workspace_info.parse(args);
          result = await workspaceInfo(parsed);
          break;
        }
        case 'path_info': {
          const parsed = toolSchemas.path_info.parse(args);
          result = pathInfo(parsed);
          break;
        }
        case 'ensure_dir': {
          const parsed = toolSchemas.ensure_dir.parse(args);
          result = ensureDir(parsed);
          break;
        }
        case 'move_path': {
          const parsed = toolSchemas.move_path.parse(args);
          result = movePath(parsed);
          break;
        }
        case 'copy_path': {
          const parsed = toolSchemas.copy_path.parse(args);
          result = copyPath(parsed);
          break;
        }
        case 'safe_move_path': {
          const parsed = toolSchemas.safe_move_path.parse(args);
          result = safeMovePath(parsed);
          break;
        }
        case 'find_files': {
          const parsed = toolSchemas.find_files.parse(args);
          result = findFiles(parsed);
          break;
        }
        case 'search_context': {
          const parsed = toolSchemas.search_context.parse(args);
          result = await searchContext(parsed);
          break;
        }
        case 'preview_file': {
          const parsed = toolSchemas.preview_file.parse(args);
          result = previewFile(parsed);
          break;
        }
        case 'git_status': {
          const parsed = toolSchemas.git_status.parse(args);
          result = await gitStatus(parsed);
          break;
        }
        case 'git_diff_stat': {
          const parsed = toolSchemas.git_diff_stat.parse(args);
          result = await gitDiffStat(parsed);
          break;
        }
        case 'git_diff': {
          const parsed = toolSchemas.git_diff.parse(args);
          result = await gitDiff(parsed);
          break;
        }
        case 'replace_text': {
          const parsed = toolSchemas.replace_text.parse(args);
          result = replaceText(parsed);
          break;
        }
        case 'replace_regex': {
          const parsed = toolSchemas.replace_regex.parse(args);
          result = replaceRegex(parsed);
          break;
        }
        case 'detect_project': {
          const parsed = toolSchemas.detect_project.parse(args);
          result = detectProject(parsed);
          break;
        }
        case 'list_project_commands': {
          const parsed = toolSchemas.list_project_commands.parse(args);
          result = listProjectCommands(parsed);
          break;
        }
        default:
          throw new GroundcrewError('UNKNOWN_TOOL', `Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (err) {
      if (isGroundcrewError(err)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(err.toJSON()),
            },
          ],
          isError: true,
        };
      }

      if (err instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
                },
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: err instanceof Error ? err.message : String(err),
              },
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Minimal zod-to-json-schema for tool registration
  // We cheat slightly: since all our schemas are flat objects, we can reflect on them
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJson(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return { type: 'object' };
}

function zodTypeToJson(schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return zodTypeToJson(schema._def.innerType);
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values };
  }
  return { type: 'string' };
}
