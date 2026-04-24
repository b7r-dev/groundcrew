import fs from 'node:fs';
import path from 'node:path';
import { GroundcrewError } from '../errors.js';
import { resolveWorkspacePath } from '../utils/path.js';
import { isBinaryFile } from '../utils/binary.js';

export function pathInfo({ path: inputPath }: { path: string }) {
  const { absolutePath, relativePath } = resolveWorkspacePath(inputPath);

  let exists = false;
  let type: 'file' | 'directory' | 'symlink' | 'missing' | 'other' = 'missing';
  let sizeBytes: number | undefined;
  let modifiedAt: string | undefined;
  let isBinary = false;

  try {
    const stat = fs.lstatSync(absolutePath);
    exists = true;
    if (stat.isSymbolicLink()) {
      type = 'symlink';
    } else if (stat.isDirectory()) {
      type = 'directory';
    } else if (stat.isFile()) {
      type = 'file';
      sizeBytes = stat.size;
      isBinary = isBinaryFile(absolutePath);
    } else {
      type = 'other';
    }
    modifiedAt = stat.mtime.toISOString();
  } catch {
    exists = false;
    type = 'missing';
  }

  return {
    ok: true,
    tool: 'path_info',
    resolvedPath: absolutePath,
    relativePath,
    exists,
    type,
    sizeBytes,
    modifiedAt,
    isInsideWorkspace: true,
    isBinary,
  };
}

export function ensureDir({
  path: inputPath,
  dryRun = false,
}: {
  path: string;
  dryRun?: boolean;
}) {
  const { absolutePath, relativePath } = resolveWorkspacePath(inputPath);

  let existed = false;
  let created = false;

  try {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      existed = true;
    } else {
      throw new GroundcrewError('NOT_A_DIRECTORY', `Path exists but is not a directory: ${relativePath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!dryRun) {
        fs.mkdirSync(absolutePath, { recursive: true });
        created = true;
      }
    } else {
      throw err;
    }
  }

  return {
    ok: true,
    tool: 'ensure_dir',
    created: dryRun ? false : created,
    existed,
    resolvedPath: absolutePath,
    relativePath,
    dryRun,
  };
}

export function movePath({
  from,
  to,
  createParents = false,
  overwrite = false,
  dryRun = false,
}: {
  from: string;
  to: string;
  createParents?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
}) {
  const start = Date.now();
  const fromResolved = resolveWorkspacePath(from);
  const toResolved = resolveWorkspacePath(to);

  if (!fs.existsSync(fromResolved.absolutePath)) {
    throw new GroundcrewError('SOURCE_MISSING', `Source path does not exist: ${fromResolved.relativePath}`);
  }

  if (fs.existsSync(toResolved.absolutePath) && !overwrite) {
    throw new GroundcrewError('DESTINATION_EXISTS', `Destination path already exists: ${toResolved.relativePath}. Set overwrite: true to replace.`);
  }

  if (createParents && !dryRun) {
    fs.mkdirSync(path.dirname(toResolved.absolutePath), { recursive: true });
  }

  if (!dryRun) {
    try {
      fs.renameSync(fromResolved.absolutePath, toResolved.absolutePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EXDEV') {
        throw new GroundcrewError(
          'CROSS_DEVICE',
          `Cross-device move not supported by move_path. Use safe_move_path instead.`,
        );
      }
      throw err;
    }
  }

  return {
    ok: true,
    tool: 'move_path',
    from: fromResolved.relativePath,
    to: toResolved.relativePath,
    moved: !dryRun,
    dryRun,
    warnings: [] as string[],
    durationMs: Date.now() - start,
  };
}

export function copyPath({
  from,
  to,
  createParents = false,
  overwrite = false,
  recursive = false,
  dryRun = false,
}: {
  from: string;
  to: string;
  createParents?: boolean;
  overwrite?: boolean;
  recursive?: boolean;
  dryRun?: boolean;
}) {
  const start = Date.now();
  const fromResolved = resolveWorkspacePath(from);
  const toResolved = resolveWorkspacePath(to);

  if (!fs.existsSync(fromResolved.absolutePath)) {
    throw new GroundcrewError('SOURCE_MISSING', `Source path does not exist: ${fromResolved.relativePath}`);
  }

  const fromStat = fs.statSync(fromResolved.absolutePath);
  if (fromStat.isDirectory() && !recursive) {
    throw new GroundcrewError('IS_DIRECTORY', `Source is a directory. Set recursive: true to copy directories.`);
  }

  if (fs.existsSync(toResolved.absolutePath) && !overwrite) {
    throw new GroundcrewError('DESTINATION_EXISTS', `Destination path already exists: ${toResolved.relativePath}. Set overwrite: true to replace.`);
  }

  if (createParents && !dryRun) {
    fs.mkdirSync(path.dirname(toResolved.absolutePath), { recursive: true });
  }

  if (!dryRun) {
    if (fromStat.isDirectory()) {
      fs.cpSync(fromResolved.absolutePath, toResolved.absolutePath, { recursive: true });
    } else {
      fs.copyFileSync(fromResolved.absolutePath, toResolved.absolutePath);
    }
  }

  return {
    ok: true,
    tool: 'copy_path',
    copied: !dryRun,
    from: fromResolved.relativePath,
    to: toResolved.relativePath,
    dryRun,
    warnings: [] as string[],
    durationMs: Date.now() - start,
  };
}

export function safeMovePath({
  from,
  to,
  createParents = false,
  overwrite = false,
  dryRun = false,
}: {
  from: string;
  to: string;
  createParents?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
}) {
  const start = Date.now();
  const fromResolved = resolveWorkspacePath(from);
  const toResolved = resolveWorkspacePath(to);

  if (!fs.existsSync(fromResolved.absolutePath)) {
    throw new GroundcrewError('SOURCE_MISSING', `Source path does not exist: ${fromResolved.relativePath}`);
  }

  const fromStat = fs.statSync(fromResolved.absolutePath);
  if (fromStat.isDirectory()) {
    throw new GroundcrewError(
      'DIRECTORY_NOT_SUPPORTED',
      `safe_move_path does not support directories in v0.1. Use move_path or copy_path instead.`,
    );
  }

  if (fs.existsSync(toResolved.absolutePath) && !overwrite) {
    throw new GroundcrewError('DESTINATION_EXISTS', `Destination path already exists: ${toResolved.relativePath}. Set overwrite: true to replace.`);
  }

  if (createParents && !dryRun) {
    fs.mkdirSync(path.dirname(toResolved.absolutePath), { recursive: true });
  }

  let moved = false;
  let verified = false;
  const verificationMethod = 'byte_equal';

  if (!dryRun) {
    fs.copyFileSync(fromResolved.absolutePath, toResolved.absolutePath);

    const srcBytes = fs.readFileSync(fromResolved.absolutePath);
    const dstBytes = fs.readFileSync(toResolved.absolutePath);
    if (Buffer.compare(srcBytes, dstBytes) === 0) {
      verified = true;
      fs.unlinkSync(fromResolved.absolutePath);
      moved = true;
    } else {
      // Verification failed, clean up destination
      fs.unlinkSync(toResolved.absolutePath);
      throw new GroundcrewError('VERIFICATION_FAILED', `Copy verification failed for ${fromResolved.relativePath}. Original was not deleted.`);
    }
  }

  return {
    ok: true,
    tool: 'safe_move_path',
    moved,
    verified,
    verificationMethod,
    from: fromResolved.relativePath,
    to: toResolved.relativePath,
    dryRun,
    warnings: [] as string[],
    durationMs: Date.now() - start,
  };
}
