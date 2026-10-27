import { isDueWithinNextHour, isOverdue } from "../model/due-date.ts";
import { escapeHtml } from "../../../shared/lib/html.ts";

export function dateClass(date, showOverdue = true, currentDate = undefined, dueTime = undefined, currentTime = undefined) {
  if (showOverdue && isOverdue(date, dueTime, currentDate, currentTime)) {
    return "bg-rose-soft text-rose";
  }
  const today = currentDate || new Date().toLocaleDateString("en-CA");
  return date === today ? "bg-accent-soft text-accent" : "bg-tint text-muted";
}

const PRIORITY_BARS = [
  [2, 10, 3, 4],
  [6.5, 7, 3, 7],
  [11, 4, 3, 10],
];
const PRIORITY_MASKS = { low: 0b001, normal: 0b011, high: 0b111 };

export function priorityIcon(level, labels) {
  const activeBars = PRIORITY_MASKS[level] ?? PRIORITY_MASKS.normal;
  const bars = PRIORITY_BARS.map(([x, y, width, height], index) =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1" class="${activeBars & (1 << index) ? "fill-current" : "fill-muted/20"}"></rect>`,
  ).join("");
  const label = escapeHtml(labels[level] || labels.normal);
  return `<span class="inline-flex h-6 w-5 shrink-0 items-center justify-start rounded-md text-muted" role="img" aria-label="${label}" title="${label}"><svg aria-hidden="true" viewBox="0 0 16 16" class="-translate-y-px h-5 w-5">${bars}</svg></span>`;
}

export function renderTaskTags(tags = [], { activeTag, label }) {
  if (!tags.length) return "";
  const buttons = tags
    .map((tag) => {
      const name = escapeHtml(tag);
      return `<button class="tag-link" type="button" data-filter-tag="${name}" aria-label="${escapeHtml(label)}: ${name}" aria-pressed="${activeTag === tag}">${name}</button>`;
    })
    .join("");
  return `<div class="task-tag-list" role="group" aria-label="${escapeHtml(label)}">
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0 text-muted"><path d="M2 8.2V3.5a1.5 1.5 0 0 1 1.5-1.5h4.7l5.3 5.3a1.5 1.5 0 0 1 0 2.1l-3.1 3.1a1.5 1.5 0 0 1-2.1 0L2 8.2Z"></path><circle cx="5.2" cy="5.2" r=".7" fill="currentColor"></circle></svg>
    <span class="task-tag-items">${buttons}</span>
  </div>`;
}

function renderEditButton(task, label) {
  return `<button class="icon-button" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" data-edit="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button>`;
}

export function renderTaskRow(task, options) {
  const {
    mode = "tasks",
    index,
    labels,
    priorityLabels,
    formatDate,
    currentDate,
    selectedTag = null,
  } = options;
  const isPlan = mode === "plan";
  const isDone = task.status === "done";
  const safeTitle = escapeHtml(task.title);
  const editLabel = `${labels.edit}: ${task.title}`;
  const selector = isPlan
    ? `<span class="pt-1 text-center text-base leading-5 font-semibold text-line">${index + 1}</span>`
    : isDone
      ? `<button class="task-check-target task-done-control" type="button" title="${escapeHtml(labels.restore)}" aria-label="${escapeHtml(labels.restoreAria)}" data-status="open" data-id="${task.id}"><span class="task-done-indicator" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-2.5 w-2.5"><path d="m3 8 3 3 7-7"></path></svg></span></button>`
: `<button class="task-check-target task-open-control" type="button" title="${escapeHtml(labels.select(task.title))}" aria-label="${escapeHtml(labels.select(task.title))}" data-status="done" data-id="${task.id}"><span class="task-checkbox-indicator" aria-hidden="true"></span></button>`;
  const deferButton = !isPlan && !isDone
    ? `<button class="icon-button" type="button" title="${escapeHtml(labels.defer)}" aria-label="${escapeHtml(labels.defer)}" data-status="deferred" data-id="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg></button>`
    : "";
  const actions = `<div class="task-actions">${renderEditButton(task, labels.edit)}${deferButton}</div>`;
  const titleClass = isDone
    ? "text-muted line-through"
    : "text-ink hover:text-accent";
  const metadataClass = isPlan
    ? "mt-1 flex flex-wrap items-center gap-1.5"
    : "mt-1 flex min-w-0 flex-nowrap items-center gap-1.5";
  const showOverdue = !isDone;
  const overdueByDate = showOverdue && task.dueDate && task.dueDate < currentDate;
  const overdueByTime = showOverdue && task.dueDate === currentDate && isOverdue(task.dueDate, task.dueTime, currentDate);
  const dueWithinNextHour = showOverdue && isDueWithinNextHour(task.dueDate, task.dueTime, currentDate);
  const tags = isPlan
    ? ""
    : renderTaskTags(task.tags, {
        activeTag: selectedTag,
        label: labels.tagFilter,
      });

  return `<article class="task-row group grid grid-cols-[40px_minmax(0,1fr)] items-start gap-2 border-b border-line/60 px-2 py-2 hover:bg-tint last:border-b-0">
    ${selector}
    <div class="task-row-main grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-x-2 pt-1">
      <div class="min-w-0">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <button type="button" class="min-w-0 break-words text-left text-[14px] leading-5 font-semibold ${titleClass}" data-edit="${task.id}" aria-label="${escapeHtml(editLabel)}">${safeTitle}</button>
          ${task.status === "deferred" && !isPlan ? `<span class="text-[11px] font-medium text-muted">${escapeHtml(labels.deferred)}</span>` : ""}
        </div>
        <div class="${metadataClass}">
          ${priorityIcon(task.priority, priorityLabels)}
          ${task.dueDate ? `<span class="rounded-md px-2 py-1 text-[11px] font-medium ${dateClass(task.dueDate, showOverdue && !overdueByTime, currentDate)}">${escapeHtml(formatDate(task.dueDate, showOverdue && !overdueByTime))}</span>` : ""}
          ${task.dueTime && !overdueByDate ? `<time class="rounded-md px-2 py-1 text-[11px] font-medium ${overdueByTime ? "bg-rose-soft text-rose" : dueWithinNextHour ? "bg-accent-soft text-accent" : "bg-tint text-muted"}" datetime="${escapeHtml(task.dueTime)}">${escapeHtml(task.dueTime)}</time>` : ""}
          ${tags}
        </div>
        ${task.description ? `<p class="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-muted">${escapeHtml(task.description)}</p>` : ""}
      </div>
      ${actions}
    </div>
  </article>`;
}
