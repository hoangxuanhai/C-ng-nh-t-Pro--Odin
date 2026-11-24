import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, UserCheck, UserX, X } from 'lucide-react';
import type { AppSettings, Worker, WorkZone } from '../types';
import { formatCurrency, normalizeText } from '../utils/format';

interface WorkersMasterViewProps {
  workers: Worker[];
  settings: AppSettings;
  onAddWorker: (worker: Omit<Worker, 'id' | 'createdAt'>) => void;
  onUpdateWorker: (workerId: string, patch: Partial<Worker>) => void;
  onDeleteWorker: (workerId: string) => void;
}

export const WorkersMasterView: React.FC<WorkersMasterViewProps> = ({
  workers,
  settings,
  onAddWorker,
  onUpdateWorker,
  onDeleteWorker,
}) => {
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<'all' | WorkZone>('all');
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [fbName, setFbName] = useState('');
  const [krName, setKrName] = useState('');
  const [zone, setZone] = useState<WorkZone>('I동');
  const [hourlyRate, setHourlyRate] = useState(String(settings.defaultHourlyRate));
  const [phone, setPhone] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingRateWorkerId, setEditingRateWorkerId] = useState<string | null>(null);
  const [editingRateDraft, setEditingRateDraft] = useState<string>('');

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return workers.filter((w) => {
      if (zoneFilter !== 'all' && w.zone !== zoneFilter) return false;
      if (!q) return true;
      return (
        normalizeText(w.fbName).includes(q) ||
        w.krName.toLowerCase().includes(search.trim().toLowerCase()) ||
        (w.phone || '').includes(search.trim())
      );
    });
  }, [workers, zoneFilter, search]);

  const openAdd = () => {
    setEditingWorker(null);
    setFbName('');
    setKrName('');
    setZone(zoneFilter === '차동' ? '차동' : 'I동');
    setHourlyRate(String(settings.defaultHourlyRate));
    setPhone('');
    setBankInfo('');
    setIsAddOpen(true);
  };

  const openEdit = (w: Worker) => {
    setEditingWorker(w);
    setFbName(w.fbName);
    setKrName(w.krName);
    setZone(w.zone);
    setHourlyRate(String(w.hourlyRate || settings.defaultHourlyRate));
    setPhone(w.phone || '');
    setBankInfo(w.bankInfo || '');
    setIsAddOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbName.trim() && !krName.trim()) return;
    const rateNum = Number(hourlyRate);
    const cleanRate = Number.isFinite(rateNum) && rateNum >= 0 ? rateNum : settings.defaultHourlyRate;

    if (editingWorker) {
      onUpdateWorker(editingWorker.id, {
        fbName: fbName.trim() || krName.trim(),
        krName: krName.trim(),
        zone,
        hourlyRate: cleanRate,
        phone: phone.trim(),
        bankInfo: bankInfo.trim(),
      });
    } else {
      onAddWorker({
        fbName: fbName.trim() || krName.trim(),
        krName: krName.trim(),
        zone,
        hourlyRate: cleanRate,
        phone: phone.trim(),
        bankInfo: bankInfo.trim(),
        active: true,
      });
    }
    setIsAddOpen(false);
  };

  const commitInlineRate = (w: Worker) => {
    const parsed = Number(editingRateDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onUpdateWorker(w.id, { hourlyRate: Math.round(parsed) });
    }
    setEditingRateWorkerId(null);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900">
            Danh sách nhân sự gốc ({workers.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Phân chia nhân sự theo 2 bảng I 동 (10 người) và 차동 (5 người) cùng đơn giá giờ
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm nhân sự mới</span>
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên tiếng Việt, tiếng Hàn hoặc SĐT..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setZoneFilter('all')}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                zoneFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tất cả ({workers.length})
            </button>
            <button
              type="button"
              onClick={() => setZoneFilter('I동')}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                zoneFilter === 'I동' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              I 동 ({workers.filter((w) => w.zone === 'I동').length})
            </button>
            <button
              type="button"
              onClick={() => setZoneFilter('차동')}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                zoneFilter === '차동' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              차동 ({workers.filter((w) => w.zone === '차동').length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Tên tiếng Việt / FB</th>
                <th className="py-3 px-4">Tên tiếng Hàn</th>
                <th className="py-3 px-4">Bảng chấm công</th>
                <th className="py-3 px-4 text-right">Đơn giá / giờ</th>
                <th className="py-3 px-4">Liên hệ / Tài khoản</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center text-slate-500">
                    Chưa có nhân sự nào khớp với tìm kiếm.
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr
                    key={w.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      w.active ? '' : 'opacity-60 bg-slate-50/50'
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">{w.fbName}</td>
                    <td className="py-3 px-4 text-slate-800">{w.krName || '—'}</td>
                    <td className="py-3 px-4">
                      <select
                        value={w.zone}
                        onChange={(e) =>
                          onUpdateWorker(w.id, { zone: e.target.value as WorkZone })
                        }
                        className="min-h-[36px] px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="I동">I 동 (18h - 24h)</option>
                        <option value="차동">차동 (20h - 01h)</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      {editingRateWorkerId === w.id ? (
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          step={settings.currency === 'KRW' ? 500 : 1000}
                          value={editingRateDraft}
                          onChange={(e) => setEditingRateDraft(e.target.value)}
                          onBlur={() => commitInlineRate(w)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitInlineRate(w);
                            else if (e.key === 'Escape') setEditingRateWorkerId(null);
                          }}
                          className="w-28 min-h-[36px] px-2 py-1 text-right text-sm font-mono tabular-nums bg-white border-2 border-blue-600 rounded-md focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRateWorkerId(w.id);
                            setEditingRateDraft(String(w.hourlyRate || settings.defaultHourlyRate));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          title="Nhấn để sửa đơn giá giờ"
                        >
                          <span>
                            {formatCurrency(
                              w.hourlyRate || settings.defaultHourlyRate,
                              settings.currency,
                            )}
                          </span>
                          <Edit3 className="w-3 h-3 text-slate-400" />
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>{w.phone || '—'}</div>
                      {w.bankInfo && (
                        <div className="text-slate-400 mt-0.5 font-mono">{w.bankInfo}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onUpdateWorker(w.id, { active: !w.active })}
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
                          w.active
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {w.active ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Đang làm</span>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5 text-slate-500" />
                            <span>Tạm nghỉ</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {confirmDeleteId === w.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteWorker(w.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-md hover:bg-red-700"
                          >
                            Xóa hẳn
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-600"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(w)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-600"
                            title="Chỉnh sửa"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(w.id)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title="Xóa nhân sự"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add/Edit Worker Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {editingWorker ? 'Sửa thông tin nhân sự' : 'Thêm nhân sự mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bảng chấm công *
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setZone('I동')}
                    className={`min-h-[38px] text-xs font-semibold rounded-md ${
                      zone === 'I동'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Bảng I 동 (18h-24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setZone('차동')}
                    className={`min-h-[38px] text-xs font-semibold rounded-md ${
                      zone === '차동'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Bảng 차동 (20h-01h)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên tiếng Việt / FB *
                </label>
                <input
                  type="text"
                  value={fbName}
                  onChange={(e) => setFbName(e.target.value)}
                  placeholder="VD: John Việt"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên tiếng Hàn (Hangul)
                </label>
                <input
                  type="text"
                  value={krName}
                  onChange={(e) => setKrName(e.target.value)}
                  placeholder="VD: 조니비엣"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Đơn giá theo giờ ({settings.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step={settings.currency === 'KRW' ? 500 : 1000}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số điện thoại (tùy chọn)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="VD: 010-1234-5678"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số tài khoản chuyển lương (tùy chọn)
                </label>
                <input
                  type="text"
                  value={bankInfo}
                  onChange={(e) => setBankInfo(e.target.value)}
                  placeholder="VD: KB 110-482-991021"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                {editingWorker ? 'Cập nhật' : 'Thêm nhân sự'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
