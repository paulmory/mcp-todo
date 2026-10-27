import { locales, translate } from "./i18n.js";
import {
  escapeHtml as esc,
  isOverdue,
  renderEmptyState,
  renderTaskRow,
} from "./components.js";

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
  tasksHasMore: false,
  tasksOffset: 0,
  planTasks: [],
  planHasMore: false,
  planOffset: 0,
  calendarMonth: null,
  calendarCounts: new Map(),
  calendarCountsMonth: null,
  dueCalendarMonth: null,
};
let availableTags = [];
let availableTagsLoaded = false;
let availableTagsPromise = null;
let availableTagsGeneration = 0;
let viewLoadGeneration = 0;
let calendarLoadGeneration = 0;
let tasksPageLoading = false;
let planPageLoading = false;
let selectedTaskTags = [];

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
function syncLanguagePicker() {
  const select = $("#languageSelect");
  if (!select) return;
  select.value = language;
  const optionsList = $("#languageOptions");
  if (!optionsList.childElementCount) {
    [...select.options].forEach(({ value, textContent }) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "language-picker-option";
      option.setAttribute("role", "option");
      option.dataset.language = value;
      option.textContent = textContent;
      optionsList.append(option);
    });
  }
  $("#languageSelectValue").textContent =
    select.selectedOptions[0]?.textContent || "English";
  optionsList.querySelectorAll('[role="option"]').forEach((option) => {
    const selected = option.dataset.language === language;
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = selected ? 0 : -1;
  });
}
function closeLanguagePicker({ restoreFocus = false } = {}) {
  const options = $("#languageOptions");
  if (!options || options.hidden) return;
  options.hidden = true;
  $("#languageSelectTrigger").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("#languageSelectTrigger").focus();
}
function openLanguagePicker(index = null) {
  const options = $("#languageOptions");
  options.hidden = false;
  $("#languageSelectTrigger").setAttribute("aria-expanded", "true");
  const buttons = [...options.querySelectorAll('[role="option"]')];
  const selectedIndex = buttons.findIndex((option) => option.dataset.language === language);
  const targetIndex = index ?? Math.max(0, selectedIndex);
  buttons.forEach((option, optionIndex) => {
    option.tabIndex = optionIndex === targetIndex ? 0 : -1;
  });
  buttons[targetIndex]?.focus();
}
function moveLanguageOption(delta) {
  const options = [...$("#languageOptions").querySelectorAll('[role="option"]')];
  const currentIndex = options.indexOf(document.activeElement);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + delta + options.length) % options.length;
  options.forEach((option, index) => {
    option.tabIndex = index === nextIndex ? 0 : -1;
  });
  options[nextIndex]?.focus();
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
  syncLanguagePicker();
  updateTagOptions();
  updateDueDateLabel();
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

function formatDate(date, showOverdue = true, dueTime = null) {
  if (!date) return "";
  if (showOverdue && isOverdue(date, dueTime)) {
    const localDate = new Date(`${date}T00:00:00`);
    const shortDate = new Intl.DateTimeFormat(locales[language], {
      day: "numeric",
      month: "short",
    }).format(localDate);
    return t("overdue", { date: shortDate });
  }
  if (date === today()) return t("today");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === tomorrow.toLocaleDateString("en-CA")) return t("tomorrow");
  const localDate = new Date(`${date}T00:00:00`);
  const shortDate = new Intl.DateTimeFormat(locales[language], {
    day: "numeric",
    month: "short",
  }).format(localDate);
  return shortDate;
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

function renderScheduleCalendar() {
  const selectedValue = $("#planDate").value;
  const [selectedYear, selectedMonth] = selectedValue.split("-").map(Number);
  if (!state.calendarMonth)
    state.calendarMonth = new Date(selectedYear, selectedMonth - 1, 1);
  renderCalendar({
    calendar: $("#scheduleCalendar"),
    monthLabel: $("#calendarMonthLabel"),
    grid: $("#calendarGrid"),
    month: state.calendarMonth,
    selectedValue,
    taskCounts: state.calendarCounts,
    onSelect: (value) => {
      $("#planDate").value = value;
      loadPlan();
    },
    onMonthChange: (month) => {
      state.calendarMonth = month;
      loadCalendarCounts(month);
    },
  });
}

function calendarMonthKey(month) {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}

