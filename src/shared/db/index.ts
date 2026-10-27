import { createSqliteAdapter } from "./adapter.ts";
import { createDailyDatabaseBackup } from "./backup.ts";
import { runMigrations } from "./migrations.ts";

export const storage = createSqliteAdapter();
export const db = storage.connection;
export const databasePath = storage.path;

db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
runMigrations(db, databasePath);

function attemptDailyBackup(): void {
  try {
    createDailyDatabaseBackup(db, databasePath);
  } catch (error) {
    console.warn("Could not create the daily MCP-ToDo database backup:", error);
  }
}

attemptDailyBackup();
const dailyBackupTimer = setInterval(attemptDailyBackup, 60 * 60 * 1000);
dailyBackupTimer.unref();
