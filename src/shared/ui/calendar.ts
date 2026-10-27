import { escapeHtml } from "../lib/html.ts";
import { dateValue } from "../lib/date.ts";

type CalendarOptions = {
  calendar: Element;
  monthLabel: HTMLElement;
  grid: HTMLElement;
  month: Date;
  selectedValue: string;
  locale: string;
  today: string;
  taskCounts?: Map<string, number>;
  onSelect: (value: string) => void;
  onMonthChange: (month: Date) => void;
};

export function renderCalendar({
  calendar,
  monthLabel,
  grid,
  month,
  selectedValue,
  locale,
  today,
  taskCounts = new Map(),
  onSelect,
  onMonthChange,
}: CalendarOptions) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  monthLabel.textContent = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(firstDay);

  const weekInfoLocale = new Intl.Locale(locale) as Intl.Locale & {
    weekInfo?: { firstDay: number };
  };
  const weekStart = (weekInfoLocale.weekInfo?.firstDay || 1) % 7;
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 7 + ((weekStart + index) % 7)));
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(date);
  });
  const offset = (firstDay.getDay() - weekStart + 7) % 7;
  const cells = weekdays.map(
    (day) => `<span class="calendar-weekday" aria-hidden="true">${escapeHtml(day)}</span>`,
  );
  for (let index = 0; index < offset; index += 1) {
    cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = dateValue(new Date(year, monthIndex, day));
    const count = taskCounts.get(value) || 0;
    const date = new Date(year, monthIndex, day);
    const label = new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date);
    cells.push(
      `<button type="button" class="calendar-day${value === selectedValue ? " is-selected" : ""}${value === today ? " is-today" : ""}" data-calendar-date="${value}" aria-label="${escapeHtml(label)}${count ? `, ${count}` : ""}" aria-pressed="${value === selectedValue}"><span>${day}</span>${count ? '<i aria-hidden="true"></i>' : ""}</button>`,
    );
  }
  grid.innerHTML = cells.join("");
  grid.querySelectorAll<HTMLButtonElement>("[data-calendar-date]").forEach((button) => {
    button.onclick = () => onSelect(button.dataset.calendarDate || "");
  });
  calendar
    .querySelectorAll<HTMLButtonElement>("[data-calendar-shift], [data-due-calendar-shift]")
    .forEach((button) => {
      button.onclick = () =>
        onMonthChange(
          new Date(
            year,
            monthIndex + Number(button.dataset.calendarShift ?? button.dataset.dueCalendarShift),
            1,
          ),
        );
    });
}
