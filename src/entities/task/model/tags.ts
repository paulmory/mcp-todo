import { db } from "../../../shared/db/index.ts";
import { currentUserId } from "../../../shared/auth/user-context.ts";

const statements = {
  findTagsByName: db.prepare("SELECT id,name FROM tags WHERE user_id=? AND name=? COLLATE NOCASE ORDER BY id"),
  insertTag: db.prepare("INSERT OR IGNORE INTO tags(user_id,name) VALUES(?,?)"),
  findTag: db.prepare("SELECT id FROM tags WHERE user_id=? AND name=? COLLATE NOCASE"),
  tagUsageCount: db.prepare("SELECT COUNT(*) AS count FROM task_tags WHERE user_id=? AND tag_id=?"),
  mergeTagAssignments: db.prepare("INSERT OR IGNORE INTO task_tags(user_id,task_id,tag_id) SELECT user_id,task_id,? FROM task_tags WHERE user_id=? AND tag_id=?"),
  removeTagAssignments: db.prepare("DELETE FROM task_tags WHERE user_id=? AND tag_id=?"),
  removeTag: db.prepare("DELETE FROM tags WHERE user_id=? AND id=?"),
  renameTag: db.prepare("UPDATE tags SET name=? WHERE user_id=? AND id=?"),
  removeTaskTags: db.prepare("DELETE FROM task_tags WHERE user_id=? AND task_id=?"),
  insertTaskTag: db.prepare("INSERT INTO task_tags(user_id,task_id,tag_id) VALUES(?,?,?)"),
  tags: db.prepare("SELECT name FROM tags WHERE user_id=? ORDER BY name COLLATE NOCASE"),
  tagsWithCounts: db.prepare(`SELECT tg.name,COUNT(DISTINCT CASE WHEN t.status='open' THEN t.id END) AS openTasks
    FROM tags tg LEFT JOIN task_tags tt ON tt.user_id=tg.user_id AND tt.tag_id=tg.id
    LEFT JOIN tasks t ON t.user_id=tt.user_id AND t.id=tt.task_id
    WHERE tg.user_id=? GROUP BY tg.id ORDER BY tg.name COLLATE NOCASE`),
};

const taskTagQueries = new Map<string, ReturnType<typeof db.prepare>>();
function taskTagsStatement(batchSize: number) {
  const placeholders = Array.from({ length: batchSize }, () => "?").join(",");
  const sql = `SELECT tt.task_id,tg.name FROM task_tags tt JOIN tags tg ON tg.id=tt.tag_id AND tg.user_id=tt.user_id WHERE tt.user_id=? AND tt.task_id IN (${placeholders}) ORDER BY tg.name COLLATE NOCASE`;
  let statement = taskTagQueries.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    if (taskTagQueries.size >= 32) {
      const oldestSql = taskTagQueries.keys().next().value;
      if (oldestSql !== undefined) taskTagQueries.delete(oldestSql);
    }
    taskTagQueries.set(sql, statement);
  } else {
    taskTagQueries.delete(sql);
    taskTagQueries.set(sql, statement);
  }
  return statement;
}

function normalize(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeTags(values: unknown): string[] {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error("Tags must be provided as an array of names.");

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const name = normalize(value);
    if (!name) throw new Error("Tag names cannot be empty.");
    if (name.length > 100) throw new Error("Tag names must be 100 characters or fewer.");

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(key);
  }
  return tags;
}

function ensureTag(name: string): number {
  const userId = currentUserId();
  const key = name.toLowerCase();
  const matches = statements.findTagsByName.all(userId, key);
  if (matches.length) {
    const canonicalId = matches[0].id;
    for (const duplicate of matches.slice(1)) {
      statements.mergeTagAssignments.run(canonicalId, userId, duplicate.id);
      statements.removeTagAssignments.run(userId, duplicate.id);
      statements.removeTag.run(userId, duplicate.id);
    }
    if (matches[0].name !== key) statements.renameTag.run(key, userId, canonicalId);
    return Number(canonicalId);
  }

  statements.insertTag.run(userId, key);
  return Number(statements.findTag.get(userId, key).id);
}

export function assignTags(taskId: string, values: unknown): void {
  const tagIds = normalizeTags(values).map(ensureTag);
  const userId = currentUserId();
  statements.removeTaskTags.run(userId, taskId);
  for (const tagId of tagIds) statements.insertTaskTag.run(userId, taskId, tagId);
}

export function withTags(tasks: any[]): any[] {
  if (!tasks.length) return tasks;

  const ids = tasks.map((task) => task.id);
  const tagsByTask = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    const rows = taskTagsStatement(batch.length).all(currentUserId(), ...batch) as Array<{ task_id: string; name: string }>;
    for (const row of rows) tagsByTask.get(row.task_id)?.push(row.name);
  }

  return tasks.map((task) => ({ ...task, tags: tagsByTask.get(task.id) || [] }));
}

export function getTags(withCounts = false) {
  return (withCounts ? statements.tagsWithCounts : statements.tags).all(currentUserId());
}

export function deleteTag(value: unknown) {
  const name = normalize(value);
  if (!name) throw new Error("Tag name is required.");
  if (name.length > 100) throw new Error("Tag names must be 100 characters or fewer.");

  db.exec("BEGIN IMMEDIATE");
  try {
    const userId = currentUserId();
    const tag = statements.findTagsByName.get(userId, name);
    if (!tag) throw new Error(`Tag "${name}" was not found.`);

    const usageCount = statements.tagUsageCount.get(userId, tag.id).count;
    if (Number(usageCount) > 0) {
      throw new Error(`Tag "${tag.name}" is assigned to ${usageCount} task${usageCount === 1 ? "" : "s"} and cannot be deleted.`);
    }

    statements.removeTag.run(userId, tag.id);
    db.exec("COMMIT");
    return { deleted: true, name: tag.name };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
