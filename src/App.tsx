import React, { useEffect, useState } from 'react';
import {
  CalendarCheck2,
  Camera,
  CheckCircle2,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { ColumnManagerModal } from './components/ColumnManagerModal';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AutoMobileInstallPrompt, PWAInstallButton } from './components/PWAInstallButton';
import { SettingsModal } from './components/SettingsModal';
import { SmartAutoAttendanceModal } from './components/SmartAutoAttendanceModal';
import { WeeklyPayrollView } from './components/WeeklyPayrollView';
import { WorkersMasterView } from './components/WorkersMasterView';
import { TARGET_DATE_ISO, ZONE_META, createMockData, DEFAULT_COLUMNS } from './data/mockData';
import type {
  ActiveTab,
  AppDataState,
  AppSettings,
  AttendanceRecord,
  ColumnConfig,
  ParsedAttendanceCandidate,
  Worker,
  WorkZone,
} from './types';
import { addDaysISO, formatFullDate, getTodayISO, getWeekStartISO } from './utils/date';
import { formatCurrency, getEffectiveHourlyRate } from './utils/format';
import { exportAttendanceExcel } from './utils/export';
import { loadAppState, saveAppState } from './utils/storage';

function splitExtractedName(rawName: string): { fbName: string; krName: string } {
  const trimmed = rawName.trim();
  const parenMatch = trimmed.match(/^(.+?)\s*[（(](.+?)[)）]\s*$/);
  if (parenMatch) {
    const p1 = parenMatch[1].trim();
    const p2 = parenMatch[2].trim();
    const p1HasHangul = /[\uAC00-\uD7AF]/.test(p1);
    const p2HasHangul = /[\uAC00-\uD7AF]/.test(p2);
    if (p1HasHangul && !p2HasHangul) return { fbName: p2, krName: p1 };
    return { fbName: p1, krName: p2 };
  }
  const hasHangul = /[\uAC00-\uD7AF]/.test(trimmed);
  if (hasHangul) {
    return { fbName: trimmed, krName: trimmed };
  }
  return { fbName: trimmed, krName: '' };
}

