import * as XLSX from 'xlsx';
import type {
  AppSettings,
  AttendanceRecord,
  ColumnConfig,
  WeeklyPaymentEntry,
  Worker,
} from '../types';
import {
  addDaysISO,
  formatFullDate,
  formatRangeLabel,
  formatShortDate,
  getDatesInRangeISO,
  getShortDayLabel,
} from './date';
import {
  formatCurrency,
  formatHours,
  getEffectiveHourlyRate,
  getRecordHourlyRate,
} from './format';

export interface WeeklyWorkerSummary {
  worker: Worker;
  dailyHours: Record<string, number>;
  dailyAmounts: Record<string, number>;
  dailyNotes: Record<string, string>;
  totalHours: number;
  totalAmount: number;
  daysWorked: number;
  paid: boolean;
  paidAt?: string;
}

export function getPaymentKey(
  startISO: string,
  endISO: string,
  workerId: string,
): string {
  const s = startISO <= endISO ? startISO : endISO;
  const e = startISO <= endISO ? endISO : startISO;
  if (e === addDaysISO(s, 6)) {
    return `${s}__${workerId}`;
  }
  return `${s}_${e}__${workerId}`;
}

export function computeRecordAmount(
  record: AttendanceRecord | undefined,
  worker: Worker,
  defaultHourlyRate: number,
): number {
  if (!record) return 0;
  if (record.manualAmount !== null && Number.isFinite(record.manualAmount)) {
    return record.manualAmount;
  }
  const rate = getRecordHourlyRate(record, worker, defaultHourlyRate);
  return Math.round((record.hours || 0) * rate);
}

export function buildRangeSummaries(
  workers: Worker[],
  records: Record<string, AttendanceRecord>,
  payments: Record<string, WeeklyPaymentEntry>,
  startISO: string,
  endISO: string,
  defaultHourlyRate: number,
): WeeklyWorkerSummary[] {
  const days = getDatesInRangeISO(startISO, endISO);

  return workers.map((worker) => {
    const dailyHours: Record<string, number> = {};
    const dailyAmounts: Record<string, number> = {};
    const dailyNotes: Record<string, string> = {};
    let totalHours = 0;
    let totalAmount = 0;
    let daysWorked = 0;

    for (const d of days) {
      const rec = records[`${d}__${worker.id}`];
      const hrs = rec?.hours || 0;
      const amt = computeRecordAmount(rec, worker, defaultHourlyRate);
      dailyHours[d] = hrs;
      dailyAmounts[d] = amt;
      dailyNotes[d] = rec?.note || '';
      totalHours += hrs;
      totalAmount += amt;
      if (hrs > 0 || amt > 0) {
        daysWorked += 1;
      }
    }

    const payEntry = payments[getPaymentKey(startISO, endISO, worker.id)];
    return {
      worker,
      dailyHours,
      dailyAmounts,
      dailyNotes,
      totalHours: Math.round(totalHours * 100) / 100,
      totalAmount: Math.round(totalAmount),
      daysWorked,
      paid: Boolean(payEntry?.paid),
      paidAt: payEntry?.paidAt,
    };
  });
}

