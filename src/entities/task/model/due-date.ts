export function isOverdue(date, time = null, currentDate = undefined, currentTime = undefined) {
  const now = new Date();
  const today = currentDate || now.toLocaleDateString("en-CA");
  if (!date) return false;
  if (date < today) return true;
  if (date > today || !time) return false;

  const clock = currentTime || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return `${time}:00` < clock;
}

export function isDueWithinNextHour(date, time, currentDate = undefined) {
  if (!date || !time || date !== (currentDate || new Date().toLocaleDateString("en-CA"))) {
    return false;
  }
  const now = new Date();
  const dueAt = new Date(`${date}T${time}:00`);
  const millisecondsUntilDue = dueAt.getTime() - now.getTime();
  return millisecondsUntilDue >= 0 && millisecondsUntilDue <= 60 * 60 * 1000;
}

