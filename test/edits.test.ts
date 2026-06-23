import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-edits-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadEdits() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/edits.js');
}

describe('replace_text', () => {
  it('dry-run does not mutate', async () => {
    fs.writeFileSync(path.join(tempDir, 'edit.txt'), 'hello world');
    const { replaceText } = await loadEdits();
    const result = replaceText({
      path: 'edit.txt',
      search: 'world',
      replacement: 'earth',
      dryRun: true,
    });
    expect(result.changed).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'edit.txt'), 'utf-8')).toBe('hello world');
  });

  it('apply mutates exactly expected content', async () => {
    fs.writeFileSync(path.join(tempDir, 'edit2.txt'), 'foo bar baz');
    const { replaceText } = await loadEdits();
    const result = replaceText({
      path: 'edit2.txt',
      search: 'bar',
      replacement: 'qux',
      dryRun: false,
    });
    expect(result.changed).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(fs.readFileSync(path.join(tempDir, 'edit2.txt'), 'utf-8')).toBe('foo qux baz');
  });
});

describe('replace_regex', () => {
  it('validates bad regex', async () => {
    fs.writeFileSync(path.join(tempDir, 're.txt'), 'abc');
    const { replaceRegex } = await loadEdits();
    try {
      replaceRegex({
        path: 're.txt',
        pattern: '[invalid',
        replacement: 'x',
        dryRun: true,
      });
      expect.fail('should throw');
    } catch (err) {
      expect((err as Error).message).toContain('Invalid regex');
    }
  });

  it('replaces with regex', async () => {
    fs.writeFileSync(path.join(tempDir, 're2.txt'), 'foo 123 bar 456');
    const { replaceRegex } = await loadEdits();
    const result = replaceRegex({
      path: 're2.txt',
      pattern: '\\d+',
      replacement: 'NUM',
      flags: 'g',
      maxReplacements: 1,
      dryRun: false,
    });
    expect(result.changed).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 're2.txt'), 'utf-8')).toBe('foo NUM bar 456');
  });

  it('non-global regex respects maxReplacements=0', async () => {
    fs.writeFileSync(path.join(tempDir, 're3.txt'), 'foo 123 bar 456');
    const { replaceRegex } = await loadEdits();
    const result = replaceRegex({
      path: 're3.txt',
      pattern: '\\d+',
      replacement: 'NUM',
      flags: '',
      maxReplacements: 0,
      dryRun: false,
    });
    expect(result.changed).toBe(false);
    expect(result.matches).toBe(1);
    expect(result.replacements).toBe(0);
    expect(fs.readFileSync(path.join(tempDir, 're3.txt'), 'utf-8')).toBe('foo 123 bar 456');
  });

  it('non-global regex replaces 1 match by default', async () => {
    fs.writeFileSync(path.join(tempDir, 're4.txt'), 'foo 123 bar 456');
    const { replaceRegex } = await loadEdits();
    const result = replaceRegex({
      path: 're4.txt',
      pattern: '\\d+',
      replacement: 'NUM',
      flags: '',
      maxReplacements: 1,
      dryRun: false,
    });
    expect(result.changed).toBe(true);
    expect(result.matches).toBe(1);
    expect(result.replacements).toBe(1);
    expect(fs.readFileSync(path.join(tempDir, 're4.txt'), 'utf-8')).toBe('foo NUM bar 456');
  });
});
