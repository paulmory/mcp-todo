# MCP-ToDo

A task manager with a web interface and an MCP server. Both interfaces use the same application services and SQLite database. Tasks support reusable tags, due dates, times, priorities, and statuses.

## Requirements and setup

- Node.js 22.6 or later.
- Run `npm install` to install dependencies.
- Run `npm run dev` to start the web interface and API for development. The web app is available at [http://127.0.0.1:5173](http://127.0.0.1:5173); Vite proxies API requests to `127.0.0.1:4178`.
- Run `npm start` to build the web app and start the production web/API server at [http://127.0.0.1:4178](http://127.0.0.1:4178).
- Run `npm run build` to build the web app without starting the server.
- Run `npm run test:smoke` to build and run the isolated web/API smoke test against a temporary SQLite database.
- Run `npm run user:create` to create a user and access token. The command prints the token once; store it securely.

The MCP server is a separate stdio process. Configure it in your MCP client using the client’s equivalent of `command`, `args`, and `env`:

```json
{
  "mcpServers": {
    "mcp-todo": {
      "command": "node",
      "args": ["--experimental-strip-types", "/absolute/path/to/mcp-todo/src/mcp.ts"],
      "env": {
        "MCP_TODO_TOKEN": "your-access-token"
      }
    }
  }
}
```

The `env` object is optional for local use. Restart or reload the MCP client after changing its configuration.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `MCP_TODO_DB` | `~/.local/share/mcp-todo/tasks.sqlite` | SQLite database file path shared by the web server and MCP process. |
| `MCP_TODO_HOST` | `127.0.0.1` | Web/API bind address. Use a loopback address for unauthenticated local access. |
| `MCP_TODO_PORT` | `4178` | Web/API server port. |
| `MCP_TODO_TOKEN` | unset | User access token for an MCP process or the web server. Stored credentials are hashed in the database. |
| `MCP_TODO_COOKIE_SECURE` | `false` | Set to `true` when the web app is served over HTTPS, so session cookies use the `Secure` attribute. |

When the web server binds to loopback and `MCP_TODO_TOKEN` is unset, the app opens directly in the built-in `local` workspace without asking for credentials. Remote-bound web servers require authentication for API access. Use the in-app key control to sign in with a user token; the server then issues an HTTP-only browser session. The MCP process authenticates with the same token through `MCP_TODO_TOKEN`.

User codes are five-character identifiers for display and administration. They are not secrets. The randomly generated access token is the credential: keep it private, and do not put it in source control. The `local` workspace is reserved for the default local experience.

## Storage architecture and migrations

SQLite is the only implemented storage adapter. Database connection setup is isolated in `src/shared/db/adapter.ts`; application code obtains the configured connection through `src/shared/db/index.ts`. User context is resolved per request with async-local context, and task/tag records are scoped by `user_id`.

The unreleased schema history is consolidated into one initial migration in `src/shared/db/migrations.ts`. New databases are created directly with the current user-scoped schema. Existing task/tag databases are upgraded into that schema and their data is assigned to the `local` workspace. Databases already using the previous version 4 schema are recognized without rewriting their data. The migration runs automatically when the database opens.

The adapter boundary isolates connection creation, but query code currently uses SQLite SQL and synchronous `node:sqlite` APIs. Supporting another database will require a compatible adapter and a persistence/query layer for that database’s dialect; changing a connection string alone is not sufficient.

## MCP tools

- `create_task` — create a task with zero or more tags. New tags are created automatically when needed.
- `list_tasks` — list tasks with optional tag, status, due-date, overdue, and priority filters. A task must have all requested tags to match.
- `get_tags` — list available tags, optionally with open-task counts.
- `update_task` — update a task by ID, including replacing its tags. Pass an empty `tags` array to remove all tags.
- `update_task_status` — complete, defer, or reopen a task.
- `get_day_plan` — generate a suggested plan for a selected date without modifying task data.

## Task dates, priorities, and statuses

Dates use the `YYYY-MM-DD` format. Priorities are `low`, `normal`, and `high`. Statuses are `open`, `done`, and `deferred`. Without a status filter, `list_tasks` returns open tasks.

By default, `get_day_plan` returns up to 8 open tasks: overdue tasks, tasks due on or before the selected date, and undated high- or normal-priority tasks. Completed and deferred tasks are excluded. Undated low-priority tasks are not included.

## Backups

Stop all MCP-ToDo processes before copying the database file, or use SQLite’s backup API for a consistent live backup. For example, after stopping the service:

```sh
cp "$HOME/.local/share/mcp-todo/tasks.sqlite" "$HOME/tasks-backup-$(date +%Y%m%d).sqlite"
```

Do not remove SQLite WAL files while the service is running.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
