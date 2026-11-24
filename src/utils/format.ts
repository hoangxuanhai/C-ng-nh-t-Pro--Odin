import type { AttendanceRecord, CurrencyCode, Worker } from '../types';

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const rounded = Math.round(amount || 0);
  const formatted = new Intl.NumberFormat('en-US').format(rounded);
  return currency === 'KRW' ? `${formatted} ₩` : `${formatted} ₫`;
}

export function formatCurrencyCompact(amount: number, currency: CurrencyCode): string {
  const rounded = Math.round(amount || 0);
  const formatted = new Intl.NumberFormat('en-US').format(rounded);
  return currency === 'KRW' ? `₩${formatted}` : `${formatted}đ`;
}

export function formatHours(hours: number): string {
  if (!hours) return '0';
  const fixed = Math.round(hours * 100) / 100;
  return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

export function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

function stringSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return Math.max(0.84, ratio);
  }

  const tokensA = na.split(' ');
  const tokensB = nb.split(' ');
  const overlap = tokensA.filter((t) => tokensB.includes(t)).length;
  const tokenScore = overlap / Math.max(tokensA.length, tokensB.length);

  const dist = levenshtein(na, nb);
  const levScore = 1 - dist / Math.max(na.length, nb.length);

  return Math.max(levScore, tokenScore * 0.9);
}

/**
 * Fuzzy matches an extracted or pasted name against existing workers (fbName & krName).
 * Returns `{ worker, score }` if score >= 0.55, otherwise `null`.
 */
export function matchWorkerByName(
  rawName: string,
  workers: Worker[],
): { worker: Worker; score: number } | null {
  const cleaned = rawName.trim();
  if (!cleaned) return null;

  // Also test parts inside parentheses, e.g. "Nguyễn Minh Tuấn (김민준)"
  const parenMatch = cleaned.match(/^(.+?)\s*[（(](.+?)[)）]\s*$/);
  const variants = parenMatch
    ? [cleaned, parenMatch[1].trim(), parenMatch[2].trim()]
    : [cleaned];

  let bestWorker: Worker | null = null;
  let bestScore = 0;

  for (const w of workers) {
    for (const v of variants) {
      const sFb = w.fbName ? stringSimilarity(v, w.fbName) : 0;
      const sKr = w.krName ? stringSimilarity(v, w.krName) : 0;
      const sCombined = stringSimilarity(v, `${w.fbName} ${w.krName}`);
      const score = Math.max(sFb, sKr, sCombined);
      if (score > bestScore) {
        bestScore = score;
        bestWorker = w;
      }
    }
  }

  if (bestWorker && bestScore >= 0.55) {
    return { worker: bestWorker, score: bestScore };
  }
  return null;
}

export function getEffectiveHourlyRate(worker: Worker, defaultRate: number): number {
  return worker.hourlyRate && worker.hourlyRate > 0 ? worker.hourlyRate : defaultRate;
}

export function getRecordHourlyRate(
  record: AttendanceRecord | undefined,
  worker: Worker,
  defaultRate: number,
): number {
  if (record?.hourlyRate && record.hourlyRate > 0) {
    return record.hourlyRate;
  }
  return getEffectiveHourlyRate(worker, defaultRate);
}
