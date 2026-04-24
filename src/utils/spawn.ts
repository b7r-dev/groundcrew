import { spawn } from 'node:child_process';
import { DEFAULT_LIMITS } from '../config.js';

export interface SpawnOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export async function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<SpawnResult> {
  const {
    cwd,
    timeoutMs = DEFAULT_LIMITS.spawnTimeoutMs,
    maxOutputBytes = DEFAULT_LIMITS.maxOutputBytes,
  } = options;

  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: { ...process.env, ...(options.env || {}) },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let killed = false;
    let truncated = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Force kill after grace period
      setTimeout(() => child.kill('SIGKILL'), 1000);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (truncated) return;
      stdoutChunks.push(chunk);
      const total = Buffer.concat(stdoutChunks).length;
      if (total > maxOutputBytes) {
        truncated = true;
        child.kill('SIGTERM');
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false,
        truncated: false,
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      resolve({
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut: killed,
        truncated,
      });
    });
  });
}
