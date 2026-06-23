import { describe, it, expect } from 'vitest';
import { capOutput, capResults } from '../src/utils/limits.js';

describe('capOutput', () => {
  it('returns unchanged text when under the byte limit', () => {
    const result = capOutput('hello world', 100);
    expect(result.truncated).toBe(false);
    expect(result.output).toBe('hello world');
    expect(result.outputBytes).toBe(11);
  });

  it('truncates text that exceeds the byte limit', () => {
    const text = 'a'.repeat(1000);
    const result = capOutput(text, 100);
    expect(result.truncated).toBe(true);
    expect(result.outputBytes).toBeLessThanOrEqual(100);
    expect(result.output.length).toBeLessThan(1000);
  });

  it('handles multi-byte characters correctly', () => {
    const text = '🎉'.repeat(100);
    const result = capOutput(text, 100);
    expect(result.truncated).toBe(true);
    expect(result.outputBytes).toBeLessThanOrEqual(100);
  });

  it('returns empty string for empty input', () => {
    const result = capOutput('', 100);
    expect(result.truncated).toBe(false);
    expect(result.output).toBe('');
    expect(result.outputBytes).toBe(0);
  });
});

describe('capResults', () => {
  it('returns unchanged array when under the limit', () => {
    const arr = [1, 2, 3];
    const result = capResults(arr, 10);
    expect(result.truncated).toBe(false);
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.count).toBe(3);
  });

  it('truncates array that exceeds the limit', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = capResults(arr, 3);
    expect(result.truncated).toBe(true);
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.count).toBe(5);
  });
});