export function exportAttendanceExcel(params: {
  selectedDate: string;
  rangeStartISO: string;
  rangeEndISO: string;
  workers: Worker[];
  columns: ColumnConfig[];
  records: Record<string, AttendanceRecord>;
  payments: Record<string, WeeklyPaymentEntry>;
  settings: AppSettings;
}): void {
  const {
    selectedDate,
    rangeStartISO,
    rangeEndISO,
    workers,
    columns,
    records,
    payments,
    settings,
  } = params;
  const wb = XLSX.utils.book_new();
  const rangeDays = getDatesInRangeISO(rangeStartISO, rangeEndISO);
  const summaries = buildRangeSummaries(
    workers,
    records,
    payments,
    rangeStartISO,
    rangeEndISO,
    settings.defaultHourlyRate,
  );
  const summaryMap = new Map(summaries.map((s) => [s.worker.id, s]));

  // Sheet 1: Tổng kết khoảng ngày
  const weeklyRows = summaries
    .filter((s) => s.totalHours > 0 || s.totalAmount > 0)
    .map((s, index) => {
      const row: Record<string, string | number> = {
        STT: index + 1,
        'Bảng / Khu': s.worker.zone,
        'Tên tiếng Việt / FB': s.worker.fbName,
        'Tên tiếng Hàn': s.worker.krName,
        'Đơn giá/giờ': getEffectiveHourlyRate(s.worker, settings.defaultHourlyRate),
      };
      if (rangeDays.length <= 14) {
        for (const d of rangeDays) {
          const colName = `${getShortDayLabel(d)} (${formatShortDate(d)})`;
          row[colName] = s.dailyHours[d] || 0;
        }
      } else {
        row['Số ngày đi làm'] = s.daysWorked;
      }
      row['Tổng giờ'] = s.totalHours;
      row[`Tổng tiền (${settings.currency})`] = s.totalAmount;
      row['Trạng thái'] = s.paid ? 'Đã thanh toán' : 'Chưa thanh toán';
      return row;
    });

  const wsWeekly = XLSX.utils.json_to_sheet(
    weeklyRows.length > 0
      ? weeklyRows
      : [{ 'Thông báo': 'Chưa có dữ liệu chấm công trong khoảng ngày đã chọn' }],
  );
  XLSX.utils.book_append_sheet(wb, wsWeekly, 'Tong_ket');

  // Helper to build daily rows for a list of workers
  const visibleCols = columns.filter((c) => c.visible);
  const buildDailySheetRows = (list: Worker[]) =>
    list.map((w, idx) => {
      const rec = records[`${selectedDate}__${w.id}`];
      const row: Record<string, string | number | boolean> = {
        STT: idx + 1,
        'Bảng / Khu': w.zone,
      };
      for (const col of visibleCols) {
        if (col.systemKey === 'fbName') {
          row[col.label] = w.fbName;
        } else if (col.systemKey === 'krName') {
          row[col.label] = w.krName;
        } else if (col.systemKey === 'hours') {
          row[col.label] = rec?.hours ?? 0;
        } else if (col.systemKey === 'amount') {
          row[col.label] = computeRecordAmount(rec, w, settings.defaultHourlyRate);
        } else if (col.systemKey === 'weeklyTotal') {
          row[col.label] = summaryMap.get(w.id)?.totalAmount ?? 0;
        } else if (col.systemKey === 'note') {
          row[col.label] = rec?.note ?? '';
        } else {
          const val = rec?.customFields?.[col.key];
          if (col.type === 'checkbox') {
            row[col.label] = val ? 'Có' : 'Không';
          } else {
            row[col.label] = val ?? '';
          }
        }
      }
      return row;
    });

  const iDongRows = buildDailySheetRows(workers.filter((w) => w.zone === 'I동'));
  if (iDongRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(iDongRows), 'Bang_I_Dong');
  }
  const chaDongRows = buildDailySheetRows(workers.filter((w) => w.zone === '차동'));
  if (chaDongRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chaDongRows), 'Bang_Cha_Dong');
  }

  // Sheet 4: Nhật ký chi tiết trong khoảng ngày
  const detailRows: Array<Record<string, string | number>> = [];
  for (const d of rangeDays) {
    for (const w of workers) {
      const rec = records[`${d}__${w.id}`];
      const amt = computeRecordAmount(rec, w, settings.defaultHourlyRate);
      if (!rec || (rec.hours === 0 && amt === 0 && !rec.note)) continue;
      detailRows.push({
        Ngày: formatFullDate(d),
        Thứ: getShortDayLabel(d),
        'Bảng / Khu': w.zone,
        'Tên tiếng Việt / FB': w.fbName,
        'Tên tiếng Hàn': w.krName,
        'Số giờ': rec.hours,
        'Đơn giá/giờ': getRecordHourlyRate(rec, w, settings.defaultHourlyRate),
        [`Số tiền (${settings.currency})`]: amt,
        'Ghi chú': rec.note || '',
      });
    }
  }
  if (detailRows.length > 0) {
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Chi_tiet_ngay');
  }

  XLSX.writeFile(wb, `Bang_luong_${rangeStartISO}_den_${rangeEndISO}.xlsx`);
}

export function buildWorkerPayMessage(
  summary: WeeklyWorkerSummary,
  rangeStartISO: string,
  rangeEndISO: string,
  settings: AppSettings,
): string {
  const days = getDatesInRangeISO(rangeStartISO, rangeEndISO);
  const workedDayLines = days
    .filter((d) => summary.dailyHours[d] > 0 || summary.dailyAmounts[d] > 0)
    .map((d) => {
      const notePart = summary.dailyNotes[d] ? ` (${summary.dailyNotes[d]})` : '';
      return `- ${getShortDayLabel(d)} ${formatShortDate(d)}: ${formatHours(summary.dailyHours[d])}h → ${formatCurrency(summary.dailyAmounts[d], settings.currency)}${notePart}`;
    });

  const nameLine = summary.worker.krName
    ? `${summary.worker.fbName} (${summary.worker.krName})`
    : summary.worker.fbName;

  return [
    `[BÁO LƯƠNG · Bảng ${summary.worker.zone}]`,
    `Nhân sự: ${nameLine}`,
    `Từ ngày: ${formatRangeLabel(rangeStartISO, rangeEndISO)}`,
    ...workedDayLines,
    `-------------------------`,
    `Tổng giờ: ${formatHours(summary.totalHours)} giờ (${summary.daysWorked} ngày)`,
    `Tổng tiền: ${formatCurrency(summary.totalAmount, settings.currency)}`,
    `Trạng thái: ${summary.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}`,
  ].join('\n');
}

