export const DEFAULT_LIMITS = {
  maxOutputBytes: 20_000,
  maxResults: 100,
  maxPreviewBytes: 20_000,
  maxPreviewLines: 400,
  spawnTimeoutMs: 10_000,
} as const;

export const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
]);

export const WORKSPACE_ROOT = process.env.GROUNDCREW_WORKSPACE_ROOT || process.cwd();
