export function bindWorkspacePopupDismissal({ $, closeMobileTagPopup, taskCalendar, preferences }) {
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
    if (event.key !== "Escape") return;
    closeMobileTagPopup({ restoreFocus: true });
    taskCalendar.closeMobilePlanCalendarPopup({ restoreFocus: true });
    taskCalendar.closeDueDatePopup({ restoreFocus: true });
    preferences.closeLanguagePicker({ restoreFocus: true });
  });
}
