import { locales, translate } from "./i18n.js";

const $ = (selector) => document.querySelector(selector);
const savedLanguage = (() => {
  try {
    return localStorage.getItem("todo-language");
  } catch {
    return null;
  }
})();
let language = Object.hasOwn(locales, savedLanguage) ? savedLanguage : "en";
const t = (key, values) => translate(language, key, values);
const state = {
  tag: null,
  untagged: false,
  view: "tasks",
  status: "open",
  search: "",
  tasks: [],
  calendarMonth: null,
  dueCalendarMonth: null,
};
let availableTags = [];

const today = () => new Date().toLocaleDateString("en-CA");
const todayDate = new Date();
function renderTodayLabel() {
  const todayText = new Intl.DateTimeFormat(locales[language], {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(todayDate);
  $("#todayLabel").textContent =
    todayText.charAt(0).toLocaleUpperCase(locales[language]) +
    todayText.slice(1);
}
function applyStaticTranslations() {
  document.documentElement.lang = language;
  document.title = t("appTitle");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  if ($("#taskId").value) $("#dialogTitle").textContent = t("editTaskTitle");
  document
    .querySelectorAll("[data-i18n-aria]")
    .forEach((element) =>
      element.setAttribute("aria-label", t(element.dataset.i18nAria)),
    );
  document
    .querySelectorAll("[data-i18n-title]")
    .forEach((element) =>
      element.setAttribute("title", t(element.dataset.i18nTitle)),
    );
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((element) =>
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder)),
    );
  document
    .querySelector("#accentPalette")
    .setAttribute("aria-label", t("accentColor"));
  $("#accentPickerToggle").setAttribute("aria-label", t("accentColor"));
  $("#accentPickerToggle").setAttribute("title", t("accentColor"));
  $("#languageSelect").value = language;
  updateTagOptions();
  renderTodayLabel();
}
applyStaticTranslations();
$("#planDate").value = today();

const accentChoices = [
  "red",
  "orange",
  "yellow",
  "green",
  "emerald",
  "teal",
  "sky",
  "blue",
  "indigo",
  "purple",
  "pink",
  "neutral",
];
function applyAccent(accent, persist = false) {
  const selected = accentChoices.includes(accent) ? accent : "green";
  document.documentElement.dataset.accent = selected;
  $("#accentPickerToggle").setAttribute("aria-label", t("accentColor"));
  $("#accentPickerToggle").setAttribute("title", t("accentColor"));
  $("#accentPickerToggle .accent-color-dot").dataset.color = selected;
  document.querySelectorAll("[data-accent-choice]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.accentChoice === selected),
    );
  });
  if (persist) {
    try {
      localStorage.setItem("todo-accent", selected);
    } catch {}
  }
}
let initialAccent = "green";
try {
  const savedAccent = localStorage.getItem("todo-accent");
  if (savedAccent && accentChoices.includes(savedAccent))
    initialAccent = savedAccent;
} catch {}
applyAccent(initialAccent);

$("#accentPickerToggle").onclick = () => {
  const expanded =
    $("#accentPickerToggle").getAttribute("aria-expanded") === "true";
  $("#accentPickerToggle").setAttribute("aria-expanded", String(!expanded));
  $("#accentPalette").hidden = expanded;
};
document.querySelectorAll("[data-accent-choice]").forEach((button) => {
  button.onclick = () => {
    applyAccent(button.dataset.accentChoice, true);
    $("#accentPalette").hidden = true;
    $("#accentPickerToggle").setAttribute("aria-expanded", "false");
    $("#accentPickerToggle").focus();
  };
});
document.addEventListener("click", (event) => {
  if (!$("#accentPicker").contains(event.target)) {
    $("#accentPalette").hidden = true;
    $("#accentPickerToggle").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#accentPalette").hidden) {
    $("#accentPalette").hidden = true;
    $("#accentPickerToggle").setAttribute("aria-expanded", "false");
    $("#accentPickerToggle").focus();
  }
});

