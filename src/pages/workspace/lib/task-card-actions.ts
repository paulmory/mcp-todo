export function bindTaskCardActions({ $, state, taskEditor, changeTaskStatus, toggleTagFilter }) {
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
