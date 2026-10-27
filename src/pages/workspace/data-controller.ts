import { renderTaskRow } from "../../entities/task/ui/task-row.ts";
import { renderEmptyState } from "../../shared/ui/index.ts";
import { buildTaskListQuery } from "../tasks/query.ts";

/** Owns task/schedule requests, paging, and stale-request protection for workspace. */
export function createWorkspaceDataController({
  $,
  api,
  state,
  pageSize,
  t,
  today,
  getLanguage,
  getSearch,
  getDueDate,
  taskCalendar,
  activeView,
  renderStatusSwitch,
  closeMobileTagPopup,
  renderTags,
  renderTasks,
  taskComponentOptions,
  toast,
}) {
  let availableTags = [];
  let availableTagsLoaded = false;
  let availableTagsPromise = null;
  let availableTagsGeneration = 0;
  let viewLoadGeneration = 0;
  let tasksPageLoading = false;
  let planPageLoading = false;

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
          if (generation === availableTagsGeneration) availableTagsPromise = null;
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
    taskCalendar.closeMobilePlanCalendarPopup();
    taskCalendar.closeDueDatePopup();
    activeView("tasks");
    renderStatusSwitch();
    state.tasksHasMore = false;
    $("#loadMoreTasks").hidden = true;

    const query = buildTaskListQuery({
      state,
      pageSize,
      offset: 0,
      search: getSearch(),
      dueDate: getDueDate(),
    });

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

  async function loadMoreTasks() {
    if (tasksPageLoading || !state.tasksHasMore || state.view !== "tasks") return;
    tasksPageLoading = true;
    const requestId = viewLoadGeneration;
    $("#loadMoreTasks").disabled = true;
    try {
      const query = buildTaskListQuery({
        state,
        pageSize,
        offset: state.tasksOffset,
        search: getSearch(),
        dueDate: getDueDate(),
      });
      const result = await api(`/api/tasks?${query}`);
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
      toast(getLanguage() === "ru" ? error.message : t("requestFailed"));
    } finally {
      tasksPageLoading = false;
      if (state.view === "tasks") $("#loadMoreTasks").disabled = false;
    }
  }

  async function loadPlan() {
    const requestId = ++viewLoadGeneration;
    closeMobileTagPopup();
    taskCalendar.closeMobilePlanCalendarPopup();
    taskCalendar.closeDueDatePopup();
    taskCalendar.syncScheduleCalendarPlacement();
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
    taskCalendar.renderPlanDateSwitch();
    taskCalendar.renderPlanDateLabel();
    const selectedDate = $("#planDate").value;
    taskCalendar.setScheduleDate(selectedDate);
    const query = new URLSearchParams({
      date: selectedDate,
      includeBacklog: String(selectedDate === today()),
      limit: String(pageSize),
      offset: "0",
    });
    let result;
    try {
      [result] = await Promise.all([
        api(`/api/schedule?${query}`),
        taskCalendar.loadCalendarCounts(),
      ]);
    } catch (error) {
      if (requestId !== viewLoadGeneration) return;
      throw error;
    }
    if (requestId !== viewLoadGeneration || state.view !== "plan") return;
    state.planTasks = result.tasks;
    state.planHasMore = result.hasMore;
    state.planOffset = result.nextOffset;
    taskCalendar.renderScheduleCalendar();
    const options = taskComponentOptions("plan");
    $("#planItems").innerHTML = result.tasks.length
      ? result.tasks.map((task, index) => renderTaskRow(task, { ...options, index })).join("")
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
      limit: String(pageSize),
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
      toast(getLanguage() === "ru" ? error.message : t("requestFailed"));
    } finally {
      planPageLoading = false;
      if (state.view === "plan") $("#loadMorePlanTasks").disabled = false;
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
        toast(t("taskCompleted"), {
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
              toast(getLanguage() === "ru" ? error.message : t("requestFailed"));
            }
          },
        }, 6000);
      } else toast(t("statusUpdated"));
      if (state.view === "plan") await loadPlan();
      else await loadTasks();
    } catch (error) {
      toast(getLanguage() === "ru" ? error.message : t("requestFailed"));
    }
  }

  return {
    changeTaskStatus,
    getAvailableTags: () => availableTags,
    isTasksLoading: () => tasksPageLoading,
    invalidateAvailableTags,
    loadMorePlanTasks,
    loadMoreTasks,
    loadPlan,
    loadTasks,
  };
}