function renderThemeToggle() {
  const dark = document.documentElement.classList.contains("dark");
  const button = $("#themeToggle");
  button.setAttribute("aria-checked", String(dark));
  button.setAttribute(
    "aria-label",
    dark ? t("themeDarkEnabled") : t("themeDarkDisabled"),
  );
  document.querySelector('meta[name="theme-color"]').content = dark
    ? "#101716"
    : "#f2f5f3";
}
renderThemeToggle();
$("#themeToggle").onclick = () => {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("todo-theme", dark ? "dark" : "light");
  } catch {}
  renderThemeToggle();
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      language === "ru" ? data.error || t("requestFailed") : t("requestFailed"),
    );
  return data;
}

function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

let toastTimer;
function toast(message, action = null, duration = 5000) {
  const element = $("#toast");
  const actionButton = $("#toastAction");
  clearTimeout(toastTimer);
  $("#toastMessage").textContent = message;
  actionButton.hidden = !action;
  actionButton.disabled = false;
  actionButton.textContent = action?.label ?? "";
  actionButton.onclick = action
    ? async () => {
        clearTimeout(toastTimer);
        actionButton.disabled = true;
        await action.onClick();
      }
    : null;
  element.classList.remove("opacity-0", "translate-y-3");
  element.classList.add("opacity-100", "translate-y-0");
  toastTimer = setTimeout(() => {
    element.classList.add("opacity-0", "translate-y-3");
    element.classList.remove("opacity-100", "translate-y-0");
    actionButton.onclick = null;
  }, duration);
}

function formatDate(date, showOverdue = true) {
  if (!date) return "";
  if (date === today()) return t("today");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === tomorrow.toLocaleDateString("en-CA")) return t("tomorrow");
  const localDate = new Date(`${date}T00:00:00`);
  const shortDate = new Intl.DateTimeFormat(locales[language], {
    day: "numeric",
    month: "short",
  }).format(localDate);
  return showOverdue && date < today()
    ? t("overdue", { date: shortDate })
    : shortDate;
}

function dateClass(date, showOverdue = true) {
  if (showOverdue && date && date < today()) return "bg-rose-soft text-rose";
  if (date === today()) return "bg-accent-soft text-accent";
  return "bg-tint text-muted";
}

function priorityIcon(level) {
  const labels = {
    high: t("priorityHigh"),
    normal: t("priorityNormal"),
    low: t("priorityLow"),
  };
  const color = "text-muted";
  const bars = [
    '<rect x="2" y="10" width="3" height="4" rx="1" class="fill-current"></rect>',
    `<rect x="6.5" y="7" width="3" height="7" rx="1" class="${level === "low" ? "fill-muted/20" : "fill-current"}"></rect>`,
    `<rect x="11" y="4" width="3" height="10" rx="1" class="${level === "high" ? "fill-current" : "fill-muted/20"}"></rect>`,
  ].join("");
  return `<span class="inline-flex h-6 w-5 shrink-0 items-center justify-start rounded-md ${color}" role="img" aria-label="${esc(labels[level])}" title="${esc(labels[level])}"><svg aria-hidden="true" viewBox="0 0 16 16" class="-translate-y-px h-5 w-5">${bars}</svg></span>`;
}

function dateValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function renderPlanDateLabel() {
  const [year, month, day] = $("#planDate").value.split("-").map(Number);
  $("#planDateLabel").textContent = new Intl.DateTimeFormat(locales[language], {
    dateStyle: "long",
  }).format(new Date(year, month - 1, day));
}

function renderPlanDateSwitch() {
  const selectedDate = $("#planDate").value;
  const dates = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const label =
      offset === 0
        ? t("today")
        : offset === 1
          ? t("tomorrow")
          : new Intl.DateTimeFormat(locales[language], {
              day: "numeric",
              month: "short",
            }).format(date);
    return { value: dateValue(date), label };
  });
  $("#planDateSwitch").innerHTML = dates
    .map(
      ({ value, label }) => `
    <button type="button" class="status-option" data-plan-day="${value}" aria-pressed="${value === selectedDate}">${esc(label)}</button>
  `,
    )
    .join("");
  document.querySelectorAll("[data-plan-day]").forEach((button) => {
    button.onclick = () => {
      $("#planDate").value = button.dataset.planDay;
      loadPlan();
    };
  });
}

