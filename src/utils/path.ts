import path from 'node:path';
import { GroundcrewError } from '../errors.js';
import { WORKSPACE_ROOT } from '../config.js';

export interface ResolvedPath {
  absolutePath: string;
  relativePath: string;
}

export function resolveWorkspacePath(inputPath: string): ResolvedPath {
  if (inputPath.startsWith('~')) {
    throw new GroundcrewError('HOME_PATH', 'Paths starting with ~ are not supported in v0.1');
  }

  const normalized = path.normalize(inputPath);
  const resolved = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(WORKSPACE_ROOT, normalized);

  if (path.isAbsolute(inputPath) && !isInsideWorkspace(resolved)) {
    throw new GroundcrewError(
      'ABSOLUTE_PATH',
      `Absolute path ${inputPath} is outside the workspace`,
    );
  }

  if (!isInsideWorkspace(resolved)) {
    throw new GroundcrewError(
      'PATH_TRAVERSAL',
      `Resolved path ${resolved} is outside the workspace root ${WORKSPACE_ROOT}`,
    );
  }

  const relativePath = path.relative(WORKSPACE_ROOT, resolved);

  return {
    absolutePath: resolved,
    relativePath: relativePath === '' ? '.' : relativePath,
  };
}

export function isInsideWorkspace(absolutePath: string): boolean {
  const relative = path.relative(WORKSPACE_ROOT, absolutePath);
  return relative === '' || !relative.startsWith('..');
}
