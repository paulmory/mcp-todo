import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverEntry = join(projectRoot, 'src', 'server.ts');
const mcpEntry = join(projectRoot, 'src', 'mcp.ts');
const createUserEntry = join(projectRoot, 'scripts', 'create-user.ts');
const tempDirectory = await mkdtemp(join(tmpdir(), 'mcp-todo-smoke-'));
const databasePath = join(tempDirectory, 'smoke.sqlite');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function requestJson(baseUrl: string, path: string, { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  assert(response.ok, `${method} ${path} returned ${response.status}: ${text}`);
  return data;
}

async function createSmokeToken() {
  const child = spawn(process.execPath, ['--experimental-strip-types', createUserEntry], {
    cwd: projectRoot,
    env: { ...process.env, MCP_TODO_DB: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  assert(code === 0, `Could not create the isolated smoke-test user. ${stderr}`);
  const token = stdout.match(/Access token \(store securely; shown only once\): (\S+)/)?.[1];
  assert(token, 'The isolated smoke-test user did not return an access token.');
  return token;
}

function startMcpServer(token: string) {
  const child = spawn(process.execPath, ['--experimental-strip-types', mcpEntry], {
    cwd: projectRoot,
    env: { ...process.env, MCP_TODO_DB: databasePath, MCP_TODO_TOKEN: token },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    const lines = stdout.split('\n');
    stdout = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (typeof message.id !== 'number') continue;
      const request = pending.get(message.id);
      if (!request) continue;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || 'MCP request failed.'));
      else request.resolve(message.result);
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  function request(method: string, params: Record<string, unknown> = {}) {
    const id = ++nextId;
    return new Promise<any>((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`MCP ${method} timed out. ${stderr}`));
      }, 5000);
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  function notify(method: string, params: Record<string, unknown> = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async function callTool(name: string, args: Record<string, unknown> = {}, { allowError = false } = {}) {
    const result = await request('tools/call', { name, arguments: args });
    if (result.isError && !allowError) {
      throw new Error(`MCP tool ${name} failed: ${result.content?.[0]?.text || 'Unknown error'}`);
    }
    const text = result.content?.find((item) => item.type === 'text')?.text;
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { result, data };
  }

  return {
    child,
    async initialize() {
      await request('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'mcp-todo-smoke', version: '1.0.0' },
      });
      notify('notifications/initialized');
    },
    callTool,
    async close() {
      for (const { timer, reject } of pending.values()) {
        clearTimeout(timer);
        reject(new Error('MCP server closed with requests pending.'));
      }
      pending.clear();
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        await Promise.race([exited, new Promise((resolveDelay) => setTimeout(resolveDelay, 1500))]);
      }
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    },
  };
}

const accessToken = await createSmokeToken();
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--experimental-strip-types', serverEntry], {
  cwd: projectRoot,
  env: {
    ...process.env,
    MCP_TODO_DB: databasePath,
    MCP_TODO_TOKEN: accessToken,
    MCP_TODO_PORT: String(port),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { stderr += chunk; });
const childExit = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
let mcp;

try {
  let ready = false;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup. ${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  assert(ready, `Server did not become ready. ${stderr}`);

  const pageResponse = await fetch(`${baseUrl}/`);
  const html = await pageResponse.text();
  assert(pageResponse.ok && html.includes('<title>My ToDo</title>'), 'The production web page did not load.');

  const auth = await requestJson(baseUrl, '/api/auth', { token: accessToken });
  assert(auth.authenticated && !auth.local, 'The smoke-test token did not authenticate as its own user.');

  const initialTags = await requestJson(baseUrl, '/api/tags?withCounts=true', { token: accessToken });
  assert(Array.isArray(initialTags) && initialTags.length === 0, 'The isolated smoke-test database should start without tags.');

  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await requestJson(baseUrl, '/api/tasks', {
    method: 'POST',
    body: {
      title: 'Smoke test task',
      tags: ['Smoke test', 'migration'],
      description: 'Created by the isolated smoke test.',
      dueDate,
      priority: 'high',
    },
    token: accessToken,
  });
  assert(created.id && created.title === 'Smoke test task', 'Task creation failed.');

  const secondCreated = await requestJson(baseUrl, '/api/tasks', {
    method: 'POST',
    body: {
      title: 'Second smoke test task',
      dueDate,
      priority: 'normal',
    },
    token: accessToken,
  });
  assert(secondCreated.id && secondCreated.title === 'Second smoke test task', 'Second task creation failed.');

  const openTasks = await requestJson(baseUrl, '/api/tasks?status=open&tags=Smoke%20test', { token: accessToken });
  assert(Array.isArray(openTasks) && openTasks.some((task) => task.id === created.id), 'Task tag filtering failed.');

  const firstPage = await requestJson(baseUrl, '/api/tasks?status=open&limit=1&offset=0', { token: accessToken });
  const secondPage = await requestJson(baseUrl, '/api/tasks?status=open&limit=1&offset=1', { token: accessToken });
  assert(firstPage.tasks.length === 1 && firstPage.hasMore && firstPage.nextOffset === 1, 'The first task page metadata is incorrect.');
  assert(secondPage.tasks.length === 1 && secondPage.tasks[0].id !== firstPage.tasks[0].id && !secondPage.hasMore, 'Task pagination did not return distinct pages.');

  const schedulePage = await requestJson(baseUrl, `/api/schedule?date=${dueDate}&limit=1&offset=0`, { token: accessToken });
  assert(schedulePage.tasks.length === 1 && schedulePage.hasMore, 'Schedule task pagination failed.');
  const calendarCounts = await requestJson(baseUrl, `/api/calendar-counts?from=${dueDate}&to=${dueDate}`, { token: accessToken });
  assert(calendarCounts.some((item) => item.dueDate === dueDate && item.count === 2), 'Calendar task counts are incorrect.');

  const tags = await requestJson(baseUrl, '/api/tags?withCounts=true', { token: accessToken });
  assert(tags.some((tag) => tag.name === 'smoke test' && tag.openTasks === 1), 'Task tags or tag counts are incorrect.');

  const plan = await requestJson(baseUrl, `/api/plan?date=${dueDate}`, { token: accessToken });
  assert(plan.some((task) => task.id === created.id), 'The task was not included in the day plan.');

  await requestJson(baseUrl, `/api/tasks/${created.id}/status`, { method: 'POST', body: { status: 'done' }, token: accessToken });
  const completedTasks = await requestJson(baseUrl, '/api/tasks?status=done', { token: accessToken });
  assert(completedTasks.some((task) => task.id === created.id), 'Task status update failed.');

  mcp = startMcpServer(accessToken);
  await mcp.initialize();
  const mcpCreated = await mcp.callTool('create_task', {
    title: 'MCP smoke lifecycle task',
    tags: ['smoke lifecycle'],
    description: 'Created and deleted by the authenticated MCP smoke test.',
  });
  assert(mcpCreated.data.id && mcpCreated.data.title === 'MCP smoke lifecycle task', 'MCP task creation failed.');
  const mcpTags = await mcp.callTool('get_tags', { withCounts: true });
  assert(mcpTags.data.some((tag) => tag.name === 'smoke lifecycle' && tag.openTasks === 1), 'MCP task or tag was not created under the smoke-test user.');
  const mcpDeleted = await mcp.callTool('delete_task', { id: mcpCreated.data.id });
  assert(mcpDeleted.data.deleted && mcpDeleted.data.id === mcpCreated.data.id, 'MCP task deletion failed.');
  const missingTask = await mcp.callTool('get_task', { id: mcpCreated.data.id }, { allowError: true });
  assert(missingTask.result.isError, 'The deleted MCP task is still available.');
  const tagDeleted = await mcp.callTool('delete_tag', { name: 'smoke lifecycle' });
  assert(tagDeleted.data.deleted, 'MCP tag cleanup failed.');

  console.log('Smoke test passed: authenticated user token, web task API, tags, pagination, schedule, calendar counts, day plan, status updates, and MCP task/tag create-delete lifecycle.');
} finally {
  await mcp?.close();
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