async function loadCalendarCounts(month = state.calendarMonth) {
  if (!month) return;
  const key = calendarMonthKey(month);
  if (state.calendarCountsMonth === key) {
    renderScheduleCalendar();
    return;
  }
  const from = `${key}-01`;
  const to = dateValue(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const requestId = ++calendarLoadGeneration;
  try {
    const counts = await api(`/api/calendar-counts?from=${from}&to=${to}`);
    if (requestId !== calendarLoadGeneration || calendarMonthKey(state.calendarMonth) !== key) return;
    state.calendarCounts = new Map(counts.map(({ dueDate, count }) => [dueDate, count]));
    state.calendarCountsMonth = key;
    renderScheduleCalendar();
  } catch (error) {
    if (requestId === calendarLoadGeneration) {
      state.calendarCounts = new Map();
      state.calendarCountsMonth = null;
      renderScheduleCalendar();
      toast(language === "ru" ? error.message : t("requestFailed"));
    }
  }
}

function updateDueDateLabel() {
  const value = $("#dueDate")?.value;
  const toggle = $("#dueDateToggle");
  toggle.classList.toggle("is-empty", !value);
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
  renderSearchTagSuggestions();
  renderTaskTagEditor();
}

function searchTagContext(value = $("#searchInput").value) {
  const match = /(^|\s)tag:(?:"((?:\\.|[^"])*)|([^\s]*))$/i.exec(value);
  if (!match) return null;
  const rawQuery = match[2] ?? match[3];
  if (match[2] === undefined && rawQuery.startsWith('"') && rawQuery.endsWith('"'))
    return null;
  const query = normalizeSearchTag(rawQuery);
  return {
    start: match.index + match[1].length,
    query: query.toLocaleLowerCase(locales[language]),
  };
}

function normalizeSearchTag(value) {
  let normalized = value.replace(/\\(.)/g, "$1");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {}
  return normalized;
}

