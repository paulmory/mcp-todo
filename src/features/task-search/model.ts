export function normalizeSearchTag(value) {
  let normalized = value.replace(/\\(.)/g, "$1");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {}
  return normalized;
}

export function formatSearchTag(value) {
  const escaped = value.replace(/([\\"])/g, "\\$1");
  return /[\s"]/.test(value) ? `"${escaped}"` : escaped;
}

export function searchTagTerms(value) {
  return [
    ...value.matchAll(
      /(?:^|\s)tag:"((?:\\.|[^"])*)"|(?:^|\s)tag:([^\s]+)/gi,
    ),
  ].map((match) => normalizeSearchTag(match[1] ?? match[2]));
}

export function replaceSearchQualifier(value, qualifier, replacement) {
  if (qualifier !== "tag") return value;
  const query = value
    .replace(/(^|\s)tag:(?:"(?:\\.|[^"])*"|[^\s]+)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return [query, replacement].filter(Boolean).join(" ");
}

export function filterTasksBySearch(tasks, query, locale) {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  if (!normalizedQuery) return tasks;

  const tagTerms = [];
  const textQuery = normalizedQuery
    .replace(/(^|\s)tag:"((?:\\.|[^"])*)"|(^|\s)tag:([^\s]+)/gi, (_, beforeQuoted, quoted, beforeBare, bare) => {
      const rawTag = quoted ?? bare;
      if (rawTag) tagTerms.push(normalizeSearchTag(rawTag));
      return `${beforeQuoted ?? beforeBare} `;
    })
    .replace(/(^|\s)tag:"(?:\\.|[^"])*$/i, " ")
    .replace(/(^|\s)tag:[^\s]*$/i, " ");
  const terms = textQuery.split(/\s+/).filter(Boolean);

  return tasks.filter((task) => {
    const tags = (task.tags || []).map((tag) => tag.toLocaleLowerCase(locale));
    const content = [task.title, task.description, ...tags]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(locale);
    return (
      terms.every((term) => content.includes(term)) &&
      tagTerms.every((term) => tags.some((tag) => tag.includes(term)))
    );
  });
}
