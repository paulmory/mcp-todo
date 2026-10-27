import {
  formatSearchTag,
  normalizeSearchTag,
  replaceSearchQualifier,
  searchTagTerms,
} from "../../entities/task/client.ts";

export function createTaskFilters({
  $,
  all,
  state,
  getLanguage,
  getLocale,
  t,
  escapeHtml,
  getAvailableTags,
  renderEditorTags,
  renderStatusSwitch,
  loadTasks,
}) {
  function scopeClass(active) {
    return `scope-option${active ? " is-active" : ""}`;
  }

  function updateOptions() {
    renderSearchTagSuggestions();
    renderEditorTags();
  }

  function searchTagContext(value = $("#searchInput").value) {
    const match = /(^|\s)tag:(?:"((?:\\.|[^"])*)|([^\s]*))$/i.exec(value);
    if (!match) return null;
    const rawQuery = match[2] ?? match[3];
    if (match[2] === undefined && rawQuery.startsWith('"') && rawQuery.endsWith('"'))
      return null;
    return {
      start: match.index + match[1].length,
      query: normalizeSearchTag(rawQuery).toLocaleLowerCase(getLocale()),
    };
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
    } else state.tag = null;
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
        (match) => normalizeSearchTag(match[1] ?? match[2]).toLocaleLowerCase(getLocale()),
      ),
    );
    const suggestions = getAvailableTags().filter((tag) => {
      const name = tag.name.toLocaleLowerCase(getLocale());
      return !existing.has(name) && name.startsWith(context.query);
    });
    if (!suggestions.length) {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      list.replaceChildren();
      return;
    }

    list.innerHTML = suggestions.map((tag) => `
      <button class="search-tag-option" type="button" role="option" aria-selected="false" data-search-tag="${escapeHtml(tag.name)}">
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.2V3.5A1.5 1.5 0 0 1 3.5 2h4.7l5.3 5.3a1.5 1.5 0 0 1 0 2.1l-3.1 3.1a1.5 1.5 0 0 1-2.1 0L2 8.2Z"></path><circle cx="5.2" cy="5.2" r=".7" fill="currentColor"></circle></svg>
        <span class="min-w-0 flex-1 truncate">${escapeHtml(tag.name)}</span>
        <span class="search-tag-count">${tag.openTasks}</span>
      </button>`).join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    all("[data-search-tag]", list).forEach((button) => {
      button.onpointerdown = (event) => event.preventDefault();
      button.onclick = () => {
        input.value = `${input.value.slice(0, context.start)}tag:${formatSearchTag(button.dataset.searchTag)} `;
        renderSearchTagSuggestions();
        input.focus();
      };
    });
  }

  function updateTagSearch(tag, value = $("#searchInput").value) {
    const query = replaceSearchQualifier(value, "tag", tag ? `tag:${formatSearchTag(tag)}` : "");
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

  function toggleTagFilter(tag) {
    const selected = searchTagTerms($("#searchInput").value).some(
      (item) => item.toLocaleLowerCase(getLocale()) === tag.toLocaleLowerCase(getLocale()),
    ) ? null : tag;
    updateTagSearch(selected);
    loadTasks();
  }

  function closeMobileTagPopup({ restoreFocus = false } = {}) {
    const popup = $("#mobileTagPopup");
    if (!popup || popup.hidden) return;
    popup.hidden = true;
    $("#mobileTagToggle").setAttribute("aria-expanded", "false");
    if (restoreFocus) $("#mobileTagToggle").focus();
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
    updateOptions();
    const visibleTags = tags.filter((tag) => tag.openTasks > 0);
    const options = visibleTags.map((tag) =>
      `<option value="tag:${encodeURIComponent(tag.name)}">${escapeHtml(tag.name)} (${tag.openTasks})</option>`,
    ).join("");
    $("#scopeFilter").innerHTML = `<option value="all">${t("allTasks")}</option><option value="untagged">${t("noProject")}</option>${options}`;
    $("#scopeFilter").value = state.untagged ? "untagged" : state.tag ? `tag:${encodeURIComponent(state.tag)}` : "all";
    $("#allTasks").className = scopeClass(!state.tag && !state.untagged);
    $("#unassigned").className = scopeClass(state.untagged);
    $("#tags").innerHTML = visibleTags.map((tag) => `
      <button class="${scopeClass(state.tag === tag.name && !state.untagged)}" data-tag="${escapeHtml(tag.name)}">
        <span class="min-w-0 truncate">${escapeHtml(tag.name)}</span><span class="ml-2 rounded-full bg-meta-chip px-2 py-0.5 text-[11px] text-muted">${tag.openTasks}</span>
      </button>`).join("") || `<p class="px-3 py-2 text-xs text-muted">${t("projectsEmpty")}</p>`;
    $("#mobileTagMenu").innerHTML = `
      <button type="button" class="${scopeClass(!state.tag && !state.untagged)}" data-mobile-scope="all"><span>${t("allTasks")}</span></button>
      <button type="button" class="${scopeClass(state.untagged)}" data-mobile-scope="untagged"><span>${t("noProject")}</span></button>
      <div class="my-2 border-t border-line"></div>
      ${visibleTags.map((tag) => `<button type="button" class="${scopeClass(state.tag === tag.name && !state.untagged)}" data-mobile-tag="${escapeHtml(tag.name)}"><span class="min-w-0 truncate">${escapeHtml(tag.name)}</span><span class="ml-2 rounded-full bg-meta-chip px-2 py-0.5 text-[11px] text-muted">${tag.openTasks}</span></button>`).join("") || `<p class="px-3 py-2 text-xs text-muted">${t("projectsEmpty")}</p>`}`;
    all("[data-tag]").forEach((button) => {
      button.onclick = () => { updateTagSearch(button.dataset.tag); loadTasks(); };
    });
    all("[data-mobile-scope]").forEach((button) => {
      button.onclick = () => selectMobileTagScope(button.dataset.mobileScope);
    });
    all("[data-mobile-tag]").forEach((button) => {
      button.onclick = () => selectMobileTagScope("tag", button.dataset.mobileTag);
    });
  }

  return {
    applySearch,
    closeMobileTagPopup,
    removeTagSearch,
    renderSearchTagSuggestions,
    renderTags,
    selectMobileTagScope,
    toggleTagFilter,
    updateOptions,
    updateStatusFilter,
    updateTagSearch,
  };
}
