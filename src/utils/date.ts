const DAY_SHORT_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAY_FULL_VI = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getTodayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, delta: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Returns Monday YYYY-MM-DD of the week containing `isoDate` */
export function getWeekStartISO(isoDate: string): string {
  const d = parseISODate(isoDate);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMon);
  return toISODate(d);
}

/** Returns 7 ISO date strings [Mon, Tue, Wed, Thu, Fri, Sat, Sun] */
export function getWeekDaysISO(weekStartISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i));
}

export function getShortDayLabel(iso: string): string {
  const d = parseISODate(iso);
  return DAY_SHORT_VI[d.getDay()];
}

export function getFullDayLabel(iso: string): string {
  const d = parseISODate(iso);
  return DAY_FULL_VI[d.getDay()];
}

export function formatShortDate(iso: string): string {
  const d = parseISODate(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatFullDate(iso: string): string {
  const d = parseISODate(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatWeekRangeLabel(weekStartISO: string): string {
  const weekEndISO = addDaysISO(weekStartISO, 6);
  return `T2 ${formatShortDate(weekStartISO)} – CN ${formatFullDate(weekEndISO)}`;
}

export function getDatesInRangeISO(startISO: string, endISO: string): string[] {
  if (!startISO || !endISO) return [];
  const s = startISO <= endISO ? startISO : endISO;
  const e = startISO <= endISO ? endISO : startISO;
  const start = parseISODate(s);
  const end = parseISODate(e);
  const result: string[] = [];
  const cursor = new Date(start.getTime());
  let guard = 0;
  while (cursor <= end && guard < 120) {
    result.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return result;
}

export function formatRangeLabel(startISO: string, endISO: string): string {
  const s = startISO <= endISO ? startISO : endISO;
  const e = startISO <= endISO ? endISO : startISO;
  if (s === e) return formatFullDate(s);
  return `${formatShortDate(s)} – ${formatFullDate(e)}`;
}
