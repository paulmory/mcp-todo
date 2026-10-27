import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** Minimal connection contract shared by storage implementations. */
export interface DatabaseAdapter {
  readonly dialect: "sqlite";
  readonly path: string;
  readonly connection: DatabaseSync;
  close(): void;
}

export function createSqliteAdapter(path = process.env.MCP_TODO_DB || join(homedir(), ".local", "share", "mcp-todo", "tasks.sqlite")): DatabaseAdapter {
  mkdirSync(dirname(path), { recursive: true });
  const connection = new DatabaseSync(path);
  connection.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  connection.function("unicode_contains", (value, query) =>
    String(value ?? "").toLocaleLowerCase().includes(String(query ?? "").toLocaleLowerCase()) ? 1 : 0,
  );
  return { dialect: "sqlite", path, connection, close: () => connection.close() };
}
