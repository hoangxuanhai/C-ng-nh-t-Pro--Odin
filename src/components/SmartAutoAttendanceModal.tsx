import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  ScanText,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type { ParsedAttendanceCandidate, Worker, WorkZone } from '../types';
import { formatFullDate } from '../utils/date';
import { formatCurrency, getEffectiveHourlyRate, matchWorkerByName } from '../utils/format';
import { parseAttendanceText } from '../utils/textParser';

interface SmartAutoAttendanceModalProps {
  isOpen: boolean;
  selectedDate: string;
  currency: 'KRW' | 'VND';
  defaultHourlyRate: number;
  workers: Worker[];
  onClose: () => void;
  onApplyCandidates: (
    candidates: ParsedAttendanceCandidate[],
    mode: 'overwrite' | 'accumulate',
    applyDateISO: string,
  ) => void;
}

const SAMPLE_PASTE_TEXT = `Ngày 23/11 - Đội I동
John Việt (조니비엣) - 5h - 60k
반디엔 6시간
Thìn - 72.000
Lê Duy (레뒤): 5.5h - tăng ca 0.5h
Hưng (흥) - 차동 - 5h - 60,000₩
Đinh Trung (딘뚱) - 80k`;

async function compressImageToDataUrl(
  file: File,
  maxDim = 1600,
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải hình ảnh hợp lệ.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.9);
        resolve({ dataUrl, mimeType });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const SmartAutoAttendanceModal: React.FC<SmartAutoAttendanceModalProps> = ({
  isOpen,
  selectedDate,
  currency,
  defaultHourlyRate,
  workers,
  onClose,
  onApplyCandidates,
}) => {
  const [activeMode, setActiveMode] = useState<'image' | 'text'>('image');
  const [applyDateISO, setApplyDateISO] = useState(selectedDate);
  const [detectedDateHint, setDetectedDateHint] = useState<string>('');
  const [defaultNewZone, setDefaultNewZone] = useState<WorkZone>('I동');

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [aiHint, setAiHint] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rawText, setRawText] = useState('');
  const [candidates, setCandidates] = useState<ParsedAttendanceCandidate[]>([]);
  const [applyMode, setApplyMode] = useState<'overwrite' | 'accumulate'>('overwrite');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setApplyDateISO(selectedDate);
      setErrorMsg(null);
      setDetectedDateHint('');
    }
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const handleSelectImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const { dataUrl, mimeType } = await compressImageToDataUrl(file);
      setImagePreviewUrl(dataUrl);
      setImageMimeType(mimeType);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải ảnh.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAnalyzeImage = async () => {
    if (!imagePreviewUrl) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    setDetectedDateHint('');

    try {
      const res = await fetch('/api/ocr-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreviewUrl,
          mimeType: imageMimeType,
          hint: aiHint.trim() || undefined,
          knownWorkers: workers.map((w) => ({
            fbName: w.fbName,
            krName: w.krName,
            zone: w.zone,
          })),
        }),
      });

      const data = (await res.json()) as {
        detectedDate?: string;
        detectedZone?: WorkZone | '';
        items?: Array<{
          name: string;
          krName?: string;
          hours: number | null;
          amount: number | null;
          note: string;
          confidence: number;
        }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Không thể phân tích ảnh chấm công.');
      }

      const items = data.items || [];
      if (items.length === 0) {
        setErrorMsg(
          'AI không tìm thấy dòng chấm công nào rõ ràng trong ảnh. Hãy thử ảnh rõ nét hơn hoặc dùng chế độ Nhập thông tin văn bản.',
        );
        setCandidates([]);
        return;
      }

      if (data.detectedDate) {
        setDetectedDateHint(data.detectedDate);
        setApplyDateISO(data.detectedDate);
      }

      const zoneFallback: WorkZone = data.detectedZone || defaultNewZone;
      if (data.detectedZone) {
        setDefaultNewZone(data.detectedZone);
      }

      const mapped: ParsedAttendanceCandidate[] = items.map((item, idx) => {
        const matched =
          matchWorkerByName(item.name, workers) ||
          (item.krName ? matchWorkerByName(item.krName, workers) : null);

        return {
          tempId: `ocr_${Date.now()}_${idx}`,
          rawName: item.name,
          krName: item.krName || (matched ? matched.worker.krName : ''),
          hours: item.hours,
          amount: item.amount,
          note: item.note || '',
          zone: matched ? matched.worker.zone : zoneFallback,
          confidence: matched ? Math.max(item.confidence, matched.score) : item.confidence,
          matchedWorkerId: matched ? matched.worker.id : null,
          createNewIfUnmatched: !matched,
          selected: true,
        };
      });

      setCandidates(mapped);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Lỗi kết nối máy chủ nhận diện ảnh.',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleParseText = () => {
    setErrorMsg(null);
    setDetectedDateHint('');
    if (!rawText.trim()) {
      setErrorMsg('Vui lòng nhập hoặc dán thông tin danh sách trước khi phân tích.');
      return;
    }
    const parsed = parseAttendanceText(rawText, workers, defaultNewZone);
    if (parsed.items.length === 0) {
      setErrorMsg('Không tìm thấy dòng hợp lệ nào trong thông tin vừa nhập.');
      return;
    }
    if (parsed.detectedDate) {
      setDetectedDateHint(parsed.detectedDate);
      setApplyDateISO(parsed.detectedDate);
    }
    if (parsed.detectedZone) {
      setDefaultNewZone(parsed.detectedZone);
    }
    setCandidates(parsed.items);
  };

  const updateCandidate = (
    tempId: string,
    patch: Partial<ParsedAttendanceCandidate>,
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)),
    );
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

  const handleConfirmApply = () => {
    const active = candidates.filter((c) => c.selected);
    if (active.length === 0) return;
    onApplyCandidates(active, applyMode, applyDateISO);
    setCandidates([]);
    setRawText('');
    setImagePreviewUrl(null);
    setAiHint('');
    onClose();
  };

  const getEstimatedPayForPreview = (item: ParsedAttendanceCandidate): number | null => {
    if (item.amount !== null) return item.amount;
    if (item.hours !== null && item.hours > 0) {
      const worker = workers.find((w) => w.id === item.matchedWorkerId);
      const rate = worker
        ? getEffectiveHourlyRate(worker, defaultHourlyRate)
        : defaultHourlyRate;
      return Math.round(item.hours * rate);
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Công cụ nhập nhanh & Quét ảnh chấm công"
    >
      <div className="bg-white w-full sm:max-w-5xl rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[93vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Nhập thông tin & Quét ảnh tự động điền theo ngày
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tải ảnh bảng lương/sổ tay hoặc nhập danh sách văn bản — tự động điền tên, số tiền và số giờ (nếu có) vào đúng ngày
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

        {/* Date & Default Zone Bar inside Tool */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Ngày áp dụng:</span>
            </label>
            <input
              type="date"
              value={applyDateISO}
              onChange={(e) => e.target.value && setApplyDateISO(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
            />
            {detectedDateHint && (
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Đã tự nhận ngày {formatFullDate(detectedDateHint)} từ dữ liệu</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Bảng mặc định:</span>
            <select
              value={defaultNewZone}
              onChange={(e) => setDefaultNewZone(e.target.value as WorkZone)}
              className="min-h-[40px] px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            >
              <option value="I동">Bảng I 동 (18h - 24h)</option>
              <option value="차동">Bảng 차동 (20h - 01h)</option>
            </select>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveMode('image');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-md flex items-center justify-center gap-2 transition-colors ${
                activeMode === 'image'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate">Tải / Chụp ảnh danh sách</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('text');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-md flex items-center justify-center gap-2 transition-colors ${
                activeMode === 'text'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate">Nhập thông tin / Dán Excel</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
              {activeMode === 'image' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('text');
                    setErrorMsg(null);
                  }}
                  className="px-3 py-1.5 bg-white border border-red-200 text-red-700 text-xs font-semibold rounded-md hover:bg-red-100 whitespace-nowrap shrink-0"
                >
                  Chuyển sang nhập văn bản
                </button>
              )}
            </div>
          )}

          {activeMode === 'image' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[50px] px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 flex items-center justify-center gap-2.5 text-sm font-semibold transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  <span>Chụp ảnh trực tiếp (Camera)</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[50px] px-4 py-2.5 bg-slate-50 border border-slate-300 text-slate-800 rounded-xl hover:bg-slate-100 flex items-center justify-center gap-2.5 text-sm font-semibold transition-colors"
                >
                  <Upload className="w-5 h-5 text-slate-600" />
                  <span>Chọn ảnh danh sách từ máy</span>
                </button>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleSelectImage}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleSelectImage}
                className="hidden"
              />

              {imagePreviewUrl ? (
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-blue-600" />
                      Ảnh danh sách đã tải lên
                    </span>
                    <button
                      type="button"
                      onClick={() => setImagePreviewUrl(null)}
                      className="text-xs text-slate-500 hover:text-red-600 font-medium px-2 py-1"
                    >
                      Xóa ảnh
                    </button>
                  </div>
                  <div className="max-h-56 overflow-hidden rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                    <img
                      src={imagePreviewUrl}
                      alt="Ảnh bảng chấm công tải lên"
                      className="max-h-56 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <input
                    type="text"
                    value={aiHint}
                    onChange={(e) => setAiHint(e.target.value)}
                    placeholder="Gợi ý thêm cho AI (tùy chọn): VD 'Bảng này của 차동 ngày 23/11, cột F là tiền'"
                    className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAnalyzeImage}
                    disabled={isAnalyzing}
                    className="w-full min-h-[46px] px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI đang đọc tên, số tiền và số giờ từ ảnh...</span>
                      </>
                    ) : (
                      <>
                        <ScanText className="w-4 h-4" />
                        <span>Phân tích ảnh & Tự động điền bảng xem trước</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/70">
                  <p className="text-sm font-medium text-slate-700">
                    Hỗ trợ ảnh chụp bảng Google Sheets/Excel, sổ tay viết tay, ảnh tin nhắn Messenger / KakaoTalk
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    AI tự động trích xuất cả Tên Việt, Tên Hàn, Số tiền, Số giờ (nếu có) và Ngày làm việc.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  Nhập thông tin từng dòng (hỗ trợ tên + số giờ + số tiền, hoặc dán từ Excel/Sheets)
                </label>
                <button
                  type="button"
                  onClick={() => setRawText(SAMPLE_PASTE_TEXT)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline py-1"
                >
                  Điền thử dữ liệu mẫu (có giờ & tiền)
                </button>
              </div>
              <textarea
                rows={6}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Ví dụ:\nNgày 23/11\nJohn Việt (조니비엣) - 5h - 60k\nHưng 5h 60.000\nĐinh Trung - 80k (không ghi giờ)\nLê Duy: 6.5 tiếng (tự tính tiền theo đơn giá)`}
                className="w-full p-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 font-sans leading-relaxed"
              />
              <button
                type="button"
                onClick={handleParseText}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors"
              >
                <ScanText className="w-4 h-4" />
                <span>Phân tích & Điền vào xem trước</span>
              </button>
            </div>
          )}

          {/* Preview & Edit Table */}
          {candidates.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Xem trước dữ liệu sẽ điền ({selectedCount}/{candidates.length} dòng)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nếu có "Số tiền" đọc được, app sẽ điền trực tiếp; nếu để trống tiền mà có "Số giờ", app tự tính theo đơn giá.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                  <button
                    type="button"
                    onClick={() => setApplyMode('overwrite')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      applyMode === 'overwrite'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Cập nhật / Ghi đè
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyMode('accumulate')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      applyMode === 'accumulate'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Cộng dồn
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse min-w-[780px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3 w-10 text-center">Chọn</th>
                      <th className="py-2.5 px-3">Tên đọc được</th>
                      <th className="py-2.5 px-3">Khớp nhân sự</th>
                      <th className="py-2.5 px-2.5 w-28">Bảng</th>
                      <th className="py-2.5 px-2.5 w-24 text-right">Số giờ</th>
                      <th className="py-2.5 px-2.5 w-36 text-right">Số tiền ({currency})</th>
                      <th className="py-2.5 px-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {candidates.map((item) => {
                      const estPay = getEstimatedPayForPreview(item);
                      return (
                        <tr
                          key={item.tempId}
                          className={item.selected ? 'bg-white' : 'bg-slate-50 opacity-55'}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) =>
                                updateCandidate(item.tempId, { selected: e.target.checked })
                              }
                              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900">{item.rawName}</div>
                            <div className="text-[11px] text-slate-500">
                              {item.krName && item.krName !== item.rawName
                                ? `${item.krName} · `
                                : ''}
                              {item.matchedWorkerId
                                ? `Khớp ${Math.round(item.confidence * 100)}%`
                                : 'Nhân sự mới'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={item.matchedWorkerId ?? '__new__'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__new__') {
                                  updateCandidate(item.tempId, {
                                    matchedWorkerId: null,
                                    createNewIfUnmatched: true,
                                  });
                                } else {
                                  const w = workers.find((x) => x.id === val);
                                  updateCandidate(item.tempId, {
                                    matchedWorkerId: val,
                                    createNewIfUnmatched: false,
                                    zone: w ? w.zone : item.zone,
                                  });
                                }
                              }}
                              className={`w-full min-h-[38px] px-2 py-1 text-xs sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                                item.matchedWorkerId
                                  ? 'border-slate-300 bg-white text-slate-900'
                                  : 'border-amber-300 bg-amber-50 text-amber-900'
                              }`}
                            >
                              <option value="__new__">
                                + Tạo mới ({item.rawName})
                              </option>
                              {workers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  [{w.zone}] {w.fbName}
                                  {w.krName ? ` (${w.krName})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <select
                              value={item.zone}
                              onChange={(e) =>
                                updateCandidate(item.tempId, {
                                  zone: e.target.value as WorkZone,
                                })
                              }
                              className="w-full min-h-[38px] px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
                            >
                              <option value="I동">I 동</option>
                              <option value="차동">차동</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="24"
                              placeholder="—"
                              value={item.hours ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                updateCandidate(item.tempId, {
                                  hours: v === '' ? null : Math.max(0, parseFloat(v) || 0),
                                });
                              }}
                              className="w-full min-h-[38px] px-2 py-1 text-right text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-2.5">
                            <input
                              type="number"
                              step="1000"
                              min="0"
                              placeholder={
                                estPay !== null
                                  ? formatCurrency(estPay, currency)
                                  : 'Tự tính'
                              }
                              value={item.amount ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                updateCandidate(item.tempId, {
                                  amount: v === '' ? null : Math.max(0, Math.round(Number(v) || 0)),
                                });
                              }}
                              className="w-full min-h-[38px] px-2 py-1 text-right text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            {item.amount === null && estPay !== null && (
                              <div className="text-[10px] text-slate-400 text-right mt-0.5 tabular-nums">
                                Tự tính: {formatCurrency(estPay, currency)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={item.note}
                              onChange={(e) =>
                                updateCandidate(item.tempId, { note: e.target.value })
                              }
                              placeholder="Ghi chú..."
                              className="w-full min-h-[38px] px-2.5 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {candidates.some((c) => c.selected && !c.matchedWorkerId) && (
                <p className="text-xs text-amber-800 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>
                    Các dòng "+ Tạo mới" sẽ tự động thêm nhân sự vào đúng bảng (I 동 / 차동) đã chọn.
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleConfirmApply}
            disabled={selectedCount === 0}
            className="min-h-[46px] px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>
              Xác nhận điền vào ngày {formatFullDate(applyDateISO)} ({selectedCount} người)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
