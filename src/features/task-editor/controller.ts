import { parseTaskTags } from "../task-tags/model.ts";
import { renderTaskTagEditor } from "../task-tags/ui/editor.ts";

export function createTaskEditor({
  $,
  api,
  translate,
  getLanguage,
  getLocale,
  getAvailableTags,
  onSaved,
  onError,
}) {
  let selectedTags = [];

  function renderTags() {
    const input = $("#taskTags");
    renderTaskTagEditor({
      input,
      chips: $("#taskTagChips"),
      options: $("#taskTagOptions"),
      selectedTags,
      availableTags: getAvailableTags(),
      locale: getLocale(),
      translate,
      onSelectedTagsChange: (tags) => {
        selectedTags = parseTaskTags(tags.join(","));
        renderTags();
      },
    });
  }

  function addTags(value = $("#taskTags").value) {
    selectedTags = parseTaskTags(
      [...selectedTags, ...parseTaskTags(value)].join(","),
    );
    $("#taskTags").value = "";
    renderTags();
  }

  function resizeDescription() {
    const field = $("#description");
    field.style.height = "auto";
    const styles = getComputedStyle(field);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const verticalPadding =
      Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const borders =
      Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
    const minHeight = lineHeight * 5 + verticalPadding + borders;
    const maxHeight = lineHeight * 10 + verticalPadding + borders;
    const contentHeight = field.scrollHeight + borders;
    field.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
    field.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  function open(task = null) {
    $("#taskForm").reset();
    $("#formError").textContent = "";
    $("#taskId").value = task?.id || "";
    $("#dialogTitle").textContent = task ? translate("editTaskTitle") : translate("newTask");
    $("#title").value = task?.title || "";
    selectedTags = parseTaskTags((task?.tags || []).join(","));
    $("#taskTags").value = "";
    renderTags();
    $("#description").value = task?.description || "";
    resizeDescription();
    $("#taskDue").value = task?.dueDate || "";
    $("#taskDueTime").value = task?.dueTime || "";
    $("#taskPriority").value = task?.priority || "normal";
    $("#taskDialog").showModal();
    $("#title").focus();
  }

  function edit(id, tasks) {
    const task = tasks.find((item) => item.id === id);
    if (task) open(task);
  }

  function bind() {
    const tagsInput = $("#taskTags");
    tagsInput.addEventListener("input", renderTags);
    tagsInput.addEventListener("focus", renderTags);
    tagsInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        const options = $("#taskTagOptions");
        if (
          document.activeElement !== tagsInput &&
          !options.contains(document.activeElement)
        ) {
          if (tagsInput.value.trim()) addTags(tagsInput.value);
          options.hidden = true;
          tagsInput.setAttribute("aria-expanded", "false");
        }
      }, 0);
    });
    tagsInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && !$("#taskTagOptions").hidden) {
        event.preventDefault();
        $("#taskTagOptions [data-task-tag-option]")?.focus();
      } else if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        const value = tagsInput.value;
        const locale = getLocale();
        const exactMatch = getAvailableTags().find(
          (tag) => tag.name.toLocaleLowerCase(locale) === value.trim().toLocaleLowerCase(locale),
        );
        if (exactMatch) {
          selectedTags = parseTaskTags([...selectedTags, exactMatch.name].join(","));
          tagsInput.value = "";
          renderTags();
        } else {
          addTags(value);
        }
      } else if (event.key === "Backspace" && !tagsInput.value && selectedTags.length) {
        selectedTags = selectedTags.slice(0, -1);
        renderTags();
      } else if (event.key === "Escape") {
        $("#taskTagOptions").hidden = true;
        tagsInput.setAttribute("aria-expanded", "false");
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
          tags: parseTaskTags(
            [...selectedTags, ...parseTaskTags(tagsInput.value)].join(","),
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
        await onSaved(id);
      } catch (error) {
        onError(error, getLanguage());
      }
    };
  }

  return { bind, edit, open, renderTags, resizeDescription };
}
