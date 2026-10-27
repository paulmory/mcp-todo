import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { runMigrations } from "./migrations.ts";

const dbPath =
  process.env.MCP_TODO_DB ||
  join(homedir(), ".local", "share", "mcp-todo", "tasks.sqlite");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
export const databasePath = dbPath;

db.function(
  "unicode_contains",
  (value, query) =>
    String(value ?? "")
      .toLocaleLowerCase()
      .includes(String(query ?? "").toLocaleLowerCase()) ? 1 : 0,
);

db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title))>0), description TEXT, due_date TEXT, due_time TEXT, priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','deferred')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS task_tags (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(task_id,tag_id));
CREATE INDEX IF NOT EXISTS tasks_status_due ON tasks(status,due_date);
CREATE INDEX IF NOT EXISTS task_tags_tag ON task_tags(tag_id,task_id);
DROP TABLE IF EXISTS schema_migrations;`);
runMigrations(db);
