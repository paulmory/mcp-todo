export function createScheduleView({ $, taskCalendar, loadPlan }) {
  function bind() {
    taskCalendar.syncScheduleCalendarPlacement();
    $("#mobilePlanCalendarToggle").onclick = () => {
      const popup = $("#mobilePlanCalendarPopup"); const willOpen = popup.hidden; popup.hidden = !willOpen;
      $("#mobilePlanCalendarToggle").setAttribute("aria-expanded", String(willOpen));
    };
    window.addEventListener("resize", taskCalendar.syncScheduleCalendarPlacement);
    $("#planDate").onchange = loadPlan;
  }
  return { bind };
}
