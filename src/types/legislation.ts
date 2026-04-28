export type ImpactStrength = 'High' | 'Medium' | 'Low';

export type ImpactType =
  | 'funding support'
  | 'regulation increase'
  | 'regulation decrease'
  | 'tax change'
  | 'subsidy'
  | 'deregulation'
  | 'program establishment'
  | 'administrative change'
  | 'definition clarification'
  | 'market restriction';

/** Controlled sector taxonomy used across all bills for cross-bill comparability.
 *  AI may also return `Other: <freeform name>` when a bill genuinely affects a sector
 *  outside this list. */
export const CONTROLLED_SECTORS = [
  'Energy',
  'Healthcare',
  'Finance',
  'Agriculture',
  'Technology',
  'Transportation',
  'Education',
  'Housing',
  'Environment',
  'Defense',
  'Government (Federal)',
  'Tribal Governments',
  'Non-profit/NGOs',
] as const;

export interface SectorImpact {
  sector: string;
  impactType: ImpactType;
  strength: ImpactStrength;
  explanation: string;
  /** In billions over 5 years. Null/undefined when the bill lacks a quantitative anchor. */
  economicImpact?: number | null;
  quantitativeBasis?: string;
  confidence?: 'High' | 'Medium' | 'Low';
  assumptions?: string;
}

/** Societal impact dimensions — orthogonal to economic sectors. */
export const SOCIETAL_DIMENSIONS = [
  'Civil Rights & Liberties',
  'Public Health & Safety',
  'Equity & Access',
  'Environmental Justice',
  'Education Access',
  'Housing & Community',
  'Criminal Justice',
  'Workers & Labor',
  'Privacy & Data Rights',
  'Democratic Participation',
] as const;

export interface SocietalImpact {
  dimension: string;
  /** Direction of the change for the affected population. */
  direction: 'Expands' | 'Restricts' | 'Reforms' | 'Mixed';
  strength: ImpactStrength;
  /** Plain-language description of who is affected. */
  affectedGroups: string;
  /** Grounded explanation citing the bill text. */
  explanation: string;
  confidence?: 'High' | 'Medium' | 'Low';
}

export interface Bill {
  id: string;
  title: string;
  number: string;
  status: 'Introduced' | 'In Committee' | 'Passed' | 'Enacted' | 'Vetoed';
  introducedDate: string;
  summary: string;
  sponsors: string[];
  impacts: SectorImpact[];
  societalImpacts?: SocietalImpact[];
  /** Plain-language stakeholder-oriented policy brief (3-4 sentences). */
  narrativeBrief?: string;
  /** When the cached analysis was last checked against the source site. */
  lastCheckedAt?: string;
  /** Federal action timeline (most recent first). */
  actions?: Array<{ date: string; text: string; type?: string }>;
  /** Federal cosponsor list. */
  cosponsors?: Array<{ name: string; party?: string; state?: string }>;
  /** First ~1500 chars of extracted bill text for verification. */
  textExcerpt?: string;
  /** Canonical source page (congress.gov / Ohio Legislature) the analysis was built from. */
  sourceUrl?: string;
  /** Direct PDF / formatted-text URL for the bill, when known. */
  pdfUrl?: string;
  /** Link to the CBO cost estimate page, when one is published. */
  cboUrl?: string;
  /** Short excerpt from the CBO cost estimate, when available. */
  cboEstimate?: string;
}

export interface OhioEconomicData {
  sector: string;
  gdpContribution: number;
  employment: number;
  growth: number;
}
