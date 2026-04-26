import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE_ROOT, IGNORED_DIRS, DEFAULT_LIMITS } from '../config.js';
import { resolveWorkspacePath } from '../utils/path.js';
import { capResults, capOutput } from '../utils/limits.js';
import { runCommand } from '../utils/spawn.js';

interface FindResult {
  relativePath: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
}

function simpleGlobMatch(relativePath: string, pattern: string): boolean {
  // Very basic glob: supports * and ** only
  const parts = pattern.split('/');
  const pathParts = relativePath.split('/');

  let pi = 0;
  let pj = 0;
  while (pi < parts.length && pj < pathParts.length) {
    const part = parts[pi];
    if (part === '**') {
      // ** matches any number of directories
      const nextPart = parts[pi + 1];
      if (!nextPart) return true;
      while (pj < pathParts.length && !matchSegment(pathParts[pj], nextPart)) {
        pj++;
      }
      if (pj >= pathParts.length) return false;
      pi += 2;
      pj++;
    } else {
      if (!matchSegment(pathParts[pj], part)) return false;
      pi++;
      pj++;
    }
  }
  return pi === parts.length && pj === pathParts.length;
}

function matchSegment(segment: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(segment);
}

function walkDir(dir: string, results: FindResult[], maxResults: number, includeHidden: boolean): void {
  if (results.length >= maxResults) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;
    if (!includeHidden && entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(WORKSPACE_ROOT, fullPath);

    if (entry.isDirectory()) {
      results.push({ relativePath: relPath, type: 'directory' });
      walkDir(fullPath, results, maxResults, includeHidden);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      let sizeBytes: number | undefined;
      try {
        sizeBytes = fs.statSync(fullPath).size;
      } catch {
        // ignore
      }
      results.push({ relativePath: relPath, type: 'file', sizeBytes });
    }
  }
}

export function findFiles({
  query,
  glob,
  type = 'any',
  maxResults = DEFAULT_LIMITS.maxResults,
  includeHidden = false,
}: {
  query?: string;
  glob?: string;
  type?: 'file' | 'directory' | 'any';
  maxResults?: number;
  includeHidden?: boolean;
}) {
  const safeMax = Math.min(maxResults, DEFAULT_LIMITS.maxResults);
  const results: FindResult[] = [];
  walkDir(WORKSPACE_ROOT, results, safeMax * 2, includeHidden);

  let filtered = results;

  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter((r) => r.relativePath.toLowerCase().includes(lowerQuery));
  }

  if (glob) {
    filtered = filtered.filter((r) => simpleGlobMatch(r.relativePath, glob));
  }

  if (type !== 'any') {
    filtered = filtered.filter((r) => r.type === type);
  }

  const capped = capResults(filtered, safeMax);

  return {
    ok: true,
    tool: 'find_files',
    results: capped.items,
    count: capped.count,
    truncated: capped.truncated,
    ...(capped.truncated
      ? {
          suggestion:
            'Results were capped. Try a more specific query, a narrower glob, or lower maxResults.',
        }
      : {}),
  };
}

export async function searchContext({
  pattern,
  path: inputPath,
  contextLines = 2,
  includeGlob,
  excludeGlob,
  maxResults = DEFAULT_LIMITS.maxResults,
  maxOutputBytes = DEFAULT_LIMITS.maxOutputBytes,
  fixedStrings = false,
  caseSensitive = false,
}: {
  pattern: string;
  path?: string;
  contextLines?: number;
  includeGlob?: string;
  excludeGlob?: string;
  maxResults?: number;
  maxOutputBytes?: number;
  fixedStrings?: boolean;
  caseSensitive?: boolean;
}) {
  const searchDir = inputPath ? resolveWorkspacePath(inputPath).absolutePath : WORKSPACE_ROOT;

  const rgCheck = await runCommand('rg', ['--version'], { timeoutMs: 2000 });
  if (rgCheck.exitCode !== 0) {
    return {
      ok: false,
      tool: 'search_context',
      error: 'rg (ripgrep) is not available. Install it to use search_context.',
    };
  }

  const args: string[] = [
    '--json',
    '--context',
    String(contextLines),
    '--max-count',
    String(Math.min(maxResults, DEFAULT_LIMITS.maxResults)),
    '--max-columns',
    '500',
  ];

  if (fixedStrings) args.push('--fixed-strings');
  if (!caseSensitive) args.push('--ignore-case');
  if (includeGlob) {
    args.push('--glob');
    args.push(includeGlob);
  }
  if (excludeGlob) {
    args.push('--glob');
    args.push(`!${excludeGlob}`);
  }

  args.push(pattern);
  args.push(searchDir);

  const result = await runCommand('rg', args, {
    cwd: WORKSPACE_ROOT,
    maxOutputBytes,
  });

  // rg exits 0 on matches, 1 on no matches. Null exit code means killed (truncation or timeout).
  // If truncated, we still parse what we got. Otherwise, it's a real error.
  if (result.exitCode !== 0 && result.exitCode !== 1 && !result.truncated) {
    return {
      ok: false,
      tool: 'search_context',
      error: `rg failed: ${result.stderr || result.stdout}`.slice(0, 500),
    };
  }

  const matches: Array<{
    path: string;
    lineNumber: number;
    text: string;
    type: 'match' | 'context';
  }> = [];

  const lines = result.stdout.split('\n').filter(Boolean);
  let filesMatched = 0;
  const seenFiles = new Set<string>();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'begin') {
        filesMatched++;
        seenFiles.add(parsed.data.path.text);
      } else if (parsed.type === 'match' || parsed.type === 'context') {
        const m = parsed.data;
        matches.push({
          path: m.path?.text || '',
          lineNumber: m.line_number || 0,
          text: m.lines?.text || '',
          type: parsed.type,
        });
      }
    } catch {
      // ignore malformed JSON lines
    }
  }

  const { truncated, outputBytes } = capOutput(
    result.stdout,
    maxOutputBytes,
  );

  const isTruncated = result.truncated || truncated;

  return {
    ok: true,
    tool: 'search_context',
    matches,
    matchCount: matches.filter((m) => m.type === 'match').length,
    filesMatched,
    truncated: isTruncated,
    outputBytes,
    commandUsed: 'rg',
    ...(isTruncated
      ? {
          suggestion:
            'Output was capped. Try a more specific pattern, a narrower path scope, or lower maxResults.',
        }
      : {}),
  };
}
