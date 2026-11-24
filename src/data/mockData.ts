import type { AppDataState, AttendanceRecord, ColumnConfig, Worker, WorkZone } from '../types';

export const TARGET_DATE_ISO = '2026-11-22';

export const ZONE_META: Record<
  WorkZone,
  { title: string; shiftLabel: string; timeRange: string }
> = {
  'I동': {
    title: 'Bảng chấm công I 동',
    shiftLabel: '아이동 (18h - 24h)',
    timeRange: '18h - 24h',
  },
  '차동': {
    title: 'Bảng chấm công 차동',
    shiftLabel: '차동 (20h - 01h)',
    timeRange: '20h - 01h',
  },
};

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  {
    id: 'col_fbName',
    key: 'fbName',
    label: 'Tên tiếng Việt / FB',
    type: 'text',
    visible: true,
    system: true,
    systemKey: 'fbName',
  },
  {
    id: 'col_krName',
    key: 'krName',
    label: 'Tên tiếng Hàn',
    type: 'text',
    visible: true,
    system: true,
    systemKey: 'krName',
  },
  {
    id: 'col_shift',
    key: 'shift',
    label: 'Ca làm việc',
    type: 'text',
    visible: true,
    system: false,
  },
  {
    id: 'col_hours',
    key: 'hours',
    label: 'Số giờ',
    type: 'number',
    visible: true,
    system: true,
    systemKey: 'hours',
  },
  {
    id: 'col_amount',
    key: 'amount',
    label: 'Số tiền',
    type: 'currency',
    visible: true,
    system: true,
    systemKey: 'amount',
  },
  {
    id: 'col_weeklyTotal',
    key: 'weeklyTotal',
    label: 'Tổng tiền cuối tuần',
    type: 'computed_weekly',
    visible: true,
    system: true,
    systemKey: 'weeklyTotal',
  },
  {
    id: 'col_note',
    key: 'note',
    label: 'Ghi chú',
    type: 'text',
    visible: true,
    system: true,
    systemKey: 'note',
  },
];

const IDONG_WORKERS_SEED: Array<{ id: string; krName: string; fbName: string }> = [
  { id: 'w_i1', krName: '조니비엣', fbName: 'John Việt' },
  { id: 'w_i2', krName: '반디엔', fbName: 'Tiến' },
  { id: 'w_i3', krName: '광훈', fbName: 'Thìn' },
  { id: 'w_i4', krName: '레뒤', fbName: 'Lê Duy' },
  { id: 'w_i5', krName: '렁', fbName: 'Long' },
  { id: 'w_i6', krName: '득', fbName: 'Đức' },
  { id: 'w_i7', krName: '쭝', fbName: 'Dũng' },
  { id: 'w_i8', krName: '득안', fbName: 'Đức Anh' },
  { id: 'w_i9', krName: '가잉', fbName: 'Cảnh' },
  { id: 'w_i10', krName: '마이탕', fbName: 'Mai Thắng' },
];

const CHADONG_WORKERS_SEED: Array<{ id: string; krName: string; fbName: string }> = [
  { id: 'w_c1', krName: '흥', fbName: 'Hưng' },
  { id: 'w_c2', krName: '딘뚱', fbName: 'Đinh Trung' },
  { id: 'w_c3', krName: '렁레', fbName: 'Long Lê' },
  { id: 'w_c4', krName: '이아', fbName: 'Trung Nghĩa' },
  { id: 'w_c5', krName: '득기엣', fbName: 'Đức Kiệt' },
];

export function createMockData(): AppDataState {
  const iDongWorkers: Worker[] = IDONG_WORKERS_SEED.map((item) => ({
    id: item.id,
    fbName: item.fbName,
    krName: item.krName,
    zone: 'I동',
    hourlyRate: 12000,
    active: true,
    createdAt: TARGET_DATE_ISO,
  }));

  const chaDongWorkers: Worker[] = CHADONG_WORKERS_SEED.map((item) => ({
    id: item.id,
    fbName: item.fbName,
    krName: item.krName,
    zone: '차동',
    hourlyRate: 12000,
    active: true,
    createdAt: TARGET_DATE_ISO,
  }));

  const workers = [...iDongWorkers, ...chaDongWorkers];
  const records: Record<string, AttendanceRecord> = {};

  for (const w of workers) {
    records[`${TARGET_DATE_ISO}__${w.id}`] = {
      date: TARGET_DATE_ISO,
      workerId: w.id,
      hours: 5,
      manualAmount: null, // 5h * 12,000 = 60,000 KRW
      note: '',
      customFields: {
        shift: ZONE_META[w.zone].shiftLabel,
      },
    };
  }

  return {
    workers,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    records,
    payments: {},
    settings: {
      currency: 'KRW',
      defaultHourlyRate: 12000,
      teamName: 'Đội I 동 & 차동',
    },
  };
}