export function buildGroupPayMessage(
  summaries: WeeklyWorkerSummary[],
  rangeStartISO: string,
  rangeEndISO: string,
  settings: AppSettings,
): string {
  const active = summaries.filter((s) => s.totalHours > 0 || s.totalAmount > 0);
  const grandTotal = active.reduce((acc, s) => acc + s.totalAmount, 0);
  const grandHours = active.reduce((acc, s) => acc + s.totalHours, 0);

  const lines = active.map((s, idx) => {
    const kr = s.worker.krName ? ` (${s.worker.krName})` : '';
    const status = s.paid ? '✓ Đã trả' : '○ Chưa trả';
    return `${idx + 1}. [${s.worker.zone}] ${s.worker.fbName}${kr}: ${formatHours(s.totalHours)}h = ${formatCurrency(s.totalAmount, settings.currency)} [${status}]`;
  });

  return [
    `[TỔNG KẾT LƯƠNG · ${settings.teamName}]`,
    `Thời gian: ${formatRangeLabel(rangeStartISO, rangeEndISO)}`,
    `-------------------------`,
    ...lines,
    `-------------------------`,
    `Tổng cộng (${active.length} người): ${formatHours(grandHours)} giờ · ${formatCurrency(grandTotal, settings.currency)}`,
  ].join('\n');
}

export async function renderPayslipCanvasDataUrl(
  summary: WeeklyWorkerSummary,
  rangeStartISO: string,
  rangeEndISO: string,
  settings: AppSettings,
): Promise<string> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const days = getDatesInRangeISO(rangeStartISO, rangeEndISO);
  const width = 760;
  const rowHeight = 46;
  const workedDays = days.filter(
    (d) => summary.dailyHours[d] > 0 || summary.dailyAmounts[d] > 0,
  );
  const height = 390 + Math.max(1, workedDays.length) * rowHeight;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Top bar
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, 118);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 13px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  ctx.fillText(`${settings.teamName.toUpperCase()} · BẢNG ${summary.worker.zone}`, 36, 38);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 26px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  const titleName = summary.worker.krName
    ? `${summary.worker.fbName} · ${summary.worker.krName}`
    : summary.worker.fbName;
  ctx.fillText(titleName, 36, 76);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 14px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  ctx.fillText(`Phiếu lương: ${formatRangeLabel(rangeStartISO, rangeEndISO)}`, 36, 102);

  // Status tag on header right
  const statusLabel = summary.paid ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN';
  ctx.fillStyle = summary.paid ? '#059669' : '#D97706';
  ctx.fillRect(width - 196, 32, 160, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusLabel, width - 116, 53);
  ctx.textAlign = 'left';

  // Summary strip
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(36, 140, width - 72, 82);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.strokeRect(36, 140, width - 72, 82);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Số ngày làm', 56, 168);
  ctx.fillText('Tổng số giờ', 250, 168);
  ctx.fillText('Tổng tiền nhận', 460, 168);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 22px "JetBrains Mono", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${summary.daysWorked} ngày`, 56, 202);
  ctx.fillText(`${formatHours(summary.totalHours)} giờ`, 250, 202);

  ctx.fillStyle = '#1D4ED8';
  ctx.fillText(formatCurrency(summary.totalAmount, settings.currency), 460, 202);

  // Table Header
  let y = 258;
  ctx.fillStyle = '#475569';
  ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NGÀY LÀM', 36, y);
  ctx.fillText('GHI CHÚ', 190, y);
  ctx.textAlign = 'right';
  ctx.fillText('SỐ GIỜ', 540, y);
  ctx.fillText('THÀNH TIỀN', width - 36, y);
  ctx.textAlign = 'left';

  y += 12;
  ctx.strokeStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(36, y);
  ctx.lineTo(width - 36, y);
  ctx.stroke();

  y += 28;
  if (workedDays.length === 0) {
    ctx.fillStyle = '#64748B';
    ctx.font = '400 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Chưa có dữ liệu chấm công trong khoảng ngày này.', 36, y);
  } else {
    for (const d of workedDays) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${getShortDayLabel(d)} · ${formatFullDate(d)}`, 36, y);

      ctx.fillStyle = '#64748B';
      ctx.font = '400 13px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
      const noteStr = (summary.dailyNotes[d] || '—').slice(0, 30);
      ctx.fillText(noteStr, 190, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = '500 14px "JetBrains Mono", sans-serif';
      ctx.fillText(`${formatHours(summary.dailyHours[d])}h`, 540, y);
      ctx.font = '600 14px "JetBrains Mono", sans-serif';
      ctx.fillText(
        formatCurrency(summary.dailyAmounts[d], settings.currency),
        width - 36,
        y,
      );
      ctx.textAlign = 'left';

      ctx.strokeStyle = '#F1F5F9';
      ctx.beginPath();
      ctx.moveTo(36, y + 14);
      ctx.lineTo(width - 36, y + 14);
      ctx.stroke();

      y += rowHeight;
    }
  }

  // Footer
  const footerY = height - 34;
  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 12px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  const rateText = formatCurrency(
    getEffectiveHourlyRate(summary.worker, settings.defaultHourlyRate),
    settings.currency,
  );
  ctx.fillText(`Đơn giá: ${rateText}/giờ`, 36, footerY);
  if (summary.worker.bankInfo) {
    ctx.textAlign = 'right';
    ctx.fillText(`TK: ${summary.worker.bankInfo}`, width - 36, footerY);
    ctx.textAlign = 'left';
  }

  return canvas.toDataURL('image/png');
}
