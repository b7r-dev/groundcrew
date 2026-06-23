import fs from 'node:fs';
import { GroundcrewError } from '../errors.js';
import { DEFAULT_LIMITS } from '../config.js';
import { resolveWorkspacePath } from '../utils/path.js';
import { refuseBinary } from '../utils/binary.js';

export function previewFile({
  path: inputPath,
  startLine,
  lineCount,
  maxBytes,
}: {
  path: string;
  startLine?: number;
  lineCount?: number;
  maxBytes?: number;
}) {
  const { absolutePath, relativePath } = resolveWorkspacePath(inputPath);

  if (!fs.existsSync(absolutePath)) {
    throw new GroundcrewError('FILE_MISSING', `File does not exist: ${relativePath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    throw new GroundcrewError('IS_DIRECTORY', `Path is a directory: ${relativePath}`);
  }

  refuseBinary(absolutePath, 'preview_file');

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const allLines = content.split('\n');
  const totalLines = allLines.length;

  const start = startLine !== undefined ? Math.max(1, startLine) : 1;
  const maxLines = lineCount !== undefined ? lineCount : 200;
  const safeMaxBytes = maxBytes !== undefined ? maxBytes : DEFAULT_LIMITS.maxPreviewBytes;

  const end = Math.min(start + maxLines - 1, totalLines);
  const slicedLines = allLines.slice(start - 1, end);

  let preview = slicedLines.join('\n');
  let truncated = end < totalLines;

  // Byte cap
  const encoder = new TextEncoder();
  if (encoder.encode(preview).length > safeMaxBytes) {
    while (encoder.encode(preview).length > safeMaxBytes && preview.length > 0) {
      preview = preview.slice(0, -1);
    }
    truncated = true;
  }

  return {
    ok: true,
    tool: 'preview_file',
    path: relativePath,
    startLine: start,
    endLine: end,
    totalLines,
    content: preview,
    truncated,
    ...(truncated
      ? {
          suggestion:
            'Preview was capped. Use startLine and lineCount to read specific sections.',
        }
      : {}),
  };
}