function renderCalendar({
  calendar,
  monthLabel,
  grid,
  month,
  selectedValue,
  taskCounts = new Map(),
  onSelect,
  onMonthChange,
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const locale = locales[language];
  monthLabel.textContent = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(firstDay);

  const weekStart = (new Intl.Locale(language).weekInfo?.firstDay || 1) % 7;
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 7 + ((weekStart + index) % 7)));
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(date);
  });
  const offset = (firstDay.getDay() - weekStart + 7) % 7;
  const cells = weekdays.map(
    (day) =>
      `<span class="calendar-weekday" aria-hidden="true">${esc(day)}</span>`,
  );
  for (let index = 0; index < offset; index += 1)
    cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = dateValue(new Date(year, monthIndex, day));
    const count = taskCounts.get(value) || 0;
    const date = new Date(year, monthIndex, day);
    const label = new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(
      date,
    );
    cells.push(
      `<button type="button" class="calendar-day${value === selectedValue ? " is-selected" : ""}${value === today() ? " is-today" : ""}" data-calendar-date="${value}" aria-label="${esc(label)}${count ? `, ${count}` : ""}" aria-pressed="${value === selectedValue}"><span>${day}</span>${count ? '<i aria-hidden="true"></i>' : ""}</button>`,
    );
  }
  grid.innerHTML = cells.join("");
  grid.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.onclick = () => onSelect(button.dataset.calendarDate);
  });
  calendar
    .querySelectorAll("[data-calendar-shift], [data-due-calendar-shift]")
    .forEach((button) => {
      button.onclick = () =>
        onMonthChange(
          new Date(
            year,
            monthIndex +
              Number(
                button.dataset.calendarShift ?? button.dataset.dueCalendarShift,
              ),
            1,
          ),
        );
    });
}

function renderScheduleCalendar(tasks = []) {
  const selectedValue = $("#planDate").value;
  const [selectedYear, selectedMonth] = selectedValue.split("-").map(Number);
  if (!state.calendarMonth)
    state.calendarMonth = new Date(selectedYear, selectedMonth - 1, 1);
  const taskCounts = new Map();
  tasks.forEach((task) => {
    if (task.dueDate)
      taskCounts.set(task.dueDate, (taskCounts.get(task.dueDate) || 0) + 1);
  });
  renderCalendar({
    calendar: $("#scheduleCalendar"),
    monthLabel: $("#calendarMonthLabel"),
    grid: $("#calendarGrid"),
    month: state.calendarMonth,
    selectedValue,
    taskCounts,
    onSelect: (value) => {
      $("#planDate").value = value;
      loadPlan();
    },
    onMonthChange: (month) => {
      state.calendarMonth = month;
      renderScheduleCalendar(tasks);
    },
  });
}

