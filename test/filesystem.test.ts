import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fs-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadTools() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/filesystem.js');
}

describe('path_info', () => {
  it('returns metadata for an existing file', async () => {
    fs.writeFileSync(path.join(tempDir, 'a.txt'), 'hello');
    const { pathInfo } = await loadTools();
    const result = pathInfo({ path: 'a.txt' });
    expect(result.exists).toBe(true);
    expect(result.type).toBe('file');
    expect(result.sizeBytes).toBe(5);
  });

  it('returns missing for nonexistent path', async () => {
    const { pathInfo } = await loadTools();
    const result = pathInfo({ path: 'nope.txt' });
    expect(result.exists).toBe(false);
    expect(result.type).toBe('missing');
  });
});

describe('ensure_dir', () => {
  it('creates directory in dry run without mutating', async () => {
    const { ensureDir } = await loadTools();
    const result = ensureDir({ path: 'new-dir', dryRun: true });
    expect(result.created).toBe(false);
    expect(result.existed).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'new-dir'))).toBe(false);
  });

  it('creates directory for real', async () => {
    const { ensureDir } = await loadTools();
    const result = ensureDir({ path: 'real-dir', dryRun: false });
    expect(result.created).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'real-dir'))).toBe(true);
  });
});

describe('move_path', () => {
  it('moves file in dry run without mutating', async () => {
    fs.writeFileSync(path.join(tempDir, 'src.txt'), 'content');
    const { movePath } = await loadTools();
    const result = movePath({ from: 'src.txt', to: 'dst.txt', dryRun: true });
    expect(result.moved).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'src.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'dst.txt'))).toBe(false);
  });

  it('moves file for real', async () => {
    fs.writeFileSync(path.join(tempDir, 'mv-src.txt'), 'content');
    const { movePath } = await loadTools();
    const result = movePath({ from: 'mv-src.txt', to: 'mv-dst.txt', dryRun: false });
    expect(result.moved).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'mv-src.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'mv-dst.txt'))).toBe(true);
  });

  it('refuses overwrite by default', async () => {
    fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
    const { movePath } = await loadTools();
    try {
      movePath({ from: 'a.txt', to: 'b.txt', dryRun: false });
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('already exists');
    }
  });
});

describe('safe_move_path', () => {
  it('verifies before deleting original', async () => {
    fs.writeFileSync(path.join(tempDir, 'safe-src.txt'), 'safe-content');
    const { safeMovePath } = await loadTools();
    const result = safeMovePath({
      from: 'safe-src.txt',
      to: 'safe-dst.txt',
      dryRun: false,
    });
    expect(result.moved).toBe(true);
    expect(result.verified).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'safe-src.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'safe-dst.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'safe-dst.txt'), 'utf-8')).toBe('safe-content');
  });

  it('rejects directories', async () => {
    fs.mkdirSync(path.join(tempDir, 'safe-dir'));
    const { safeMovePath } = await loadTools();
    try {
      safeMovePath({ from: 'safe-dir', to: 'safe-dir2', dryRun: false });
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('does not support directories');
    }
  });
});
