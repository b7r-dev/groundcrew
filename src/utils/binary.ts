import fs from 'node:fs';
import { GroundcrewError } from '../errors.js';

const MAX_SCAN_BYTES = 8 * 1024;

export function isBinaryFile(absolutePath: string): boolean {
  try {
    const fd = fs.openSync(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(MAX_SCAN_BYTES);
      const bytesRead = fs.readSync(fd, buffer, 0, MAX_SCAN_BYTES, 0);
      return isBinaryBuffer(buffer.subarray(0, bytesRead));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  // If contains null bytes, it's binary
  if (buffer.includes(0x00)) return true;

  let nonPrintable = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    // Allow common text bytes: printable ASCII, tab, newline, carriage return
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      nonPrintable++;
    } else if (byte > 0x7e && byte < 0xa0) {
      // C1 control characters (rare in text)
      nonPrintable++;
    }
  }

  return nonPrintable / buffer.length > 0.3;
}

export function refuseBinary(absolutePath: string, operation: string): void {
  if (isBinaryFile(absolutePath)) {
    throw new GroundcrewError(
      'BINARY_FILE',
      `Refusing ${operation} on likely binary file: ${absolutePath}`,
    );
  }
}
