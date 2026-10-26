import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverEntry = join(projectRoot, 'src', 'index.js');
const tempDirectory = await mkdtemp(join(tmpdir(), 'mcp-todo-smoke-'));
const databasePath = join(tempDirectory, 'smoke.sqlite');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function requestJson(baseUrl, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  assert(response.ok, `${method} ${path} returned ${response.status}: ${text}`);
  return data;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [serverEntry], {
  cwd: projectRoot,
  env: {
    ...process.env,
    MCP_TODO_DB: databasePath,
    MCP_TODO_PORT: String(port),
    MCP_TODO_WEB: '1',
    MCP_TODO_MCP: '0',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { stderr += chunk; });
const childExit = once(child, 'exit').then(([code, signal]) => ({ code, signal }));

try {
  let ready = false;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup. ${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/api/structure`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  assert(ready, `Server did not become ready. ${stderr}`);

  const pageResponse = await fetch(`${baseUrl}/`);
  const html = await pageResponse.text();
  assert(pageResponse.ok && html.includes('<title>My Tasks</title>'), 'The production web page did not load.');

  const initialStructure = await requestJson(baseUrl, '/api/structure?withCounts=true');
  assert(Array.isArray(initialStructure) && initialStructure.length === 0, 'The isolated smoke-test database should start without projects.');

  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await requestJson(baseUrl, '/api/tasks', {
    method: 'POST',
    body: {
      title: 'Smoke test task',
      project: 'Smoke test project',
      section: 'Smoke test section',
      description: 'Created by the isolated smoke test.',
      dueDate,
      priority: 'high',
    },
  });
  assert(created.id && created.title === 'Smoke test task', 'Task creation failed.');

  const openTasks = await requestJson(baseUrl, '/api/tasks?status=open&project=Smoke%20test%20project');
  assert(openTasks.some((task) => task.id === created.id), 'The new task was not returned by the task list endpoint.');

  const structure = await requestJson(baseUrl, '/api/structure?withCounts=true');
  const project = structure.find((item) => item.name === 'Smoke test project');
  assert(project?.openTasks === 1 && project.sections.some((section) => section.name === 'Smoke test section'), 'Project or section creation failed.');

  const plan = await requestJson(baseUrl, `/api/plan?date=${dueDate}`);
  assert(plan.some((task) => task.id === created.id), 'The task was not included in the day plan.');

  await requestJson(baseUrl, `/api/tasks/${created.id}/status`, { method: 'POST', body: { status: 'done' } });
  const completedTasks = await requestJson(baseUrl, '/api/tasks?status=done');
  assert(completedTasks.some((task) => task.id === created.id), 'Task status update failed.');

  console.log('Smoke test passed: web page, task API, project structure, day plan, and status updates.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGINT');
    let stopTimer;
    await Promise.race([
      childExit,
      new Promise((_, reject) => { stopTimer = setTimeout(() => reject(new Error('Timed out waiting for the smoke-test server to stop.')), 3000); }),
    ]).finally(() => clearTimeout(stopTimer)).catch(() => child.kill('SIGKILL'));
  }
  await rm(tempDirectory, { recursive: true, force: true });
}
