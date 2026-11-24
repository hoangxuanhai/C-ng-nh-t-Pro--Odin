import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { ColumnConfig, ColumnType } from '../types';

interface ColumnManagerModalProps {
  isOpen: boolean;
  columns: ColumnConfig[];
  onClose: () => void;
  onSaveColumns: (nextColumns: ColumnConfig[]) => void;
  onResetDefault: () => void;
}

const COLUMN_TYPE_LABELS: Record<Exclude<ColumnType, 'computed_weekly'>, string> = {
  text: 'Chữ (Text)',
  number: 'Số (Number)',
  currency: 'Tiền tệ (Currency)',
  checkbox: 'Tick chọn (Checkbox)',
};

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
  isOpen,
  columns,
  onClose,
  onSaveColumns,
  onResetDefault,
}) => {
  const [draft, setDraft] = useState<ColumnConfig[]>(() => columns.map((c) => ({ ...c })));
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<Exclude<ColumnType, 'computed_weekly'>>('text');

  React.useEffect(() => {
    if (isOpen) {
      setDraft(columns.map((c) => ({ ...c })));
      setNewLabel('');
      setNewType('text');
    }
  }, [isOpen, columns]);

  if (!isOpen) return null;

  const handleRename = (id: string, label: string) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  };

  const handleToggleVisible = (id: string) => {
    setDraft((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const visibleCount = prev.filter((c) => c.visible).length;
      if (target.visible && visibleCount <= 1) return prev;
      return prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
    });
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draft.length) return;
    setDraft((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const handleDeleteCustom = (id: string) => {
    setDraft((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const slug = `custom_${Date.now()}`;
    const newCol: ColumnConfig = {
      id: `col_${slug}`,
      key: slug,
      label: trimmed,
      type: newType,
      visible: true,
      system: false,
    };
    setDraft((prev) => [...prev, newCol]);
    setNewLabel('');
  };

  const handleSave = () => {
    const sanitized = draft.map((c) => ({
      ...c,
      label: c.label.trim() || 'Cột không tên',
    }));
    onSaveColumns(sanitized);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Quản lý cột bảng chấm công"
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Quản lý cột dữ liệu</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Đổi tên, sắp xếp thứ tự, ẩn/hiện hoặc thêm cột tùy chỉnh mới
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Add new custom column */}
          <form
            onSubmit={handleAddColumn}
            className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3"
          >
            <div className="text-xs font-semibold text-slate-700">Thêm cột tùy chỉnh mới</div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="VD: Phụ cấp ăn, Tiền ứng, Đã ký..."
                className="flex-1 min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as Exclude<ColumnType, 'computed_weekly'>)
                }
                className="min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {Object.entries(COLUMN_TYPE_LABELS).map(([val, text]) => (
                  <option key={val} value={val}>
                    {text}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!newLabel.trim()}
                className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm cột</span>
              </button>
            </div>
          </form>

          {/* Column List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                Danh sách cột ({draft.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  onResetDefault();
                  onClose();
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1 py-1 px-2 rounded hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục cột mặc định</span>
              </button>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden bg-white">
              {draft.map((col, idx) => (
                <div
                  key={col.id}
                  className={`flex items-center gap-2.5 p-2.5 sm:px-3 transition-colors ${
                    col.visible ? 'bg-white' : 'bg-slate-50/80 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      title="Di chuyển lên"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === draft.length - 1}
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      title="Di chuyển xuống"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) => handleRename(col.id, e.target.value)}
                      className="w-full min-h-[40px] px-2.5 py-1.5 text-sm font-medium text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="text-[11px] text-slate-500 mt-1 px-0.5">
                      {col.system ? 'Cột hệ thống' : 'Cột tùy chỉnh'} ·{' '}
                      {col.type === 'computed_weekly'
                        ? 'Tự động cộng dồn tuần'
                        : COLUMN_TYPE_LABELS[col.type]}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleVisible(col.id)}
                      className={`min-h-[40px] px-2.5 flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors ${
                        col.visible
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={col.visible ? 'Ẩn cột' : 'Hiện cột'}
                    >
                      {col.visible ? (
                        <>
                          <Eye className="w-4 h-4 text-blue-600" />
                          <span className="hidden sm:inline">Hiện</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-4 h-4 text-slate-400" />
                          <span className="hidden sm:inline">Ẩn</span>
                        </>
                      )}
                    </button>

                    {!col.system && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustom(col.id)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                        title="Xóa cột tùy chỉnh"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            Lưu cấu trúc cột
          </button>
        </div>
      </div>
    </div>
  );
};
