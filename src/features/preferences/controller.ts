export function createPreferences({ $, all, locales, getLanguage, setLanguage, translate }) {
  const accentChoices = [
    "red", "orange", "yellow", "green", "emerald", "teal",
    "sky", "blue", "indigo", "purple", "pink", "neutral",
  ];
  const t = (key) => translate(getLanguage(), key);

  function syncLanguagePicker() {
    const select = $("#languageSelect");
    if (!select) return;
    select.value = getLanguage();
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
    all('[role="option"]', optionsList).forEach((option) => {
      const selected = option.dataset.language === getLanguage();
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
    const buttons = all('[role="option"]', options);
    const selectedIndex = buttons.findIndex(
      (option) => option.dataset.language === getLanguage(),
    );
    const targetIndex = index ?? Math.max(0, selectedIndex);
    buttons.forEach((option, optionIndex) => {
      option.tabIndex = optionIndex === targetIndex ? 0 : -1;
    });
    buttons[targetIndex]?.focus();
  }

  function moveLanguageOption(delta) {
    const options = all('[role="option"]', $("#languageOptions"));
    const currentIndex = options.indexOf(document.activeElement);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + delta + options.length) % options.length;
    options.forEach((option, index) => {
      option.tabIndex = index === nextIndex ? 0 : -1;
    });
    options[nextIndex]?.focus();
  }

  function applyAccent(accent, persist = false) {
    const selected = accentChoices.includes(accent) ? accent : "green";
    document.documentElement.dataset.accent = selected;
    $("#accentPickerToggle").setAttribute("aria-label", t("accentColor"));
    $("#accentPickerToggle").setAttribute("title", t("accentColor"));
    $("#accentPickerToggle .accent-color-dot").dataset.color = selected;
    all("[data-accent-choice]").forEach((button) => {
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

  function renderThemeToggle() {
    const dark = document.documentElement.classList.contains("dark");
    const button = $("#themeToggle");
    button.setAttribute("aria-checked", String(dark));
    button.setAttribute(
      "aria-label",
      dark ? t("themeDarkEnabled") : t("themeDarkDisabled"),
    );
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]').content = dark
      ? "#101716"
      : "#f2f5f3";
  }

  function bind(onLanguageChange) {
    let initialAccent = "green";
    try {
      const savedAccent = localStorage.getItem("todo-accent");
      if (savedAccent && accentChoices.includes(savedAccent)) initialAccent = savedAccent;
    } catch {}
    applyAccent(initialAccent);
    renderThemeToggle();

    $("#accentPickerToggle").onclick = () => {
      const expanded = $("#accentPickerToggle").getAttribute("aria-expanded") === "true";
      $("#accentPickerToggle").setAttribute("aria-expanded", String(!expanded));
      $("#accentPalette").hidden = expanded;
    };
    all("[data-accent-choice]").forEach((button) => {
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
    $("#themeToggle").onclick = () => {
      const dark = document.documentElement.classList.toggle("dark");
      try {
        localStorage.setItem("todo-theme", dark ? "dark" : "light");
      } catch {}
      renderThemeToggle();
    };

    const trigger = $("#languageSelectTrigger");
    const options = $("#languageOptions");
    trigger.onclick = () => options.hidden ? openLanguagePicker() : closeLanguagePicker();
    trigger.onkeydown = (event) => {
      if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (options.hidden) {
        openLanguagePicker(event.key === "ArrowUp" ? options.children.length - 1 : null);
      } else moveLanguageOption(event.key === "ArrowUp" ? -1 : 1);
    };
    options.onclick = (event) => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      $("#languageSelect").value = option.dataset.language;
      $("#languageSelect").dispatchEvent(new Event("change", { bubbles: true }));
      closeLanguagePicker({ restoreFocus: true });
    };
    options.onkeydown = (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveLanguageOption(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        openLanguagePicker(event.key === "Home" ? 0 : options.children.length - 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeLanguagePicker({ restoreFocus: true });
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey && !event.metaKey && !event.altKey
      ) {
        const query = (options.dataset.typeahead || "") + event.key.toLocaleLowerCase();
        options.dataset.typeahead = query;
        clearTimeout(options.typeaheadTimer);
        options.typeaheadTimer = setTimeout(() => { options.dataset.typeahead = ""; }, 600);
        const buttons = all('[role="option"]', options);
        const start = Math.max(0, buttons.indexOf(document.activeElement));
        const labels = buttons.map((option) => option.textContent.trim().toLocaleLowerCase());
        const index = [...labels.slice(start), ...labels.slice(0, start)]
          .findIndex((label) => label.startsWith(query));
        if (index >= 0) {
          const target = (start + index) % buttons.length;
          buttons.forEach((option, itemIndex) => { option.tabIndex = itemIndex === target ? 0 : -1; });
          buttons[target].focus();
        }
      }
    };
    $("#languageSelect").onchange = () => {
      const next = $("#languageSelect").value;
      setLanguage(Object.hasOwn(locales, next) ? next : "en");
      onLanguageChange();
    };
  }

  return { bind, closeLanguagePicker, renderThemeToggle, syncLanguagePicker };
}
