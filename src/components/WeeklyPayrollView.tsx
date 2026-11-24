import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Search,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  AttendanceRecord,
  WeeklyPaymentEntry,
  Worker,
  WorkZone,
} from '../types';
import {
  addDaysISO,
  formatRangeLabel,
  formatShortDate,
  getDatesInRangeISO,
  getShortDayLabel,
  getTodayISO,
  getWeekStartISO,
} from '../utils/date';
import { formatCurrency, formatHours, normalizeText } from '../utils/format';
import {
  buildGroupPayMessage,
  buildRangeSummaries,
  buildWorkerPayMessage,
  getPaymentKey,
  renderPayslipCanvasDataUrl,
  type WeeklyWorkerSummary,
} from '../utils/export';

interface WeeklyPayrollViewProps {
  rangeStartISO: string;
  rangeEndISO: string;
  onChangeRange: (startISO: string, endISO: string) => void;
  workers: Worker[];
  records: Record<string, AttendanceRecord>;
  payments: Record<string, WeeklyPaymentEntry>;
  settings: AppSettings;
  onTogglePayment: (paymentKey: string) => void;
  onExportExcel: () => void;
  onJumpToDate: (dateISO: string) => void;
}

export const WeeklyPayrollView: React.FC<WeeklyPayrollViewProps> = ({
  rangeStartISO,
  rangeEndISO,
  onChangeRange,
  workers,
  records,
  payments,
  settings,
  onTogglePayment,
  onExportExcel,
  onJumpToDate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState<'all' | WorkZone>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [payslipPreview, setPayslipPreview] = useState<{
    workerName: string;
    fileName: string;
    dataUrl: string;
  } | null>(null);

  const currentWeekStart = getWeekStartISO(getTodayISO());
  const rangeDays = useMemo(
    () => getDatesInRangeISO(rangeStartISO, rangeEndISO),
    [rangeStartISO, rangeEndISO],
  );

  const isShortGrid = rangeDays.length <= 10;

  const allSummaries = useMemo(
    () =>
      buildRangeSummaries(
        workers,
        records,
        payments,
        rangeStartISO,
        rangeEndISO,
        settings.defaultHourlyRate,
      ),
    [workers, records, payments, rangeStartISO, rangeEndISO, settings.defaultHourlyRate],
  );

  const workedSummaries = useMemo(
    () => allSummaries.filter((s) => s.totalHours > 0 || s.totalAmount > 0),
    [allSummaries],
  );

  const zoneScopedSummaries = useMemo(
    () =>
      zoneFilter === 'all'
        ? workedSummaries
        : workedSummaries.filter((s) => s.worker.zone === zoneFilter),
    [workedSummaries, zoneFilter],
  );

  const settlementTotals = useMemo(() => {
    let totalAmount = 0;
    let totalHours = 0;
    let paidAmount = 0;
    let paidCount = 0;
    let unpaidAmount = 0;
    let unpaidCount = 0;

    for (const s of zoneScopedSummaries) {
      totalAmount += s.totalAmount;
      totalHours += s.totalHours;
      if (s.paid) {
        paidAmount += s.totalAmount;
        paidCount += 1;
      } else {
        unpaidAmount += s.totalAmount;
        unpaidCount += 1;
      }
    }

    return {
      totalWorkers: zoneScopedSummaries.length,
      totalHours: Math.round(totalHours * 100) / 100,
      totalAmount,
      paidAmount,
      paidCount,
      unpaidAmount,
      unpaidCount,
    };
  }, [zoneScopedSummaries]);

  const filteredSummaries = useMemo(() => {
    const q = normalizeText(searchQuery);
    return zoneScopedSummaries.filter((s) => {
      if (statusFilter === 'paid' && !s.paid) return false;
      if (statusFilter === 'unpaid' && s.paid) return false;
      if (!q) return true;
      return (
        normalizeText(s.worker.fbName).includes(q) ||
        s.worker.krName.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
    });
  }, [zoneScopedSummaries, statusFilter, searchQuery]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr));
      }, 2200);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2200);
    }
  };

  const handleOpenPayslip = async (summary: WeeklyWorkerSummary) => {
    const dataUrl = await renderPayslipCanvasDataUrl(
      summary,
      rangeStartISO,
      rangeEndISO,
      settings,
    );
    if (!dataUrl) return;
    const safeName = summary.worker.fbName.replace(/\s+/g, '_');
    setPayslipPreview({
      workerName: summary.worker.krName
        ? `${summary.worker.fbName} (${summary.worker.krName})`
        : summary.worker.fbName,
      fileName: `Phieu_luong_${safeName}_${rangeStartISO}_${rangeEndISO}.png`,
      dataUrl,
    });
  };

  const handleDownloadPayslip = () => {
    if (!payslipPreview) return;
    const a = document.createElement('a');
    a.href = payslipPreview.dataUrl;
    a.download = payslipPreview.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Date Range Selector */}
      <section className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onChangeRange(
                addDaysISO(rangeStartISO, -7),
                addDaysISO(rangeEndISO, -7),
              )
            }
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            aria-label="Lùi 1 tuần"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Từ</span>
              <input
                type="date"
                value={rangeStartISO}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  onChangeRange(val, val > rangeEndISO ? val : rangeEndISO);
                }}
                className="min-h-[42px] px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Đến</span>
              <input
                type="date"
                value={rangeEndISO}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  onChangeRange(val < rangeStartISO ? val : rangeStartISO, val);
                }}
                className="min-h-[42px] px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onChangeRange(
                addDaysISO(rangeStartISO, 7),
                addDaysISO(rangeEndISO, 7),
              )
            }
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            aria-label="Tiến 1 tuần"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeRange(currentWeekStart, addDaysISO(currentWeekStart, 6))
            }
            className="min-h-[42px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
          >
            Tuần hiện tại
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              copyToClipboard(
                buildGroupPayMessage(
                  zoneScopedSummaries,
                  rangeStartISO,
                  rangeEndISO,
                  settings,
                ),
                '__group__',
              )
            }
            disabled={zoneScopedSummaries.length === 0}
            className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
          >
            {copiedId === '__group__' ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Đã copy tin nhắn nhóm</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-blue-600" />
                <span>Copy tin nhắn báo lương nhóm</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </section>

      {/* Settlement KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">
            Tổng quỹ lương ({formatRangeLabel(rangeStartISO, rangeEndISO)} ·{' '}
            {settlementTotals.totalWorkers} người · {formatHours(settlementTotals.totalHours)}h)
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatCurrency(settlementTotals.totalAmount, settings.currency)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã thanh toán ({settlementTotals.paidCount} người)</span>
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {formatCurrency(settlementTotals.paidAmount, settings.currency)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>Còn nợ / Chưa trả ({settlementTotals.unpaidCount} người)</span>
          </div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {formatCurrency(settlementTotals.unpaidAmount, settings.currency)}
          </div>
        </div>
      </section>

      {/* Payroll Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setZoneFilter('all')}
                className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                  zoneFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Cả 2 bảng
              </button>
              <button
                type="button"
                onClick={() => setZoneFilter('I동')}
                className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                  zoneFilter === 'I동' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                I 동
              </button>
              <button
                type="button"
                onClick={() => setZoneFilter('차동')}
                className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                  zoneFilter === '차동' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                차동
              </button>
            </div>

            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nhân sự..."
                className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tất cả ({zoneScopedSummaries.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unpaid')}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                statusFilter === 'unpaid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Chưa trả ({settlementTotals.unpaidCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('paid')}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                statusFilter === 'paid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Đã trả ({settlementTotals.paidCount})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-3.5 sticky left-0 z-20 bg-slate-50 border-r border-slate-200 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] min-w-[175px]">
                  Nhân sự (FB / Hàn)
                </th>
                {isShortGrid ? (
                  rangeDays.map((d) => (
                    <th key={d} className="py-3 px-2 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onJumpToDate(d)}
                        className="hover:text-blue-600 transition-colors"
                        title={`Xem chi tiết ngày ${formatShortDate(d)}`}
                      >
                        <div>{getShortDayLabel(d)}</div>
                        <div className="text-[10px] font-normal text-slate-400 tabular-nums">
                          {formatShortDate(d)}
                        </div>
                      </button>
                    </th>
                  ))
                ) : (
                  <th className="py-3 px-3 text-center whitespace-nowrap">Số ngày đi làm</th>
                )}
                <th className="py-3 px-3 text-right whitespace-nowrap">Tổng giờ</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Tổng tiền</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">Thanh toán</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Gửi lương</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td
                    colSpan={isShortGrid ? rangeDays.length + 5 : 6}
                    className="py-12 px-4 text-center text-slate-500"
                  >
                    <p className="text-sm font-medium text-slate-700">
                      Chưa có nhân sự nào phát sinh công trong khoảng ngày này
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Hãy điều chỉnh Từ ngày – Đến ngày hoặc chấm công ở tab Chấm công ngày.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s) => {
                  const payKey = getPaymentKey(rangeStartISO, rangeEndISO, s.worker.id);
                  return (
                    <tr key={s.worker.id} className="group hover:bg-slate-50/90 transition-colors">
                      <td className="py-3 px-3.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] min-w-[175px]">
                        <div className="font-semibold text-slate-900">{s.worker.fbName}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          {s.worker.krName && <span>{s.worker.krName}</span>}
                          {s.worker.krName && <span aria-hidden="true">·</span>}
                          <span className="text-blue-700 font-medium">{s.worker.zone}</span>
                        </div>
                      </td>

                      {isShortGrid ? (
                        rangeDays.map((d) => {
                          const hrs = s.dailyHours[d] || 0;
                          return (
                            <td
                              key={d}
                              className="py-3 px-2 text-center font-mono tabular-nums text-xs"
                            >
                              {hrs > 0 ? (
                                <span className="text-slate-800 font-medium">
                                  {formatHours(hrs)}h
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })
                      ) : (
                        <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700">
                          {s.daysWorked} ngày
                        </td>
                      )}

                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatHours(s.totalHours)}h
                      </td>

                      <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">
                        {formatCurrency(s.totalAmount, settings.currency)}
                      </td>

                      <td className="py-3 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => onTogglePayment(payKey)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                            s.paid
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                              : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          {s.paid ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Đã thanh toán</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-4 h-4 text-amber-600" />
                              <span>Chưa thanh toán</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                buildWorkerPayMessage(
                                  s,
                                  rangeStartISO,
                                  rangeEndISO,
                                  settings,
                                ),
                                s.worker.id,
                              )
                            }
                            className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 whitespace-nowrap"
                            title="Copy tin nhắn báo lương"
                          >
                            {copiedId === s.worker.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700">Đã copy</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                                <span>Copy tin</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenPayslip(s)}
                            className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 whitespace-nowrap"
                            title="Xem & Tải ảnh bảng lương"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span>Ảnh lương</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payslip PNG Preview Modal */}
      {payslipPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước ảnh bảng lương"
        >
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div className="font-semibold text-slate-900 text-sm sm:text-base truncate">
                Thẻ báo lương · {payslipPreview.workerName}
              </div>
              <button
                type="button"
                onClick={() => setPayslipPreview(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 overflow-y-auto flex justify-center">
              <img
                src={payslipPreview.dataUrl}
                alt={`Bảng lương ${payslipPreview.workerName}`}
                className="max-w-full rounded-lg border border-slate-200 shadow-sm"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPayslipPreview(null)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleDownloadPayslip}
                className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Tải ảnh bảng lương (.png)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
