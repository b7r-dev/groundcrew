#!/usr/bin/env node
/**
 * Golden directory smoke test for Groundcrew MCP server.
 *
 * Spins up a temporary workspace with a git repo, files, and nested dirs,
 * then exercises every tool via real JSON-RPC over stdio.
 *
 * Run after `npm run build`:
 *   node scripts/smoke-test.js
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../dist/index.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

async function sendRequest(proc, method, params, id) {
  const req = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  proc.stdin.write(req + '\n');
}

function collectResponses(proc, expectedCount, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const responses = [];
    let buffer = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timed out waiting for ${expectedCount} responses, got ${responses.length}`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          responses.push(JSON.parse(line));
          if (responses.length >= expectedCount) {
            clearTimeout(timer);
            resolve(responses);
          }
        } catch {
          // ignore malformed lines
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', () => {
      clearTimeout(timer);
      resolve(responses);
    });
  });
}

async function run() {
  // ── Setup temp workspace ──────────────────────────────────────────────
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-smoke-'));
  console.log(`Workspace: ${tempDir}`);

  // Nested dirs
  fs.mkdirSync(path.join(tempDir, 'src', 'utils'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'test'), { recursive: true });

  // Text files
  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Smoke Test\n\nHello world.\n');
  fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), "export const foo = 'bar';\n");
  fs.writeFileSync(
    path.join(tempDir, 'src', 'utils', 'helpers.ts'),
    "export function helper() { return 42; }\n"
  );

  // Large file for truncation test
  const bigLines = [];
  for (let i = 0; i < 800; i++) {
    bigLines.push(`// context A ${i}`);
    bigLines.push(`MATCH_TOKEN line ${i}`);
    bigLines.push(`// context B ${i}`);
  }
  fs.writeFileSync(path.join(tempDir, 'big.txt'), bigLines.join('\n'));

  // package.json for project detection
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'smoke-test',
      version: '1.0.0',
      scripts: { build: 'tsc', test: 'vitest' },
    }, null, 2)
  );

  // Git repo
  const gitInit = spawn('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
  await new Promise((r) => gitInit.on('close', r));
  const gitConfig = spawn('git', ['config', 'user.email', 'smoke@test.com'], { cwd: tempDir, stdio: 'ignore' });
  await new Promise((r) => gitConfig.on('close', r));
  const gitConfig2 = spawn('git', ['config', 'user.name', 'Smoke Test'], { cwd: tempDir, stdio: 'ignore' });
  await new Promise((r) => gitConfig2.on('close', r));

  // ── Spawn MCP server ──────────────────────────────────────────────────
  const proc = spawn('node', [SERVER_PATH], {
    env: { ...process.env, GROUNDCREW_WORKSPACE_ROOT: tempDir },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // ── Send requests ─────────────────────────────────────────────────────
  const requests = [
    // 1. initialize
    { id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0.0' } } },
    // 2. tools/list
    { id: 2, method: 'tools/list', params: {} },
    // 3. workspace_info
    { id: 3, method: 'tools/call', params: { name: 'workspace_info', arguments: {} } },
    // 4. path_info existing file
    { id: 4, method: 'tools/call', params: { name: 'path_info', arguments: { path: 'README.md' } } },
    // 5. path_info missing
    { id: 5, method: 'tools/call', params: { name: 'path_info', arguments: { path: 'nope.txt' } } },
    // 6. find_files
    { id: 6, method: 'tools/call', params: { name: 'find_files', arguments: { glob: 'src/**/*.ts', maxResults: 10 } } },
    // 7. search_context with matches
    { id: 7, method: 'tools/call', params: { name: 'search_context', arguments: { pattern: 'MATCH_TOKEN', maxResults: 5 } } },
    // 8. search_context no matches
    { id: 8, method: 'tools/call', params: { name: 'search_context', arguments: { pattern: 'NOT_FOUND_12345', maxResults: 5 } } },
    // 9. search_context truncation (small maxOutputBytes)
    { id: 9, method: 'tools/call', params: { name: 'search_context', arguments: { pattern: 'MATCH_TOKEN', maxResults: 100, maxOutputBytes: 3000 } } },
    // 10. preview_file
    { id: 10, method: 'tools/call', params: { name: 'preview_file', arguments: { path: 'README.md' } } },
    // 11. git_status
    { id: 11, method: 'tools/call', params: { name: 'git_status', arguments: {} } },
    // 12. git_diff_stat
    { id: 12, method: 'tools/call', params: { name: 'git_diff_stat', arguments: {} } },
    // 13. ensure_dir dry run
    { id: 13, method: 'tools/call', params: { name: 'ensure_dir', arguments: { path: 'new-dir', dryRun: true } } },
    // 14. replace_text dry run
    { id: 14, method: 'tools/call', params: { name: 'replace_text', arguments: { path: 'README.md', search: 'Hello', replacement: 'Hi', dryRun: true } } },
    // 15. replace_regex dry run
    { id: 15, method: 'tools/call', params: { name: 'replace_regex', arguments: { path: 'README.md', pattern: 'world', replacement: 'universe', dryRun: true } } },
    // 16. detect_project
    { id: 16, method: 'tools/call', params: { name: 'detect_project', arguments: {} } },
    // 17. list_project_commands
    { id: 17, method: 'tools/call', params: { name: 'list_project_commands', arguments: {} } },
    // 18. move_path dry run
    { id: 18, method: 'tools/call', params: { name: 'move_path', arguments: { from: 'README.md', to: 'README2.md', dryRun: true } } },
    // 19. copy_path dry run
    { id: 19, method: 'tools/call', params: { name: 'copy_path', arguments: { from: 'README.md', to: 'README-copy.md', dryRun: true } } },
    // 20. safe_move_path dry run
    { id: 20, method: 'tools/call', params: { name: 'safe_move_path', arguments: { from: 'README.md', to: 'README-safe.md', dryRun: true } } },
    // 21. path traversal error
    { id: 21, method: 'tools/call', params: { name: 'path_info', arguments: { path: '../outside' } } },
    // 22. invalid regex error
    { id: 22, method: 'tools/call', params: { name: 'replace_regex', arguments: { path: 'README.md', pattern: '[bad', replacement: 'x', dryRun: true } } },
    // 23. empty search error
    { id: 23, method: 'tools/call', params: { name: 'replace_text', arguments: { path: 'README.md', search: '', replacement: 'x', dryRun: true } } },
    // 24. unknown tool error
    { id: 24, method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } },
  ];

  for (const req of requests) {
    await sendRequest(proc, req.method, req.params, req.id);
  }

  const responses = await collectResponses(proc, requests.length, 20000);
  proc.stdin.end();

  // ── Assertions ────────────────────────────────────────────────────────
  const byId = Object.fromEntries(responses.map((r) => [r.id, r]));

  console.log('\n--- Results ---');

  // 1. initialize
  console.log(`[1] initialize`);
  assert(byId[1]?.result?.serverInfo?.name === 'groundcrew', 'server name is groundcrew');

  // 2. tools/list
  console.log(`[2] tools/list`);
  const tools = byId[2]?.result?.tools;
  assert(Array.isArray(tools), 'tools is array');
  assert(tools.length >= 10, `has at least 10 tools, got ${tools?.length}`);

  // 3. workspace_info
  console.log(`[3] workspace_info`);
  assert(byId[3]?.result?.content?.[0]?.text?.includes('"ok":true'), 'workspace_info ok');

  // 4. path_info existing
  console.log(`[4] path_info (existing)`);
  const p4 = JSON.parse(byId[4]?.result?.content?.[0]?.text);
  assert(p4.ok === true, 'path_info ok');
  assert(p4.exists === true, 'path_info exists');
  assert(p4.type === 'file', 'path_info type file');

  // 5. path_info missing
  console.log(`[5] path_info (missing)`);
  const p5 = JSON.parse(byId[5]?.result?.content?.[0]?.text);
  assert(p5.ok === true, 'path_info ok for missing');
  assert(p5.exists === false, 'path_info missing');

  // 6. find_files
  console.log(`[6] find_files`);
  const p6 = JSON.parse(byId[6]?.result?.content?.[0]?.text);
  assert(p6.ok === true, 'find_files ok');
  assert(p6.count >= 2, `find_files count >= 2, got ${p6.count}`);

  // 7. search_context matches
  console.log(`[7] search_context (matches)`);
  const p7 = JSON.parse(byId[7]?.result?.content?.[0]?.text);
  assert(p7.ok === true, 'search_context ok');
  assert(p7.matchCount > 0, `search_context has matches, got ${p7.matchCount}`);

  // 8. search_context no matches
  console.log(`[8] search_context (no matches)`);
  const p8 = JSON.parse(byId[8]?.result?.content?.[0]?.text);
  assert(p8.ok === true, 'search_context no-match ok');
  assert(p8.matchCount === 0, 'search_context no-match count 0');

  // 9. search_context truncation
  console.log(`[9] search_context (truncation)`);
  const p9 = JSON.parse(byId[9]?.result?.content?.[0]?.text);
  assert(p9.ok === true, 'search_context truncation ok');
  assert(p9.truncated === true, 'search_context truncated flag');
  assert(p9.matches.length > 0, 'search_context truncation has partial matches');

  // 10. preview_file
  console.log(`[10] preview_file`);
  const p10 = JSON.parse(byId[10]?.result?.content?.[0]?.text);
  assert(p10.ok === true, 'preview_file ok');
  assert(p10.content.includes('Hello world'), 'preview_file content');

  // 11. git_status
  console.log(`[11] git_status`);
  const p11 = JSON.parse(byId[11]?.result?.content?.[0]?.text);
  assert(p11.ok === true, 'git_status ok');
  assert(p11.isGitRepo === true, 'git_status isGitRepo');

  // 12. git_diff_stat
  console.log(`[12] git_diff_stat`);
  const p12 = JSON.parse(byId[12]?.result?.content?.[0]?.text);
  assert(p12.ok === true, 'git_diff_stat ok');

  // 13. ensure_dir
  console.log(`[13] ensure_dir`);
  const p13 = JSON.parse(byId[13]?.result?.content?.[0]?.text);
  assert(p13.ok === true, 'ensure_dir ok');
  assert(p13.dryRun === true, 'ensure_dir dryRun');

  // 14. replace_text
  console.log(`[14] replace_text`);
  const p14 = JSON.parse(byId[14]?.result?.content?.[0]?.text);
  assert(p14.ok === true, 'replace_text ok');
  assert(p14.changed === true, 'replace_text changed');
  assert(p14.dryRun === true, 'replace_text dryRun');

  // 15. replace_regex
  console.log(`[15] replace_regex`);
  const p15 = JSON.parse(byId[15]?.result?.content?.[0]?.text);
  assert(p15.ok === true, 'replace_regex ok');

  // 16. detect_project
  console.log(`[16] detect_project`);
  const p16 = JSON.parse(byId[16]?.result?.content?.[0]?.text);
  assert(p16.ok === true, 'detect_project ok');
  assert(p16.isGitRepo === true, 'detect_project isGitRepo');

  // 17. list_project_commands
  console.log(`[17] list_project_commands`);
  const p17 = JSON.parse(byId[17]?.result?.content?.[0]?.text);
  assert(p17.ok === true, 'list_project_commands ok');
  assert(p17.commands.length >= 2, `list_project_commands has commands, got ${p17.commands?.length}`);

  // 18. move_path
  console.log(`[18] move_path`);
  const p18 = JSON.parse(byId[18]?.result?.content?.[0]?.text);
  assert(p18.ok === true, 'move_path ok');
  assert(p18.dryRun === true, 'move_path dryRun');

  // 19. copy_path
  console.log(`[19] copy_path`);
  const p19 = JSON.parse(byId[19]?.result?.content?.[0]?.text);
  assert(p19.ok === true, 'copy_path ok');

  // 20. safe_move_path
  console.log(`[20] safe_move_path`);
  const p20 = JSON.parse(byId[20]?.result?.content?.[0]?.text);
  assert(p20.ok === true, 'safe_move_path ok');

  // 21. path traversal error
  console.log(`[21] path_info (path traversal error)`);
  const p21 = JSON.parse(byId[21]?.result?.content?.[0]?.text);
  assert(p21.ok === false, 'path_traversal returns ok:false');
  assert(p21.error?.code === 'PATH_TRAVERSAL', `path_traversal code, got ${p21.error?.code}`);

  // 22. invalid regex error
  console.log(`[22] replace_regex (invalid regex error)`);
  const p22 = JSON.parse(byId[22]?.result?.content?.[0]?.text);
  assert(p22.ok === false, 'invalid regex returns ok:false');
  assert(p22.error?.code === 'INVALID_REGEX', `invalid regex code, got ${p22.error?.code}`);

  // 23. empty search error
  console.log(`[23] replace_text (empty search error)`);
  const p23 = JSON.parse(byId[23]?.result?.content?.[0]?.text);
  assert(p23.ok === false, 'empty search returns ok:false');
  assert(p23.error?.code === 'EMPTY_SEARCH', `empty search code, got ${p23.error?.code}`);

  // 24. unknown tool error
  console.log(`[24] unknown tool error`);
  const p24 = JSON.parse(byId[24]?.result?.content?.[0]?.text);
  assert(p24.ok === false, 'unknown tool returns ok:false');
  assert(p24.error?.code === 'UNKNOWN_TOOL', `unknown tool code, got ${p24.error?.code}`);

  // ── Cleanup ───────────────────────────────────────────────────────────
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
