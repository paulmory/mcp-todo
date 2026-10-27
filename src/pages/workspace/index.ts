import { locales, translate } from "../../shared/config/i18n.ts";
import { dateValue, escapeHtml as esc } from "../../shared/lib/index.ts";
import { createTaskFilters } from "../../features/task-filters/index.ts";
import { createTaskEditor } from "../../features/task-editor/index.ts";
import { createTaskCalendar } from "../../features/task-calendar/index.ts";
import { createPreferences } from "../../features/preferences/index.ts";
import { createWorkspaceDataController } from "./model/data-controller.ts";
import { createWorkspacePresentation } from "./model/presentation.ts";
import { bindWorkspacePopupDismissal } from "./lib/dismiss-popups.ts";
import { bindTaskCardActions } from "./lib/task-card-actions.ts";
import { createTasksView } from "../../widgets/tasks-view/index.ts";
import { createScheduleView } from "../../widgets/schedule-view/index.ts";

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
  const browserLanguage = (() => {
    const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const candidate of candidates) {
      const languageCode = candidate?.toLowerCase().split("-")[0];
      if (languageCode && Object.hasOwn(locales, languageCode)) return languageCode;
    }
    return "en";
  })();
  let language = Object.hasOwn(locales, savedLanguage) ? savedLanguage : browserLanguage;
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
  let authState = { authenticated: false, local: true };
  let dataController;
  let tasksView;
  let scheduleView;
  function renderTasks() { tasksView?.render(); }
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
    closeMobileTagPopup,
    renderTags,
    toggleTagFilter,
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
  const presentation = createWorkspacePresentation({
    $, all, locales, getLanguage: () => language, t, state, preferences,
    taskFilters, taskCalendar, getAuthState: () => authState, today,
  });
  const { activeView, applyStaticTranslations, taskComponentOptions } = presentation;
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

  async function syncAuthState() {
    authState = await api("/api/auth");
    const button = $("#authToggle");
    button.setAttribute("aria-label", t(authState.authenticated && !authState.local ? "signOut" : "signIn"));
    button.title = t(authState.authenticated && !authState.local ? "signOut" : "signIn");
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

  function renderStatusSwitch() {
    all("[data-status-view]").forEach((button) => {
      const active = button.dataset.statusView === state.status;
      button.setAttribute("aria-pressed", String(active));
    });
  }

  tasksView = createTasksView({
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
  scheduleView = createScheduleView({ $, taskCalendar, loadPlan });
  const {
    changeTaskStatus,
    invalidateAvailableTags,
    loadMorePlanTasks,
    loadMoreTasks,
  } = dataController;

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
  $("#authToggle").onclick = async () => {
    try {
      if (authState.authenticated && !authState.local) {
        await api("/api/auth/logout", { method: "POST" });
        await syncAuthState();
        dataController.invalidateAvailableTags();
        if (state.view === "plan") await loadPlan();
        else await loadTasks({ refreshTags: true });
      } else {
        $("#authToken").value = "";
        $("#authDialog").showModal();
        $("#authToken").focus();
      }
    } catch (error) {
      toast(language === "ru" ? error.message : t("requestFailed"));
    }
  };
  const closeAuthDialog = () => $("#authDialog").close();
  $("#closeAuthDialog").onclick = closeAuthDialog;
  $("#cancelAuthDialog").onclick = closeAuthDialog;
  $("#authForm").onsubmit = async (event) => {
    event.preventDefault();
    const token = $("#authToken").value.trim();
    if (!token) return;
    const submit = $("#authForm").querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ token }) });
      closeAuthDialog();
      await syncAuthState();
      dataController.invalidateAvailableTags();
      if (state.view === "plan") await loadPlan();
      else await loadTasks({ refreshTags: true });
    } catch (error) {
      toast(language === "ru" ? error.message : t("requestFailed"));
    } finally {
      submit.disabled = false;
    }
  };
  $("#closeDialog").onclick = () => $("#taskDialog").close();
  $("#refresh").onclick = () =>
    state.view === "plan" ? loadPlan() : loadTasks({ refreshTags: true });
  tasksView.bind();
  scheduleView.bind();
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
  all("[data-view]").forEach((button) => {
    button.onclick = () =>
      button.dataset.view === "plan" ? loadPlan() : loadTasks();
  });
  bindTaskCardActions({ $, state, taskEditor, changeTaskStatus, toggleTagFilter });
  bindWorkspacePopupDismissal({ $, closeMobileTagPopup, taskCalendar, preferences });
  void syncAuthState();
  loadTasks().catch((error) =>
    toast(language === "ru" ? error.message : t("requestFailed")),
  );

}
