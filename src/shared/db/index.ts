import { createSqliteAdapter } from "./adapter.ts";
import { runMigrations } from "./migrations.ts";

export const storage = createSqliteAdapter();
export const db = storage.connection;
export const databasePath = storage.path;

db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
runMigrations(db);
