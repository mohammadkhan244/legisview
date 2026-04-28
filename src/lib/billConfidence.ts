import { Bill } from '@/types/legislation';

export interface ConfidenceResult {
  level: 'low' | 'partial' | 'good';
  reasons: string[];
}

/**
 * Heuristic data-quality check for an analyzed bill.
 * Triggered when the upstream scrape returned sparse content
 * (e.g. Firecrawl partial response, PDF unreachable, etc.).
 */
export const assessBillConfidence = (bill: Bill): ConfidenceResult => {
  const reasons: string[] = [];

  const titleMissing =
    !bill.title || /^unknown$/i.test(bill.title.trim()) || bill.title.trim().length < 5;
  const summaryMissing = !bill.summary || bill.summary.trim().length < 40;
  const sponsorsMissing =
    !bill.sponsors?.length ||
    bill.sponsors.every((s) => !s || /^unknown$/i.test(s.trim()));
  const noImpacts = !bill.impacts?.length;

  if (titleMissing) reasons.push('Title could not be extracted');
  if (summaryMissing) reasons.push('Bill summary is missing or very short');
  if (sponsorsMissing) reasons.push('Sponsor information unavailable');
  if (noImpacts) reasons.push('No sector impacts were generated');

  if (reasons.length === 0) return { level: 'good', reasons };
  if (reasons.length >= 2 || titleMissing || noImpacts)
    return { level: 'low', reasons };
  return { level: 'partial', reasons };
};