export default function App() {
  const [state, setState] = useState<AppDataState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(TARGET_DATE_ISO);
  const [summaryStartDate, setSummaryStartDate] = useState<string>(() =>
    getWeekStartISO(TARGET_DATE_ISO),
  );
  const [summaryEndDate, setSummaryEndDate] = useState<string>(() =>
    addDaysISO(getWeekStartISO(TARGET_DATE_ISO), 6),
  );
  const [isCustomRange, setIsCustomRange] = useState(false);

  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const handleChangeDate = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (!isCustomRange) {
      const ws = getWeekStartISO(nextDate);
      setSummaryStartDate(ws);
      setSummaryEndDate(addDaysISO(ws, 6));
    }
  };

  const handleChangeSummaryRange = (
    startISO: string,
    endISO: string,
    custom: boolean,
  ) => {
    setSummaryStartDate(startISO);
    setSummaryEndDate(endISO);
    setIsCustomRange(custom);
  };

  const handleUpdateRecord = (
    dateISO: string,
    workerId: string,
    updater: (prev: AttendanceRecord) => AttendanceRecord,
  ) => {
    setState((prev) => {
      const key = `${dateISO}__${workerId}`;
      const existing: AttendanceRecord = prev.records[key] ?? {
        date: dateISO,
        workerId,
        hours: 0,
        manualAmount: null,
        note: '',
        customFields: {},
      };
      return {
        ...prev,
        records: {
          ...prev.records,
          [key]: updater(existing),
        },
      };
    });
  };

  const handleUpdateWorker = (workerId: string, patch: Partial<Worker>) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) => (w.id === workerId ? { ...w, ...patch } : w)),
    }));
  };

  const handleAddWorker = (workerInput: Omit<Worker, 'id' | 'createdAt'>) => {
    const newWorker: Worker = {
      ...workerInput,
      id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: getTodayISO(),
    };
    setState((prev) => ({
      ...prev,
      workers: [...prev.workers, newWorker],
    }));
    showToast(`Đã thêm nhân sự "${newWorker.fbName}"`);
  };

  const handleQuickAddWorker = (
    fbName: string,
    krName: string,
    hourlyRate: number,
    zone: WorkZone,
  ) => {
    handleAddWorker({
      fbName,
      krName,
      zone,
      hourlyRate,
      active: true,
    });
  };

  const handleDeleteWorker = (workerId: string) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.filter((w) => w.id !== workerId),
    }));
    showToast('Đã xóa nhân sự khỏi danh sách.');
  };

  const handleTogglePayment = (paymentKey: string) => {
    setState((prev) => {
      const curr = prev.payments[paymentKey]?.paid ?? false;
      return {
        ...prev,
        payments: {
          ...prev.payments,
          [paymentKey]: {
            paid: !curr,
            paidAt: !curr ? getTodayISO() : undefined,
          },
        },
      };
    });
  };

  const handleApplyCandidates = (
    candidates: ParsedAttendanceCandidate[],
    mode: 'overwrite' | 'accumulate',
    applyDateISO: string,
  ) => {
    let createdCount = 0;
    let appliedCount = 0;

    setState((prev) => {
      const nextWorkers = [...prev.workers];
      const nextRecords = { ...prev.records };

      for (const item of candidates) {
        let targetWorkerId = item.matchedWorkerId;
        let workerZone: WorkZone = item.zone;
        let workerRate = prev.settings.defaultHourlyRate;

        if (!targetWorkerId) {
          const split = splitExtractedName(item.rawName);
          const created: Worker = {
            id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fbName: split.fbName,
            krName: item.krName || split.krName,
            zone: item.zone,
            hourlyRate: prev.settings.defaultHourlyRate,
            active: true,
            createdAt: getTodayISO(),
          };
          nextWorkers.push(created);
          targetWorkerId = created.id;
          createdCount += 1;
        } else {
          const found = nextWorkers.find((w) => w.id === targetWorkerId);
          if (found) {
            workerZone = found.zone;
            workerRate = getEffectiveHourlyRate(found, prev.settings.defaultHourlyRate);
            if (!found.krName && item.krName) {
              found.krName = item.krName;
            }
          }
        }

        const key = `${applyDateISO}__${targetWorkerId}`;
        const existing: AttendanceRecord = nextRecords[key] ?? {
          date: applyDateISO,
          workerId: targetWorkerId,
          hours: 0,
          manualAmount: null,
          note: '',
          customFields: {
            shift: ZONE_META[workerZone].shiftLabel,
          },
        };

        const itemHours = item.hours !== null ? item.hours : 0;
        const nextHours =
          mode === 'accumulate'
            ? Math.round((existing.hours + itemHours) * 100) / 100
            : itemHours;

        let nextManualAmount: number | null = null;
        if (item.amount !== null) {
          if (mode === 'accumulate') {
            const existingAmt =
              existing.manualAmount !== null
                ? existing.manualAmount
                : Math.round(existing.hours * workerRate);
            nextManualAmount = existingAmt + item.amount;
          } else {
            // If hours > 0 and amount equals exact auto rate calculation, keep auto-calc clean; else store explicit amount
            const autoAmt = Math.round(nextHours * workerRate);
            nextManualAmount = nextHours > 0 && autoAmt === item.amount ? null : item.amount;
          }
        } else if (mode === 'accumulate' && existing.manualAmount !== null) {
          nextManualAmount = existing.manualAmount + Math.round(itemHours * workerRate);
        }

        const nextNote =
          mode === 'accumulate' && existing.note && item.note
            ? `${existing.note}; ${item.note}`
            : item.note || existing.note;

        nextRecords[key] = {
          ...existing,
          hours: nextHours,
          manualAmount: nextManualAmount,
          note: nextNote,
        };
        appliedCount += 1;
      }

      return {
        ...prev,
        workers: nextWorkers,
        records: nextRecords,
      };
    });

    setSelectedDate(applyDateISO);
    if (!isCustomRange) {
      const ws = getWeekStartISO(applyDateISO);
      setSummaryStartDate(ws);
      setSummaryEndDate(addDaysISO(ws, 6));
    }

    const extra = createdCount > 0 ? ` (thêm mới ${createdCount} nhân sự)` : '';
    showToast(
      `Đã điền dữ liệu cho ${appliedCount} nhân sự vào ngày ${formatFullDate(applyDateISO)}${extra}.`,
    );
    setActiveTab('daily');
  };

  const handleExportExcel = () => {
    exportAttendanceExcel({
      selectedDate,
      rangeStartISO: summaryStartDate,
      rangeEndISO: summaryEndDate,
      workers: state.workers,
      columns: state.columns,
      records: state.records,
      payments: state.payments,
      settings: state.settings,
    });
    showToast('Đã xuất file Excel (.xlsx) thành công.');
  };

  const handleSaveColumns = (nextColumns: ColumnConfig[]) => {
    setState((prev) => ({ ...prev, columns: nextColumns }));
    showToast('Đã cập nhật cấu trúc cột.');
  };

  const handleResetDefaultColumns = () => {
    setState((prev) => ({
      ...prev,
      columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    }));
    showToast('Đã khôi phục cột mặc định.');
  };

  const handleUpdateSettings = (settings: AppSettings) => {
    setState((prev) => ({ ...prev, settings }));
  };

  const handleApplyHourlyRate = (params: {
    target: 'default' | 'all' | WorkZone | { workerId: string };
    mode: 'permanent' | 'date_only';
    rate: number;
    dateISO: string;
    recalcAmountOnDate: boolean;
  }) => {
    const cleanRate = Math.max(0, Math.round(params.rate));
    if (!Number.isFinite(cleanRate)) return;

    setState((prev) => {
      let nextSettings = prev.settings;
      let nextWorkers = prev.workers;
      const nextRecords = { ...prev.records };

      if (params.target === 'default') {
        nextSettings = {
          ...prev.settings,
          defaultHourlyRate: cleanRate,
        };
        if (params.recalcAmountOnDate) {
          for (const w of prev.workers) {
            if (!w.hourlyRate || w.hourlyRate === 0) {
              const key = `${params.dateISO}__${w.id}`;
              const existing = nextRecords[key];
              if (existing && (existing.manualAmount !== null || existing.hourlyRate)) {
                nextRecords[key] = {
                  ...existing,
                  hourlyRate: null,
                  manualAmount: null,
                };
              }
            }
          }
        }
      } else {
        const matchesWorker = (w: Worker) => {
          if (typeof params.target === 'object') return w.id === params.target.workerId;
          if (params.target === 'all') return w.active;
          return w.active && w.zone === params.target;
        };

        if (params.mode === 'permanent') {
          nextWorkers = prev.workers.map((w) =>
            matchesWorker(w) ? { ...w, hourlyRate: cleanRate } : w,
          );
        }

        for (const w of prev.workers) {
          if (!matchesWorker(w)) continue;
          const key = `${params.dateISO}__${w.id}`;
          const existing = nextRecords[key];

          if (params.mode === 'date_only') {
            if (existing) {
              nextRecords[key] = {
                ...existing,
                hourlyRate: cleanRate > 0 ? cleanRate : null,
                manualAmount: params.recalcAmountOnDate ? null : existing.manualAmount,
              };
            } else if (cleanRate > 0) {
              nextRecords[key] = {
                date: params.dateISO,
                workerId: w.id,
                hours: 0,
                hourlyRate: cleanRate,
                manualAmount: null,
                note: '',
                customFields: {},
              };
            }
          } else if (existing) {
            nextRecords[key] = {
              ...existing,
              hourlyRate: null,
              manualAmount: params.recalcAmountOnDate ? null : existing.manualAmount,
            };
          }
        }
      }

      return {
        ...prev,
        settings: nextSettings,
        workers: nextWorkers,
        records: nextRecords,
      };
    });

    const rateLabel =
      cleanRate === 0
        ? `mặc định`
        : `${formatCurrency(cleanRate, state.settings.currency)}/giờ`;
    if (params.target === 'default') {
      showToast(`Đã cập nhật đơn giá mặc định thành ${rateLabel}.`);
    } else if (typeof params.target === 'object') {
      const w = state.workers.find((item) => item.id === (params.target as { workerId: string }).workerId);
      showToast(
        params.mode === 'date_only'
          ? `Đã đổi đơn giá ngày ${formatFullDate(params.dateISO)} cho ${w?.fbName || 'nhân sự'} thành ${rateLabel}.`
          : `Đã cập nhật đơn giá cho ${w?.fbName || 'nhân sự'} thành ${rateLabel}.`,
      );
    } else {
      const scopeLabel = params.target === 'all' ? 'cả 2 bảng' : `bảng ${params.target}`;
      showToast(
        params.mode === 'date_only'
          ? `Đã áp dụng ${rateLabel} cho ${scopeLabel} riêng ngày ${formatFullDate(params.dateISO)}.`
          : `Đã cập nhật ${rateLabel} cho ${scopeLabel}.`,
      );
    }
  };

  const handleRestoreState = (nextState: AppDataState) => {
    setState(nextState);
  };

  const handleResetSampleData = () => {
    const fresh = createMockData();
    setState(fresh);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 clean zones on desktop, compact 56px bar on mobile */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-2 sm:gap-4 md:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('daily');
            }}
            className="text-[15px] sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Công Nhật Pro
          </a>

          {/* Zone 2: Desktop single-line nav links */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium"
            aria-label="Điều hướng chính"
          >
            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeTab === 'daily'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Chấm công ngày
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeTab === 'weekly'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Tổng kết & Thanh toán tuần
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workers')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeTab === 'workers'
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Danh sách nhân sự
            </button>
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="py-1 whitespace-nowrap shrink-0 border-b-2 border-transparent text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cài đặt & Sao lưu
            </button>
          </nav>

          {/* Zone 3: Primary CTA (+ Download / Share App button) */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={() => setIsAutoModalOpen(true)}
              className="min-h-[40px] px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 shadow-xs transition-colors"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Tự động</span>
              <span className="hidden sm:inline">Tự động chấm công</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8">
        {activeTab === 'daily' && (
          <DailyAttendanceView
            selectedDate={selectedDate}
            onChangeDate={handleChangeDate}
            summaryStartDate={summaryStartDate}
            summaryEndDate={summaryEndDate}
            onChangeSummaryRange={handleChangeSummaryRange}
            workers={state.workers}
            columns={state.columns}
            records={state.records}
            payments={state.payments}
            settings={state.settings}
            onUpdateRecord={handleUpdateRecord}
            onUpdateWorker={handleUpdateWorker}
            onQuickAddWorker={handleQuickAddWorker}
            onApplyHourlyRate={handleApplyHourlyRate}
            onOpenColumnManager={() => setIsColumnModalOpen(true)}
            onOpenAutoModal={() => setIsAutoModalOpen(true)}
            onExportExcel={handleExportExcel}
          />
        )}

        {activeTab === 'weekly' && (
          <WeeklyPayrollView
            rangeStartISO={summaryStartDate}
            rangeEndISO={summaryEndDate}
            onChangeRange={(s, e) => handleChangeSummaryRange(s, e, true)}
            workers={state.workers}
            records={state.records}
            payments={state.payments}
            settings={state.settings}
            onTogglePayment={handleTogglePayment}
            onExportExcel={handleExportExcel}
            onJumpToDate={(d) => {
              setSelectedDate(d);
              setActiveTab('daily');
            }}
          />
        )}

        {activeTab === 'workers' && (
          <WorkersMasterView
            workers={state.workers}
            settings={state.settings}
            onAddWorker={handleAddWorker}
            onUpdateWorker={handleUpdateWorker}
            onDeleteWorker={handleDeleteWorker}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-Zone Ergonomics) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        aria-label="Menu di động"
      >
        <div className="grid grid-cols-4 h-16">
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'daily' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <CalendarCheck2 className="w-5 h-5" />
            <span className="text-[11px] font-medium">Chấm công</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('weekly')}
            className={`flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'weekly' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] font-medium">Thanh toán</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'workers' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[11px] font-medium">Nhân sự</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-500"
          >
            <Settings className="w-5 h-5" />
            <span className="text-[11px] font-medium">Cài đặt</span>
          </button>
        </div>
      </nav>

      {/* Offline Banner */}
      <OfflineIndicator />

      {/* Auto Mobile Install Prompt (for ?install=1 / QR / Chrome / Zalo WebView) */}
      <AutoMobileInstallPrompt />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Modals */}
      <SmartAutoAttendanceModal
        isOpen={isAutoModalOpen}
        selectedDate={selectedDate}
        currency={state.settings.currency}
        defaultHourlyRate={state.settings.defaultHourlyRate}
        workers={state.workers}
        onClose={() => setIsAutoModalOpen(false)}
        onApplyCandidates={handleApplyCandidates}
      />

      <ColumnManagerModal
        isOpen={isColumnModalOpen}
        columns={state.columns}
        onClose={() => setIsColumnModalOpen(false)}
        onSaveColumns={handleSaveColumns}
        onResetDefault={handleResetDefaultColumns}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        state={state}
        onClose={() => setIsSettingsModalOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onRestoreState={handleRestoreState}
        onResetSampleData={handleResetSampleData}
      />
    </div>
  );
}
