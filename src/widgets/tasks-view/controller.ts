import { filterTasksBySearch, renderTaskRow } from "../../entities/task/client.ts";
import { renderEmptyState } from "../../shared/ui/index.ts";

export function createTasksView({
  $,
  all,
  state,
  getLocale,
  today,
  t,
  taskComponentOptions,
  taskFilters,
  taskCalendar,
  loadTasks,
}) {
  function render() {
    const tasks = filterTasksBySearch(state.tasks, state.search, getLocale());
    const options = taskComponentOptions();
    $("#tasks").innerHTML = tasks.length
      ? tasks.map((task) => renderTaskRow(task, options)).join("")
      : renderEmptyState(t(state.search.trim() ? "emptySearch" : "emptyTasks"), t("emptyHint"));
    $("#loadMoreTasks").hidden = !state.tasksHasMore;
    $("#loadMoreTasks").disabled = false;
  }
  function bind() {
    $("#allTasks").onclick = () => {
      taskFilters.removeTagSearch();
      state.untagged = false;
      loadTasks();
    };
    $("#unassigned").onclick = () => {
      taskFilters.removeTagSearch();
      state.untagged = true;
      loadTasks();
    };
    $("#scopeFilter").onchange = () => {
      const [kind, tagName] = $("#scopeFilter").value.split(":");
      state.untagged = kind === "untagged";
      if (kind === "tag") taskFilters.updateTagSearch(decodeURIComponent(tagName));
      else taskFilters.removeTagSearch();
      state.untagged = kind === "untagged";
      loadTasks();
    };
    all("[data-status-view]").forEach((button) => {
      button.onclick = () => {
        taskFilters.updateStatusFilter(button.dataset.statusView);
        loadTasks();
      };
    });
    $("#searchInput").oninput = () => {
      taskFilters.renderSearchTagSuggestions();
      if (!$("#searchInput").value.trim() && state.search) taskFilters.applySearch("");
    };
    $("#searchInput").onkeydown = (event) => {
      if (event.key === "ArrowDown" && !$("#searchTagSuggestions").hidden) {
        event.preventDefault();
        $("#searchTagSuggestions [data-search-tag]")?.focus();
      } else if (event.key === "Enter") {
        event.preventDefault();
        $("#searchTagSuggestions").hidden = true;
        $("#searchInput").setAttribute("aria-expanded", "false");
        taskFilters.applySearch();
      } else if (event.key === "Escape") {
        $("#searchTagSuggestions").hidden = true; $("#searchInput").setAttribute("aria-expanded", "false");
        $("#searchInput").value = state.search;
      }
    };
    $("#searchTagSuggestions").onkeydown = (event) => {
      const options = [...$("#searchTagSuggestions").querySelectorAll("[data-search-tag]")];
      const current = options.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = current + (event.key === "ArrowDown" ? 1 : -1);
        if (next < 0) $("#searchInput").focus();
        else options[Math.min(next, options.length - 1)]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault(); $("#searchTagSuggestions").hidden = true;
        $("#searchInput").setAttribute("aria-expanded", "false"); $("#searchInput").focus();
      }
    };
    $("#searchInputContainer").onfocusout = (event) => {
      if (!$("#searchInputContainer").contains(event.relatedTarget)) {
        $("#searchTagSuggestions").hidden = true; $("#searchInput").setAttribute("aria-expanded", "false");
      }
    };
    $("#dueDateToggle").onclick = taskCalendar.openDueDatePopup;
    $("#dueDateToday").onclick = () => {
      $("#dueDate").value = today(); taskCalendar.setDueDateToToday(); taskCalendar.closeDueDatePopup(); loadTasks();
    };
    $("#dueDateClear").onclick = () => {
      $("#dueDate").value = ""; taskCalendar.updateDueDateLabel(); taskCalendar.closeDueDatePopup(); loadTasks();
    };
    $("#mobileTagToggle").onclick = () => {
      const popup = $("#mobileTagPopup");
      const willOpen = popup.hidden;
      popup.hidden = !willOpen;
      $("#mobileTagToggle").setAttribute("aria-expanded", String(willOpen));
    };
  }
  return { bind, render };
}
