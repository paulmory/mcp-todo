interface TaskListQueryOptions {
  state: {
    status: string;
    tag: string | null;
    untagged: boolean;
  };
  pageSize: number;
  offset: number;
  search: string;
  dueDate: string;
}

export function buildTaskListQuery({
  state,
  pageSize,
  offset,
  search,
  dueDate,
}: TaskListQueryOptions): URLSearchParams {
  const overdueOnly = state.status === "overdue";
  const query = new URLSearchParams({
    status: overdueOnly ? "all" : state.status,
    limit: String(pageSize),
    offset: String(offset),
  });

  if (overdueOnly) query.set("overdue", "true");
  if (state.tag) query.set("tag", state.tag);
  if (state.untagged) query.set("untagged", "true");
  if (dueDate) query.set("dueDate", dueDate);
  if (search.trim()) query.set("q", search.trim());

  return query;
}
