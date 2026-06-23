import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-git-'));
  spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir, stdio: 'ignore' });
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadGit() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/git.js');
}

describe('git_status', () => {
  it('returns not a git repo for non-repo path', async () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-nogit-'));
    process.env.GROUNDCREW_WORKSPACE_ROOT = nonRepo;
    vi.resetModules();
    const { gitStatus } = await import('../src/tools/git.js');
    const result = await gitStatus({});
    expect(result.isGitRepo).toBe(false);
    fs.rmSync(nonRepo, { recursive: true, force: true });
  });

  it('reports branch and dirty state', async () => {
    fs.writeFileSync(path.join(tempDir, 'a.txt'), 'hello');
    const { gitStatus } = await loadGit();
    const result = await gitStatus({});
    expect(result.isGitRepo).toBe(true);
    expect(result.branch).toBeDefined();
    expect(result.dirty).toBe(true);
    expect(result.entries!.length).toBeGreaterThan(0);
  });
});

describe('git_diff_stat', () => {
  it('returns stat for unstaged changes', async () => {
    fs.writeFileSync(path.join(tempDir, 'b.txt'), 'world');
    const { gitDiffStat } = await loadGit();
    const result = await gitDiffStat({});
    expect(result.isGitRepo).toBe(true);
    expect((result as any).stat).toBeDefined();
  });
});

describe('git_diff', () => {
  it('returns diff for unstaged changes', async () => {
    fs.writeFileSync(path.join(tempDir, 'c.txt'), 'diff me');
    const { gitDiff } = await loadGit();
    const result = await gitDiff({});
    expect(result.isGitRepo).toBe(true);
    expect((result as any).diff).toBeDefined();
  });

  it('returns diff for staged changes', async () => {
    fs.writeFileSync(path.join(tempDir, 'd.txt'), 'staged');
    spawnSync('git', ['add', 'd.txt'], { cwd: tempDir, stdio: 'ignore' });
    const { gitDiff } = await loadGit();
    const result = await gitDiff({ staged: true });
    expect(result.isGitRepo).toBe(true);
    expect((result as any).diff).toBeDefined();
  });
});
