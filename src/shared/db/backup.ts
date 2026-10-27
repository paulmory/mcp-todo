import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DAILY_RETENTION = 14;

function backupDirectory(databasePath: string): string {
  return resolve(
    process.env.MCP_TODO_BACKUP_DIR || join(dirname(databasePath), "backups"),
  );
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function uniqueBackupPath(databasePath: string, type: "manual" | "pre-migration"): string {
  const suffix = type === "pre-migration" ? "pre-migration-v1" : "manual";
  return join(
    backupDirectory(databasePath),
    `tasks-${suffix}-${timestamp(new Date())}-${process.pid}-${randomUUID()}.sqlite`,
  );
}

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Creates a consistent SQLite snapshot using VACUUM INTO, safe with WAL enabled. */
export function createDatabaseBackup(
  db: DatabaseSync,
  databasePath: string,
  type: "manual" | "pre-migration" = "manual",
): string {
  const directory = backupDirectory(databasePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = uniqueBackupPath(databasePath, type);
  if (resolve(path) === resolve(databasePath)) {
    throw new Error("The backup path must be different from the database path.");
  }

  try {
    db.exec(`VACUUM INTO ${quoteSqlString(path)}`);
    chmodSync(path, 0o600);
    const snapshot = new DatabaseSync(path);
    try {
      const result = snapshot.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      if (result.integrity_check !== "ok") {
        throw new Error(`SQLite integrity check failed: ${result.integrity_check}`);
      }
    } finally {
      snapshot.close();
    }
    return path;
  } catch (error) {
    if (existsSync(path)) unlinkSync(path);
    throw error;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function acquireLock(path: string): (() => void) | null {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(path, "wx", 0o600);
      writeFileSync(descriptor, String(process.pid));
      return () => {
        closeSync(descriptor);
        if (existsSync(path)) unlinkSync(path);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let lockPid = 0;
      try {
        lockPid = Number(readFileSync(path, "utf8"));
      } catch {}
      if (lockPid > 0 && processIsRunning(lockPid)) return null;
      if (lockPid <= 0) {
        try {
          if (Date.now() - statSync(path).mtimeMs < 30_000) return null;
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw statError;
        }
      }
      try {
        unlinkSync(path);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
      }
    }
  }
  return null;
}

function pruneDailyBackups(directory: string): void {
  const backups = readdirSync(directory)
    .filter((name) => /^tasks-daily-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
    .sort()
    .reverse();
  for (const name of backups.slice(DAILY_RETENTION)) {
    unlinkSync(join(directory, name));
  }
}

/** Creates at most one verified daily snapshot, even if web and MCP start together. */
export function createDailyDatabaseBackup(db: DatabaseSync, databasePath: string): string | null {
  const directory = backupDirectory(databasePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const day = new Date().toISOString().slice(0, 10);
  const path = join(directory, `tasks-daily-${day}.sqlite`);
  if (existsSync(path)) return null;

  const releaseLock = acquireLock(join(directory, `tasks-daily-${day}.lock`));
  if (!releaseLock) return null;
  try {
    if (existsSync(path)) return null;
    db.exec(`VACUUM INTO ${quoteSqlString(path)}`);
    chmodSync(path, 0o600);
    const snapshot = new DatabaseSync(path);
    try {
      const result = snapshot.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      if (result.integrity_check !== "ok") {
        throw new Error(`SQLite integrity check failed: ${result.integrity_check}`);
      }
    } finally {
      snapshot.close();
    }
    pruneDailyBackups(directory);
    return path;
  } catch (error) {
    if (existsSync(path)) unlinkSync(path);
    throw error;
  } finally {
    releaseLock();
  }
}
