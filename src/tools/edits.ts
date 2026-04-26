import fs from 'node:fs';
import { GroundcrewError } from '../errors.js';
import { resolveWorkspacePath } from '../utils/path.js';
import { refuseBinary } from '../utils/binary.js';
import { unifiedDiff } from '../utils/diff.js';
import { capOutput } from '../utils/limits.js';

export function replaceText({
  path: inputPath,
  search,
  replacement,
  maxReplacements = 1,
  dryRun = true,
}: {
  path: string;
  search: string;
  replacement: string;
  maxReplacements?: number;
  dryRun?: boolean;
}) {
  if (search === '') {
    throw new GroundcrewError('EMPTY_SEARCH', 'search string must not be empty');
  }

  const { absolutePath, relativePath } = resolveWorkspacePath(inputPath);

  if (!fs.existsSync(absolutePath)) {
    throw new GroundcrewError('FILE_MISSING', `File does not exist: ${relativePath}`);
  }

  refuseBinary(absolutePath, 'replace_text');

  const original = fs.readFileSync(absolutePath, 'utf-8');
  const originalLines = original.split('\n');

  let matches = 0;
  let replaced = original;
  let count = 0;
  let idx = replaced.indexOf(search);

  while (idx !== -1 && count < maxReplacements) {
    matches++;
    count++;
    replaced = replaced.slice(0, idx) + replacement + replaced.slice(idx + search.length);
    idx = replaced.indexOf(search, idx + replacement.length);
  }

  // Count remaining matches
  let remainingIdx = replaced.indexOf(search);
  while (remainingIdx !== -1) {
    matches++;
    remainingIdx = replaced.indexOf(search, remainingIdx + 1);
  }

  const changed = original !== replaced;
  const diffPreview = changed
    ? unifiedDiff(originalLines, replaced.split('\n'), relativePath)
    : '';
  const cappedDiff = capOutput(diffPreview, 15000);

  if (!dryRun && changed) {
    fs.writeFileSync(absolutePath, replaced, 'utf-8');
  }

  return {
    ok: true,
    tool: 'replace_text',
    path: relativePath,
    matches,
    replacements: count,
    dryRun,
    changed,
    diffPreview: cappedDiff.output,
    truncatedDiff: cappedDiff.truncated,
    ...(cappedDiff.truncated
      ? {
          suggestion:
            'Diff preview was capped. The operation succeeded; use git_diff to see full changes.',
        }
      : {}),
  };
}

export function replaceRegex({
  path: inputPath,
  pattern,
  replacement,
  flags = 'g',
  maxReplacements = 1,
  dryRun = true,
}: {
  path: string;
  pattern: string;
  replacement: string;
  flags?: string;
  maxReplacements?: number;
  dryRun?: boolean;
}) {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    throw new GroundcrewError('INVALID_REGEX', `Invalid regex pattern: ${pattern}`);
  }

  const { absolutePath, relativePath } = resolveWorkspacePath(inputPath);

  if (!fs.existsSync(absolutePath)) {
    throw new GroundcrewError('FILE_MISSING', `File does not exist: ${relativePath}`);
  }

  refuseBinary(absolutePath, 'replace_regex');

  const original = fs.readFileSync(absolutePath, 'utf-8');
  const originalLines = original.split('\n');

  let matches = 0;
  let replaced = original;

  if (flags.includes('g')) {
    // Global: we need to limit replacements manually
    let count = 0;
    replaced = original.replace(regex, (match) => {
      matches++;
      if (count < maxReplacements) {
        count++;
        return replacement;
      }
      return match;
    });
  } else {
    const match = original.match(regex);
    matches = match ? match.length : 0;
    replaced = original.replace(regex, replacement);
  }

  const changed = original !== replaced;
  const diffPreview = changed
    ? unifiedDiff(originalLines, replaced.split('\n'), relativePath)
    : '';
  const cappedDiff = capOutput(diffPreview, 15000);

  if (!dryRun && changed) {
    fs.writeFileSync(absolutePath, replaced, 'utf-8');
  }

  return {
    ok: true,
    tool: 'replace_regex',
    path: relativePath,
    matches,
    replacements: changed ? (flags.includes('g') ? Math.min(matches, maxReplacements) : 1) : 0,
    dryRun,
    changed,
    diffPreview: cappedDiff.output,
    truncatedDiff: cappedDiff.truncated,
    ...(cappedDiff.truncated
      ? {
          suggestion:
            'Diff preview was capped. The operation succeeded; use git_diff to see full changes.',
        }
      : {}),
  };
}
