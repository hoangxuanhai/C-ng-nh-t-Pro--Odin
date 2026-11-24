import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import type { AppDataState, AppSettings, CurrencyCode } from '../types';
import { exportBackupJSON, parseBackupJSON } from '../utils/storage';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  isOpen: boolean;
  state: AppDataState;
  onClose: () => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onRestoreState: (nextState: AppDataState) => void;
  onResetSampleData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  state,
  onClose,
  onUpdateSettings,
  onRestoreState,
  onResetSampleData,
}) => {
  const [teamName, setTeamName] = useState(state.settings.teamName);
  const [currency, setCurrency] = useState<CurrencyCode>(state.settings.currency);
  const [defaultRate, setDefaultRate] = useState(String(state.settings.defaultHourlyRate));
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTeamName(state.settings.teamName);
      setCurrency(state.settings.currency);
      setDefaultRate(String(state.settings.defaultHourlyRate));
      setFeedback(null);
      setConfirmReset(false);
    }
  }, [isOpen, state.settings]);

  if (!isOpen) return null;

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRate = Number(defaultRate);
    onUpdateSettings({
      teamName: teamName.trim() || 'Đội I 동 & 차동',
      currency,
      defaultHourlyRate: Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 12000,
    });
    setFeedback({ type: 'ok', text: 'Đã lưu cài đặt hệ thống.' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const restored = parseBackupJSON(text);
      onRestoreState(restored);
      setFeedback({
        type: 'ok',
        text: `Đã khôi phục thành công ${restored.workers.length} nhân sự và toàn bộ dữ liệu chấm công.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không thể đọc file sao lưu.',
      });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt và sao lưu dữ liệu"
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cài đặt & Sao lưu</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cấu hình đơn vị tiền tệ, đơn giá mặc định và sao lưu trình duyệt
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {feedback && (
            <div
              className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Install as Mobile App */}
          <PWAInstallButton variant="card" onInstalled={onClose} />

          {/* General Settings */}
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên đội / Công trình (hiển thị trên phiếu lương)
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="VD: Tổ xây dựng Incheon"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Đơn vị tiền tệ
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('KRW');
                      if (defaultRate === '50000') setDefaultRate('12000');
                    }}
                    className={`min-h-[38px] text-xs font-semibold rounded-md transition-colors ${
                      currency === 'KRW'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    KRW (₩)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('VND');
                      if (defaultRate === '12000') setDefaultRate('50000');
                    }}
                    className={`min-h-[38px] text-xs font-semibold rounded-md transition-colors ${
                      currency === 'VND'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    VND (₫)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Đơn giá mặc định / giờ ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step={currency === 'KRW' ? 500 : 1000}
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
            >
              Lưu cài đặt
            </button>
          </form>

          {/* Backup & Restore */}
          <div className="pt-5 border-t border-slate-200 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Sao lưu & Khôi phục dữ liệu (LocalStorage)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dữ liệu được lưu tự động trên trình duyệt. Hãy tải file JSON định kỳ để tránh mất dữ liệu khi đổi máy.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  exportBackupJSON(state);
                  setFeedback({ type: 'ok', text: 'Đã tải xuống file sao lưu JSON.' });
                }}
                className="min-h-[44px] px-4 py-2 bg-white border border-slate-300 text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>Sao lưu (Backup JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-4 py-2 bg-white border border-slate-300 text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Khôi phục từ JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="pt-2">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="text-xs font-medium text-slate-500 hover:text-red-600 flex items-center gap-1.5 py-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục 2 bảng gốc I 동 & 차동 (ngày 22/11)</span>
                </button>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="text-xs text-amber-900 font-medium">
                    Xác nhận đặt lại toàn bộ về 2 bảng I 동 (10 người) & 차동 (5 người)?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-700"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onResetSampleData();
                        setConfirmReset(false);
                        setFeedback({ type: 'ok', text: 'Đã khôi phục dữ liệu mẫu ban đầu.' });
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      Đồng ý đặt lại
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
