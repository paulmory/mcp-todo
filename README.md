# MCP-ToDo

A personal task manager that runs locally. The Vite web interface and MCP server share the same business logic and SQLite database. Tasks can have multiple reusable tags. No account is required, and task data is not synchronized.

## Requirements and setup

- Node.js 22.6 or later.
- For development with Vite and hot module replacement (HMR), run `npm install`, then `npm run dev`.
- The web interface is available at [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api` requests to the local API at `127.0.0.1:4178`.
- For production, run `npm start`. It builds the Vite bundle into `dist` and starts the Node server at [http://127.0.0.1:4178](http://127.0.0.1:4178).
- To build the production bundle without starting the server, run `npm run build`.
- To build the app and run the isolated web/API smoke test, run `npm run test:smoke`. It uses a temporary SQLite database.

In development, Vite and the HTTP API start with one command. The MCP server runs as a separate stdio process from `src/mcp.ts`. Both entry points use the same SQLite database and business logic from `src/store.ts`. Existing project and section values are preserved as task tags during database migration.

## Configuration

- `MCP_TODO_DB` sets the SQLite database path. The default is `~/.local/share/mcp-todo/tasks.sqlite`.
- `MCP_TODO_PORT` sets the local web/API port. The default is `4178`.

The web server binds to `127.0.0.1`.

## Web interface

The default interface language is English. The language picker also offers Russian, Spanish, French, German, Chinese, Japanese, Korean, Portuguese, and Turkish. The selected language, theme, and accent color are saved in the browser. Task data is stored in SQLite and is not synchronized.

## MCP client configuration

Add the server to your MCP client's configuration for local stdio servers. The configuration file and exact field names depend on the client; use its equivalent of `command`, `args`, and optional environment variables:

```json
{
  "mcpServers": {
    "mcp-todo": {
      "command": "node",
      "args": ["--experimental-strip-types", "/absolute/path/to/mcp-todo/src/mcp.ts"],
      "env": {
        "MCP_TODO_DB": "/absolute/path/to/tasks.sqlite"
      }
    }
  }
}
```

Replace the script path with the absolute path to this project. The `env` block is optional; omit it to use the default database location. Restart or reload the MCP client after updating its configuration. The server exposes these tools:

- `create_task` — create a task with zero or more tags. New tags are created automatically when needed.
- `list_tasks` — list tasks; supports tags, status, due-date, overdue, and priority filters. A task must have all requested tags to match.
- `get_tags` — list available tags, optionally with open-task counts.
- `update_task` — update a task by its ID, including replacing its tags. Pass an empty `tags` array to remove all tags.
- `update_task_status` — complete, defer, or reopen a task.
- `get_day_plan` — generate a suggested plan for a selected date without modifying task data.

## Task dates, priorities, and statuses

Dates use the `YYYY-MM-DD` format. Priorities are `low`, `normal`, and `high`. Statuses are `open`, `done`, and `deferred`. When no status filter is provided, `list_tasks` returns open tasks.

By default, `get_day_plan` returns up to 8 open tasks: overdue tasks, tasks due on or before the selected date, and undated high- or normal-priority tasks. Completed and deferred tasks are excluded. Undated low-priority tasks are not included in the suggested plan.

## Database and local backups

On macOS, the default database is usually located at `/Users/username/.local/share/mcp-todo/tasks.sqlite`. Override the path with `MCP_TODO_DB=/absolute/path/tasks.sqlite`.

For a consistent backup, use the SQLite backup API, or stop all mcp-todo instances before copying the database file. For example, after stopping the service:

```sh
cp "$HOME/.local/share/mcp-todo/tasks.sqlite" "$HOME/tasks-backup-$(date +%Y%m%d).sqlite"
```

Do not delete WAL files while the service is running. If you need backups to remain fully local, store them in a folder that is not synced to the cloud.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
