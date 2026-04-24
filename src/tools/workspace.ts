import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE_ROOT, DEFAULT_LIMITS } from '../config.js';
import { runCommand } from '../utils/spawn.js';

async function commandExists(cmd: string): Promise<boolean> {
  const result = await runCommand(
    process.platform === 'win32' ? 'where' : 'command',
    process.platform === 'win32' ? [cmd] : ['-v', cmd],
    { timeoutMs: 2000, maxOutputBytes: 100 },
  );
  return result.exitCode === 0;
}

export async function workspaceInfo({ includeTools = false }: { includeTools?: boolean }) {
  const gitRoot = await (async () => {
    const result = await runCommand('git', ['rev-parse', '--show-toplevel'], {
      cwd: WORKSPACE_ROOT,
      timeoutMs: 3000,
    });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return undefined;
  })();

  const availableTools = includeTools
    ? {
        git: await commandExists('git'),
        rg: await commandExists('rg'),
        node: await commandExists('node'),
        npm: await commandExists('npm'),
        pnpm: await commandExists('pnpm'),
        yarn: await commandExists('yarn'),
      }
    : undefined;

  const packageVersion = (() => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf-8'));
      return pkg.version as string | undefined;
    } catch {
      return undefined;
    }
  })();

  return {
    ok: true,
    tool: 'workspace_info',
    cwd: WORKSPACE_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    platform: process.platform,
    nodeVersion: process.version,
    packageVersion,
    gitRoot,
    availableTools,
    limits: { ...DEFAULT_LIMITS },
    safety: {
      pathTraversalGuard: true,
      outsideWorkspaceGuard: true,
      homePathGuard: true,
      dryRunDefault: true,
      overwriteRefusalDefault: true,
    },
  };
}
