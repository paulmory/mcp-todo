import { db, databasePath } from "./shared/db/index.ts";
import { assignTags, deleteTag, getTags, normalizeTags, withTags } from "./entities/tag/model/repository.ts";

export { databasePath, deleteTag, getTags };

const now = () => new Date().toISOString();
const taskSelect = `SELECT t.id,t.title,t.description,t.due_date AS dueDate,t.due_time AS dueTime,t.priority,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt FROM tasks t`;
const normalize = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

// Cache the bounded set of generated SQL variants used by filters and tag batches.
const statementCache = new Map<string, ReturnType<typeof db.prepare>>();
const MAX_CACHED_STATEMENTS = 128;
function prepare(sql: string) {
  const cached = statementCache.get(sql);
  if (cached) {
    statementCache.delete(sql);
    statementCache.set(sql, cached);
    return cached;
  }

  const statement = db.prepare(sql);
  if (statementCache.size >= MAX_CACHED_STATEMENTS) {
    const oldestSql = statementCache.keys().next().value;
    if (oldestSql !== undefined) statementCache.delete(oldestSql);
  }
  statementCache.set(sql, statement);
  return statement;
}

function transaction<T>(operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

function pagination(limit: unknown, offset: unknown, max = 200) {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > max) {
    throw new Error(`Limit must be an integer between 1 and ${max}.`);
  }
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    throw new Error("Offset must be a non-negative integer.");
  }
  return { limit: parsedLimit, offset: parsedOffset };
}

const statements = {
  findTask: db.prepare(`${taskSelect} WHERE t.id=?`),
  insertTask: db.prepare("INSERT INTO tasks(id,title,description,due_date,due_time,priority,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'open',?,?)"),
  updateTask: db.prepare('UPDATE tasks SET title=?,description=?,due_date=?,due_time=?,priority=?,updated_at=? WHERE id=?'),
  setTaskStatus: db.prepare('UPDATE tasks SET status=?,updated_at=? WHERE id=?'),
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
    terms: [...new Set(text.toLocaleLowerCase().split(/\s+/).filter(Boolean))],
    tagTerms: [...new Set(tagTerms)],
  };
}
function get(id) {
  const task = statements.findTask.get(id);
  return task ? withTags([task])[0] : null;
}
function validateDate(value, field='due date') {
  if (value == null || value === '') return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Field "${field}" must use a valid YYYY-MM-DD date.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Field "${field}" must use a valid YYYY-MM-DD date.`);
  }
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
  const id = crypto.randomUUID();
  const stamp = now();
  return transaction(() => {
    statements.insertTask.run(
      id, title, normalize(input.description), due, dueTime, priority, stamp, stamp,
    );
    assignTags(id, input.tags ?? []);
    return get(id);
  });
}

export function updateTask(id, changes) {
  return transaction(() => {
    const current = get(id);
    if (!current) throw new Error(`Task with ID "${id}" was not found.`);
    const title = changes.title === undefined ? current.title : normalize(changes.title);
    if (!title) throw new Error('Task title is required.');
    const due = changes.dueDate === undefined ? current.dueDate : validateDate(changes.dueDate);
    const dueTime = changes.dueTime === undefined ? current.dueTime : validateTime(changes.dueTime);
    const priority = changes.priority === undefined ? current.priority : validatePriority(changes.priority);
    const description = changes.description === undefined ? current.description : normalize(changes.description);
    statements.updateTask.run(title, description, due, dueTime, priority, now(), id);
    if (changes.tags !== undefined) assignTags(id, changes.tags);
    return get(id);
  });
}

export function setTaskStatus(id, status) {
  if (!['open', 'done', 'deferred'].includes(status)) {
    throw new Error('Status must be open, done, or deferred.');
  }
  return transaction(() => {
    const result = statements.setTaskStatus.run(status, now(), id);
    if (!result.changes) throw new Error(`Task with ID "${id}" was not found.`);
    return get(id);
  });
}
export function listTasks(filters: {
  status?: string;
  tags?: string[];
  tag?: string;
  untagged?: boolean;
  priority?: string;
  dueDate?: string;
  overdue?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
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
    return withTags(prepare(`${taskSelect}${whereSql}${orderSql}`).all(...args));
  }
  const { limit, offset } = pagination(filters.limit, filters.offset ?? 0);
  const rows = prepare(`${taskSelect}${whereSql}${orderSql} LIMIT ? OFFSET ?`).all(...args, limit + 1, offset);
  const hasMore = rows.length > limit;
  const tasks = withTags(rows.slice(0, limit));
  return { tasks, hasMore, nextOffset: offset + tasks.length };
}

export function listScheduleTasks(date, includeBacklog = false, limit = 100, offset = 0) {
  validateDate(date, 'schedule date');
  ({ limit, offset } = pagination(limit, offset));
  const where = includeBacklog ? 't.status=\'open\' AND (t.due_date<=? OR t.due_date IS NULL)' : 't.status=\'open\' AND t.due_date=?';
  const rows = prepare(`${taskSelect} WHERE ${where}
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
  return prepare(`SELECT due_date AS dueDate,COUNT(*) AS count FROM tasks
    WHERE status='open' AND due_date BETWEEN ? AND ? GROUP BY due_date`).all(from, to);
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
  const { limit: pageSize } = pagination(limit, 0, 100);

  const tasks = statements.dayPlan.all(date, date, date, pageSize);
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
