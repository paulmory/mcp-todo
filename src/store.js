import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const dbPath = process.env.MCP_TODO_DB || join(homedir(), '.local', 'share', 'mcp-todo', 'tasks.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.function('unicode_contains', (value, query) =>
  String(value ?? '').toLocaleLowerCase().includes(String(query ?? '').toLocaleLowerCase()) ? 1 : 0,
);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL COLLATE NOCASE, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(project_id,name));
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title))>0), project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL, description TEXT, due_date TEXT, due_time TEXT, priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','deferred')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS task_tags (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(task_id,tag_id));
CREATE INDEX IF NOT EXISTS tasks_status_due ON tasks(status,due_date);
CREATE INDEX IF NOT EXISTS task_tags_tag ON task_tags(tag_id,task_id);
CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);

const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE name=?');
if (!hasMigration.get('task-due-time-v1')) {
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
  if (!taskColumns.some((column) => column.name === 'due_time')) {
    db.exec('ALTER TABLE tasks ADD COLUMN due_time TEXT');
  }
  db.prepare("INSERT INTO schema_migrations(name) VALUES('task-due-time-v1')").run();
}
if (!hasMigration.get('legacy-projects-sections-to-tags-v1')) {
  db.exec(`BEGIN;
    INSERT OR IGNORE INTO tags(name) SELECT name FROM projects;
    INSERT OR IGNORE INTO tags(name) SELECT name FROM sections;
    INSERT OR IGNORE INTO task_tags(task_id,tag_id) SELECT t.id,tg.id FROM tasks t JOIN projects p ON p.id=t.project_id JOIN tags tg ON tg.name=p.name;
    INSERT OR IGNORE INTO task_tags(task_id,tag_id) SELECT t.id,tg.id FROM tasks t JOIN sections s ON s.id=t.section_id JOIN tags tg ON tg.name=s.name;
    INSERT INTO schema_migrations(name) VALUES('legacy-projects-sections-to-tags-v1');
    COMMIT;`);
}

const now = () => new Date().toISOString();
const taskSelect = `SELECT t.id,t.title,p.name AS project,s.name AS section,t.description,t.due_date AS dueDate,t.due_time AS dueTime,t.priority,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN sections s ON s.id=t.section_id`;
const normalize = (s) => typeof s === 'string' && s.trim() ? s.trim() : null;