function updateDueDateLabel() {
  const value = $("#dueDate")?.value;
  $("#dueDateLabel").textContent = value
    ? new Intl.DateTimeFormat(locales[language], {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : t("due");
}

function renderDueDateCalendar() {
  const selectedValue = $("#dueDate").value;
  const baseValue = selectedValue || today();
  const [year, month] = baseValue.split("-").map(Number);
  if (!state.dueCalendarMonth)
    state.dueCalendarMonth = new Date(year, month - 1, 1);
  renderCalendar({
    calendar: $("#dueDatePopup"),
    monthLabel: $("#dueCalendarMonthLabel"),
    grid: $("#dueCalendarGrid"),
    month: state.dueCalendarMonth,
    selectedValue,
    onSelect: (value) => {
      $("#dueDate").value = value;
      updateDueDateLabel();
      closeDueDatePopup();
      loadTasks();
    },
    onMonthChange: (nextMonth) => {
      state.dueCalendarMonth = nextMonth;
      renderDueDateCalendar();
    },
  });
}

function closeDueDatePopup({ restoreFocus = false } = {}) {
  const popup = $("#dueDatePopup");
  if (!popup || popup.hidden) return;
  popup.hidden = true;
  $("#dueDateToggle").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("#dueDateToggle").focus();
}

function openDueDatePopup() {
  const popup = $("#dueDatePopup");
  if (popup.hidden) {
    const selectedValue = $("#dueDate").value || today();
    const [year, month] = selectedValue.split("-").map(Number);
    state.dueCalendarMonth = new Date(year, month - 1, 1);
    renderDueDateCalendar();
    popup.hidden = false;
    $("#dueDateToggle").setAttribute("aria-expanded", "true");
  } else {
    closeDueDatePopup();
  }
}

function renderStatusSwitch() {
  document.querySelectorAll("[data-status-view]").forEach((button) => {
    const active = button.dataset.statusView === state.status;
    button.setAttribute("aria-pressed", String(active));
  });
}

function activeView(view) {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("text-accent", active);
    button.classList.toggle("bg-accent-soft", active);
    button.classList.toggle("bg-transparent", !active);
    button.classList.toggle("text-muted", !active);
  });
}

function scopeClass(active) {
  return `scope-option${active ? " is-active" : ""}`;
}

function updateTagOptions() {
  $("#tagOptions").innerHTML = availableTags
    .map((tag) => `<option value="${esc(tag.name)}">`)
    .join("");
}

function parseTags(value) {
  const names = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return [
    ...new Map(
      names.map((name) => [name.toLowerCase(), name.toLowerCase()]),
    ).values(),
  ];
}

function toggleTagFilter(tag) {
  state.tag = state.tag === tag ? null : tag;
  state.untagged = false;
  loadTasks();
}

function renderTaskTags(tags = []) {
  if (!tags.length) return "";
  const buttons = tags
    .map(
      (tag) =>
        `<button class="tag-link" type="button" data-filter-tag="${esc(tag)}" aria-label="${esc(t("projectFilter"))}: ${esc(tag)}" aria-pressed="${state.tag === tag}">${esc(tag)}</button>`,
    )
    .join("");
  return `<div class="task-tag-list" role="group" aria-label="${esc(t("projectFilter"))}">
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0 text-muted"><path d="M2 8.2V3.5a1.5 1.5 0 0 1 1.5-1.5h4.7l5.3 5.3a1.5 1.5 0 0 1 0 2.1l-3.1 3.1a1.5 1.5 0 0 1-2.1 0L2 8.2Z"></path><circle cx="5.2" cy="5.2" r=".7" fill="currentColor"></circle></svg>
    <span class="task-tag-items">${buttons}</span>
  </div>`;
}

function closeMobileTagPopup({ restoreFocus = false } = {}) {
  const popup = $("#mobileTagPopup");
  if (!popup || popup.hidden) return;
  popup.hidden = true;
  $("#mobileTagToggle").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("#mobileTagToggle").focus();
}

function closeMobilePlanCalendarPopup({ restoreFocus = false } = {}) {
  const popup = $("#mobilePlanCalendarPopup");
  if (!popup || popup.hidden) return;
  popup.hidden = true;
  $("#mobilePlanCalendarToggle").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("#mobilePlanCalendarToggle").focus();
}

function syncScheduleCalendarPlacement() {
  const calendar = $("#scheduleCalendar");
  const mobilePopup = $("#mobilePlanCalendarPopup");
  const desktopAnchor = $("#scheduleCalendarAnchor");
  if (window.matchMedia("(max-width: 767px)").matches) {
    if (calendar.parentElement !== mobilePopup) mobilePopup.append(calendar);
  } else if (calendar.parentElement !== desktopAnchor) {
    closeMobilePlanCalendarPopup();
    desktopAnchor.append(calendar);
  }
}

function selectMobileTagScope(kind, tag = null) {
  state.tag = kind === "tag" ? tag : null;
  state.untagged = kind === "untagged";
  closeMobileTagPopup();
  loadTasks();
}

