import type { AppBackupPayload, AppDataState, Worker } from '../types';
import { createMockData, DEFAULT_COLUMNS } from '../data/mockData';

const LEGACY_KEYS = ['congnhat_pro_state_v1', 'congnhat_pro_state_v2_chadong'];
const STORAGE_KEY = 'congnhat_pro_state_v3_two_boards';

function normalizeWorkers(rawWorkers: Partial<Worker>[]): Worker[] {
  return rawWorkers.map((w, idx) => ({
    id: w.id || `w_${Date.now()}_${idx}`,
    fbName: w.fbName || w.krName || 'Chưa đặt tên',
    krName: w.krName || '',
    zone: w.zone === '차동' ? '차동' : 'I동',
    hourlyRate: typeof w.hourlyRate === 'number' ? w.hourlyRate : 12000,
    phone: w.phone || '',
    bankInfo: w.bankInfo || '',
    active: w.active !== false,
    createdAt: w.createdAt || '2026-11-22',
  }));
}

export function loadAppState(): AppDataState {
  try {
    for (const k of LEGACY_KEYS) {
      if (localStorage.getItem(k)) {
        localStorage.removeItem(k);
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createMockData();
      saveAppState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<AppDataState>;
    if (!parsed || !Array.isArray(parsed.workers) || !Array.isArray(parsed.columns)) {
      const initial = createMockData();
      saveAppState(initial);
      return initial;
    }
    return {
      workers: normalizeWorkers(parsed.workers),
      columns: parsed.columns.length > 0 ? parsed.columns : DEFAULT_COLUMNS,
      records: parsed.records ?? {},
      payments: parsed.payments ?? {},
      settings: {
        currency: parsed.settings?.currency === 'VND' ? 'VND' : 'KRW',
        defaultHourlyRate:
          typeof parsed.settings?.defaultHourlyRate === 'number' &&
          parsed.settings.defaultHourlyRate > 0
            ? parsed.settings.defaultHourlyRate
            : 12000,
        teamName: parsed.settings?.teamName || 'Đội I 동 & 차동',
      },
    };
  } catch {
    return createMockData();
  }
}

export function saveAppState(state: AppDataState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to persist state to LocalStorage:', err);
  }
}

export function exportBackupJSON(state: AppDataState): void {
  const payload: AppBackupPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `congnhat-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBackupJSON(rawText: string): AppDataState {
  const parsed = JSON.parse(rawText) as Partial<AppBackupPayload> | Partial<AppDataState>;
  const candidate: Partial<AppDataState> =
    'data' in parsed && parsed.data ? parsed.data : (parsed as Partial<AppDataState>);

  if (!candidate || !Array.isArray(candidate.workers) || !Array.isArray(candidate.columns)) {
    throw new Error('File sao lưu không đúng định dạng hợp lệ.');
  }

  return {
    workers: normalizeWorkers(candidate.workers),
    columns: candidate.columns.length > 0 ? candidate.columns : DEFAULT_COLUMNS,
    records: candidate.records ?? {},
    payments: candidate.payments ?? {},
    settings: {
      currency: candidate.settings?.currency === 'VND' ? 'VND' : 'KRW',
      defaultHourlyRate: Number(candidate.settings?.defaultHourlyRate) || 12000,
      teamName: candidate.settings?.teamName || 'Đội I 동 & 차동',
    },
  };
}