const statements = {
  insertProject: db.prepare('INSERT INTO projects(name) VALUES(?) ON CONFLICT(name) DO NOTHING'),
  findProject: db.prepare('SELECT id FROM projects WHERE name=?'),
  insertSection: db.prepare('INSERT INTO sections(project_id,name) VALUES(?,?) ON CONFLICT(project_id,name) DO NOTHING'),
  findSection: db.prepare('SELECT id FROM sections WHERE project_id=? AND name=?'),
  findTagsByName: db.prepare('SELECT id,name FROM tags WHERE name=? COLLATE NOCASE ORDER BY id'),
  insertTag: db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING'),
  findTag: db.prepare('SELECT id FROM tags WHERE name=? COLLATE NOCASE'),
  tagUsageCount: db.prepare('SELECT COUNT(*) AS count FROM task_tags WHERE tag_id=?'),
  mergeTagAssignments: db.prepare('INSERT OR IGNORE INTO task_tags(task_id,tag_id) SELECT task_id,? FROM task_tags WHERE tag_id=?'),
  removeTagAssignments: db.prepare('DELETE FROM task_tags WHERE tag_id=?'),
  removeTag: db.prepare('DELETE FROM tags WHERE id=?'),
  renameTag: db.prepare('UPDATE tags SET name=? WHERE id=?'),
  removeTaskTags: db.prepare('DELETE FROM task_tags WHERE task_id=?'),
  insertTaskTag: db.prepare('INSERT INTO task_tags(task_id,tag_id) VALUES(?,?)'),
  findTask: db.prepare(`${taskSelect} WHERE t.id=?`),
  insertTask: db.prepare("INSERT INTO tasks(id,title,project_id,section_id,description,due_date,due_time,priority,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'open',?,?)"),
  updateTask: db.prepare('UPDATE tasks SET title=?,project_id=?,section_id=?,description=?,due_date=?,due_time=?,priority=?,updated_at=? WHERE id=?'),
  setTaskStatus: db.prepare('UPDATE tasks SET status=?,updated_at=? WHERE id=?'),
  tags: db.prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE'),
  tagsWithCounts: db.prepare(`SELECT tg.name,COUNT(DISTINCT CASE WHEN t.status='open' THEN t.id END) AS openTasks
    FROM tags tg LEFT JOIN task_tags tt ON tt.tag_id=tg.id LEFT JOIN tasks t ON t.id=tt.task_id
    GROUP BY tg.id ORDER BY tg.name COLLATE NOCASE`),
  projects: db.prepare('SELECT id,name FROM projects ORDER BY name COLLATE NOCASE'),
  projectsWithCounts: db.prepare(`SELECT p.id,p.name,COUNT(t.id) AS openTasks FROM projects p
    LEFT JOIN tasks t ON t.project_id=p.id AND t.status='open'
    GROUP BY p.id ORDER BY p.name COLLATE NOCASE`),
  sections: db.prepare('SELECT id,project_id,name FROM sections ORDER BY name COLLATE NOCASE'),
  sectionsWithCounts: db.prepare(`SELECT s.id,s.project_id,s.name,COUNT(t.id) AS openTasks FROM sections s
    LEFT JOIN tasks t ON t.section_id=s.id AND t.status='open'
    GROUP BY s.id ORDER BY s.name COLLATE NOCASE`),
  dayPlan: db.prepare(`${taskSelect}
    WHERE t.status='open'
      AND ((t.due_date IS NOT NULL AND t.due_date<=?)
        OR (t.due_date IS NULL AND t.priority IN ('high','normal')))
    ORDER BY CASE
        WHEN t.due_date IS NOT NULL AND t.due_date<? THEN 0
        WHEN t.due_date=? THEN 1
        WHEN t.due_date IS NULL AND t.priority='high' THEN 2
        ELSE 3
      END,
      t.due_date IS NULL,t.due_date,t.due_time IS NULL,t.due_time,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      t.created_at
    LIMIT ?`),
};

function ensureProject(name) {
  name = normalize(name);
  if (!name) return null;
  statements.insertProject.run(name);
  return statements.findProject.get(name).id;
}

function ensureSection(projectId, name) {
  name = normalize(name);
  if (!name) return null;
  if (!projectId) throw new Error('A project is required when assigning a section.');
  statements.insertSection.run(projectId, name);
  return statements.findSection.get(projectId, name).id;
}

function normalizeTags(values) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error('Tags must be provided as an array of names.');
  const seen = new Set();
  const tags = [];
  for (const value of values) {
    const name = normalize(value);
    if (!name) throw new Error('Tag names cannot be empty.');
    if (name.length > 100) throw new Error('Tag names must be 100 characters or fewer.');
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(key);
  }
  return tags;
}

function ensureTag(name) {
  const key = name.toLowerCase();
  const matches = statements.findTagsByName.all(key);
  if (matches.length) {
    const canonicalId = matches[0].id;
    for (const duplicate of matches.slice(1)) {
      statements.mergeTagAssignments.run(canonicalId, duplicate.id);
      statements.removeTagAssignments.run(duplicate.id);
      statements.removeTag.run(duplicate.id);
    }
    if (matches[0].name !== key) statements.renameTag.run(key, canonicalId);
    return canonicalId;
  }
  statements.insertTag.run(key);
  return statements.findTag.get(key).id;
}

