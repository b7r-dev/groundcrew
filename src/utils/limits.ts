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
  // Truncate the byte array and decode back. TextDecoder handles incomplete
  // multi-byte sequences gracefully, but the replacement character can
  // occasionally cause the re-encoded length to slightly exceed maxBytes.
  // We trim one code-unit at a time until we are safely under the limit.
  const truncatedBytes = bytes.slice(0, maxBytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let output = decoder.decode(truncatedBytes);
  let outputBytes = encoder.encode(output).length;
  while (outputBytes > maxBytes && output.length > 0) {
    output = output.slice(0, -1);
    outputBytes = encoder.encode(output).length;
  }
  return { output, truncated: true, outputBytes };
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
