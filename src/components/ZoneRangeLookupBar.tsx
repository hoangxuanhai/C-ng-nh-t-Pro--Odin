import React, { useMemo, useState } from 'react';
import { CalendarSearch, Check, Copy, EyeOff, RotateCcw } from 'lucide-react';
import type { AppSettings, AttendanceRecord, Worker, WorkZone } from '../types';
import {
  addDaysISO,
  formatRangeLabel,
  formatShortDate,
  getDatesInRangeISO,
  getShortDayLabel,
  getWeekStartISO,
} from '../utils/date';
import { computeRecordAmount } from '../utils/export';
import { formatCurrency, formatHours } from '../utils/format';

interface ZoneRangeLookupBarProps {
  zone: WorkZone;
  selectedDate: string;
  workers: Worker[]; // already filtered to this zone & active
  records: Record<string, AttendanceRecord>;
  settings: AppSettings;
  onJumpToDate: (dateISO: string) => void;
}

export const ZoneRangeLookupBar: React.FC<ZoneRangeLookupBarProps> = ({
  zone,
  selectedDate,
  workers,
  records,
  settings,
  onJumpToDate,
}) => {
  const defaultWeekStart = getWeekStartISO(selectedDate);
  const [startDate, setStartDate] = useState<string>(defaultWeekStart);
  const [endDate, setEndDate] = useState<string>(addDaysISO(defaultWeekStart, 6));
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [onlyWorked, setOnlyWorked] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const normalizedStart = startDate <= endDate ? startDate : endDate;
  const normalizedEnd = startDate <= endDate ? endDate : startDate;

  const daysInRange = useMemo(
    () => getDatesInRangeISO(normalizedStart, normalizedEnd),
    [normalizedStart, normalizedEnd],
  );

  // Only show columns for days that either have at least 1 attendance entry, OR if <= 7 days show all days in range
  const displayDays = useMemo(() => {
    if (daysInRange.length <= 7) return daysInRange;
    const activeDays = daysInRange.filter((d) =>
      workers.some((w) => {
        const rec = records[`${d}__${w.id}`];
        const amt = computeRecordAmount(rec, w, settings.defaultHourlyRate);
        return (rec?.hours || 0) > 0 || amt > 0;
      }),
    );
    return activeDays.length > 0 ? activeDays : daysInRange.slice(0, 14);
  }, [daysInRange, workers, records, settings.defaultHourlyRate]);

  const rows = useMemo(() => {
    return workers
      .map((w) => {
        const dayMap: Record<string, { hours: number; amount: number }> = {};
        let totalHours = 0;
        let totalAmount = 0;
        let daysWorked = 0;

        for (const d of daysInRange) {
          const rec = records[`${d}__${w.id}`];
          const hrs = rec?.hours || 0;
          const amt = computeRecordAmount(rec, w, settings.defaultHourlyRate);
          dayMap[d] = { hours: hrs, amount: amt };
          totalHours += hrs;
          totalAmount += amt;
          if (hrs > 0 || amt > 0) daysWorked += 1;
        }

        return {
          worker: w,
          dayMap,
          totalHours: Math.round(totalHours * 100) / 100,
          totalAmount: Math.round(totalAmount),
          daysWorked,
        };
      })
      .filter((r) => (!onlyWorked ? true : r.totalHours > 0 || r.totalAmount > 0));
  }, [workers, daysInRange, records, settings.defaultHourlyRate, onlyWorked]);

  const columnTotals = useMemo(() => {
    const perDay: Record<string, number> = {};
    for (const d of displayDays) perDay[d] = 0;
    let grandTotal = 0;
    let grandHours = 0;

    for (const r of rows) {
      grandTotal += r.totalAmount;
      grandHours += r.totalHours;
      for (const d of displayDays) {
        perDay[d] += r.dayMap[d]?.amount || 0;
      }
    }
    return {
      perDay,
      grandTotal,
      grandHours: Math.round(grandHours * 100) / 100,
    };
  }, [rows, displayDays]);

  const handleCopySummary = async () => {
    const lines = rows.map((r, idx) => {
      const kr = r.worker.krName ? ` (${r.worker.krName})` : '';
      const dayDetails = daysInRange
        .filter((d) => (r.dayMap[d]?.amount || 0) > 0 || (r.dayMap[d]?.hours || 0) > 0)
        .map(
          (d) =>
            `${formatShortDate(d)}: ${formatCurrency(r.dayMap[d].amount, settings.currency)}`,
        )
        .join(', ');
      return `${idx + 1}. ${r.worker.fbName}${kr}: ${formatCurrency(r.totalAmount, settings.currency)} (${r.daysWorked} ngày · ${formatHours(r.totalHours)}h)${dayDetails ? ` [${dayDetails}]` : ''}`;
    });

    const text = [
      `[THỐNG KÊ TIỀN CÔNG BẢNG ${zone}]`,
      `Từ ngày ${formatRangeLabel(normalizedStart, normalizedEnd)} (${daysInRange.length} ngày)`,
      `-------------------------`,
      ...lines,
      `-------------------------`,
      `Tổng cộng (${rows.length} người): ${formatHours(columnTotals.grandHours)}h · ${formatCurrency(columnTotals.grandTotal, settings.currency)}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-b border-slate-200 bg-slate-50/70">
      {/* Toolbar inside each board */}
      <div className="px-4 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap">
            <CalendarSearch className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Tra cứu {zone}:</span>
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="text-[11px] font-medium text-slate-500">Từ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                if (e.target.value) {
                  setStartDate(e.target.value);
                  setIsExpanded(true);
                }
              }}
              className="min-h-[36px] px-2.5 py-1 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
            />
            <label className="text-[11px] font-medium text-slate-500">Đến</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                if (e.target.value) {
                  setEndDate(e.target.value);
                  setIsExpanded(true);
                }
              }}
              className="min-h-[36px] px-2.5 py-1 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const ws = getWeekStartISO(selectedDate);
                setStartDate(ws);
                setEndDate(addDaysISO(ws, 6));
                setIsExpanded(true);
              }}
              className="min-h-[34px] px-2.5 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md whitespace-nowrap"
            >
              Tuần này
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(addDaysISO(selectedDate, -6));
                setEndDate(selectedDate);
                setIsExpanded(true);
              }}
              className="min-h-[34px] px-2.5 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md whitespace-nowrap"
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(`${selectedDate.slice(0, 7)}-01`);
                setEndDate(selectedDate);
                setIsExpanded(true);
              }}
              className="min-h-[34px] px-2.5 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md whitespace-nowrap"
            >
              Tháng này
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              isExpanded
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isExpanded ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ẩn bảng tra cứu ({rows.length} người)</span>
              </>
            ) : (
              <>
                <CalendarSearch className="w-3.5 h-3.5" />
                <span>
                  Xem tiền hằng ngày & tổng ({rows.length} người ·{' '}
                  {formatCurrency(columnTotals.grandTotal, settings.currency)})
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Daily Breakdown & Total Panel for this Board */}
      {isExpanded && (
        <div className="bg-white border-t border-slate-200">
          <div className="px-4 py-2.5 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-700">
              <strong className="text-slate-900">
                Bảng {zone} ({formatRangeLabel(normalizedStart, normalizedEnd)})
              </strong>
              <span className="text-slate-400 mx-1.5">·</span>
              <span>
                {rows.length} người đi làm · Tổng{' '}
                <strong className="text-blue-700 font-mono">
                  {formatCurrency(columnTotals.grandTotal, settings.currency)}
                </strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyWorked}
                  onChange={(e) => setOnlyWorked(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Chỉ hiện người đi làm</span>
              </label>

              <button
                type="button"
                onClick={handleCopySummary}
                disabled={rows.length === 0}
                className="min-h-[34px] px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-40"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Đã copy</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-blue-600" />
                    <span>Copy bảng {zone}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const ws = getWeekStartISO(selectedDate);
                  setStartDate(ws);
                  setEndDate(addDaysISO(ws, 6));
                }}
                className="min-h-[34px] px-2 py-1 text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                title="Đặt lại về tuần đang xem"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-3 w-10 text-center">STT</th>
                  <th className="py-2.5 px-3.5 sticky left-0 z-20 bg-slate-50 border-r border-slate-200 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] min-w-[160px]">
                    Nhân sự đi làm
                  </th>
                  {displayDays.map((d) => (
                    <th key={d} className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onJumpToDate(d)}
                        className="hover:text-blue-600 transition-colors text-right"
                        title={`Chuyển đến ngày ${formatShortDate(d)}`}
                      >
                        <div>
                          {getShortDayLabel(d)} {formatShortDate(d)}
                        </div>
                      </button>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Tổng giờ</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap text-blue-700">
                    Tổng số tiền
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-sm">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={displayDays.length + 4}
                      className="py-8 px-4 text-center text-xs sm:text-sm text-slate-500"
                    >
                      Không có ai đi làm ở bảng {zone} trong khoảng{' '}
                      {formatRangeLabel(normalizedStart, normalizedEnd)}.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr
                      key={r.worker.id}
                      className="group hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-2 px-3 text-center text-xs font-mono text-slate-400 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] min-w-[160px]">
                        <div className="font-semibold text-slate-900">{r.worker.fbName}</div>
                        {r.worker.krName && (
                          <div className="text-xs text-slate-500">{r.worker.krName}</div>
                        )}
                      </td>

                      {displayDays.map((d) => {
                        const dayEntry = r.dayMap[d];
                        const amt = dayEntry?.amount || 0;
                        const hrs = dayEntry?.hours || 0;
                        return (
                          <td
                            key={d}
                            onClick={() => onJumpToDate(d)}
                            className="py-2 px-2.5 text-right font-mono tabular-nums cursor-pointer hover:bg-blue-50/60"
                            title={`Nhấn để xem/sửa ngày ${formatShortDate(d)}`}
                          >
                            {amt > 0 || hrs > 0 ? (
                              <div>
                                <div className="text-xs font-semibold text-slate-900">
                                  {formatCurrency(amt, settings.currency)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {formatHours(hrs)}h
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-700 whitespace-nowrap">
                        <div>{formatHours(r.totalHours)}h</div>
                        <div className="text-[10px] font-normal text-slate-400">
                          {r.daysWorked} ngày
                        </div>
                      </td>

                      <td className="py-2 px-3.5 text-right font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap bg-blue-50/30">
                        {formatCurrency(r.totalAmount, settings.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-xs sm:text-sm">
                    <td className="py-2.5 px-3 text-center text-slate-500">Σ</td>
                    <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 text-slate-900">
                      TỔNG CỘNG ({zone})
                    </td>
                    {displayDays.map((d) => (
                      <td
                        key={d}
                        className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 text-xs"
                      >
                        {columnTotals.perDay[d] > 0
                          ? formatCurrency(columnTotals.perDay[d], settings.currency)
                          : '—'}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatHours(columnTotals.grandHours)}h
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-blue-700">
                      {formatCurrency(columnTotals.grandTotal, settings.currency)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
