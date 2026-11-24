import type { ParsedAttendanceCandidate, Worker, WorkZone } from '../types';
import { matchWorkerByName } from './format';

export interface SmartTextParseOutput {
  detectedDate: string; // YYYY-MM-DD or ''
  detectedZone: WorkZone | '';
  items: ParsedAttendanceCandidate[];
}

function parseFormattedMoney(token: string): number | null {
  const kMatch = token.match(/^(\d+(?:[.,]\d+)?)\s*k$/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(',', '.'));
    return Number.isFinite(num) ? Math.round(num * 1000) : null;
  }
  const digitsOnly = token.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;
  const num = parseInt(digitsOnly, 10);
  return Number.isFinite(num) && num >= 1000 ? num : null;
}

function detectHeaderDate(text: string): string {
  const fullMatch = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (fullMatch) {
    const d = Number(fullMatch[1]);
    const m = Number(fullMatch[2]);
    const y = Number(fullMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const shortMatch = text.match(/(?:ngày|ngay|date)\s*[:\-]?\s*(\d{1,2})[/\-.](\d{1,2})\b/i);
  if (shortMatch) {
    const d = Number(shortMatch[1]);
    const m = Number(shortMatch[2]);
    const y = new Date().getFullYear();
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}

function detectHeaderZone(text: string): WorkZone | '' {
  const lower = text.toLowerCase();
  const hasIdong = /i\s*동|아이동|i\s*dong/i.test(lower);
  const hasChadong = /차\s*동|cha\s*dong/i.test(lower);
  if (hasIdong && !hasChadong) return 'I동';
  if (hasChadong && !hasIdong) return '차동';
  return '';
}

function splitNamePair(raw: string): { fb: string; kr: string } {
  const trimmed = raw.trim();
  const paren = trimmed.match(/^(.+?)\s*[（(](.+?)[)）]\s*$/);
  if (paren) {
    const p1 = paren[1].trim();
    const p2 = paren[2].trim();
    if (/[\uAC00-\uD7AF]/.test(p1) && !/[\uAC00-\uD7AF]/.test(p2)) {
      return { fb: p2, kr: p1 };
    }
    return { fb: p1, kr: p2 };
  }
  if (/[\uAC00-\uD7AF]/.test(trimmed)) {
    return { fb: trimmed, kr: trimmed };
  }
  return { fb: trimmed, kr: '' };
}

function isHeaderOrSummaryRow(line: string): boolean {
  const lower = line.toLowerCase();
  if (
    lower.includes('tổng cộng') ||
    lower.includes('tong cong') ||
    lower.includes('bảng tính tiền') ||
    lower.includes('bang tinh tien') ||
    lower.includes('mức lương:') ||
    (lower.includes('stt') && (lower.includes('tên') || lower.includes('số giờ')))
  ) {
    return true;
  }
  return false;
}

/**
 * Parses messy Vietnamese / Korean roll-call text OR tab-separated Excel/Sheets paste.
 * Supports:
 *  - "John Việt (조니비엣) - 5h - 60k"
 *  - "Hưng 6h 72.000 tăng ca"
 *  - "반디엔 5시간 60,000원"
 *  - "Long Lê - 80k" (amount only, no hours)
 *  - "Đức Anh: 6.5 tiếng" (hours only, auto-calculates amount)
 *  - Excel/Google Sheets tab-separated rows: "1\t조니비엣\tJohn Việt\t아이동 (18h - 24h)\t5\t60.000"
 */
export function parseAttendanceText(
  rawText: string,
  workers: Worker[],
  defaultZone: WorkZone = 'I동',
): SmartTextParseOutput {
  const detectedDate = detectHeaderDate(rawText);
  const detectedZone = detectHeaderZone(rawText);
  const fallbackZone: WorkZone = detectedZone || defaultZone;

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ParsedAttendanceCandidate[] = [];

  lines.forEach((line, idx) => {
    if (isHeaderOrSummaryRow(line)) return;

    // 1. Check Tab-separated Excel / Google Sheets row
    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim());
      if (cells.length >= 2) {
        let krName = '';
        let fbName = '';
        let hours: number | null = null;
        let amount: number | null = null;
        let rowZone: WorkZone = fallbackZone;
        const notes: string[] = [];

        cells.forEach((cell, cellIdx) => {
          if (!cell) return;
          // Skip STT index column
          if (cellIdx === 0 && /^\d{1,3}$/.test(cell)) return;

          if (/아이동|i\s*동/i.test(cell)) {
            rowZone = 'I동';
            notes.push(cell);
            return;
          }
          if (/차동/i.test(cell)) {
            rowZone = '차동';
            notes.push(cell);
            return;
          }

          // Pure number or formatted money
          const moneyVal = parseFormattedMoney(cell.replace(/\s*(krw|vnd|원|₩|₫|đ)\s*/gi, ''));
          if (moneyVal !== null && moneyVal >= 1000 && /^[\d.,\s]+(k|krw|vnd|원|₩|₫|đ)?$/i.test(cell)) {
            amount = moneyVal;
            return;
          }

          const numMatch = cell.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|giờ|tiếng|시간)?$/i);
          if (numMatch) {
            const val = parseFloat(numMatch[1].replace(',', '.'));
            if (val >= 0 && val <= 24) {
              hours = Math.round(val * 100) / 100;
              return;
            }
          }

          // Hangul vs Latin name
          if (/[\uAC00-\uD7AF]/.test(cell) && !krName) {
            krName = cell;
          } else if (!fbName && cell.length <= 40) {
            fbName = cell;
          } else {
            notes.push(cell);
          }
        });

        const primaryName = fbName || krName;
        if (!primaryName) return;

        const matched =
          matchWorkerByName(primaryName, workers) ||
          (krName ? matchWorkerByName(krName, workers) : null);

        items.push({
          tempId: `txt_${Date.now()}_${idx}`,
          rawName: primaryName,
          krName: krName || (matched ? matched.worker.krName : ''),
          hours,
          amount,
          note: notes.join(' · '),
          zone: matched ? matched.worker.zone : rowZone,
          confidence: matched ? matched.score : 0.75,
          matchedWorkerId: matched ? matched.worker.id : null,
          createNewIfUnmatched: !matched,
          selected: true,
        });
        return;
      }
    }

    // Skip single metadata lines like "Ngày 22/11" or "Ca làm việc: ..."
    if (/^(ngày|ca làm việc|mức lương|bảng|đội)\s*[:\-]/i.test(line)) return;

    // 2. Free-form line parsing
    const cleanedLine = line.replace(/^(\d+[.)]\s*|[-*•]+\s*)/, '').trim();
    if (!cleanedLine) return;

    let working = cleanedLine;
    let rowZone: WorkZone = fallbackZone;
    if (/아이동|i\s*동/i.test(working)) rowZone = 'I동';
    else if (/차동/i.test(working)) rowZone = '차동';

    // Extract money (skip if explicitly preceded by ứng / tạm ứng / 가불)
    let amount: number | null = null;
    const moneyRegex =
      /(?:^|[\s\-:|,/])((?:\d+(?:[.,]\d+)?\s*k)|(?:\d{1,3}(?:[.,]\d{3})+(?:\s*(?:krw|vnd|원|₩|₫|đ))?)|(?:\d{4,}\s*(?:krw|vnd|원|₩|₫|đ)?))(?=$|[\s\-:|,/])/gi;

    let mMatch: RegExpExecArray | null;
    const moneyMatches: Array<{ index: number; full: string; val: number; isAdvance: boolean }> = [];
    while ((mMatch = moneyRegex.exec(working)) !== null) {
      const token = mMatch[1].trim();
      const val = parseFormattedMoney(token);
      if (val !== null) {
        const prefix = working.slice(Math.max(0, mMatch.index - 12), mMatch.index).toLowerCase();
        const isAdvance = /(?:ứng|ung|가불)\s*$/.test(prefix);
        moneyMatches.push({
          index: mMatch.index,
          full: mMatch[0],
          val,
          isAdvance,
        });
      }
    }

    const payMatch = moneyMatches.find((m) => !m.isAdvance);
    if (payMatch) {
      amount = payMatch.val;
      working =
        working.slice(0, payMatch.index) +
        ' ' +
        working.slice(payMatch.index + payMatch.full.length);
      working = working.replace(/\s+/g, ' ').trim();
    }

    // Extract hours
    const explicitHourRegex =
      /(?:^|[\s\-:|,/])(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|giờ|gio|tiếng|tieng|시간)\b/i;
    const fallbackHourRegex = /(?:[\s\-:|,/])(\d+(?:[.,]\d+)?)(?=\s*(?:$|[-:|,/]))/;

    let hours: number | null = null;
    const hourMatch = working.match(explicitHourRegex);
    let matchIndex = -1;
    let matchLength = 0;

    if (hourMatch && hourMatch.index !== undefined) {
      hours = parseFloat(hourMatch[1].replace(',', '.'));
      matchIndex = hourMatch.index;
      matchLength = hourMatch[0].length;
    } else {
      const fbMatch = working.match(fallbackHourRegex);
      if (fbMatch && fbMatch.index !== undefined) {
        const val = parseFloat(fbMatch[1].replace(',', '.'));
        if (val >= 0 && val <= 24) {
          hours = val;
          matchIndex = fbMatch.index;
          matchLength = fbMatch[0].length;
        }
      }
    }

    let rawNamePart = working;
    let note = '';

    if (matchIndex >= 0) {
      const before = working.slice(0, matchIndex).trim();
      const after = working.slice(matchIndex + matchLength).trim();
      rawNamePart = before.replace(/[-:|,/]+$/, '').trim();
      note = after.replace(/^[-:|,/]+/, '').trim();
    } else {
      const parts = working.split(/\s*[-:|/]\s*/).filter(Boolean);
      rawNamePart = (parts[0] || working).trim();
      if (parts.length > 1) {
        note = parts.slice(1).join(' - ').trim();
      }
    }

    if (!rawNamePart) rawNamePart = working;

    const split = splitNamePair(rawNamePart);
    const matched =
      matchWorkerByName(rawNamePart, workers) ||
      matchWorkerByName(split.fb, workers) ||
      (split.kr ? matchWorkerByName(split.kr, workers) : null);

    items.push({
      tempId: `txt_${Date.now()}_${idx}`,
      rawName: split.fb,
      krName: split.kr || (matched ? matched.worker.krName : ''),
      hours: hours !== null && Number.isFinite(hours) ? Math.max(0, Math.round(hours * 100) / 100) : null,
      amount,
      note,
      zone: matched ? matched.worker.zone : rowZone,
      confidence: matched ? matched.score : 0.45,
      matchedWorkerId: matched ? matched.worker.id : null,
      createNewIfUnmatched: !matched,
      selected: true,
    });
  });

  return { detectedDate, detectedZone, items };
}
