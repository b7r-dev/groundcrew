import { DEFAULT_LIMITS } from '../config.js';

export function capOutput(text: string, maxBytes: number = DEFAULT_LIMITS.maxOutputBytes): {
  output: string;
  truncated: boolean;
  outputBytes: number;
} {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  if (bytes.length <= maxBytes) {
    return { output: text, truncated: false, outputBytes: bytes.length };
  }
  // Slice by bytes and decode safely
  let slice = text;
  while (encoder.encode(slice).length > maxBytes) {
    slice = slice.slice(0, -1);
  }
  return { output: slice, truncated: true, outputBytes: encoder.encode(slice).length };
}

export function capResults<T>(results: T[], maxResults: number = DEFAULT_LIMITS.maxResults): {
  items: T[];
  truncated: boolean;
  count: number;
} {
  if (results.length <= maxResults) {
    return { items: results, truncated: false, count: results.length };
  }
  return {
    items: results.slice(0, maxResults),
    truncated: true,
    count: results.length,
  };
}