function formatSearchTag(value) {
  const escaped = value.replace(/([\\"])/g, "\\$1");
  return /[\s"]/.test(value) ? `"${escaped}"` : escaped;
}

function searchTagTerms(value) {
  return [
    ...value.matchAll(
      /(?:^|\s)tag:"((?:\\.|[^"])*)"|(?:^|\s)tag:([^\s]+)/gi,
    ),
  ].map((match) => normalizeSearchTag(match[1] ?? match[2]));
}

function replaceSearchQualifier(value, qualifier, replacement) {
  if (qualifier !== "tag") return value;
  const query = value
    .replace(/(^|\s)tag:(?:"(?:\\.|[^"])*"|[^\s]+)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return [query, replacement].filter(Boolean).join(" ");
}

function updateStatusFilter(status) {
  state.status = status;
  renderStatusSwitch();
}

function applySearch(value = $("#searchInput").value) {
  state.search = value.trim();
  const tags = searchTagTerms(state.search);
  if (tags.length) {
    state.tag = tags.length === 1 ? tags[0] : null;
    state.untagged = false;
  } else {
    state.tag = null;
  }
  renderStatusSwitch();
  loadTasks();
}

function renderSearchTagSuggestions() {
  const input = $("#searchInput");
  const list = $("#searchTagSuggestions");
  if (!input || !list) return;

  const context = searchTagContext();
  if (!context) {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    list.replaceChildren();
    return;
  }


  const existing = new Set(
    [...input.value.matchAll(/(?:^|\s)tag:(?:"((?:\\.|[^"])*)"|([^\s]+))/gi)].map(
      (match) =>
        normalizeSearchTag(match[1] ?? match[2]).toLocaleLowerCase(
          locales[language],
        ),
    ),
  );
  const suggestions = availableTags.filter((tag) => {
    const name = tag.name.toLocaleLowerCase(locales[language]);
    return (
      !existing.has(name) &&
      name.startsWith(context.query)
    );
  });

  if (!suggestions.length) {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    list.replaceChildren();
    return;
  }

  list.innerHTML = suggestions
    .map(
      (tag) => `
        <button class="search-tag-option" type="button" role="option" aria-selected="false" data-search-tag="${esc(tag.name)}">
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.2V3.5A1.5 1.5 0 0 1 3.5 2h4.7l5.3 5.3a1.5 1.5 0 0 1 0 2.1l-3.1 3.1a1.5 1.5 0 0 1-2.1 0L2 8.2Z"></path><circle cx="5.2" cy="5.2" r=".7" fill="currentColor"></circle></svg>
          <span class="min-w-0 flex-1 truncate">${esc(tag.name)}</span>
          <span class="search-tag-count">${tag.openTasks}</span>
        </button>`,
    )
    .join("");
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  list.querySelectorAll("[data-search-tag]").forEach((button) => {
    button.onpointerdown = (event) => event.preventDefault();
    button.onclick = () => {
      const name = button.dataset.searchTag;
      input.value = `${input.value.slice(0, context.start)}tag:${formatSearchTag(name)} `;
      renderSearchTagSuggestions();
      input.focus();
    };
  });
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

function renderTaskTagEditor() {
  const input = $("#taskTags");
  const chips = $("#taskTagChips");
  const options = $("#taskTagOptions");
  if (!input || !chips || !options) return;

  input.placeholder = selectedTaskTags.length ? "" : t("projectPlaceholder");
  chips.innerHTML = selectedTaskTags
    .map(
      (tag) => `
        <span class="task-tag-chip">
          <span>${esc(tag)}</span>
          <button type="button" data-remove-task-tag="${esc(tag)}" aria-label="${esc(t("removeTag"))}: ${esc(tag)}">×</button>
        </span>`,
    )
    .join("");
  chips.querySelectorAll("[data-remove-task-tag]").forEach((button) => {
    button.onclick = () => {
      selectedTaskTags = selectedTaskTags.filter(
        (tag) => tag !== button.dataset.removeTaskTag,
      );
      renderTaskTagEditor();
      input.focus();
    };
  });

  const query = input.value.trim().toLocaleLowerCase(locales[language]);
  const selected = new Set(selectedTaskTags);
  const matches = availableTags.filter((tag) => {
    const name = tag.name.toLocaleLowerCase(locales[language]);
    return !selected.has(name) && (!query || name.includes(query));
  });
  options.innerHTML = matches
    .map(
      (tag) => `
        <button type="button" role="option" aria-selected="false" class="task-tag-option" data-task-tag-option="${esc(tag.name)}">
          <span>${esc(tag.name)}</span>
        </button>`,
    )
    .join("");
  const showOptions = matches.length > 0 && document.activeElement === input;
  options.hidden = !showOptions;
  input.setAttribute("aria-expanded", String(showOptions));
  options.querySelectorAll("[data-task-tag-option]").forEach((button, index, buttons) => {
    button.onkeydown = (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        buttons[(index + 1) % buttons.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (index === 0) input.focus();
        else buttons[index - 1].focus();
      } else if (event.key === "Escape") {
        options.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.focus();
      }
    };
    button.onpointerdown = (event) => event.preventDefault();
    button.onclick = () => {
      selectedTaskTags = parseTags(
        [...selectedTaskTags, button.dataset.taskTagOption].join(","),
      );
      input.value = "";
      renderTaskTagEditor();
      input.focus();
    };
  });
}

function addTaskTagInput(value = $("#taskTags").value) {
  selectedTaskTags = parseTags([...selectedTaskTags, ...parseTags(value)].join(","));
  $("#taskTags").value = "";
  renderTaskTagEditor();
}

function toggleTagFilter(tag) {
  const tagName = tag.toLocaleLowerCase(locales[language]);
  const alreadySelected = searchTagTerms($("#searchInput").value).some(
    (item) => item.toLocaleLowerCase(locales[language]) === tagName,
  );
  const selected = alreadySelected ? null : tag;
  updateTagSearch(selected);
  loadTasks();
}

function updateTagSearch(tag, value = $("#searchInput").value) {
  const query = replaceSearchQualifier(
    value,
    "tag",
    tag ? "tag:" + formatSearchTag(tag) : "",
  );
  state.tag = tag;
  state.untagged = false;
  state.search = query;
  $("#searchInput").value = query;
}

function removeTagSearch(value = $("#searchInput").value) {
  const query = replaceSearchQualifier(value, "tag", "");
  state.tag = null;
  state.search = query;
  $("#searchInput").value = query;
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
  if (kind === "tag") updateTagSearch(tag);
  else {
    removeTagSearch();
    state.untagged = kind === "untagged";
  }
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
      updateTagSearch(button.dataset.tag);
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

function taskComponentOptions(mode = "tasks", index = 0) {
  return {
    mode,
    index,
    labels: {
      edit: t("editTaskAria"),
      defer: t("deferTask"),
      restore: t("restoreTask"),
      restoreAria: t("restoreTaskAria"),
      select: (title) => t("selectTask", { title }),
      deferred: t("deferredBadge"),
      tagFilter: t("projectFilter"),
    },
    priorityLabels: {
      high: t("priorityHigh"),
      normal: t("priorityNormal"),
      low: t("priorityLow"),
    },
    formatDate,
    currentDate: today(),
    selectedTag: state.tag,
  };
}

function emptyTaskContent() {
  return renderEmptyState(
    t(
      state.search.trim()
        ? "emptySearch"
        : "emptyTasks",
    ),
    t("emptyHint"),
  );
}

function renderTasks() {
  const tasks = visibleTasks();
  const options = taskComponentOptions();
  $("#tasks").innerHTML = tasks.length
    ? tasks.map((task) => renderTaskRow(task, options)).join("")
    : emptyTaskContent();
  $("#loadMoreTasks").hidden = !state.tasksHasMore;
  $("#loadMoreTasks").disabled = tasksPageLoading;
}

function visibleTasks() {
  const query = state.search.trim().toLocaleLowerCase(locales[language]);
  if (!query) return state.tasks;
  const terms = [];
  const tagTerms = [];
  const textQuery = query
    .replace(/(^|\s)tag:"((?:\\.|[^"])*)"|(^|\s)tag:([^\s]+)/gi, (_, beforeQuoted, quoted, beforeBare, bare) => {
      const rawTag = quoted ?? bare;
      if (rawTag) tagTerms.push(normalizeSearchTag(rawTag));
      return `${beforeQuoted ?? beforeBare} `;
    })
    .replace(/(^|\s)tag:"(?:\\.|[^"])*$/i, " ")
    .replace(/(^|\s)tag:[^\s]*$/i, " ");
  textQuery.split(/\s+/).filter(Boolean).forEach((term) => terms.push(term));
  return state.tasks.filter((task) => {
    const tags = (task.tags || []).map((tag) =>
      tag.toLocaleLowerCase(locales[language]),
    );
    const content = [task.title, task.description, ...tags]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(locales[language]);
    return (
      terms.every((term) => content.includes(term)) &&
      tagTerms.every((term) => tags.some((tag) => tag.includes(term)))
    );
  });
}