function renderTags(tags) {
  availableTags = tags;
  updateTagOptions();
  const visibleTags = tags.filter((tag) => tag.openTasks > 0);
  const options = visibleTags
    .map(
      (tag) =>
        `<option value="tag:${encodeURIComponent(tag.name)}">${esc(tag.name)} (${tag.openTasks})</option>`,
    )
    .join("");
  $("#scopeFilter").innerHTML =
    `<option value="all">${t("allTasks")}</option><option value="untagged">${t("noProject")}</option>${options}`;
  $("#scopeFilter").value = state.untagged
    ? "untagged"
    : state.tag
      ? `tag:${encodeURIComponent(state.tag)}`
      : "all";
  $("#allTasks").className = scopeClass(!state.tag && !state.untagged);
  $("#unassigned").className = scopeClass(state.untagged);
  $("#tags").innerHTML =
    visibleTags
      .map(
        (tag) => `
    <button class="${scopeClass(state.tag === tag.name && !state.untagged)}" data-tag="${esc(tag.name)}">
      <span class="min-w-0 truncate">${esc(tag.name)}</span><span class="ml-2 rounded-full bg-meta-chip px-2 py-0.5 text-[11px] text-muted">${tag.openTasks}</span>
    </button>`,
      )
      .join("") ||
    `<p class="px-3 py-2 text-xs text-muted">${t("projectsEmpty")}</p>`;
  $("#mobileTagMenu").innerHTML = `
    <button type="button" class="${scopeClass(!state.tag && !state.untagged)}" data-mobile-scope="all"><span>${t("allTasks")}</span></button>
    <button type="button" class="${scopeClass(state.untagged)}" data-mobile-scope="untagged"><span>${t("noProject")}</span></button>
    <div class="my-2 border-t border-line"></div>
    ${visibleTags.map((tag) => `<button type="button" class="${scopeClass(state.tag === tag.name && !state.untagged)}" data-mobile-tag="${esc(tag.name)}"><span class="min-w-0 truncate">${esc(tag.name)}</span><span class="ml-2 rounded-full bg-meta-chip px-2 py-0.5 text-[11px] text-muted">${tag.openTasks}</span></button>`).join("") || `<p class="px-3 py-2 text-xs text-muted">${t("projectsEmpty")}</p>`}
  `;
  document.querySelectorAll("[data-tag]").forEach((button) => {
    button.onclick = () => {
      state.tag = button.dataset.tag;
      state.untagged = false;
      loadTasks();
    };
  });
  document.querySelectorAll("[data-mobile-scope]").forEach((button) => {
    button.onclick = () => selectMobileTagScope(button.dataset.mobileScope);
  });
  document.querySelectorAll("[data-mobile-tag]").forEach((button) => {
    button.onclick = () =>
      selectMobileTagScope("tag", button.dataset.mobileTag);
  });
}

function emptyContent() {
  const message = state.search ? t("emptySearch") : t("emptyTasks");
  return `<div class="empty-state"><p class="empty-state-title">${message}</p><p class="empty-state-hint">${t("emptyHint")}</p></div>`;
}

