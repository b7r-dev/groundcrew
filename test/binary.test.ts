import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isBinaryBuffer, isBinaryFile, refuseBinary } from '../src/utils/binary.js';
import { GroundcrewError } from '../src/errors.js';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-binary-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('isBinaryBuffer', () => {
  it('returns false for empty buffer', () => {
    expect(isBinaryBuffer(Buffer.from(''))).toBe(false);
  });

  it('returns true for buffer with null bytes', () => {
    expect(isBinaryBuffer(Buffer.from([0x00, 0x01, 0x02]))).toBe(true);
  });

  it('returns false for plain ASCII text', () => {
    expect(isBinaryBuffer(Buffer.from('hello world\n'))).toBe(false);
  });

  it('returns true when >30% non-printable', () => {
    const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);
    expect(isBinaryBuffer(bytes)).toBe(true);
  });
});

describe('isBinaryFile', () => {
  it('returns false for a text file', () => {
    const filePath = path.join(tempDir, 'text.txt');
    fs.writeFileSync(filePath, 'hello world\n');
    expect(isBinaryFile(filePath)).toBe(false);
  });

  it('returns true for a file with null bytes', () => {
    const filePath = path.join(tempDir, 'binary.dat');
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    expect(isBinaryFile(filePath)).toBe(true);
  });

  it('returns false for a missing file', () => {
    const filePath = path.join(tempDir, 'missing.txt');
    expect(isBinaryFile(filePath)).toBe(false);
  });
});

describe('refuseBinary', () => {
  it('does not throw for a text file', () => {
    const filePath = path.join(tempDir, 'safe.txt');
    fs.writeFileSync(filePath, 'safe content');
    expect(() => refuseBinary(filePath, 'preview_file')).not.toThrow();
  });

  it('throws GroundcrewError with BINARY_FILE code for a binary file', () => {
    const filePath = path.join(tempDir, 'unsafe.dat');
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    try {
      refuseBinary(filePath, 'preview_file');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GroundcrewError);
      expect((err as GroundcrewError).code).toBe('BINARY_FILE');
      expect((err as Error).message).toContain('Refusing preview_file');
    }
  });
});
