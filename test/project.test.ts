import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-proj-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadProject() {
  process.env.GROUNDCREW_WORKSPACE_ROOT = tempDir;
  vi.resetModules();
  return import('../src/tools/project.js');
}

describe('detect_project', () => {
  it('identifies Node package', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', version: '1.0.0' }),
    );
    const { detectProject } = await loadProject();
    const result = detectProject({});
    expect(result.projectTypes.map((p) => p.type)).toContain('node');
    expect(result.importantFiles).toContain('package.json');
  });
});

describe('list_project_commands', () => {
  it('parses package scripts', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: {
          build: 'tsc',
          test: 'vitest',
        },
      }),
    );
    const { listProjectCommands } = await loadProject();
    const result = listProjectCommands({});
    const names = result.commands.map((c) => c.name);
    expect(names).toContain('build');
    expect(names).toContain('test');
  });
});
