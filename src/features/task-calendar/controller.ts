import { renderCalendar } from "../../shared/ui/calendar.ts";

export function createTaskCalendar({
  $,
  all,
  api,
  t,
  getLocale,
  dateValue,
  escapeHtml,
  today,
  getPlanDate,
  setPlanDate,
  loadPlan,
  loadTasks,
  onError,
}) {
  let scheduleMonth = null;
  let taskCounts = new Map();
  let countsMonth = null;
  let dueMonth = null;
  let countsRequestId = 0;

  function monthKey(month) {
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  }

  function setScheduleDate(value = getPlanDate()) {
    const [year, month] = value.split("-").map(Number);
    scheduleMonth = new Date(year, month - 1, 1);
  }

  function renderPlanDateLabel() {
    const [year, month, day] = getPlanDate().split("-").map(Number);
    $("#planDateLabel").textContent = new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "long",
    }).format(new Date(year, month - 1, day));
  }

  function renderPlanDateSwitch() {
    const selectedDate = getPlanDate();
    const dates = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const label =
        offset === 0
          ? t("today")
          : offset === 1
            ? t("tomorrow")
            : new Intl.DateTimeFormat(getLocale(), {
                day: "numeric",
                month: "short",
              }).format(date);
      return { value: dateValue(date), label };
    });
    $("#planDateSwitch").innerHTML = dates
      .map(
        ({ value, label }) =>
          `<button type="button" class="status-option" data-plan-day="${value}" aria-pressed="${value === selectedDate}">${escapeHtml(label)}</button>`,
      )
      .join("");
    all("[data-plan-day]").forEach((button) => {
      button.onclick = () => {
        setPlanDate(button.dataset.planDay);
        loadPlan();
      };
    });
  }

  function renderScheduleCalendar() {
    const selectedValue = getPlanDate();
    if (!scheduleMonth) setScheduleDate(selectedValue);
    renderCalendar({
      calendar: $("#scheduleCalendar"),
      monthLabel: $("#calendarMonthLabel"),
      grid: $("#calendarGrid"),
      month: scheduleMonth,
      selectedValue,
      locale: getLocale(),
      today: today(),
      taskCounts,
      onSelect: (value) => {
        setPlanDate(value);
        loadPlan();
      },
      onMonthChange: (month) => {
        scheduleMonth = month;
        loadCalendarCounts(month);
      },
    });
  }

  async function loadCalendarCounts(month = scheduleMonth) {
    if (!month) return;
    const key = monthKey(month);
    if (countsMonth === key) {
      renderScheduleCalendar();
      return;
    }
    const from = `${key}-01`;
    const to = dateValue(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    const requestId = ++countsRequestId;
    try {
      const counts = await api(`/api/calendar-counts?from=${from}&to=${to}`);
      if (requestId !== countsRequestId || monthKey(scheduleMonth) !== key) return;
      taskCounts = new Map(counts.map(({ dueDate, count }) => [dueDate, count]));
      countsMonth = key;
      renderScheduleCalendar();
    } catch (error) {
      if (requestId !== countsRequestId) return;
      taskCounts = new Map();
      countsMonth = null;
      renderScheduleCalendar();
      onError(error);
    }
  }

  function updateDueDateLabel() {
    const value = $("#dueDate")?.value;
    const toggle = $("#dueDateToggle");
    toggle.classList.toggle("is-empty", !value);
    $("#dueDateLabel").textContent = value
      ? new Intl.DateTimeFormat(getLocale(), {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(`${value}T00:00:00`))
      : t("due");
  }

  function renderDueDateCalendar() {
    const selectedValue = $("#dueDate").value;
    const baseValue = selectedValue || today();
    const [year, month] = baseValue.split("-").map(Number);
    if (!dueMonth) dueMonth = new Date(year, month - 1, 1);
    renderCalendar({
      calendar: $("#dueDatePopup"),
      monthLabel: $("#dueCalendarMonthLabel"),
      grid: $("#dueCalendarGrid"),
      month: dueMonth,
      selectedValue,
      locale: getLocale(),
      today: today(),
      onSelect: (value) => {
        $("#dueDate").value = value;
        updateDueDateLabel();
        closeDueDatePopup();
        loadTasks();
      },
      onMonthChange: (nextMonth) => {
        dueMonth = nextMonth;
        renderDueDateCalendar();
      },
    });
  }

  function closeDueDatePopup({ restoreFocus = false } = {}) {
    const popup = $("#dueDatePopup");
    if (!popup || popup.hidden) return;
    popup.hidden = true;
    $("#dueDateToggle").setAttribute("aria-expanded", "false");
    if (restoreFocus) $("#dueDateToggle").focus();
  }

  function openDueDatePopup() {
    const popup = $("#dueDatePopup");
    if (popup.hidden) {
      const selectedValue = $("#dueDate").value || today();
      const [year, month] = selectedValue.split("-").map(Number);
      dueMonth = new Date(year, month - 1, 1);
      renderDueDateCalendar();
      popup.hidden = false;
      $("#dueDateToggle").setAttribute("aria-expanded", "true");
    } else {
      closeDueDatePopup();
    }
  }

  function closeMobilePlanCalendarPopup({ restoreFocus = false } = {}) {
    const popup = $("#mobilePlanCalendarPopup");
    if (!popup || popup.hidden) return;
    popup.hidden = true;
    $("#mobilePlanCalendarToggle").setAttribute("aria-expanded", "false");
    if (restoreFocus) $("#mobilePlanCalendarToggle").focus();
  }

  function syncScheduleCalendarPlacement() {
    const calendar = $("#scheduleCalendar");
    const mobilePopup = $("#mobilePlanCalendarPopup");
    const desktopAnchor = $("#scheduleCalendarAnchor");
    if (window.matchMedia("(max-width: 767px)").matches) {
      if (calendar.parentElement !== mobilePopup) mobilePopup.append(calendar);
    } else if (calendar.parentElement !== desktopAnchor) {
      closeMobilePlanCalendarPopup();
      desktopAnchor.append(calendar);
    }
  }

  function setDueDateToToday() {
    dueMonth = new Date();
    updateDueDateLabel();
  }

  return {
    closeDueDatePopup,
    closeMobilePlanCalendarPopup,
    loadCalendarCounts,
    openDueDatePopup,
    renderDueDateCalendar,
    renderPlanDateLabel,
    renderPlanDateSwitch,
    renderScheduleCalendar,
    setDueDateToToday,
    setScheduleDate,
    syncScheduleCalendarPlacement,
    updateDueDateLabel,
  };
}