function taskCard(task) {
  const selector =
    task.status === "done"
      ? `<button class="task-check-target task-done-control" type="button" title="${esc(t("restoreTask"))}" aria-label="${esc(t("restoreTaskAria"))}" data-status="open" data-id="${task.id}"><span class="task-done-indicator" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-2.5 w-2.5"><path d="m3 8 3 3 7-7"></path></svg></span></button>`
      : `<button class="task-check-target task-open-control" type="button" title="${esc(t("selectTask", { title: task.title }))}" aria-label="${esc(t("selectTask", { title: task.title }))}" data-status="done" data-id="${task.id}"><span class="task-checkbox-indicator" aria-hidden="true"></span></button>`;
  const actions = `<div class="task-actions">
    <button class="icon-button" type="button" title="${t("editTaskAria")}" aria-label="${t("editTaskAria")}" data-edit="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button>
    ${task.status === "done" ? "" : `<button class="icon-button" type="button" title="${t("deferTask")}" aria-label="${t("deferTask")}" data-status="deferred" data-id="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg></button>`}
  </div>`;
  const tagLabels = renderTaskTags(task.tags);
  return `<article class="task-row group grid grid-cols-[40px_minmax(0,1fr)] items-start gap-2 border-b border-line/60 px-2 py-2 hover:bg-tint last:border-b-0">
    ${selector}
    <div class="task-row-main grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-x-2 pt-1">
      <div class="min-w-0">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <button type="button" class="min-w-0 break-words text-left text-[14px] leading-5 font-semibold ${task.status === "done" ? "text-muted line-through" : "text-ink hover:text-accent"}" data-edit="${task.id}" aria-label="${esc(t("editTaskAria"))}: ${esc(task.title)}">${esc(task.title)}</button>
          ${task.status === "deferred" ? `<span class="text-[11px] font-medium text-muted">${t("deferredBadge")}</span>` : ""}
        </div>
        <div class="mt-1 flex min-w-0 flex-nowrap items-center gap-1.5">
          ${priorityIcon(task.priority)}
          ${task.dueDate ? `<span class="rounded-md px-2 py-1 text-[11px] font-medium ${dateClass(task.dueDate, task.status !== "done")}">${formatDate(task.dueDate, task.status !== "done")}</span>` : ""}
          ${tagLabels}
        </div>
        ${task.description ? `<p class="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-muted">${esc(task.description)}</p>` : ""}
      </div>
      ${actions}
    </div>
  </article>`;
}

function visibleTasks() {
  const query = state.search.trim().toLocaleLowerCase(locales[language]);
  if (!query) return state.tasks;
  const terms = query.split(/\s+/).filter(Boolean);
  return state.tasks.filter((task) => {
    const content = [task.title, task.description, ...(task.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(locales[language]);
    return terms.every((term) => content.includes(term));
  });
}

function renderTasks() {
  const tasks = visibleTasks();
  $("#tasks").innerHTML = tasks.length
    ? tasks.map(taskCard).join("")
    : emptyContent();
  wireCards();
}

async function loadTasks() {
  state.view = "tasks";
  $("#taskView").hidden = false;
  $("#planView").hidden = true;
  $("#taskToolbar").hidden = false;
  $("#planToolbar").hidden = true;
  $("#tagNavigation").hidden = false;
  $("#scheduleCalendar").hidden = true;
  $("#tagPanel").classList.remove("force-visible");
  closeMobileTagPopup();
  closeMobilePlanCalendarPopup();
  closeDueDatePopup();
  activeView("tasks");
  renderStatusSwitch();
  const query = new URLSearchParams({ status: state.status });
  if (state.tag) query.set("tag", state.tag);
  if (state.untagged) query.set("untagged", "true");
  if ($("#dueDate").value) query.set("dueDate", $("#dueDate").value);
  const [tasks, tags] = await Promise.all([
    api(`/api/tasks?${query}`),
    api("/api/tags?withCounts=true"),
  ]);
  state.tasks = tasks;
  renderTasks();
  renderTags(tags);
}

function wireCards(tasks = state.tasks) {
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.onclick = async () => {
      const taskId = button.dataset.id;
      const nextStatus = button.dataset.status;
      try {
        await api(`/api/tasks/${taskId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: nextStatus }),
        });
        if (nextStatus === "done") {
          toast(
            t("taskCompleted"),
            {
              label: t("cancelAction"),
              onClick: async () => {
                try {
                  await api(`/api/tasks/${taskId}/status`, {
                    method: "POST",
                    body: JSON.stringify({ status: "open" }),
                  });
                  if (state.view === "plan") await loadPlan();
                  else await loadTasks();
                  toast(t("statusUpdated"), null, 1500);
                } catch (error) {
                  toast(language === "ru" ? error.message : t("requestFailed"));
                }
              },
            },
            6000,
          );
        } else toast(t("statusUpdated"));
        if (state.view === "plan") await loadPlan();
        else await loadTasks();
      } catch (error) {
        toast(language === "ru" ? error.message : t("requestFailed"));
      }
    };
  });
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.onclick = () => editTask(button.dataset.edit, tasks);
  });
  document.querySelectorAll("[data-filter-tag]").forEach((button) => {
    button.onclick = () => toggleTagFilter(button.dataset.filterTag);
  });
}

