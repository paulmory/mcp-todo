export function parseTaskTags(value) {
  const names = value
    .split(",")
    .map((tag) => tag.trim().toLocaleLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}
