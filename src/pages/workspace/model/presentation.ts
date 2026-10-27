import { isOverdue } from "../../../entities/task/client.ts";

export function createWorkspacePresentation({
  $, all, locales, getLanguage, t, state, preferences, taskFilters, taskCalendar,
  getAuthState, today,
}) {
  const todayDate = new Date();

  function renderTodayLabel() {
    const language = getLanguage();
    const todayText = new Intl.DateTimeFormat(locales[language], {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(todayDate);
    $("#todayLabel").textContent =
      todayText.charAt(0).toLocaleUpperCase(locales[language]) + todayText.slice(1);
  }

  function applyStaticTranslations() {
    const language = getLanguage();
    document.documentElement.lang = language;
    document.title = t("appTitle");
    all("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    if ($("#taskId").value) $("#dialogTitle").textContent = t("editTaskTitle");
    document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((element) =>
      element.setAttribute("aria-label", t(element.dataset.i18nAria)),
    );
    document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) =>
      element.setAttribute("title", t(element.dataset.i18nTitle)),
    );
    document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((element) =>
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder)),
    );
    document.querySelector("#accentPalette").setAttribute("aria-label", t("accentColor"));
    $("#accentPickerToggle").setAttribute("aria-label", t("accentColor"));
    $("#accentPickerToggle").setAttribute("title", t("accentColor"));
    const authState = getAuthState();
    if (authState) {
      const authLabel = authState.authenticated && !authState.local ? "signOut" : "signIn";
      $("#authToggle").setAttribute("aria-label", t(authLabel));
      $("#authToggle").setAttribute("title", t(authLabel));
    }
    preferences.syncLanguagePicker();
    taskFilters.updateOptions();
    taskCalendar.updateDueDateLabel();
    renderTodayLabel();
  }

  function formatDate(date, showOverdue = true, dueTime = null) {
    const language = getLanguage();
    if (!date) return "";
    if (showOverdue && isOverdue(date, dueTime)) {
      const localDate = new Date(`${date}T00:00:00`);
      const shortDate = new Intl.DateTimeFormat(locales[language], {
        day: "numeric", month: "short",
      }).format(localDate);
      return t("overdue", { date: shortDate });
    }
    if (date === today()) return t("today");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date === tomorrow.toLocaleDateString("en-CA")) return t("tomorrow");
    return new Intl.DateTimeFormat(locales[language], {
      day: "numeric", month: "short",
    }).format(new Date(`${date}T00:00:00`));
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

  return { activeView, applyStaticTranslations, formatDate, renderTodayLabel, taskComponentOptions };
}
