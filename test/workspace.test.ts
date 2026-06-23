import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-workspace-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadWorkspace() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/workspace.js');
}

describe('workspace_info', () => {
  it('returns basic workspace facts', async () => {
    const { workspaceInfo } = await loadWorkspace();
    const result = await workspaceInfo({});
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('workspace_info');
    expect(result.cwd).toBe(tempDir);
    expect(result.workspaceRoot).toBe(tempDir);
    expect(result.platform).toBe(process.platform);
    expect(result.nodeVersion).toBe(process.version);
    expect(result.limits).toBeDefined();
    expect(result.safety).toBeDefined();
    expect(result.safety.dryRunDefault).toBe(true);
    expect(result.safety.overwriteRefusalDefault).toBe(true);
  });

  it('detects git root when inside a repo', async () => {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), '');
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });

    const { workspaceInfo } = await loadWorkspace();
    const result = await workspaceInfo({});
    expect(result.gitRoot).toBe(fs.realpathSync(tempDir));
  });

  it('reads package version when package.json exists', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', version: '2.0.0' }),
    );
    const { workspaceInfo } = await loadWorkspace();
    const result = await workspaceInfo({});
    expect(result.packageVersion).toBe('2.0.0');
  });

  it('returns available tools when includeTools is true', async () => {
    const { workspaceInfo } = await loadWorkspace();
    const result = await workspaceInfo({ includeTools: true });
    expect(result.availableTools).toBeDefined();
    expect(typeof (result as any).availableTools.node).toBe('boolean');
  });
});