function assignTags(taskId, values) {
  const tagIds = normalizeTags(values).map(ensureTag);
  statements.removeTaskTags.run(taskId);
  for (const tagId of tagIds) statements.insertTaskTag.run(taskId, tagId);
}

function withTags(tasks) {
  if (!tasks.length) return tasks;
  const ids = tasks.map((task) => task.id);
  const tagsByTask = new Map(ids.map((id) => [id, []]));
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`SELECT tt.task_id,tg.name FROM task_tags tt JOIN tags tg ON tg.id=tt.tag_id WHERE tt.task_id IN (${placeholders}) ORDER BY tg.name COLLATE NOCASE`).all(...batch);
    for (const row of rows) tagsByTask.get(row.task_id)?.push(row.name);
  }
  return tasks.map((task) => ({ ...task, tags: tagsByTask.get(task.id) || [] }));
}
function parseSearch(search) {
  if (search == null || search === '') return { terms: [], tagTerms: [] };
  if (typeof search !== 'string' || search.length > 500) {
    throw new Error('Search must be a string of 500 characters or fewer.');
  }
  const tagTerms = [];
  const text = search.replace(/(^|\s)tag:"((?:\\.|[^"])*)"|(^|\s)tag:([^\s]+)/gi, (_, quotedPrefix, quoted, barePrefix, bare) => {
    const value = quoted ?? bare;
    if (value) {
      let normalized = value.replace(/\\(.)/g, '$1');
      try { normalized = decodeURIComponent(normalized); } catch {}
      tagTerms.push(normalized.toLocaleLowerCase());
    }
    return `${quotedPrefix ?? barePrefix} `;
  });
  return {
    terms: text.toLocaleLowerCase().split(/\s+/).filter(Boolean),
    tagTerms,
  };
}
function get(id) {
  const task = statements.findTask.get(id);
  return task ? withTags([task])[0] : null;
}
function tagsFromInput(input) {
  if (input.tags !== undefined) return normalizeTags(input.tags);
  return normalizeTags([input.project, input.section].filter(Boolean));
}
function validateDate(value, field='due date') {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`Field "${field}" must use the YYYY-MM-DD date format.`);
  return value;
}
function validateTime(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('Field "due time" must use the HH:MM 24-hour format.');
  }
  return value;
}
function validatePriority(value) {
  if (!['low', 'normal', 'high'].includes(value)) {
    throw new Error('Priority must be low, normal, or high.');
  }
  return value;
}

export function createTask(input) {
  const title = normalize(input.title);
  if (!title) throw new Error('Task title is required.');
  const priority = validatePriority(input.priority ?? 'normal');
  const due = validateDate(input.dueDate);
  const dueTime = validateTime(input.dueTime);
  const projectId = ensureProject(input.project);
  const sectionId = ensureSection(projectId, input.section);
  const id = crypto.randomUUID();
  const stamp = now();
  statements.insertTask.run(
    id,
    title,
    projectId,
    sectionId,
    normalize(input.description),
    due,
    dueTime,
    priority,
    stamp,
    stamp,
  );
  assignTags(id, tagsFromInput(input));
  return get(id);
}

export function updateTask(id, changes) {
  const current = get(id);
  if (!current) throw new Error(`Task with ID "${id}" was not found.`);
  const title = changes.title === undefined ? current.title : normalize(changes.title);
  if (!title) throw new Error('Task title is required.');
  const project = changes.project === undefined ? current.project : normalize(changes.project);
  const section = changes.section === undefined ? current.section : normalize(changes.section);
  const projectId = ensureProject(project);
  const sectionId = ensureSection(projectId, section);
  const due = changes.dueDate === undefined ? current.dueDate : validateDate(changes.dueDate);
  const dueTime = changes.dueTime === undefined ? current.dueTime : validateTime(changes.dueTime);
  const priority = changes.priority === undefined ? current.priority : validatePriority(changes.priority);
  const description = changes.description === undefined ? current.description : normalize(changes.description);
  statements.updateTask.run(title, projectId, sectionId, description, due, dueTime, priority, now(), id);
  if (changes.tags !== undefined) assignTags(id, changes.tags);
  else if (changes.project !== undefined || changes.section !== undefined) assignTags(id, [project, section].filter(Boolean));
  return get(id);
}

