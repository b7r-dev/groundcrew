import { describe, it, expect } from 'vitest';
import { unifiedDiff } from '../src/utils/diff.js';

describe('unifiedDiff', () => {
  it('returns header only for identical lines', () => {
    const lines = ['hello', 'world'];
    const result = unifiedDiff(lines, lines, 'test.txt');
    expect(result).toContain('--- test.txt');
    expect(result).toContain('+++ test.txt');
    expect(result).not.toContain('@@');
  });

  it('shows added lines', () => {
    const original = ['line 1'];
    const modified = ['line 1', 'line 2'];
    const result = unifiedDiff(original, modified, 'test.txt');
    expect(result).toContain('--- test.txt');
    expect(result).toContain('+++ test.txt');
    expect(result).toContain('+line 2');
  });

  it('shows removed lines', () => {
    const original = ['line 1', 'line 2'];
    const modified = ['line 1'];
    const result = unifiedDiff(original, modified, 'test.txt');
    expect(result).toContain('-line 2');
  });

  it('shows changed lines', () => {
    const original = ['old text'];
    const modified = ['new text'];
    const result = unifiedDiff(original, modified, 'test.txt');
    expect(result).toContain('-old text');
    expect(result).toContain('+new text');
  });

  it('truncates when exceeding maxLines', () => {
    const original = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const modified = Array.from({ length: 20 }, (_, i) => `modified ${i}`);
    const result = unifiedDiff(original, modified, 'test.txt', 5);
    expect(result).toContain('... (diff truncated)');
  });
});