function invalidateAvailableTags() {
  availableTagsGeneration += 1;
  availableTagsLoaded = false;
  availableTagsPromise = null;
}

function loadAvailableTags() {
  if (availableTagsLoaded) return Promise.resolve(availableTags);
  if (!availableTagsPromise) {
    const generation = availableTagsGeneration;
    availableTagsPromise = api("/api/tags?withCounts=true")
      .then((tags) => {
        if (generation === availableTagsGeneration) {
          availableTags = tags;
          availableTagsLoaded = true;
        }
        return tags;
      })
      .finally(() => {
        if (generation === availableTagsGeneration) {
          availableTagsPromise = null;
        }
      });
  }
  return availableTagsPromise;
}

async function loadTasks({ refreshTags = false } = {}) {
  const requestId = ++viewLoadGeneration;
  if (refreshTags) invalidateAvailableTags();
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
  state.tasksHasMore = false;
  $("#loadMoreTasks").hidden = true;
  const overdueOnly = state.status === "overdue";
  const query = new URLSearchParams({
    status: overdueOnly ? "all" : state.status,
    limit: "100",
    offset: "0",
  });
  if (overdueOnly) query.set("overdue", "true");
  if (state.search.trim()) query.set("q", state.search.trim());
  if (state.tag) query.set("tag", state.tag);
  if (state.untagged) query.set("untagged", "true");
  if ($("#dueDate").value) query.set("dueDate", $("#dueDate").value);
  let result;
  let tags;
  try {
    [result, tags] = await Promise.all([
      api(`/api/tasks?${query}`),
      loadAvailableTags(),
    ]);
  } catch (error) {
    if (requestId !== viewLoadGeneration) return;
    throw error;
  }
  if (requestId !== viewLoadGeneration || state.view !== "tasks") return;
  state.tasks = result.tasks;
  state.tasksHasMore = result.hasMore;
  state.tasksOffset = result.nextOffset;
  renderTasks();
  renderTags(tags);
}

function taskListQuery(offset) {
  const query = new URLSearchParams({
    status: state.status === "overdue" ? "all" : state.status,
    limit: "100",
    offset: String(offset),
  });
  if (state.status === "overdue") query.set("overdue", "true");
  if (state.tag) query.set("tag", state.tag);
  if (state.untagged) query.set("untagged", "true");
  if ($("#dueDate").value) query.set("dueDate", $("#dueDate").value);
  if (state.search.trim()) query.set("q", state.search.trim());
  return query;
}

