import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-safety-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadUtils() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  const mod = await import('../src/utils/path.js');
  return mod;
}

describe('resolveWorkspacePath', () => {
  it('rejects path traversal outside workspace', async () => {
    const { resolveWorkspacePath } = await loadUtils();
    try {
      resolveWorkspacePath('../outside');
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('outside the workspace root');
    }
  });

  it('rejects absolute path outside workspace', async () => {
    const { resolveWorkspacePath } = await loadUtils();
    try {
      resolveWorkspacePath('/tmp/outside');
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('outside the workspace');
    }
  });

  it('rejects home path', async () => {
    const { resolveWorkspacePath } = await loadUtils();
    try {
      resolveWorkspacePath('~/foo');
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('~');
    }
  });

  it('resolves relative path inside workspace', async () => {
    const { resolveWorkspacePath } = await loadUtils();
    const result = resolveWorkspacePath('src/foo.ts');
    expect(result.absolutePath).toBe(path.join(tempDir, 'src', 'foo.ts'));
    expect(result.relativePath).toBe(path.join('src', 'foo.ts'));
  });

  it('resolves absolute path inside workspace', async () => {
    const { resolveWorkspacePath } = await loadUtils();
    const inside = path.join(tempDir, 'bar.ts');
    const result = resolveWorkspacePath(inside);
    expect(result.absolutePath).toBe(inside);
  });
});
