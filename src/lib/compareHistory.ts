/**
 * Recent-comparisons store, persisted to localStorage.
 *
 * A comparison entry captures the *set* of bill source URLs that were viewed
 * side-by-side, plus minimal display metadata (bill numbers) so we can render
 * a quick-launch chip without re-fetching the analyses.
 */
import { encodeBillSlug } from './billUrl';

export interface CompareHistoryEntry {
  /** Stable key built from sorted, normalised URLs. */
  key: string;
  /** Original URLs in user-selected order. */
  urls: string[];
  /** Short labels for each URL (e.g. "HR 776"). Falls back to a parsed token. */
  labels: string[];
  /** ISO timestamp of the most recent visit. */
  visitedAt: string;
  /** "federal" if every URL is congress.gov, "ohio" if every URL is Ohio,
   *  otherwise "mixed". Used for chip colouring. */
  jurisdiction: 'federal' | 'ohio' | 'mixed';
}

const KEY = 'legisview.compareHistory.v1';
const MAX_ENTRIES = 8;

const norm = (u: string) =>
  u.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();

const buildKey = (urls: string[]) =>
  urls.map(norm).slice().sort().join('|');

const detectJurisdiction = (url: string): 'federal' | 'ohio' | 'unknown' => {
  if (/legislature\.ohio\.gov|ohiohouse\.gov|ohiosenate\.gov/i.test(url)) return 'ohio';
  if (/congress\.gov/i.test(url)) return 'federal';
  return 'unknown';
};

const parseLabel = (url: string): string => {
  // Federal: /bill/119th-congress/house-bill/776
  const fed = url.match(/\/bill\/\d+(?:st|nd|rd|th)-congress\/([a-z-]+)\/(\d+)/i);
  if (fed) {
    const map: Record<string, string> = {
      'house-bill': 'HR', 'senate-bill': 'S',
      'house-joint-resolution': 'H.J.Res', 'senate-joint-resolution': 'S.J.Res',
      'house-resolution': 'H.Res', 'senate-resolution': 'S.Res',
      'house-concurrent-resolution': 'H.Con.Res', 'senate-concurrent-resolution': 'S.Con.Res',
    };
    return `${map[fed[1].toLowerCase()] ?? fed[1]} ${fed[2]}`;
  }
  // Ohio: /legislation/136/sb2
  const oh = url.match(/\/legislation\/(\d+)\/([a-z]+)(\d+)/i);
  if (oh) return `${oh[2].toUpperCase()} ${oh[3]}`;
  return url.replace(/^https?:\/\//, '').slice(0, 28);
};

const summariseJurisdiction = (urls: string[]): CompareHistoryEntry['jurisdiction'] => {
  const set = new Set(urls.map(detectJurisdiction));
  set.delete('unknown');
  if (set.size === 1) return [...set][0] as 'federal' | 'ohio';
  return 'mixed';
};

export const readCompareHistory = (): CompareHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CompareHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/** Record (or refresh) a comparison; returns the updated history. */
export const recordCompare = (
  urls: string[],
  labelsByUrl: Record<string, string> = {},
): CompareHistoryEntry[] => {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean);
  if (cleaned.length < 2) return readCompareHistory();

  const entry: CompareHistoryEntry = {
    key: buildKey(cleaned),
    urls: cleaned,
    labels: cleaned.map((u) => labelsByUrl[u] ?? parseLabel(u)),
    visitedAt: new Date().toISOString(),
    jurisdiction: summariseJurisdiction(cleaned),
  };

  const existing = readCompareHistory().filter((e) => e.key !== entry.key);
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
};

export const removeCompareEntry = (key: string): CompareHistoryEntry[] => {
  const next = readCompareHistory().filter((e) => e.key !== key);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
};

export const clearCompareHistory = () => {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
};

/** Build the `/compare?bills=…` route for an entry. */
export const compareEntryHref = (entry: CompareHistoryEntry) =>
  `/compare?bills=${entry.urls.map(encodeBillSlug).join(',')}`;