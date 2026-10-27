import { escapeHtml } from "../../../shared/lib/html.ts";

export function renderTaskTagEditor({
  input,
  chips,
  options,
  selectedTags,
  availableTags,
  locale,
  translate,
  onSelectedTagsChange,
}) {
  if (!input || !chips || !options) return;

  input.placeholder = selectedTags.length ? "" : translate("projectPlaceholder");
  chips.innerHTML = selectedTags
    .map(
      (tag) => `
        <span class="task-tag-chip">
          <span>${escapeHtml(tag)}</span>
          <button type="button" data-remove-task-tag="${escapeHtml(tag)}" aria-label="${escapeHtml(translate("removeTag"))}: ${escapeHtml(tag)}">×</button>
        </span>`,
    )
    .join("");
  chips.querySelectorAll("[data-remove-task-tag]").forEach((button) => {
    button.onclick = () => {
      onSelectedTagsChange(
        selectedTags.filter((tag) => tag !== button.dataset.removeTaskTag),
      );
      input.focus();
    };
  });

  const query = input.value.trim().toLocaleLowerCase(locale);
  const selected = new Set(selectedTags);
  const matches = availableTags.filter((tag) => {
    const name = tag.name.toLocaleLowerCase(locale);
    return !selected.has(name) && (!query || name.includes(query));
  });
  options.innerHTML = matches
    .map(
      (tag) => `
        <button type="button" role="option" aria-selected="false" class="task-tag-option" data-task-tag-option="${escapeHtml(tag.name)}">
          <span>${escapeHtml(tag.name)}</span>
        </button>`,
    )
    .join("");

  const showOptions = matches.length > 0 && document.activeElement === input;
  options.hidden = !showOptions;
  input.setAttribute("aria-expanded", String(showOptions));
  const buttons = [...options.querySelectorAll("[data-task-tag-option]")];
  buttons.forEach((button, index) => {
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
      onSelectedTagsChange([...selectedTags, button.dataset.taskTagOption]);
      input.value = "";
      input.focus();
    };
  });
}
