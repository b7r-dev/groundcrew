import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-search-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadSearch() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/search.js');
}

describe('search_context', () => {
  it('returns ok with truncated=true when output exceeds maxOutputBytes', async () => {
    // Create a file with many lines containing a repeated pattern.
    // With --context 2, each match outputs ~5 lines of JSON from rg.
    // 1000 matches * ~200 bytes each = ~200KB, well over the 20KB default limit.
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(`// context line A ${i}`);
      lines.push(`// context line B ${i}`);
      lines.push(`MATCH_TOKEN line ${i}`);
      lines.push(`// context line C ${i}`);
      lines.push(`// context line D ${i}`);
    }
    fs.writeFileSync(path.join(tempDir, 'big.txt'), lines.join('\n'));

    const { searchContext } = await loadSearch();
    const result = await searchContext({
      pattern: 'MATCH_TOKEN',
      maxResults: 100, // high match count to force large output
      maxOutputBytes: 5000, // intentionally small to trigger truncation
    });

    expect(result.ok).toBe(true);
    expect((result as any).truncated).toBe(true);
    expect((result as any).matches.length).toBeGreaterThan(0);
    expect((result as any).matchCount).toBeGreaterThan(0);
  });

  it('returns empty results when pattern has no matches', async () => {
    fs.writeFileSync(path.join(tempDir, 'small.txt'), 'hello world');
    const { searchContext } = await loadSearch();
    const result = await searchContext({
      pattern: 'NOT_FOUND_98765',
      maxResults: 10,
    });

    expect(result.ok).toBe(true);
    expect((result as any).matches).toEqual([]);
    expect((result as any).matchCount).toBe(0);
    expect((result as any).filesMatched).toBe(0);
    expect((result as any).truncated).toBe(false);
  });
});
