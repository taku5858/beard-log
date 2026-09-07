export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function parseISO(dateStr) {
  // "YYYY-MM-DD" をローカル日付として解釈
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateJP(dateStr) {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateJPShort(dateStr) {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function daysBetween(fromISO, toISO) {
  const a = parseISO(fromISO);
  const b = parseISO(toISO);
  const ms = b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function daysFromToday(dateStr) {
  return daysBetween(todayISO(), dateStr);
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function weekdayJP(dateStr) {
  const w = ["日", "月", "火", "水", "木", "金", "土"];
  return w[parseISO(dateStr).getDay()];
}
