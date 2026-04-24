import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-preview-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadPreview() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/preview.js');
}

describe('preview_file', () => {
  it('returns bounded lines', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    fs.writeFileSync(path.join(tempDir, 'big.txt'), lines.join('\n'));
    const { previewFile } = await loadPreview();
    const result = previewFile({ path: 'big.txt', lineCount: 10 });
    expect(result.startLine).toBe(1);
    expect(result.content.split('\n').length).toBe(10);
    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(500);
  });

  it('refuses binary files', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    fs.writeFileSync(path.join(tempDir, 'binary.dat'), buf);
    const { previewFile } = await loadPreview();
    try {
      previewFile({ path: 'binary.dat' });
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('binary');
    }
  });

  it('refuses directories', async () => {
    fs.mkdirSync(path.join(tempDir, 'subdir'));
    const { previewFile } = await loadPreview();
    try {
      previewFile({ path: 'subdir' });
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('directory');
    }
  });
});
