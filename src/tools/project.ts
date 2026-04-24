import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE_ROOT } from '../config.js';
import { resolveWorkspacePath } from '../utils/path.js';

interface ProjectType {
  type: string;
  files: string[];
}

const DETECTORS: Array<{ type: string; files: string[] }> = [
  { type: 'node', files: ['package.json'] },
  { type: 'go', files: ['go.mod'] },
  { type: 'python', files: ['pyproject.toml', 'requirements.txt', 'setup.py'] },
  { type: 'rust', files: ['Cargo.toml'] },
  { type: 'make', files: ['Makefile'] },
];

const LOCKFILES: Record<string, string> = {
  'package-lock.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
  'bun.lock': 'bun',
  'poetry.lock': 'poetry',
  'Cargo.lock': 'cargo',
};

export function detectProject({ path: inputPath }: { path?: string } = {}) {
  const root = inputPath ? resolveWorkspacePath(inputPath).absolutePath : WORKSPACE_ROOT;

  const projectTypes: ProjectType[] = [];
  const packageManagers: string[] = [];
  const importantFiles: string[] = [];
  let isGitRepo = false;

  try {
    const entries = fs.readdirSync(root);
    for (const entry of entries) {
      const fullPath = path.join(root, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      importantFiles.push(entry);

      for (const detector of DETECTORS) {
        if (detector.files.includes(entry)) {
          const existing = projectTypes.find((p) => p.type === detector.type);
          if (existing) {
            existing.files.push(entry);
          } else {
            projectTypes.push({ type: detector.type, files: [entry] });
          }
        }
      }

      if (LOCKFILES[entry] && !packageManagers.includes(LOCKFILES[entry])) {
        packageManagers.push(LOCKFILES[entry]);
      }
    }
  } catch {
    // ignore
  }

  try {
    if (fs.statSync(path.join(root, '.git')).isDirectory()) {
      isGitRepo = true;
    }
  } catch {
    // ignore
  }

  if (isGitRepo && !projectTypes.find((p) => p.type === 'git')) {
    projectTypes.push({ type: 'git', files: ['.git'] });
  }

  return {
    ok: true,
    tool: 'detect_project',
    projectTypes,
    packageManagers,
    importantFiles,
    likelyCommands: [] as string[],
    isGitRepo,
  };
}

export function listProjectCommands({ path: inputPath }: { path?: string } = {}) {
  const root = inputPath ? resolveWorkspacePath(inputPath).absolutePath : WORKSPACE_ROOT;
  const commands: Array<{
    name: string;
    command: string;
    args: string[];
    source: string;
    risk: 'safe' | 'medium' | 'risky';
  }> = [];
  const notes: string[] = [];

  // Node
  try {
    const pkgPath = path.join(root, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      for (const [name, script] of Object.entries(pkg.scripts)) {
        if (typeof script !== 'string') continue;
        commands.push({
          name,
          command: 'npm',
          args: ['run', name],
          source: 'package.json',
          risk: inferRisk(script),
        });
      }
    }
  } catch {
    // ignore
  }

  // Make
  try {
    const makefilePath = path.join(root, 'Makefile');
    const content = fs.readFileSync(makefilePath, 'utf-8');
    const targetRegex = /^([a-zA-Z0-9_.-]+):/gm;
    let match;
    while ((match = targetRegex.exec(content)) !== null) {
      const target = match[1];
      if (target === 'PHONY') continue;
      commands.push({
        name: target,
        command: 'make',
        args: [target],
        source: 'Makefile',
        risk: 'medium',
      });
    }
  } catch {
    // ignore
  }

  // Go
  try {
    const goModPath = path.join(root, 'go.mod');
    fs.accessSync(goModPath);
    commands.push({
      name: 'test',
      command: 'go',
      args: ['test', './...'],
      source: 'go.mod',
      risk: 'safe',
    });
    commands.push({
      name: 'build',
      command: 'go',
      args: ['build', './...'],
      source: 'go.mod',
      risk: 'safe',
    });
  } catch {
    // ignore
  }

  // Rust
  try {
    const cargoPath = path.join(root, 'Cargo.toml');
    fs.accessSync(cargoPath);
    commands.push({
      name: 'test',
      command: 'cargo',
      args: ['test'],
      source: 'Cargo.toml',
      risk: 'safe',
    });
    commands.push({
      name: 'build',
      command: 'cargo',
      args: ['build'],
      source: 'Cargo.toml',
      risk: 'safe',
    });
  } catch {
    // ignore
  }

  // Python
  try {
    const pyprojectPath = path.join(root, 'pyproject.toml');
    fs.accessSync(pyprojectPath);
    commands.push({
      name: 'test',
      command: 'pytest',
      args: [],
      source: 'pyproject.toml',
      risk: 'medium',
    });
  } catch {
    // ignore
  }

  if (commands.length === 0) {
    notes.push('No recognized project commands found.');
  }

  return {
    ok: true,
    tool: 'list_project_commands',
    commands,
    notes,
  };
}

function inferRisk(script: string): 'safe' | 'medium' | 'risky' {
  const lower = script.toLowerCase();
  if (lower.includes('rm -rf') || lower.includes('curl') || lower.includes('wget') || lower.includes('eval')) {
    return 'risky';
  }
  if (lower.includes('build') || lower.includes('test') || lower.includes('lint') || lower.includes('format')) {
    return 'safe';
  }
  return 'medium';
}
