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

function columnNames(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    db.prepare(`PRAGMA table_info(${table})`).all()
      .map((column) => String(column.name)),
  );
}

function isCurrentSchema(db: DatabaseSync): boolean {
  const tables = tableNames(db);
  if (!["users", "access_tokens", "web_sessions", "tasks", "tags", "task_tags"]
    .every((table) => tables.has(table))) return false;
  return ["tasks", "tags", "task_tags"].every((table) => columnNames(db, table).has("user_id"));
}

function createCurrentSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE CHECK(length(code)=5),
      created_at TEXT NOT NULL
    );
    INSERT INTO users(id,code,created_at) VALUES('local','local',datetime('now'));
    CREATE TABLE access_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE web_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX web_sessions_expiry ON web_sessions(expires_at);
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK(length(trim(title))>0),
      description TEXT,
      due_date TEXT,
      due_time TEXT,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','deferred')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id,id)
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id,name COLLATE NOCASE),
      UNIQUE(user_id,id)
    );
    CREATE TABLE task_tags (
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY(user_id,task_id,tag_id),
      FOREIGN KEY(user_id,task_id) REFERENCES tasks(user_id,id) ON DELETE CASCADE,
      FOREIGN KEY(user_id,tag_id) REFERENCES tags(user_id,id) ON DELETE CASCADE
    );
    CREATE INDEX tasks_user_status_due ON tasks(user_id,status,due_date,due_time);
    CREATE INDEX task_tags_user_tag ON task_tags(user_id,tag_id,task_id);
    CREATE INDEX tags_user_name ON tags(user_id,name COLLATE NOCASE);
  `);
}

function migrateLegacyFields(db: DatabaseSync): void {
  const columns = columnNames(db, "tasks");
  if (!columns.has("due_time")) db.exec("ALTER TABLE tasks ADD COLUMN due_time TEXT");

  const tables = tableNames(db);
  if (tables.has("projects") && tables.has("sections") && columns.has("project_id") && columns.has("section_id")) {
    db.exec(`
      INSERT OR IGNORE INTO tags(name) SELECT name FROM projects;
      INSERT OR IGNORE INTO tags(name) SELECT name FROM sections;
      INSERT OR IGNORE INTO task_tags(task_id,tag_id)
        SELECT t.id,tg.id FROM tasks t JOIN projects p ON p.id=t.project_id JOIN tags tg ON tg.name=p.name;
      INSERT OR IGNORE INTO task_tags(task_id,tag_id)
        SELECT t.id,tg.id FROM tasks t JOIN sections s ON s.id=t.section_id JOIN tags tg ON tg.name=s.name;
    `);
  }

  if (columns.has("project_id") || columns.has("section_id")) {
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,title TEXT NOT NULL CHECK(length(trim(title))>0),description TEXT,
        due_date TEXT,due_time TEXT,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','deferred')),
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      INSERT INTO tasks_new(id,title,description,due_date,due_time,priority,status,created_at,updated_at)
        SELECT id,title,description,due_date,due_time,priority,status,created_at,updated_at FROM tasks;
      CREATE TEMP TABLE task_links_backup AS SELECT task_id,tag_id FROM task_tags;
      DROP TABLE task_tags;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE TABLE task_tags(
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY(task_id,tag_id)
      );
      INSERT INTO task_tags(task_id,tag_id) SELECT task_id,tag_id FROM task_links_backup;
      DROP TABLE task_links_backup;
    `);
  }
  db.exec("DROP TABLE IF EXISTS sections; DROP TABLE IF EXISTS projects;");
}

function initializeFromExistingData(db: DatabaseSync): void {
  if (!tableNames(db).has("tasks")) {
    createCurrentSchema(db);
    return;
  }

  // Legacy releases created these tables before applying their schema changes.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(task_id,tag_id)
    );
  `);
  migrateLegacyFields(db);

  db.exec(`
    CREATE TEMP TABLE task_backup AS SELECT * FROM tasks;
    CREATE TEMP TABLE tag_backup AS SELECT * FROM tags;
    CREATE TEMP TABLE task_tag_backup AS SELECT task_id,tag_id FROM task_tags;
    DROP TABLE task_tags;
    DROP TABLE tasks;
    DROP TABLE tags;
  `);
  createCurrentSchema(db);
  db.exec(`
    INSERT INTO tasks(id,user_id,title,description,due_date,due_time,priority,status,created_at,updated_at)
      SELECT id,'local',title,description,due_date,due_time,priority,status,created_at,updated_at FROM task_backup;
    INSERT INTO tags(id,user_id,name,created_at)
      SELECT id,'local',name,created_at FROM tag_backup;
    INSERT INTO task_tags(user_id,task_id,tag_id)
      SELECT 'local',task_id,tag_id FROM task_tag_backup;
    DROP TABLE task_tag_backup;
    DROP TABLE tag_backup;
    DROP TABLE task_backup;
  `);
}

// Pre-release schema history is consolidated into this single initial baseline.
// After release, preserve this migration and append new versions instead.
const migrations: Migration[] = [
  { version: 1, name: "initial-schema", up: initializeFromExistingData },
];

export function runMigrations(db: DatabaseSync): void {
  const currentVersion = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  );

  // The unreleased version 4 schema already matches the initial baseline.
  if (currentVersion === 4) {
    if (isCurrentSchema(db)) return;
    throw new Error("Database schema version 4 is incomplete or incompatible; refusing to rewrite it.");
  }
  if (currentVersion > 4) {
    throw new Error(`Database schema version ${currentVersion} is newer than this application supports.`);
  }
  if (currentVersion === 1 && isCurrentSchema(db)) return;

  const [initial] = migrations;
  db.exec("BEGIN IMMEDIATE");
  try {
    initial.up(db);
    db.exec(`PRAGMA user_version=${initial.version}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw new Error(`Database migration ${initial.version} (${initial.name}) failed.`, { cause: error });
  }
}
