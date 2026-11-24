import React, { useMemo, useState } from 'react';
import {
  CalendarRange,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Columns3,
  FileSpreadsheet,
  Pencil,
  RotateCcw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { ZONE_META } from '../data/mockData';
import type {
  AppSettings,
  AttendanceRecord,
  ColumnConfig,
  WeeklyPaymentEntry,
  Worker,
  WorkZone,
} from '../types';
import {
  addDaysISO,
  formatFullDate,
  formatRangeLabel,
  formatShortDate,
  formatWeekRangeLabel,
  getDatesInRangeISO,
  getFullDayLabel,
  getShortDayLabel,
  getTodayISO,
  getWeekDaysISO,
  getWeekStartISO,
} from '../utils/date';
import {
  formatCurrency,
  formatHours,
  getEffectiveHourlyRate,
  getRecordHourlyRate,
  normalizeText,
} from '../utils/format';
import { buildRangeSummaries, computeRecordAmount } from '../utils/export';
import { ZoneRangeLookupBar } from './ZoneRangeLookupBar';

interface DailyAttendanceViewProps {
  selectedDate: string;
  onChangeDate: (nextDate: string) => void;
  summaryStartDate: string;
  summaryEndDate: string;
  onChangeSummaryRange: (startISO: string, endISO: string, isCustom: boolean) => void;
  workers: Worker[];
  columns: ColumnConfig[];
  records: Record<string, AttendanceRecord>;
  payments: Record<string, WeeklyPaymentEntry>;
  settings: AppSettings;
  onUpdateRecord: (
    dateISO: string,
    workerId: string,
    updater: (prev: AttendanceRecord) => AttendanceRecord,
  ) => void;
  onUpdateWorker: (workerId: string, patch: Partial<Worker>) => void;
  onQuickAddWorker: (
    fbName: string,
    krName: string,
    hourlyRate: number,
    zone: WorkZone,
  ) => void;
  onApplyHourlyRate: (params: {
    target: 'default' | 'all' | WorkZone | { workerId: string };
    mode: 'permanent' | 'date_only';
    rate: number;
    dateISO: string;
    recalcAmountOnDate: boolean;
  }) => void;
  onOpenColumnManager: () => void;
  onOpenAutoModal: () => void;
  onExportExcel: () => void;
}

interface EditingCell {
  workerId: string;
  colId: string;
}

export const DailyAttendanceView: React.FC<DailyAttendanceViewProps> = ({
  selectedDate,
  onChangeDate,
  summaryStartDate,
  summaryEndDate,
  onChangeSummaryRange,
  workers,
  columns,
  records,
  payments,
  settings,
  onUpdateRecord,
  onUpdateWorker,
  onQuickAddWorker,
  onApplyHourlyRate,
  onOpenColumnManager,
  onOpenAutoModal,
  onExportExcel,
}) => {
  const [boardView, setBoardView] = useState<'all' | WorkZone>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWorkedToday, setOnlyWorkedToday] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newFb, setNewFb] = useState('');
  const [newKr, setNewKr] = useState('');
  const [newZone, setNewZone] = useState<WorkZone>('I동');
  const [newRate, setNewRate] = useState(String(settings.defaultHourlyRate));
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [draftRangeStart, setDraftRangeStart] = useState(summaryStartDate);
  const [draftRangeEnd, setDraftRangeEnd] = useState(summaryEndDate);
  const [rateModalTarget, setRateModalTarget] = useState<
    null | { kind: 'worker'; worker: Worker } | { kind: 'bulk'; scope: 'default' | 'all' | WorkZone }
  >(null);
  const [rateModalDraft, setRateModalDraft] = useState<string>('');
  const [rateModalScope, setRateModalScope] = useState<'default' | 'all' | WorkZone>('default');
  const [rateModalMode, setRateModalMode] = useState<'permanent' | 'date_only'>('permanent');
  const [rateModalRecalc, setRateModalRecalc] = useState(true);

  const todayISO = getTodayISO();
  const weekStartISO = getWeekStartISO(selectedDate);
  const weekDays = useMemo(() => getWeekDaysISO(weekStartISO), [weekStartISO]);
  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  const stickyColId = useMemo(() => {
    const fb = visibleColumns.find((c) => c.systemKey === 'fbName');
    if (fb) return fb.id;
    const kr = visibleColumns.find((c) => c.systemKey === 'krName');
    if (kr) return kr.id;
    return visibleColumns[0]?.id ?? null;
  }, [visibleColumns]);

  const activeWorkers = useMemo(() => workers.filter((w) => w.active), [workers]);

  const rangeSummaries = useMemo(
    () =>
      buildRangeSummaries(
        workers,
        records,
        payments,
        summaryStartDate,
        summaryEndDate,
        settings.defaultHourlyRate,
      ),
    [workers, records, payments, summaryStartDate, summaryEndDate, settings.defaultHourlyRate],
  );

  const rangeSummaryMap = useMemo(() => {
    const map = new Map<string, { totalAmount: number; totalHours: number; daysWorked: number }>();
    rangeSummaries.forEach((s) =>
      map.set(s.worker.id, {
        totalAmount: s.totalAmount,
        totalHours: s.totalHours,
        daysWorked: s.daysWorked,
      }),
    );
    return map;
  }, [rangeSummaries]);

  const openRangePicker = () => {
    setDraftRangeStart(summaryStartDate);
    setDraftRangeEnd(summaryEndDate);
    setIsRangeModalOpen(true);
  };

  const openWorkerRateModal = (worker: Worker) => {
    const rec = records[`${selectedDate}__${worker.id}`];
    const activeRate = getRecordHourlyRate(rec, worker, settings.defaultHourlyRate);
    setRateModalTarget({ kind: 'worker', worker });
    setRateModalDraft(String(activeRate));
    setRateModalMode(rec?.hourlyRate && rec.hourlyRate > 0 ? 'date_only' : 'permanent');
    setRateModalRecalc(true);
  };

  const openBulkRateModal = (scope: 'default' | 'all' | WorkZone) => {
    setRateModalTarget({ kind: 'bulk', scope });
    setRateModalScope(scope);
    setRateModalDraft(String(settings.defaultHourlyRate));
    setRateModalMode('permanent');
    setRateModalRecalc(true);
  };

  const rangeDaysCount = useMemo(
    () => getDatesInRangeISO(summaryStartDate, summaryEndDate).length,
    [summaryStartDate, summaryEndDate],
  );

  const stats = useMemo(() => {
    let workedToday = 0;
    let totalHoursToday = 0;
    let totalAmountToday = 0;

    for (const w of activeWorkers) {
      const rec = records[`${selectedDate}__${w.id}`];
      const hrs = rec?.hours || 0;
      const amt = computeRecordAmount(rec, w, settings.defaultHourlyRate);
      if (hrs > 0 || amt > 0) workedToday += 1;
      totalHoursToday += hrs;
      totalAmountToday += amt;
    }

    const totalRangeAmount = rangeSummaries.reduce((acc, s) => acc + s.totalAmount, 0);

    return {
      workedToday,
      totalActive: activeWorkers.length,
      totalHoursToday: Math.round(totalHoursToday * 100) / 100,
      totalAmountToday: Math.round(totalAmountToday),
      totalRangeAmount: Math.round(totalRangeAmount),
    };
  }, [activeWorkers, records, selectedDate, settings.defaultHourlyRate, rangeSummaries]);

  const dayCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of weekDays) {
      let count = 0;
      for (const w of activeWorkers) {
        const rec = records[`${d}__${w.id}`];
        if (rec && (rec.hours > 0 || (rec.manualAmount ?? 0) > 0)) {
          count += 1;
        }
      }
      map.set(d, count);
    }
    return map;
  }, [weekDays, activeWorkers, records]);

  const filterWorkersForZone = (zone: WorkZone) => {
    const q = normalizeText(searchQuery);
    return activeWorkers.filter((w) => {
      if (w.zone !== zone) return false;
      if (onlyWorkedToday) {
        const rec = records[`${selectedDate}__${w.id}`];
        if (!rec || (rec.hours <= 0 && (rec.manualAmount ?? 0) <= 0)) return false;
      }
      if (!q) return true;
      const fbMatch = normalizeText(w.fbName).includes(q);
      const krMatch = w.krName.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return fbMatch || krMatch;
    });
  };

  const getRecordOrDefault = (workerId: string): AttendanceRecord => {
    return (
      records[`${selectedDate}__${workerId}`] ?? {
        date: selectedDate,
        workerId,
        hours: 0,
        manualAmount: null,
        note: '',
        customFields: {},
      }
    );
  };

  const startEditing = (worker: Worker, col: ColumnConfig) => {
    const rec = getRecordOrDefault(worker.id);
    if (col.type === 'computed_weekly') return;

    if (col.type === 'checkbox') {
      const curr = Boolean(rec.customFields?.[col.key]);
      onUpdateRecord(selectedDate, worker.id, (prev) => ({
        ...prev,
        customFields: { ...prev.customFields, [col.key]: !curr },
      }));
      return;
    }

    let initialVal = '';
    if (col.systemKey === 'fbName') initialVal = worker.fbName;
    else if (col.systemKey === 'krName') initialVal = worker.krName;
    else if (col.systemKey === 'hours') initialVal = rec.hours ? String(rec.hours) : '';
    else if (col.systemKey === 'amount') {
      const amt = computeRecordAmount(rec, worker, settings.defaultHourlyRate);
      initialVal = amt ? String(amt) : '';
    } else if (col.systemKey === 'note') initialVal = rec.note || '';
    else {
      const customVal = rec.customFields?.[col.key];
      initialVal = customVal !== undefined && customVal !== null ? String(customVal) : '';
    }

    setEditingCell({ workerId: worker.id, colId: col.id });
    setEditDraft(initialVal);
  };

  const commitEdit = (worker: Worker, col: ColumnConfig, overrideDraft?: string) => {
    const valStr = overrideDraft !== undefined ? overrideDraft : editDraft;

    if (col.systemKey === 'fbName') {
      const trimmed = valStr.trim();
      if (trimmed) onUpdateWorker(worker.id, { fbName: trimmed });
    } else if (col.systemKey === 'krName') {
      onUpdateWorker(worker.id, { krName: valStr.trim() });
    } else if (col.systemKey === 'hours') {
      const parsed = parseFloat(valStr.replace(',', '.'));
      const hours = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
      onUpdateRecord(selectedDate, worker.id, (prev) => ({
        ...prev,
        hours,
      }));
    } else if (col.systemKey === 'amount') {
      const trimmed = valStr.trim();
      if (trimmed === '') {
        onUpdateRecord(selectedDate, worker.id, (prev) => ({
          ...prev,
          manualAmount: null,
        }));
      } else {
        const parsed = parseFloat(trimmed.replace(/,/g, ''));
        if (Number.isFinite(parsed) && parsed >= 0) {
          onUpdateRecord(selectedDate, worker.id, (prev) => ({
            ...prev,
            manualAmount: Math.round(parsed),
          }));
        }
      }
    } else if (col.systemKey === 'note') {
      onUpdateRecord(selectedDate, worker.id, (prev) => ({
        ...prev,
        note: valStr.trim(),
      }));
    } else {
      const parsedVal =
        col.type === 'number' || col.type === 'currency'
          ? parseFloat(valStr.replace(',', '.')) || 0
          : valStr;
      onUpdateRecord(selectedDate, worker.id, (prev) => ({
        ...prev,
        customFields: {
          ...prev.customFields,
          [col.key]: parsedVal,
        },
      }));
    }

    setEditingCell(null);
  };

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFb.trim() && !newKr.trim()) return;
    const rate = Number(newRate) || settings.defaultHourlyRate;
    onQuickAddWorker(newFb.trim() || newKr.trim(), newKr.trim(), rate, newZone);
    setNewFb('');
    setNewKr('');
    setNewRate(String(settings.defaultHourlyRate));
    setShowQuickAdd(false);
  };

  const zonesToRender: WorkZone[] =
    boardView === 'all' ? ['I동', '차동'] : [boardView];

  const renderZoneTable = (zone: WorkZone) => {
    const zoneWorkers = filterWorkersForZone(zone);
    const meta = ZONE_META[zone];

    let zoneHours = 0;
    let zoneAmount = 0;
    let zoneWorkedCount = 0;
    let zoneRangeTotalAmount = 0;

    for (const w of zoneWorkers) {
      const rec = records[`${selectedDate}__${w.id}`];
      const hrs = rec?.hours || 0;
      const amt = computeRecordAmount(rec, w, settings.defaultHourlyRate);
      if (hrs > 0 || amt > 0) zoneWorkedCount += 1;
      zoneHours += hrs;
      zoneAmount += amt;
      zoneRangeTotalAmount += rangeSummaryMap.get(w.id)?.totalAmount || 0;
    }

    return (
      <section
        key={zone}
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        {/* Board Header */}
        <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">{meta.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ca làm việc: {meta.shiftLabel} · Ngày {formatFullDate(selectedDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs sm:text-sm font-medium text-slate-700 tabular-nums">
            <span>
              Đi làm: <strong className="text-slate-900">{zoneWorkedCount}/{zoneWorkers.length}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              Tổng giờ: <strong className="text-slate-900 font-mono">{formatHours(zoneHours)}h</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              Thành tiền:{' '}
              <strong className="text-blue-700 font-mono">
                {formatCurrency(zoneAmount, settings.currency)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => openBulkRateModal(zone)}
              className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md inline-flex items-center gap-1 transition-colors"
              title={`Điều chỉnh đơn giá theo giờ cho bảng ${zone}`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Đổi giá/giờ ({zone})</span>
            </button>
          </div>
        </div>

        {/* Independent Từ ngày – Đến ngày Lookup & Daily Breakdown Toolbar for this board */}
        <ZoneRangeLookupBar
          zone={zone}
          selectedDate={selectedDate}
          workers={activeWorkers.filter((w) => w.zone === zone)}
          records={records}
          settings={settings}
          onJumpToDate={onChangeDate}
        />

        {/* Horizontal Scrollable Data Grid */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-3 w-12 text-center">STT</th>
                {visibleColumns.map((col) => {
                  const isSticky = col.id === stickyColId;
                  const isNumeric =
                    col.type === 'number' ||
                    col.type === 'currency' ||
                    col.type === 'computed_weekly';
                  return (
                    <th
                      key={col.id}
                      className={`py-3 px-3.5 whitespace-nowrap ${
                        isNumeric
                          ? 'text-right'
                          : col.type === 'checkbox'
                            ? 'text-center'
                            : 'text-left'
                      } ${
                        isSticky
                          ? 'sticky left-0 z-20 bg-slate-50 border-r border-slate-200 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] min-w-[155px]'
                          : ''
                      }`}
                    >
                      {col.systemKey === 'weeklyTotal' ? (
                        <button
                          type="button"
                          onClick={openRangePicker}
                          className="inline-flex flex-col items-end text-right group/hdr hover:text-blue-700 transition-colors cursor-pointer"
                          title="Nhấn để chọn từ ngày nào đến ngày nào"
                        >
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <span>{col.label}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                          </span>
                          <span className="text-[10px] font-normal text-blue-600 group-hover/hdr:underline tabular-nums">
                            {formatRangeLabel(summaryStartDate, summaryEndDate)} ({rangeDaysCount} ngày)
                          </span>
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-sm">
              {zoneWorkers.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="py-8 px-4 text-center text-slate-500 text-xs sm:text-sm"
                  >
                    Không có nhân sự nào trong bảng {zone} khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                zoneWorkers.map((worker, idx) => {
                  const rec = getRecordOrDefault(worker.id);
                  const computedAmt = computeRecordAmount(
                    rec,
                    worker,
                    settings.defaultHourlyRate,
                  );
                  const isManualAmt = rec.manualAmount !== null;
                  const rangeInfo = rangeSummaryMap.get(worker.id);
                  const weeklyTotal = rangeInfo?.totalAmount || 0;
                  const workerRate = getRecordHourlyRate(
                    rec,
                    worker,
                    settings.defaultHourlyRate,
                  );
                  const isDateCustomRate = Boolean(rec.hourlyRate && rec.hourlyRate > 0);
                  const isWorkerCustomRate =
                    !isDateCustomRate &&
                    worker.hourlyRate > 0 &&
                    worker.hourlyRate !== settings.defaultHourlyRate;

                  return (
                    <tr
                      key={worker.id}
                      className="group hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-center text-xs font-mono text-slate-400 tabular-nums">
                        {idx + 1}
                      </td>
                      {visibleColumns.map((col) => {
                        const isSticky = col.id === stickyColId;
                        const isEditing =
                          editingCell?.workerId === worker.id &&
                          editingCell?.colId === col.id;
                        const isNumeric =
                          col.type === 'number' ||
                          col.type === 'currency' ||
                          col.type === 'computed_weekly';

                        const stickyClasses = isSticky
                          ? 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] min-w-[155px]'
                          : '';

                        if (isEditing) {
                          return (
                            <td
                              key={col.id}
                              className={`py-1.5 px-2 align-top ${stickyClasses}`}
                            >
                              <div className="space-y-1.5">
                                <input
                                  autoFocus
                                  type={
                                    col.type === 'number' || col.type === 'currency'
                                      ? 'number'
                                      : 'text'
                                  }
                                  step={col.systemKey === 'hours' ? '0.5' : 'any'}
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  onBlur={() => commitEdit(worker, col)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      commitEdit(worker, col);
                                    } else if (e.key === 'Escape') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  className={`w-full min-h-[38px] px-2.5 py-1 text-sm bg-white border-2 border-blue-600 rounded-md focus:outline-none ${
                                    isNumeric
                                      ? 'text-right font-mono tabular-nums'
                                      : 'text-left'
                                  }`}
                                />
                                {col.systemKey === 'hours' && (
                                  <div
                                    className="flex flex-wrap gap-1"
                                    onMouseDown={(e) => e.preventDefault()}
                                  >
                                    {[0, 4, 5, 8, 8.5, 10].map((preset) => (
                                      <button
                                        key={preset}
                                        type="button"
                                        onClick={() =>
                                          commitEdit(worker, col, String(preset))
                                        }
                                        className="px-2 py-0.5 text-[11px] font-mono font-medium bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded"
                                      >
                                        {preset}h
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {col.systemKey === 'amount' && isManualAmt && (
                                  <div onMouseDown={(e) => e.preventDefault()}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onUpdateRecord(selectedDate, worker.id, (prev) => ({
                                          ...prev,
                                          manualAmount: null,
                                        }));
                                        setEditingCell(null);
                                      }}
                                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>Tính lại tự động ({formatHours(rec.hours)}h)</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col.systemKey === 'fbName') {
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 cursor-pointer ${stickyClasses}`}
                              title="Nhấn vào tên để sửa tên · Nhấn vào đơn giá/giờ bên dưới để chỉnh tiền theo giờ"
                            >
                              <div className="font-semibold text-slate-900 leading-snug">
                                {worker.fbName}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openWorkerRateModal(worker);
                                }}
                                className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition-colors ${
                                  isDateCustomRate
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                                    : isWorkerCustomRate
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200 font-semibold'
                                      : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200'
                                }`}
                                title="Nhấn để điều chỉnh số tiền làm theo giờ"
                              >
                                <span>{formatCurrency(workerRate, settings.currency)}/h</span>
                                <Pencil className="w-2.5 h-2.5 opacity-70" />
                              </button>
                            </td>
                          );
                        }

                        if (col.systemKey === 'krName') {
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 cursor-pointer ${stickyClasses}`}
                              title="Nhấn để sửa tên tiếng Hàn"
                            >
                              <span
                                className={
                                  worker.krName
                                    ? 'font-medium text-slate-800'
                                    : 'text-slate-400 italic text-xs'
                                }
                              >
                                {worker.krName || 'Thêm tên Hàn...'}
                              </span>
                            </td>
                          );
                        }

                        if (col.systemKey === 'hours') {
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 text-right cursor-pointer font-mono tabular-nums ${stickyClasses}`}
                              title="Nhấn để nhập số giờ"
                            >
                              <span
                                className={`inline-block min-w-[44px] py-1 px-2 rounded-md ${
                                  rec.hours > 0
                                    ? 'bg-blue-50/80 text-blue-800 font-semibold'
                                    : 'text-slate-400 hover:bg-slate-100'
                                }`}
                              >
                                {rec.hours > 0 ? `${formatHours(rec.hours)}h` : '0'}
                              </span>
                            </td>
                          );
                        }

                        if (col.systemKey === 'amount') {
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 text-right cursor-pointer ${stickyClasses}`}
                              title="Nhấn để sửa tay số tiền"
                            >
                              <div className="font-mono tabular-nums font-medium text-slate-900">
                                {computedAmt > 0
                                  ? formatCurrency(computedAmt, settings.currency)
                                  : '—'}
                              </div>
                              {isManualAmt ? (
                                <div className="text-[10px] text-amber-700 font-medium">
                                  Nhập tay
                                </div>
                              ) : rec.hours > 0 ? (
                                <div className="text-[10px] text-slate-400 tabular-nums font-mono">
                                  {formatHours(rec.hours)}h × {new Intl.NumberFormat('en-US').format(workerRate)}
                                </div>
                              ) : null}
                            </td>
                          );
                        }

                        if (col.systemKey === 'weeklyTotal') {
                          return (
                            <td
                              key={col.id}
                              onClick={openRangePicker}
                              className={`py-2.5 px-3.5 text-right font-mono tabular-nums cursor-pointer bg-slate-50/40 hover:bg-blue-50/50 transition-colors ${stickyClasses}`}
                              title="Nhấn để chọn khoảng ngày tính tổng"
                            >
                              <div className="font-semibold text-slate-900">
                                {weeklyTotal > 0
                                  ? formatCurrency(weeklyTotal, settings.currency)
                                  : '—'}
                              </div>
                              {rangeInfo && rangeInfo.daysWorked > 0 && (
                                <div className="text-[10px] text-slate-500 font-normal">
                                  {formatHours(rangeInfo.totalHours)}h · {rangeInfo.daysWorked} ngày
                                </div>
                              )}
                            </td>
                          );
                        }

                        if (col.systemKey === 'note') {
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 cursor-pointer max-w-[220px] ${stickyClasses}`}
                              title="Nhấn để sửa ghi chú"
                            >
                              <span
                                className={
                                  rec.note
                                    ? 'text-slate-700 text-xs sm:text-sm'
                                    : 'text-slate-400 text-xs'
                                }
                              >
                                {rec.note || 'Thêm ghi chú...'}
                              </span>
                            </td>
                          );
                        }

                        // Custom column
                        const customVal = rec.customFields?.[col.key];
                        if (col.type === 'checkbox') {
                          const checked = Boolean(customVal);
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 text-center cursor-pointer ${stickyClasses}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {}}
                                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer pointer-events-none"
                              />
                            </td>
                          );
                        }

                        if (col.type === 'currency') {
                          const num = Number(customVal) || 0;
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 text-right cursor-pointer font-mono tabular-nums text-slate-800 ${stickyClasses}`}
                            >
                              {num !== 0
                                ? formatCurrency(num, settings.currency)
                                : '—'}
                            </td>
                          );
                        }

                        if (col.type === 'number') {
                          const num = Number(customVal) || 0;
                          return (
                            <td
                              key={col.id}
                              onClick={() => startEditing(worker, col)}
                              className={`py-2.5 px-3.5 text-right cursor-pointer font-mono tabular-nums text-slate-800 ${stickyClasses}`}
                            >
                              {num !== 0 ? num : '—'}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.id}
                            onClick={() => startEditing(worker, col)}
                            className={`py-2.5 px-3.5 cursor-pointer text-slate-700 text-xs sm:text-sm ${stickyClasses}`}
                          >
                            {customVal ? (
                              String(customVal)
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>

            {zoneWorkers.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-sm">
                  <td className="py-2.5 px-3 text-center text-xs text-slate-500">Σ</td>
                  {visibleColumns.map((col) => {
                    const isSticky = col.id === stickyColId;
                    const stickyClasses = isSticky
                      ? 'sticky left-0 z-10 bg-slate-50 border-r border-slate-200'
                      : '';
                    if (col.id === stickyColId) {
                      return (
                        <td key={col.id} className={`py-2.5 px-3.5 text-slate-800 ${stickyClasses}`}>
                          TỔNG CỘNG ({zone})
                        </td>
                      );
                    }
                    if (col.systemKey === 'hours') {
                      return (
                        <td
                          key={col.id}
                          className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-900"
                        >
                          {formatHours(zoneHours)}h
                        </td>
                      );
                    }
                    if (col.systemKey === 'amount') {
                      return (
                        <td
                          key={col.id}
                          className="py-2.5 px-3.5 text-right font-mono tabular-nums text-blue-700"
                        >
                          {formatCurrency(zoneAmount, settings.currency)}
                        </td>
                      );
                    }
                    if (col.systemKey === 'weeklyTotal') {
                      return (
                        <td
                          key={col.id}
                          className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-900"
                        >
                          {formatCurrency(zoneRangeTotalAmount, settings.currency)}
                        </td>
                      );
                    }
                    return <td key={col.id} className="py-2.5 px-3.5" />;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-500">Đi làm hôm nay (2 bảng)</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums font-mono">
              {stats.workedToday}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              / {stats.totalActive} người
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-500">Tổng giờ hôm nay</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums font-mono">
              {formatHours(stats.totalHoursToday)}
            </span>
            <span className="text-xs text-slate-500">giờ</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-500">Tiền dự kiến hôm nay</div>
          <div className="mt-1.5 text-lg sm:text-2xl font-bold text-blue-700 tabular-nums font-mono truncate">
            {formatCurrency(stats.totalAmountToday, settings.currency)}
          </div>
        </div>

        <button
          type="button"
          onClick={openRangePicker}
          className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 sm:p-4 text-left transition-colors group"
          title="Nhấn để chọn từ ngày nào đến ngày nào"
        >
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between gap-1">
            <span className="truncate">
              Tổng cộng ({formatRangeLabel(summaryStartDate, summaryEndDate)})
            </span>
            <CalendarRange className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          </div>
          <div className="mt-1.5 text-lg sm:text-2xl font-bold text-slate-900 tabular-nums font-mono truncate group-hover:text-blue-700">
            {formatCurrency(stats.totalRangeAmount, settings.currency)}
          </div>
        </button>
      </section>

      {/* Date & Week Selector Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeDate(addDaysISO(selectedDate, -1))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Ngày trước"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onChangeDate(e.target.value)}
              className="min-h-[44px] px-3 py-2 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
            />

            <button
              type="button"
              onClick={() => onChangeDate(addDaysISO(selectedDate, 1))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Ngày sau"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {selectedDate !== todayISO && (
              <button
                type="button"
                onClick={() => onChangeDate(todayISO)}
                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
              >
                Hôm nay
              </button>
            )}

            <div className="text-xs sm:text-sm text-slate-600 font-medium pl-1">
              {getFullDayLabel(selectedDate)} · Tuần {formatWeekRangeLabel(weekStartISO)}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => onChangeDate(addDaysISO(weekStartISO, -7))}
              className="min-h-[38px] px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap"
            >
              « Tuần trước
            </button>
            <button
              type="button"
              onClick={() => onChangeDate(addDaysISO(weekStartISO, 7))}
              className="min-h-[38px] px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap"
            >
              Tuần sau »
            </button>
          </div>
        </div>

        {/* 7-Day Horizontal Quick Switcher */}
        <div className="grid grid-cols-7 gap-1.5 overflow-x-auto pb-0.5">
          {weekDays.map((dayISO) => {
            const isSelected = dayISO === selectedDate;
            const isToday = dayISO === todayISO;
            const count = dayCountsMap.get(dayISO) || 0;
            return (
              <button
                key={dayISO}
                type="button"
                onClick={() => onChangeDate(dayISO)}
                className={`min-h-[54px] px-1.5 py-1.5 rounded-lg border text-center transition-colors flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : isToday
                      ? 'bg-blue-50/70 border-blue-200 text-slate-900 hover:bg-blue-100/70'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-[11px] font-semibold">
                  {getShortDayLabel(dayISO)}
                </span>
                <span
                  className={`text-xs font-mono tabular-nums ${
                    isSelected ? 'text-slate-200' : 'text-slate-600'
                  }`}
                >
                  {formatShortDate(dayISO)}
                </span>
                <span
                  className={`text-[10px] mt-0.5 tabular-nums ${
                    isSelected
                      ? 'text-blue-200'
                      : count > 0
                        ? 'text-emerald-700 font-medium'
                        : 'text-slate-400'
                  }`}
                >
                  {count > 0 ? `${count} ng` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Toolbar: Board Selector + Search + Actions */}
      <section className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Board Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setBoardView('all')}
                className={`min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md whitespace-nowrap transition-colors ${
                  boardView === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cả 2 bảng (I 동 & 차동)
              </button>
              <button
                type="button"
                onClick={() => setBoardView('I동')}
                className={`min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md whitespace-nowrap transition-colors ${
                  boardView === 'I동'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bảng I 동 ({activeWorkers.filter((w) => w.zone === 'I동').length})
              </button>
              <button
                type="button"
                onClick={() => setBoardView('차동')}
                className={`min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md whitespace-nowrap transition-colors ${
                  boardView === '차동'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bảng 차동 ({activeWorkers.filter((w) => w.zone === '차동').length})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenAutoModal}
              className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-blue-600" />
              <span>Quét ảnh / Nhập nhanh</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (boardView !== 'all') setNewZone(boardView);
                setShowQuickAdd((v) => !v);
              }}
              className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4 text-blue-600" />
              <span>Thêm nhân sự</span>
            </button>

            <button
              type="button"
              onClick={() => openBulkRateModal('default')}
              className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
              title="Điều chỉnh số tiền làm theo giờ"
            >
              <Coins className="w-4 h-4 text-blue-600" />
              <span>Đơn giá: {formatCurrency(settings.defaultHourlyRate, settings.currency)}/h</span>
            </button>

            <button
              type="button"
              onClick={onOpenColumnManager}
              className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Columns3 className="w-4 h-4 text-slate-600" />
              <span>Quản lý cột</span>
            </button>

            <button
              type="button"
              onClick={onExportExcel}
              className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Search & Worked filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhanh Tên tiếng Việt / FB hoặc Tên tiếng Hàn..."
              className="w-full min-h-[42px] pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                aria-label="Xóa tìm kiếm"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setOnlyWorkedToday(false)}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                !onlyWorkedToday ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tất cả ({activeWorkers.length})
            </button>
            <button
              type="button"
              onClick={() => setOnlyWorkedToday(true)}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                onlyWorkedToday ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Có đi làm ({stats.workedToday})
            </button>
          </div>
        </div>

        {/* Inline Quick Add Worker Drawer */}
        {showQuickAdd && (
          <form
            onSubmit={handleQuickAddSubmit}
            className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-lg flex flex-col md:flex-row items-stretch md:items-end gap-2.5"
          >
            <div className="w-full md:w-36">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Bảng chấm công *
              </label>
              <select
                value={newZone}
                onChange={(e) => setNewZone(e.target.value as WorkZone)}
                className="w-full min-h-[42px] px-2.5 py-1.5 text-sm font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="I동">I 동 (18h-24h)</option>
                <option value="차동">차동 (20h-01h)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Tên tiếng Việt / FB *
              </label>
              <input
                type="text"
                value={newFb}
                onChange={(e) => setNewFb(e.target.value)}
                placeholder="VD: Minh Hoàng"
                className="w-full min-h-[42px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Tên tiếng Hàn (Hangul)
              </label>
              <input
                type="text"
                value={newKr}
                onChange={(e) => setNewKr(e.target.value)}
                placeholder="VD: 민호앙"
                className="w-full min-h-[42px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="w-full md:w-32">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Đơn giá/giờ
              </label>
              <input
                type="number"
                min={0}
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setShowQuickAdd(false)}
                className="min-h-[42px] px-3 py-2 bg-white border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50"
              >
                Hủy
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Render Separate Tables: I 동 and 차동 */}
      <div className="space-y-5">
        {zonesToRender.map((zone) => renderZoneTable(zone))}
      </div>

      {/* Custom Date Range Picker Modal for Tổng tiền cuối tuần */}
      {isRangeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Chọn khoảng ngày tính tổng tiền"
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Tính tổng tiền theo khoảng ngày
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn Từ ngày – Đến ngày để tự động cộng dồn cột Tổng tiền cuối tuần
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRangeModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Từ ngày
                  </label>
                  <input
                    type="date"
                    value={draftRangeStart}
                    onChange={(e) => e.target.value && setDraftRangeStart(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Đến ngày
                  </label>
                  <input
                    type="date"
                    value={draftRangeEnd}
                    onChange={(e) => e.target.value && setDraftRangeEnd(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">Chọn nhanh</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const mon = getWeekStartISO(selectedDate);
                      const sun = addDaysISO(mon, 6);
                      setDraftRangeStart(mon);
                      setDraftRangeEnd(sun);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                  >
                    Tuần đang xem (T2 – CN)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftRangeStart(addDaysISO(selectedDate, -6));
                      setDraftRangeEnd(selectedDate);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                  >
                    7 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftRangeStart(addDaysISO(selectedDate, -13));
                      setDraftRangeEnd(selectedDate);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                  >
                    14 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const monthStart = `${selectedDate.slice(0, 7)}-01`;
                      setDraftRangeStart(monthStart);
                      setDraftRangeEnd(selectedDate);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                  >
                    Từ đầu tháng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftRangeStart(selectedDate);
                      setDraftRangeEnd(selectedDate);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                  >
                    Chỉ ngày {formatShortDate(selectedDate)}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                Đang chọn:{' '}
                <strong>
                  {formatRangeLabel(draftRangeStart, draftRangeEnd)} (
                  {getDatesInRangeISO(draftRangeStart, draftRangeEnd).length} ngày)
                </strong>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsRangeModalOpen(false)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = draftRangeStart <= draftRangeEnd ? draftRangeStart : draftRangeEnd;
                  const e = draftRangeStart <= draftRangeEnd ? draftRangeEnd : draftRangeStart;
                  onChangeSummaryRange(s, e, true);
                  setIsRangeModalOpen(false);
                }}
                className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Áp dụng tính tổng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hourly Rate Adjustment Modal */}
      {rateModalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Điều chỉnh số tiền làm theo giờ"
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {rateModalTarget.kind === 'worker'
                      ? `Đơn giá/giờ: ${rateModalTarget.worker.fbName}`
                      : 'Điều chỉnh tiền làm theo giờ'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {rateModalTarget.kind === 'worker'
                      ? `${rateModalTarget.worker.krName ? `${rateModalTarget.worker.krName} · ` : ''}Bảng ${rateModalTarget.worker.zone}`
                      : 'Thay đổi mức lương theo giờ cho mặc định hoặc từng bảng'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRateModalTarget(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {rateModalTarget.kind === 'bulk' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Phạm vi áp dụng
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'default', label: 'Mặc định chung' },
                        { id: 'all', label: 'Cả 2 bảng (I 동 & 차동)' },
                        { id: 'I동', label: 'Chỉ bảng I 동' },
                        { id: '차동', label: 'Chỉ bảng 차동' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRateModalScope(opt.id)}
                        className={`min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                          rateModalScope === opt.id
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Số tiền / 1 giờ ({settings.currency})
                </label>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step={settings.currency === 'KRW' ? 500 : 1000}
                  value={rateModalDraft}
                  onChange={(e) => setRateModalDraft(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 text-base font-bold font-mono tabular-nums border-2 border-blue-600 rounded-lg focus:outline-none"
                />

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(settings.currency === 'KRW'
                    ? [10000, 11000, 12000, 13000, 14000, 15000, 18000, 20000]
                    : [40000, 50000, 60000, 75000, 100000]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRateModalDraft(String(preset))}
                      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border transition-colors ${
                        Number(rateModalDraft) === preset
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-200'
                      }`}
                    >
                      {new Intl.NumberFormat('en-US').format(preset)}
                    </button>
                  ))}
                </div>
              </div>

              {(rateModalTarget.kind === 'worker' || rateModalScope !== 'default') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Thời gian áp dụng
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setRateModalMode('permanent')}
                      className={`min-h-[38px] px-2 text-xs font-semibold rounded-md transition-colors ${
                        rateModalMode === 'permanent'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Áp dụng lâu dài
                    </button>
                    <button
                      type="button"
                      onClick={() => setRateModalMode('date_only')}
                      className={`min-h-[38px] px-2 text-xs font-semibold rounded-md transition-colors ${
                        rateModalMode === 'date_only'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Chỉ ngày {formatShortDate(selectedDate)}
                    </button>
                  </div>
                </div>
              )}

              {rateModalTarget.kind === 'worker' && (
                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-slate-700 flex items-center justify-between gap-2">
                  <span>
                    Ước tính ngày {formatShortDate(selectedDate)} (
                    {formatHours(getRecordOrDefault(rateModalTarget.worker.id).hours)}h):
                  </span>
                  <strong className="font-mono text-sm text-blue-700 tabular-nums">
                    {formatCurrency(
                      Math.round(
                        (getRecordOrDefault(rateModalTarget.worker.id).hours || 0) *
                          (Number(rateModalDraft) || 0),
                      ),
                      settings.currency,
                    )}
                  </strong>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rateModalRecalc}
                  onChange={(e) => setRateModalRecalc(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>
                  Tự động tính lại cột Thành tiền ngày {formatShortDate(selectedDate)} theo đơn giá mới
                </span>
              </label>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              {rateModalTarget.kind === 'worker' ? (
                <button
                  type="button"
                  onClick={() => {
                    onApplyHourlyRate({
                      target: { workerId: rateModalTarget.worker.id },
                      mode: 'permanent',
                      rate: 0,
                      dateISO: selectedDate,
                      recalcAmountOnDate: rateModalRecalc,
                    });
                    setRateModalTarget(null);
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-blue-700 underline"
                >
                  Về mặc định ({formatCurrency(settings.defaultHourlyRate, settings.currency)}/h)
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setRateModalTarget(null)}
                  className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parsed = Number(rateModalDraft);
                    if (!Number.isFinite(parsed) || parsed < 0) return;
                    if (rateModalTarget.kind === 'worker') {
                      onApplyHourlyRate({
                        target: { workerId: rateModalTarget.worker.id },
                        mode: rateModalMode,
                        rate: parsed,
                        dateISO: selectedDate,
                        recalcAmountOnDate: rateModalRecalc,
                      });
                    } else {
                      onApplyHourlyRate({
                        target: rateModalScope,
                        mode: rateModalScope === 'default' ? 'permanent' : rateModalMode,
                        rate: parsed,
                        dateISO: selectedDate,
                        recalcAmountOnDate: rateModalRecalc,
                      });
                    }
                    setRateModalTarget(null);
                  }}
                  className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