function editTask(id, tasks = state.tasks) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  openForm(task);
}

function openForm(task = null) {
  $("#taskForm").reset();
  $("#formError").textContent = "";
  $("#taskId").value = task?.id || "";
  $("#dialogTitle").textContent = task ? t("editTaskTitle") : t("newTask");
  $("#title").value = task?.title || "";
  $("#taskTags").value = (task?.tags || []).join(", ");
  $("#description").value = task?.description || "";
  resizeDescription();
  $("#taskDue").value = task?.dueDate || "";
  $("#taskPriority").value = task?.priority || "normal";
  $("#taskDialog").showModal();
  $("#title").focus();
}

function resizeDescription() {
  const field = $("#description");
  field.style.height = "auto";
  const styles = getComputedStyle(field);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) +
    Number.parseFloat(styles.paddingBottom);
  const borders =
    Number.parseFloat(styles.borderTopWidth) +
    Number.parseFloat(styles.borderBottomWidth);
  const minHeight = lineHeight * 5 + verticalPadding + borders;
  const maxHeight = lineHeight * 10 + verticalPadding + borders;
  const contentHeight = field.scrollHeight + borders;
  field.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
  field.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

$("#description").addEventListener("input", resizeDescription);
window.addEventListener("resize", resizeDescription);

$("#taskForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const id = $("#taskId").value;
    const body = {
      title: $("#title").value,
      tags: parseTags($("#taskTags").value),
      description: $("#description").value || null,
      dueDate: $("#taskDue").value || null,
      priority: $("#taskPriority").value,
    };
    await api(id ? `/api/tasks/${id}` : "/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
    $("#taskDialog").close();
    toast(t("saved"));
    if (id && state.view === "plan") await loadPlan();
    else await loadTasks();
  } catch (error) {
    $("#formError").textContent =
      language === "ru" ? error.message : t("requestFailed");
  }
};

async function loadPlan() {
  closeMobileTagPopup();
  closeMobilePlanCalendarPopup();
  closeDueDatePopup();
  syncScheduleCalendarPlacement();
  state.view = "plan";
  $("#taskView").hidden = true;
  $("#planView").hidden = false;
  $("#taskToolbar").hidden = true;
  $("#planToolbar").hidden = false;
  $("#tagNavigation").hidden = true;
  $("#scheduleCalendar").hidden = false;
  $("#tagPanel").classList.add("force-visible");
  activeView("plan");
  renderPlanDateSwitch();
  renderPlanDateLabel();
  const selectedDate = $("#planDate").value;
  const [selectedYear, selectedMonth] = selectedDate.split("-").map(Number);
  state.calendarMonth = new Date(selectedYear, selectedMonth - 1, 1);
  const allTasks = await api("/api/tasks?status=open");
  const tasks = allTasks.filter((task) => task.dueDate === selectedDate);
  renderScheduleCalendar(allTasks);
  $("#planItems").innerHTML = tasks.length
    ? tasks
        .map(
          (task, index) => `
    <article class="task-row group grid grid-cols-[40px_minmax(0,1fr)] items-start gap-2 border-b border-line/60 px-2 py-2 hover:bg-tint last:border-b-0">
      <span class="pt-1 text-center text-base leading-5 font-semibold text-line">${index + 1}</span>
      <div class="task-row-main grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-x-2 pt-1">
        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <button type="button" class="min-w-0 break-words text-left text-[14px] leading-5 font-semibold text-ink hover:text-accent" data-edit="${task.id}" aria-label="${esc(t("editTaskAria"))}: ${esc(task.title)}">${esc(task.title)}</button>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5">
            ${priorityIcon(task.priority)}
            ${task.dueDate ? `<span class="rounded-md px-2 py-1 text-[11px] font-medium ${dateClass(task.dueDate)}">${formatDate(task.dueDate)}</span>` : ""}
          </div>
          ${task.description ? `<p class="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-muted">${esc(task.description)}</p>` : ""}
        </div>
        <div class="task-actions">
          <button class="icon-button" type="button" title="${t("editTaskAria")}" aria-label="${t("editTaskAria")}" data-edit="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button>
        </div>
      </div>
    </article>`,
        )
        .join("")
    : `<div class="empty-state"><p class="empty-state-title">${t("planEmpty")}</p><p class="empty-state-hint">${t("planEmptyHint")}</p></div>`;
  wireCards(tasks);
}

