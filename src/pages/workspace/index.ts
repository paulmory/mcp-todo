import { locales, translate } from "../../shared/config/i18n.ts";
import { dateValue, escapeHtml as esc } from "../../shared/lib/index.ts";
import { isOverdue } from "../../entities/task/model/due-date.ts";
import { createTaskFilters } from "../../features/task-filters/controller.ts";
import { createTaskEditor } from "../../features/task-editor/index.ts";
import { createTaskCalendar } from "../../features/task-calendar/index.ts";
import { createPreferences } from "../../features/preferences/index.ts";
import { createWorkspaceDataController } from "./data-controller.ts";
import { createTasksPage } from "../tasks/controller.ts";
import { createSchedulePage } from "../schedule/controller.ts";

export function initWorkspace() {
  // The UI is server-rendered HTML with stable IDs; centralize DOM access here.
  const PAGE_SIZE = 30;
  const $ = (selector: string): any => document.querySelector(selector);
  const all = (selector: string, root: ParentNode = document): any[] =>
    Array.from(root.querySelectorAll(selector));
  const savedLanguage = (() => {
    try {
      return localStorage.getItem("todo-language");
    } catch {
      return null;
    }
  })();
  let language = Object.hasOwn(locales, savedLanguage) ? savedLanguage : "en";
  const t = (key: string, values: Record<string, string | number> = {}) =>
    translate(language, key, values);
  const today = () => new Date().toLocaleDateString("en-CA");
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
  };
  let dataController;
  let tasksPage;
  let schedulePage;
  function renderTasks() { tasksPage?.render(); }
  function loadTasks(options = {}) { return dataController.loadTasks(options); }
  function loadPlan() { return dataController.loadPlan(); }
  const taskEditor = createTaskEditor({
    $,
    api,
    translate: t,
    getLanguage: () => language,
    getLocale: () => locales[language],
    getAvailableTags: () => dataController?.getAvailableTags() ?? [],
    onSaved: async (id) => {
      dataController.invalidateAvailableTags();
      $("#taskDialog").close();
      toast(t("saved"));
      if (id && state.view === "plan") await loadPlan();
      else await loadTasks();
    },
    onError: (error, currentLanguage) => {
      $("#formError").textContent =
        currentLanguage === "ru" ? error.message : t("requestFailed");
    },
  });
  const taskFilters = createTaskFilters({
    $,
    all,
    state,
    getLanguage: () => language,
    getLocale: () => locales[language],
    t,
    escapeHtml: esc,
    getAvailableTags: () => dataController?.getAvailableTags() ?? [],
    renderEditorTags: () => taskEditor.renderTags(),
    renderStatusSwitch,
    loadTasks,
  });
  const {
    applySearch,
    closeMobileTagPopup,
    removeTagSearch,
    renderSearchTagSuggestions,
    renderTags,
    toggleTagFilter,
    updateOptions: updateTagOptions,
    updateStatusFilter,
    updateTagSearch,
  } = taskFilters;

  const taskCalendar = createTaskCalendar({
    $,
    all,
    api,
    t,
    getLocale: () => locales[language],
    dateValue,
    escapeHtml: esc,
    today,
    getPlanDate: () => $("#planDate").value,
    setPlanDate: (value) => { $("#planDate").value = value; },
    loadPlan,
    loadTasks,
    onError: (error) => toast(language === "ru" ? error.message : t("requestFailed")),
  });
  const preferences = createPreferences({
    $,
    all,
    locales,
    getLanguage: () => language,
    setLanguage: (value) => { language = value; },
    translate,
  });
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
    all("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    if ($("#taskId").value) $("#dialogTitle").textContent = t("editTaskTitle");
    document
      .querySelectorAll<HTMLElement>("[data-i18n-aria]")
      .forEach((element) =>
        element.setAttribute("aria-label", t(element.dataset.i18nAria)),
      );
    document
      .querySelectorAll<HTMLElement>("[data-i18n-title]")
      .forEach((element) =>
        element.setAttribute("title", t(element.dataset.i18nTitle)),
      );
    document
      .querySelectorAll<HTMLElement>("[data-i18n-placeholder]")
      .forEach((element) =>
        element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder)),
      );
    document
      .querySelector("#accentPalette")
      .setAttribute("aria-label", t("accentColor"));
    $("#accentPickerToggle").setAttribute("aria-label", t("accentColor"));
    $("#accentPickerToggle").setAttribute("title", t("accentColor"));
    preferences.syncLanguagePicker();
    updateTagOptions();
    taskCalendar.updateDueDateLabel();
    renderTodayLabel();
  }
  applyStaticTranslations();
  $("#planDate").value = today();

  async function api(path: string, options: RequestInit = {}) {
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

  function renderStatusSwitch() {
    all("[data-status-view]").forEach((button) => {
      const active = button.dataset.statusView === state.status;
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function activeView(view) {
    all("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("text-accent", active);
      button.classList.toggle("bg-accent-soft", active);
      button.classList.toggle("bg-transparent", !active);
      button.classList.toggle("text-muted", !active);
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

  tasksPage = createTasksPage({
    $,
    all,
    state,
    getLocale: () => locales[language],
    today,
    t,
    taskComponentOptions,
    taskFilters,
    taskCalendar,
    loadTasks,
  });

  dataController = createWorkspaceDataController({
    $,
    api,
    state,
    pageSize: PAGE_SIZE,
    t,
    today,
    getLanguage: () => language,
    getSearch: () => $("#searchInput").value,
    getDueDate: () => $("#dueDate").value,
    taskCalendar,
    activeView,
    renderStatusSwitch,
    closeMobileTagPopup,
    renderTags,
    renderTasks,
    taskComponentOptions,
    toast,
  });
  schedulePage = createSchedulePage({ $, taskCalendar, loadPlan });
  const {
    changeTaskStatus,
    invalidateAvailableTags,
    loadMorePlanTasks,
    loadMoreTasks,
  } = dataController;

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
          taskEditor.edit(button.dataset.edit, tasks);
        } else if (button.dataset.filterTag) {
          toggleTagFilter(button.dataset.filterTag);
        }
      });
    });
  }

  taskEditor.bind();

  $("#loadMoreTasks").onclick = loadMoreTasks;
  $("#loadMorePlanTasks").onclick = loadMorePlanTasks;
  if ("IntersectionObserver" in window) {
    const loadMoreObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ isIntersecting, target }) => {
          if (!isIntersecting) return;
          if ((target as HTMLElement).id === "loadMoreTasks") {
            void loadMoreTasks();
          } else if ((target as HTMLElement).id === "loadMorePlanTasks") {
            void loadMorePlanTasks();
          }
        });
      },
      { rootMargin: "300px 0px" },
    );
    loadMoreObserver.observe($("#loadMoreTasks"));
    loadMoreObserver.observe($("#loadMorePlanTasks"));
  }

  $("#newTask").onclick = () => taskEditor.open();
  $("#closeDialog").onclick = () => $("#taskDialog").close();
  $("#refresh").onclick = () =>
    state.view === "plan" ? loadPlan() : loadTasks({ refreshTags: true });
  tasksPage.bind();
  schedulePage.bind();
  preferences.bind(() => {
    try {
      localStorage.setItem("todo-language", language);
    } catch {}
    applyStaticTranslations();
    preferences.renderThemeToggle();
    if (!$("#dueDatePopup").hidden) taskCalendar.renderDueDateCalendar();
    if (state.view === "plan") loadPlan();
    else loadTasks();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!$("#searchInput").parentElement.contains(event.target)) {
      $("#searchTagSuggestions").hidden = true;
      $("#searchInput").setAttribute("aria-expanded", "false");
    }
    if (!$("#mobileTagPicker").contains(event.target)) closeMobileTagPopup();
    if (!$("#mobilePlanCalendarPicker").contains(event.target))
      taskCalendar.closeMobilePlanCalendarPopup();
    if (!$("#dueDatePicker").contains(event.target)) taskCalendar.closeDueDatePopup();
    if (!$("#languagePicker").contains(event.target)) preferences.closeLanguagePicker();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileTagPopup({ restoreFocus: true });
      taskCalendar.closeMobilePlanCalendarPopup({ restoreFocus: true });
      taskCalendar.closeDueDatePopup({ restoreFocus: true });
      preferences.closeLanguagePicker({ restoreFocus: true });
    }
  });
  all("[data-view]").forEach((button) => {
    button.onclick = () =>
      button.dataset.view === "plan" ? loadPlan() : loadTasks();
  });
  bindCardActions();
  loadTasks().catch((error) =>
    toast(language === "ru" ? error.message : t("requestFailed")),
  );

}
