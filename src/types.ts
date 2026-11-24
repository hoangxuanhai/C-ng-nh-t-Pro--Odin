export type CurrencyCode = 'KRW' | 'VND';

export type WorkZone = 'I동' | '차동';

export type ColumnType = 'text' | 'number' | 'currency' | 'checkbox' | 'computed_weekly';

export interface ColumnConfig {
  id: string;
  key: string;
  label: string;
  type: ColumnType;
  visible: boolean;
  system: boolean;
  /** System field identifier when system === true */
  systemKey?: 'fbName' | 'krName' | 'hours' | 'amount' | 'weeklyTotal' | 'note';
}

export interface Worker {
  id: string;
  fbName: string;
  krName: string;
  zone: WorkZone;
  /** 0 or undefined means use global settings.defaultHourlyRate */
  hourlyRate: number;
  phone?: string;
  bankInfo?: string;
  active: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  workerId: string;
  hours: number;
  /** Optional per-day hourly rate override; null/undefined uses worker/default hourly rate */
  hourlyRate?: number | null;
  /** null means auto-calculated as hours * effectiveRate */
  manualAmount: number | null;
  note: string;
  customFields: Record<string, string | number | boolean>;
}

/** Key: `${weekStartISO}__${workerId}` */
export interface WeeklyPaymentEntry {
  paid: boolean;
  paidAt?: string;
}

export interface AppSettings {
  currency: CurrencyCode;
  defaultHourlyRate: number;
  teamName: string;
}

export interface ParsedAttendanceCandidate {
  tempId: string;
  rawName: string;
  krName: string;
  hours: number | null;
  amount: number | null;
  note: string;
  zone: WorkZone;
  confidence: number;
  matchedWorkerId: string | null; // null means create new worker
  createNewIfUnmatched: boolean;
  selected: boolean;
}

export interface AppDataState {
  workers: Worker[];
  columns: ColumnConfig[];
  /** Key: `${dateISO}__${workerId}` */
  records: Record<string, AttendanceRecord>;
  /** Key: `${weekStartISO}__${workerId}` */
  payments: Record<string, WeeklyPaymentEntry>;
  settings: AppSettings;
}

export interface AppBackupPayload {
  version: number;
  exportedAt: string;
  data: AppDataState;
}

export type ActiveTab = 'daily' | 'weekly' | 'workers';
