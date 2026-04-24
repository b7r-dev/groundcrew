import { WORKSPACE_ROOT } from '../config.js';
import { resolveWorkspacePath } from '../utils/path.js';
import { runCommand } from '../utils/spawn.js';

async function runGit(args: string[], cwd: string, maxOutputBytes?: number) {
  return runCommand('git', args, { cwd, maxOutputBytes });
}

async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runGit(['rev-parse', '--git-dir'], cwd, 1000);
  return result.exitCode === 0;
}

export async function gitStatus({ path: inputPath }: { path?: string } = {}) {
  const cwd = inputPath ? resolveWorkspacePath(inputPath).absolutePath : WORKSPACE_ROOT;

  if (!(await isGitRepo(cwd))) {
    return {
      ok: true,
      tool: 'git_status',
      isGitRepo: false,
    };
  }

  const result = await runGit(['status', '--short', '--branch'], cwd, 5000);
  const lines = result.stdout.split('\n').filter(Boolean);

  let branch: string | undefined;
  const entries: Array<{ code: string; path: string }> = [];

  for (const line of lines) {
    if (line.startsWith('##')) {
      const rest = line.slice(3).trim();
      branch = rest.split('...')[0];
    } else if (line.length >= 2) {
      const code = line.slice(0, 2);
      const filePath = line.slice(3);
      entries.push({ code, path: filePath });
    }
  }

  return {
    ok: true,
    tool: 'git_status',
    isGitRepo: true,
    branch,
    dirty: entries.length > 0,
    entries,
    raw: result.stdout,
  };
}

export async function gitDiffStat({
  path: inputPath,
  staged = false,
}: { path?: string; staged?: boolean } = {}) {
  const cwd = inputPath ? resolveWorkspacePath(inputPath).absolutePath : WORKSPACE_ROOT;

  if (!(await isGitRepo(cwd))) {
    return {
      ok: true,
      tool: 'git_diff_stat',
      isGitRepo: false,
    };
  }

  const args = staged ? ['diff', '--cached', '--stat'] : ['diff', '--stat'];
  const result = await runGit(args, cwd, 10000);

  return {
    ok: true,
    tool: 'git_diff_stat',
    isGitRepo: true,
    stat: result.stdout,
    truncated: result.truncated,
  };
}

export async function gitDiff({
  path: inputPath,
  staged = false,
  maxOutputBytes,
}: { path?: string; staged?: boolean; maxOutputBytes?: number } = {}) {
  const cwd = inputPath ? resolveWorkspacePath(inputPath).absolutePath : WORKSPACE_ROOT;

  if (!(await isGitRepo(cwd))) {
    return {
      ok: true,
      tool: 'git_diff',
      isGitRepo: false,
    };
  }

  const args = staged ? ['diff', '--cached'] : ['diff'];
  const result = await runGit(args, cwd, maxOutputBytes);

  return {
    ok: true,
    tool: 'git_diff',
    isGitRepo: true,
    diff: result.stdout,
    truncated: result.truncated,
    outputBytes: Buffer.byteLength(result.stdout, 'utf-8'),
  };
}
