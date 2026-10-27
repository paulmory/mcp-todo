import type { DatabaseSync } from "node:sqlite";

type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};

function tableNames(db: DatabaseSync): Set<string> {
  return new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map((table) => String(table.name)),
  );
}

function migrateLegacyTaskFields(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(tasks)").all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("due_time")) {
    db.exec("ALTER TABLE tasks ADD COLUMN due_time TEXT");
    columnNames.add("due_time");
  }

  const tables = tableNames(db);
  if (!tables.has("projects") || !tables.has("sections")) return;
  if (!columnNames.has("project_id") || !columnNames.has("section_id")) return;

  db.exec(`
    INSERT OR IGNORE INTO tags(name) SELECT name FROM projects;
    INSERT OR IGNORE INTO tags(name) SELECT name FROM sections;
    INSERT OR IGNORE INTO task_tags(task_id,tag_id)
      SELECT t.id,tg.id FROM tasks t
      JOIN projects p ON p.id=t.project_id
      JOIN tags tg ON tg.name=p.name;
    INSERT OR IGNORE INTO task_tags(task_id,tag_id)
      SELECT t.id,tg.id FROM tasks t
      JOIN sections s ON s.id=t.section_id
      JOIN tags tg ON tg.name=s.name;
  `);
}

function removeLegacyTaskFields(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(tasks)").all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (columnNames.has("project_id") || columnNames.has("section_id")) {
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(trim(title))>0),
        description TEXT,
        due_date TEXT,
        due_time TEXT,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','deferred')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO tasks_new(id,title,description,due_date,due_time,priority,status,created_at,updated_at)
        SELECT id,title,description,due_date,due_time,priority,status,created_at,updated_at FROM tasks;
      CREATE TEMP TABLE task_tags_backup AS SELECT task_id,tag_id FROM task_tags;
      DROP TABLE task_tags;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE TABLE task_tags (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY(task_id,tag_id)
      );
      INSERT INTO task_tags(task_id,tag_id) SELECT task_id,tag_id FROM task_tags_backup;
      DROP TABLE task_tags_backup;
    `);
  }

  db.exec(`
    DROP TABLE IF EXISTS sections;
    DROP TABLE IF EXISTS projects;
    CREATE INDEX IF NOT EXISTS tasks_status_due ON tasks(status,due_date);
    CREATE INDEX IF NOT EXISTS task_tags_tag ON task_tags(tag_id,task_id);
  `);
}

/**
 * Keep one baseline migration for the unreleased legacy schema. Future schema
 * changes should be appended as version 4 and above; never rewrite shipped
 * migrations once the application is released.
 */
const migrations: Migration[] = [
  {
    // Version 3 also upgrades databases previously opened by the intermediate
    // versioned migration runner (versions 1 and 2).
    version: 3,
    name: "consolidated-legacy-schema-v3",
    up(db) {
      migrateLegacyTaskFields(db);
      removeLegacyTaskFields(db);
      db.exec("DROP TABLE IF EXISTS schema_migrations");
    },
  },
];

const latestVersion = migrations.at(-1)?.version ?? 0;

export function runMigrations(db: DatabaseSync): void {
  const currentVersion = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  );

  if (currentVersion > latestVersion) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than this application supports (${latestVersion}).`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Database migration ${migration.version} (${migration.name}) failed.`, {
        cause: error,
      });
    }
  }
}