$("#newTask").onclick = () => openForm();
$("#closeDialog").onclick = () => $("#taskDialog").close();
$("#refresh").onclick = () =>
  state.view === "plan" ? loadPlan() : loadTasks();
$("#allTasks").onclick = () => {
  state.tag = null;
  state.untagged = false;
  loadTasks();
};
$("#unassigned").onclick = () => {
  state.tag = null;
  state.untagged = true;
  loadTasks();
};
$("#scopeFilter").onchange = () => {
  const [kind, tagName] = $("#scopeFilter").value.split(":");
  state.untagged = kind === "untagged";
  state.tag = kind === "tag" ? decodeURIComponent(tagName) : null;
  loadTasks();
};
document.querySelectorAll("[data-status-view]").forEach((button) => {
  button.onclick = () => {
    state.status = button.dataset.statusView;
    renderStatusSwitch();
    loadTasks();
  };
});
$("#searchInput").oninput = () => {
  state.search = $("#searchInput").value;
  renderTasks();
};
$("#dueDateToggle").onclick = openDueDatePopup;
$("#dueDateToday").onclick = () => {
  $("#dueDate").value = today();
  state.dueCalendarMonth = new Date();
  updateDueDateLabel();
  closeDueDatePopup();
  loadTasks();
};
$("#dueDateClear").onclick = () => {
  $("#dueDate").value = "";
  updateDueDateLabel();
  closeDueDatePopup();
  loadTasks();
};
$("#mobileTagToggle").onclick = () => {
  const popup = $("#mobileTagPopup");
  const willOpen = popup.hidden;
  popup.hidden = !willOpen;
  $("#mobileTagToggle").setAttribute("aria-expanded", String(willOpen));
};
syncScheduleCalendarPlacement();
$("#mobilePlanCalendarToggle").onclick = () => {
  const popup = $("#mobilePlanCalendarPopup");
  const willOpen = popup.hidden;
  popup.hidden = !willOpen;
  $("#mobilePlanCalendarToggle").setAttribute(
    "aria-expanded",
    String(willOpen),
  );
};
window.addEventListener("resize", syncScheduleCalendarPlacement);
document.addEventListener("pointerdown", (event) => {
  if (!$("#mobileTagPicker").contains(event.target)) closeMobileTagPopup();
  if (!$("#mobilePlanCalendarPicker").contains(event.target))
    closeMobilePlanCalendarPopup();
  if (!$("#dueDatePicker").contains(event.target)) closeDueDatePopup();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileTagPopup({ restoreFocus: true });
    closeMobilePlanCalendarPopup({ restoreFocus: true });
    closeDueDatePopup({ restoreFocus: true });
  }
});
$("#planDate").onchange = loadPlan;
$("#languageSelect").onchange = () => {
  const nextLanguage = $("#languageSelect").value;
  language = Object.hasOwn(locales, nextLanguage) ? nextLanguage : "en";
  try {
    localStorage.setItem("todo-language", language);
  } catch {}
  applyStaticTranslations();
  renderThemeToggle();
  if (!$("#dueDatePopup").hidden) renderDueDateCalendar();
  if (state.view === "plan") loadPlan();
  else loadTasks();
};
document.querySelectorAll("[data-view]").forEach((button) => {
  button.onclick = () =>
    button.dataset.view === "plan" ? loadPlan() : loadTasks();
});
loadTasks().catch((error) =>
  toast(language === "ru" ? error.message : t("requestFailed")),
);