export function setTaskStatus(id, status) {
  if (!['open', 'done', 'deferred'].includes(status)) {
    throw new Error('Status must be open, done, or deferred.');
  }
  const result = statements.setTaskStatus.run(status, now(), id);
  if (!result.changes) throw new Error(`Task with ID "${id}" was not found.`);
  return get(id);
}
export function listTasks(filters = {}) {
  const where = [];
  const args = [];
  if (filters.status && filters.status !== 'all') {
    if (!['open', 'done', 'deferred'].includes(filters.status)) {
      throw new Error('Status filter must be open, done, deferred, or all.');
    }
    where.push('t.status=?');
    args.push(filters.status);
  } else if (!filters.status) {
    where.push("t.status='open'");
  }
  if (filters.project) {
    where.push('p.name=? COLLATE NOCASE');
    args.push(filters.project);
  }
  if (filters.section) {
    where.push('s.name=? COLLATE NOCASE');
    args.push(filters.section);
  }
  const requestedTags = filters.tags ?? (filters.tag ? [filters.tag] : []);
  for (const tag of normalizeTags(requestedTags)) {
    where.push('EXISTS (SELECT 1 FROM task_tags tf JOIN tags tg ON tg.id=tf.tag_id WHERE tf.task_id=t.id AND tg.name=? COLLATE NOCASE)');
    args.push(tag);
  }
  if (filters.untagged) where.push('NOT EXISTS (SELECT 1 FROM task_tags tu WHERE tu.task_id=t.id)');
  if (filters.priority) {
    where.push('t.priority=?');
    args.push(validatePriority(filters.priority));
  }
  if (filters.dueDate) {
    where.push('t.due_date=?');
    args.push(validateDate(filters.dueDate, 'due date'));
  }
  if (filters.overdue) where.push(`t.status!='done' AND t.due_date IS NOT NULL AND (
    t.due_date < date('now','localtime') OR
    (t.due_date = date('now','localtime') AND t.due_time IS NOT NULL
      AND t.due_time < time('now','localtime'))
  )`);
  const { terms, tagTerms } = parseSearch(filters.search);
  for (const term of terms) {
    where.push(`(unicode_contains(t.title,?) OR unicode_contains(COALESCE(t.description,''),?)
      OR EXISTS (SELECT 1 FROM task_tags ts JOIN tags tx ON tx.id=ts.tag_id
        WHERE ts.task_id=t.id AND unicode_contains(tx.name,?)))`);
    args.push(term, term, term);
  }
  for (const term of tagTerms) {
    where.push(`EXISTS (SELECT 1 FROM task_tags ts JOIN tags tx ON tx.id=ts.tag_id
      WHERE ts.task_id=t.id AND unicode_contains(tx.name,?))`);
    args.push(term);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const orderSql = ' ORDER BY t.due_date IS NULL,t.due_date,t.due_time IS NULL,t.due_time,CASE t.priority WHEN \'high\' THEN 0 WHEN \'normal\' THEN 1 ELSE 2 END,t.created_at,t.id';
  if (filters.limit === undefined) {
    return withTags(db.prepare(`${taskSelect}${whereSql}${orderSql}`).all(...args));
  }
  const limit = Number(filters.limit);
  const offset = Number(filters.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Limit must be an integer between 1 and 200.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('Offset must be a non-negative integer.');
  }
  const rows = db.prepare(`${taskSelect}${whereSql}${orderSql} LIMIT ? OFFSET ?`).all(...args, limit + 1, offset);
  const hasMore = rows.length > limit;
  const tasks = withTags(rows.slice(0, limit));
  return { tasks, hasMore, nextOffset: offset + tasks.length };
}

export function listScheduleTasks(date, includeBacklog = false, limit = 100, offset = 0) {
  validateDate(date, 'schedule date');
  limit = Number(limit);
  offset = Number(offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Limit must be an integer between 1 and 200.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('Offset must be a non-negative integer.');
  }
  const where = includeBacklog ? 't.status=\'open\' AND (t.due_date<=? OR t.due_date IS NULL)' : 't.status=\'open\' AND t.due_date=?';
  const rows = db.prepare(`${taskSelect} WHERE ${where}
    ORDER BY t.due_date IS NULL,t.due_date,t.due_time IS NULL,t.due_time,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,t.created_at,t.id
    LIMIT ? OFFSET ?`).all(date, limit + 1, offset);
  const hasMore = rows.length > limit;
  const tasks = withTags(rows.slice(0, limit));
  return { tasks, hasMore, nextOffset: offset + tasks.length };
}

export function getCalendarCounts(from, to) {
  validateDate(from, 'calendar start date');
  validateDate(to, 'calendar end date');
  if (from > to) throw new Error('Calendar start date must not be after its end date.');
  return db.prepare(`SELECT due_date AS dueDate,COUNT(*) AS count FROM tasks
    WHERE status='open' AND due_date BETWEEN ? AND ? GROUP BY due_date`).all(from, to);
}
export function getTags(withCounts=false) {
  return (withCounts ? statements.tagsWithCounts : statements.tags).all();
}

export function deleteTag(value) {
  const name = normalize(value);
  if (!name) throw new Error('Tag name is required.');
  if (name.length > 100) throw new Error('Tag names must be 100 characters or fewer.');

  db.exec('BEGIN IMMEDIATE');
  try {
    const tag = statements.findTagsByName.get(name);
    if (!tag) throw new Error(`Tag "${name}" was not found.`);

    const usageCount = statements.tagUsageCount.get(tag.id).count;
    if (usageCount > 0) {
      throw new Error(`Tag "${tag.name}" is assigned to ${usageCount} task${usageCount === 1 ? '' : 's'} and cannot be deleted.`);
    }

    statements.removeTag.run(tag.id);
    db.exec('COMMIT');
    return { deleted: true, name: tag.name };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function getStructure(withCounts = false) {
  const projectQuery = withCounts ? statements.projectsWithCounts : statements.projects;
  const sectionQuery = withCounts ? statements.sectionsWithCounts : statements.sections;
  const projects = projectQuery.all();
  const sections = sectionQuery.all();
  const sectionsByProject = new Map(projects.map(({ id }) => [id, []]));

  for (const section of sections) {
    const value = {
      name: section.name,
      ...(withCounts ? { openTasks: section.openTasks } : {}),
    };
    sectionsByProject.get(section.project_id)?.push(value);
  }

  return projects.map((project) => ({
    name: project.name,
    ...(withCounts ? { openTasks: project.openTasks } : {}),
    sections: sectionsByProject.get(project.id),
  }));
}
function isTaskOverdue(dueDate, dueTime) {
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  if (dueDate < today) return true;
  if (dueDate !== today || !dueTime) return false;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return `${dueTime}:00` < currentTime;
}

export function dayPlan(date, limit = 8) {
  validateDate(date, 'plan date');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Limit must be an integer between 1 and 100.');
  }

  const tasks = statements.dayPlan.all(date, date, date, limit);
  return withTags(tasks).map((task, index) => ({
    position: index + 1,
    reason: task.dueDate && (task.dueDate < date || isTaskOverdue(task.dueDate, task.dueTime))
      ? 'Overdue task'
      : task.dueDate === date
        ? 'Due on the selected date'
        : task.priority === 'high'
          ? 'High priority, no due date'
          : task.priority === 'normal'
            ? 'Normal priority, no due date'
            : 'Low priority, no due date',
    ...task,
  }));
}
export const databasePath=dbPath;