async function loadMoreTasks() {
  if (tasksPageLoading || !state.tasksHasMore || state.view !== "tasks") return;
  tasksPageLoading = true;
  const requestId = viewLoadGeneration;
  $("#loadMoreTasks").disabled = true;
  try {
    const result = await api(`/api/tasks?${taskListQuery(state.tasksOffset)}`);
    if (requestId !== viewLoadGeneration || state.view !== "tasks") return;
    const options = taskComponentOptions();
    state.tasks = [...state.tasks, ...result.tasks];
    state.tasksHasMore = result.hasMore;
    state.tasksOffset = result.nextOffset;
    $("#tasks").insertAdjacentHTML(
      "beforeend",
      result.tasks.map((task) => renderTaskRow(task, options)).join(""),
    );
    $("#loadMoreTasks").hidden = !state.tasksHasMore;
  } catch (error) {
    toast(language === "ru" ? error.message : t("requestFailed"));
  } finally {
    tasksPageLoading = false;
    if (state.view === "tasks") $("#loadMoreTasks").disabled = false;
  }
}

async function changeTaskStatus(taskId, nextStatus) {
  try {
    await api(`/api/tasks/${taskId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: nextStatus }),
    });
    invalidateAvailableTags();
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
              invalidateAvailableTags();
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
}

function bindCardActions() {
  [$("#tasks"), $("#planItems")].forEach((container) => {
    container.addEventListener("click", (event) => {
      const button = event.target.closest(
        "button[data-status], button[data-edit], button[data-filter-tag]",
      );
      if (!button || !container.contains(button)) return;

      if (button.dataset.status) {
        changeTaskStatus(button.dataset.id, button.dataset.status);
      } else if (button.dataset.edit) {
        const tasks = container.id === "planItems" ? state.planTasks : state.tasks;
        editTask(button.dataset.edit, tasks);
      } else if (button.dataset.filterTag) {
        toggleTagFilter(button.dataset.filterTag);
      }
    });
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
  selectedTaskTags = parseTags((task?.tags || []).join(","));
  $("#taskTags").value = "";
  renderTaskTagEditor();
  $("#description").value = task?.description || "";
  resizeDescription();
  $("#taskDue").value = task?.dueDate || "";
  $("#taskDueTime").value = task?.dueTime || "";
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

$("#taskTags").addEventListener("input", renderTaskTagEditor);
$("#taskTags").addEventListener("focus", renderTaskTagEditor);
$("#taskTags").addEventListener("blur", () => {
  window.setTimeout(() => {
    const input = $("#taskTags");
    const options = $("#taskTagOptions");
    if (
      options &&
      document.activeElement !== input &&
      !options.contains(document.activeElement)
    ) {
      if (input.value.trim()) addTaskTagInput(input.value);
      options.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }
  }, 0);
});
$("#taskTags").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && !$("#taskTagOptions").hidden) {
    event.preventDefault();
    $("#taskTagOptions [data-task-tag-option]")?.focus();
  } else if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    const value = $("#taskTags").value;
    const exactMatch = availableTags.find(
      (tag) =>
        tag.name.toLocaleLowerCase(locales[language]) ===
        value.trim().toLocaleLowerCase(locales[language]),
    );
    if (exactMatch) {
      selectedTaskTags = parseTags(
        [...selectedTaskTags, exactMatch.name].join(","),
      );
      $("#taskTags").value = "";
      renderTaskTagEditor();
    } else {
      addTaskTagInput(value);
    }
  } else if (event.key === "Backspace" && !$("#taskTags").value && selectedTaskTags.length) {
    selectedTaskTags = selectedTaskTags.slice(0, -1);
    renderTaskTagEditor();
  } else if (event.key === "Escape") {
    $("#taskTagOptions").hidden = true;
    $("#taskTags").setAttribute("aria-expanded", "false");
  }
});
$("#description").addEventListener("input", resizeDescription);
window.addEventListener("resize", resizeDescription);

$("#taskForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const id = $("#taskId").value;
    const body = {
      title: $("#title").value,
      tags: parseTags(
        [...selectedTaskTags, ...parseTags($("#taskTags").value)].join(","),
      ),
      description: $("#description").value || null,
      dueDate: $("#taskDue").value || null,
      dueTime: $("#taskDueTime").value || null,
      priority: $("#taskPriority").value,
    };
    await api(id ? `/api/tasks/${id}` : "/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
    invalidateAvailableTags();
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
  const requestId = ++viewLoadGeneration;
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
  state.planHasMore = false;
  $("#loadMorePlanTasks").hidden = true;
  renderPlanDateSwitch();
  renderPlanDateLabel();
  const selectedDate = $("#planDate").value;
  const [selectedYear, selectedMonth] = selectedDate.split("-").map(Number);
  state.calendarMonth = new Date(selectedYear, selectedMonth - 1, 1);
  const includeBacklog = selectedDate === today();
  const query = new URLSearchParams({
    date: selectedDate,
    includeBacklog: String(includeBacklog),
    limit: "100",
    offset: "0",
  });
  let result;
  try {
    [result] = await Promise.all([
      api(`/api/schedule?${query}`),
      loadCalendarCounts(state.calendarMonth),
    ]);
  } catch (error) {
    if (requestId !== viewLoadGeneration) return;
    throw error;
  }
  if (requestId !== viewLoadGeneration || state.view !== "plan") return;
  const tasks = result.tasks;
  state.planTasks = tasks;
  state.planHasMore = result.hasMore;
  state.planOffset = result.nextOffset;
  renderScheduleCalendar();
  const rowOptions = taskComponentOptions("plan");
  $("#planItems").innerHTML = tasks.length
    ? tasks
        .map((task, index) =>
          renderTaskRow(task, { ...rowOptions, index }),
        )
        .join("")
    : renderEmptyState(t("planEmpty"), t("planEmptyHint"));
  $("#loadMorePlanTasks").hidden = !state.planHasMore;
  $("#loadMorePlanTasks").disabled = planPageLoading;
}

async function loadMorePlanTasks() {
  if (planPageLoading || !state.planHasMore || state.view !== "plan") return;
  planPageLoading = true;
  $("#loadMorePlanTasks").disabled = true;
  const requestId = viewLoadGeneration;
  const query = new URLSearchParams({
    date: $("#planDate").value,
    includeBacklog: String($("#planDate").value === today()),
    limit: "100",
    offset: String(state.planOffset),
  });
  try {
    const result = await api(`/api/schedule?${query}`);
    if (requestId !== viewLoadGeneration || state.view !== "plan") return;
    const startIndex = state.planTasks.length;
    state.planTasks = [...state.planTasks, ...result.tasks];
    state.planHasMore = result.hasMore;
    state.planOffset = result.nextOffset;
    const options = taskComponentOptions("plan");
    $("#planItems").insertAdjacentHTML(
      "beforeend",
      result.tasks.map((task, index) => renderTaskRow(task, { ...options, index: startIndex + index })).join(""),
    );
    $("#loadMorePlanTasks").hidden = !state.planHasMore;
  } catch (error) {
    toast(language === "ru" ? error.message : t("requestFailed"));
  } finally {
    planPageLoading = false;
    if (state.view === "plan") $("#loadMorePlanTasks").disabled = false;
  }
}

$("#loadMoreTasks").onclick = loadMoreTasks;
$("#loadMorePlanTasks").onclick = loadMorePlanTasks;

$("#newTask").onclick = () => openForm();
$("#closeDialog").onclick = () => $("#taskDialog").close();
$("#refresh").onclick = () =>
  state.view === "plan" ? loadPlan() : loadTasks({ refreshTags: true });
$("#allTasks").onclick = () => {
  removeTagSearch();
  state.untagged = false;
  loadTasks();
};
$("#unassigned").onclick = () => {
  removeTagSearch();
  state.untagged = true;
  loadTasks();
};
$("#scopeFilter").onchange = () => {
  const [kind, tagName] = $("#scopeFilter").value.split(":");
  state.untagged = kind === "untagged";
  if (kind === "tag") updateTagSearch(decodeURIComponent(tagName));
  else removeTagSearch();
  state.untagged = kind === "untagged";
  loadTasks();
};
document.querySelectorAll("[data-status-view]").forEach((button) => {
  button.onclick = () => {
    updateStatusFilter(button.dataset.statusView);
    loadTasks();
  };
});
$("#searchInput").oninput = () => {
  renderSearchTagSuggestions();
  if (!$("#searchInput").value.trim() && state.search) applySearch("");
};
$("#searchInput").onkeydown = (event) => {
  if (event.key === "ArrowDown" && !$("#searchTagSuggestions").hidden) {
    event.preventDefault();
    $("#searchTagSuggestions [data-search-tag]")?.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    $("#searchTagSuggestions").hidden = true;
    $("#searchInput").setAttribute("aria-expanded", "false");
    applySearch();
  } else if (event.key === "Escape") {
    $("#searchTagSuggestions").hidden = true;
    $("#searchInput").setAttribute("aria-expanded", "false");
    $("#searchInput").value = state.search;
  }
};
$("#searchTagSuggestions").onkeydown = (event) => {
  const options = [
    ...$("#searchTagSuggestions").querySelectorAll(
      "[data-search-tag]",
    ),
  ];
  const current = options.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = current + direction;
    if (next < 0) $("#searchInput").focus();
    else options[Math.min(next, options.length - 1)]?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    $("#searchTagSuggestions").hidden = true;
    $("#searchInput").setAttribute("aria-expanded", "false");
    $("#searchInput").focus();
  }
};
$("#searchInputContainer").onfocusout = (event) => {
  if (!$("#searchInputContainer").contains(event.relatedTarget)) {
    $("#searchTagSuggestions").hidden = true;
    $("#searchInput").setAttribute("aria-expanded", "false");
  }
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
const languageSelectTrigger = $("#languageSelectTrigger");
const languageOptions = $("#languageOptions");
languageSelectTrigger.onclick = () => {
  if (languageOptions.hidden) openLanguagePicker();
  else closeLanguagePicker();
};
languageSelectTrigger.onkeydown = (event) => {
  if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (languageOptions.hidden)
      openLanguagePicker(
        event.key === "ArrowUp" ? languageOptions.children.length - 1 : null,
      );
    else if (event.key === "ArrowUp") moveLanguageOption(-1);
    else moveLanguageOption(1);
  }
};
languageOptions.onclick = (event) => {
  const option = event.target.closest('[role="option"]');
  if (!option) return;
  $("#languageSelect").value = option.dataset.language;
  $("#languageSelect").dispatchEvent(new Event("change", { bubbles: true }));
  closeLanguagePicker({ restoreFocus: true });
};
languageOptions.onkeydown = (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveLanguageOption(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    openLanguagePicker(event.key === "Home" ? 0 : languageOptions.children.length - 1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeLanguagePicker({ restoreFocus: true });
  } else if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    const query = (languageOptions.dataset.typeahead || "") + event.key.toLocaleLowerCase();
    languageOptions.dataset.typeahead = query;
    clearTimeout(languageOptions.typeaheadTimer);
    languageOptions.typeaheadTimer = setTimeout(() => {
      languageOptions.dataset.typeahead = "";
    }, 600);
    const options = [...languageOptions.querySelectorAll('[role="option"]')];
    const startIndex = Math.max(0, options.indexOf(document.activeElement));
    const matches = options.map((option) => option.textContent.trim().toLocaleLowerCase());
    const matchIndex = [
      ...matches.slice(startIndex),
      ...matches.slice(0, startIndex),
    ].findIndex((label) => label.startsWith(query));
    if (matchIndex >= 0) {
      const optionIndex = (startIndex + matchIndex) % options.length;
      options.forEach((option, index) => {
        option.tabIndex = index === optionIndex ? 0 : -1;
      });
      options[optionIndex].focus();
    }
  }
};
document.addEventListener("pointerdown", (event) => {
  if (!$("#searchInput").parentElement.contains(event.target)) {
    $("#searchTagSuggestions").hidden = true;
    $("#searchInput").setAttribute("aria-expanded", "false");
  }
  if (!$("#mobileTagPicker").contains(event.target)) closeMobileTagPopup();
  if (!$("#mobilePlanCalendarPicker").contains(event.target))
    closeMobilePlanCalendarPopup();
  if (!$("#dueDatePicker").contains(event.target)) closeDueDatePopup();
  if (!$("#languagePicker").contains(event.target)) closeLanguagePicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileTagPopup({ restoreFocus: true });
    closeMobilePlanCalendarPopup({ restoreFocus: true });
    closeDueDatePopup({ restoreFocus: true });
    closeLanguagePicker({ restoreFocus: true });
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
bindCardActions();
loadTasks().catch((error) =>
  toast(language === "ru" ? error.message : t("requestFailed")),
);
