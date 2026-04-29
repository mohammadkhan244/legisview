import { useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data/standalone';
import { Card } from '@/components/ui/card';
import { Bill } from '@/types/legislation';

// How strongly each impact type propagates outward (0–1)
const PROPAGATION_STRENGTH: Record<string, number> = {
  'tax change': 1.0,
  'market restriction': 0.85,
  'regulation increase': 0.80,
  'deregulation': 0.70,
  'regulation decrease': 0.70,
  'subsidy': 0.70,
  'funding support': 0.65,
  'program establishment': 0.55,
  'administrative change': 0.30,
  'definition clarification': 0.20,
};

const STRENGTH_WEIGHT: Record<string, number> = { High: 1.0, Medium: 0.6, Low: 0.35 };

// Downstream dependencies: if sector X is hit, which sectors feel it and how?
const SECTOR_DOWNSTREAM: Record<string, Array<{ sector: string; mechanism: string; weight: number }>> = {
  Healthcare: [
    { sector: 'Finance', mechanism: 'Insurance & benefits markets', weight: 0.75 },
    { sector: 'Technology', mechanism: 'Health IT, devices & diagnostics', weight: 0.60 },
    { sector: 'Government (Federal)', mechanism: 'Medicare / Medicaid outlays', weight: 0.80 },
    { sector: 'Education', mechanism: 'Medical & nursing workforce', weight: 0.45 },
    { sector: 'Non-profit/NGOs', mechanism: 'Nonprofit hospital networks', weight: 0.50 },
  ],
  Energy: [
    { sector: 'Manufacturing', mechanism: 'Industrial power & fuel costs', weight: 0.85 },
    { sector: 'Transportation', mechanism: 'Fuel & EV infrastructure costs', weight: 0.75 },
    { sector: 'Agriculture', mechanism: 'Farm machinery & irrigation', weight: 0.60 },
    { sector: 'Environment', mechanism: 'Emissions & renewables policy', weight: 0.90 },
    { sector: 'Finance', mechanism: 'Energy investment & commodities', weight: 0.55 },
    { sector: 'Housing', mechanism: 'Residential utility costs', weight: 0.50 },
  ],
  Finance: [
    { sector: 'Housing', mechanism: 'Mortgage availability & lending rates', weight: 0.85 },
    { sector: 'Technology', mechanism: 'Fintech & digital payments', weight: 0.65 },
    { sector: 'Agriculture', mechanism: 'Farm credit & commodity derivatives', weight: 0.50 },
    { sector: 'Education', mechanism: 'Student loan markets', weight: 0.55 },
    { sector: 'Non-profit/NGOs', mechanism: 'Charitable giving & endowments', weight: 0.45 },
  ],
  Agriculture: [
    { sector: 'Finance', mechanism: 'Crop insurance & ag lending', weight: 0.60 },
    { sector: 'Transportation', mechanism: 'Food supply chain & logistics', weight: 0.70 },
    { sector: 'Energy', mechanism: 'Biofuels & farm energy demand', weight: 0.55 },
    { sector: 'Environment', mechanism: 'Land use, water & runoff', weight: 0.75 },
  ],
  Technology: [
    { sector: 'Finance', mechanism: 'Fintech & digital banking', weight: 0.65 },
    { sector: 'Healthcare', mechanism: 'AI diagnostics & telemedicine', weight: 0.70 },
    { sector: 'Education', mechanism: 'EdTech & digital skills pipeline', weight: 0.60 },
    { sector: 'Defense', mechanism: 'Cybersecurity & defense tech', weight: 0.60 },
    { sector: 'Government (Federal)', mechanism: 'Government IT & data policy', weight: 0.50 },
  ],
  Transportation: [
    { sector: 'Energy', mechanism: 'Fuel demand & electrification', weight: 0.70 },
    { sector: 'Agriculture', mechanism: 'Freight & rural supply chain', weight: 0.65 },
    { sector: 'Environment', mechanism: 'Emission standards & clean transit', weight: 0.60 },
    { sector: 'Housing', mechanism: 'Commute patterns & urban planning', weight: 0.40 },
    { sector: 'Government (Federal)', mechanism: 'Federal highway & transit funds', weight: 0.55 },
  ],
  Education: [
    { sector: 'Technology', mechanism: 'EdTech & digital skills pipeline', weight: 0.65 },
    { sector: 'Finance', mechanism: 'Student loans & tuition financing', weight: 0.60 },
    { sector: 'Healthcare', mechanism: 'Medical & nursing workforce', weight: 0.55 },
    { sector: 'Non-profit/NGOs', mechanism: 'Scholarships & community colleges', weight: 0.50 },
    { sector: 'Government (Federal)', mechanism: 'Title programs & federal grants', weight: 0.70 },
  ],
  Housing: [
    { sector: 'Finance', mechanism: 'Mortgage & real estate credit', weight: 0.85 },
    { sector: 'Energy', mechanism: 'Building energy efficiency standards', weight: 0.50 },
    { sector: 'Environment', mechanism: 'Zoning, wetlands & urban sprawl', weight: 0.50 },
    { sector: 'Non-profit/NGOs', mechanism: 'Affordable housing nonprofits', weight: 0.55 },
    { sector: 'Transportation', mechanism: 'Transit-oriented development', weight: 0.40 },
  ],
  Environment: [
    { sector: 'Energy', mechanism: 'Renewable mandates & carbon pricing', weight: 0.85 },
    { sector: 'Agriculture', mechanism: 'Water rights & soil policy', weight: 0.70 },
    { sector: 'Transportation', mechanism: 'Emission standards & fleet rules', weight: 0.65 },
    { sector: 'Finance', mechanism: 'ESG investing & green bonds', weight: 0.50 },
  ],
  Defense: [
    { sector: 'Technology', mechanism: 'Defense R&D & cybersecurity', weight: 0.80 },
    { sector: 'Finance', mechanism: 'Contractor bonds & equity markets', weight: 0.50 },
    { sector: 'Government (Federal)', mechanism: 'Pentagon budget & procurement', weight: 0.90 },
    { sector: 'Energy', mechanism: 'Military energy & base logistics', weight: 0.45 },
  ],
  'Government (Federal)': [
    { sector: 'Finance', mechanism: 'Treasury markets & deficit spending', weight: 0.70 },
    { sector: 'Healthcare', mechanism: 'Medicare, Medicaid & VA funding', weight: 0.80 },
    { sector: 'Education', mechanism: 'Federal student aid & grants', weight: 0.70 },
    { sector: 'Defense', mechanism: 'Appropriations & procurement', weight: 0.75 },
    { sector: 'Non-profit/NGOs', mechanism: 'Federal grants to nonprofits', weight: 0.55 },
  ],
  'Tribal Governments': [
    { sector: 'Healthcare', mechanism: 'Indian Health Service funding', weight: 0.70 },
    { sector: 'Finance', mechanism: 'Tribal gaming & sovereign markets', weight: 0.50 },
    { sector: 'Environment', mechanism: 'Tribal land & water rights', weight: 0.65 },
    { sector: 'Government (Federal)', mechanism: 'Federal trust responsibility & BIA', weight: 0.80 },
  ],
  'Non-profit/NGOs': [
    { sector: 'Healthcare', mechanism: 'Nonprofit hospital networks', weight: 0.70 },
    { sector: 'Education', mechanism: 'Private schools & scholarships', weight: 0.65 },
    { sector: 'Finance', mechanism: 'Charitable giving tax deductions', weight: 0.55 },
    { sector: 'Housing', mechanism: 'Affordable housing nonprofits', weight: 0.60 },
  ],
};

// Impact types that are structurally positive/negative regardless of $ sign
const POSITIVE_TYPES = new Set(['funding support', 'subsidy', 'deregulation', 'regulation decrease', 'program establishment']);
const NEGATIVE_TYPES = new Set(['regulation increase', 'tax change', 'market restriction']);

const IMPACT_LABELS: Record<string, string> = {
  'tax change': 'Tax Change',
  'regulation increase': 'Regulation ↑',
  'regulation decrease': 'Regulation ↓',
  'funding support': 'Funding',
  'subsidy': 'Subsidy',
  'deregulation': 'Deregulation',
  'program establishment': 'New Program',
  'administrative change': 'Admin Change',
  'definition clarification': 'Clarification',
  'market restriction': 'Restriction',
};

const cssVar = (name: string, fallback = '#888') => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
};

const buildGraph = (bill: Bill) => {
  const fg = cssVar('--foreground');
  const primary = cssVar('--primary');
  const accent = cssVar('--accent');
  const card = cssVar('--card');
  const muted = cssVar('--muted-foreground');
  const impactLow = cssVar('--impact-low');
  const impactHigh = cssVar('--impact-high');

  const nodes: object[] = [];
  const edges: object[] = [];

  // Bill node at center (level 0)
  nodes.push({
    id: '__bill__',
    label: bill.number,
    title: `${bill.number}\n${bill.title}`,
    shape: 'hexagon',
    size: 36,
    level: 0,
    color: { background: primary, border: accent },
    font: { color: fg, size: 15, bold: true, face: 'inherit' },
  });

  // Group impacts by sector so multiple Agriculture/Healthcare entries don't create duplicate node IDs
  const bySector = new Map<string, typeof bill.impacts>();
  bill.impacts.forEach((impact) => {
    const group = bySector.get(impact.sector) ?? [];
    group.push(impact);
    bySector.set(impact.sector, group);
  });

  const directSectors = new Set(bySector.keys());

  // Direct impact nodes (level 1) — one node per unique sector
  bySector.forEach((impacts, sector) => {
    // Pick the strongest impact for visual representation
    const primary = impacts.reduce((a, b) =>
      (STRENGTH_WEIGHT[b.strength] ?? 0.5) > (STRENGTH_WEIGHT[a.strength] ?? 0.5) ? b : a,
    );

    const totalEcon = impacts.reduce((sum, i) =>
      typeof i.economicImpact === 'number' ? sum + i.economicImpact : sum, 0,
    );
    const hasEcon = impacts.some((i) => typeof i.economicImpact === 'number');
    const netPos = hasEcon
      ? totalEcon >= 0
      : POSITIVE_TYPES.has(primary.impactType)
      ? true
      : NEGATIVE_TYPES.has(primary.impactType)
      ? false
      : true;

    const size = primary.strength === 'High' ? 28 : primary.strength === 'Medium' ? 22 : 16;
    const bgColor = netPos ? impactLow : impactHigh;

    const tipLines = [
      sector,
      impacts.map((i) => `  · ${i.impactType} (${i.strength})`).join('\n'),
      hasEcon ? `Net economic: ${totalEcon >= 0 ? '+' : ''}$${Math.abs(totalEcon).toFixed(1)}B` : '',
      `\n"${primary.explanation.slice(0, 140)}${primary.explanation.length > 140 ? '…' : ''}"`,
    ].filter(Boolean).join('\n');

    nodes.push({
      id: `d_${sector}`,
      label: sector,
      title: tipLines,
      shape: 'dot',
      size,
      level: 1,
      color: { background: bgColor, border: accent, highlight: { background: bgColor, border: primary } },
      font: { color: fg, size: 12, face: 'inherit' },
    });

    // Collapse multiple impacts on same sector into one combined edge label
    const edgeWidth = primary.strength === 'High' ? 4 : primary.strength === 'Medium' ? 2.5 : 1.5;
    const uniqueTypes = [...new Set(impacts.map((i) => IMPACT_LABELS[i.impactType] ?? i.impactType))];
    const edgeLabel = uniqueTypes.slice(0, 2).join(' + ') + (uniqueTypes.length > 2 ? ' +…' : '');

    edges.push({
      id: `bill->d_${sector}`,
      from: '__bill__',
      to: `d_${sector}`,
      label: edgeLabel,
      width: edgeWidth,
      color: { color: bgColor, opacity: 0.85 },
      font: { color: fg, size: 10, strokeWidth: 3, strokeColor: card, face: 'inherit', align: 'middle' },
      arrows: { to: { enabled: true, scaleFactor: 0.65 } },
      smooth: { enabled: true, type: 'curvedCW', roundness: 0.15 },
    });
  });

  // Build indirect propagation map
  const indirectAccum: Record<
    string,
    { weight: number; sources: Array<{ from: string; mechanism: string }> }
  > = {};

  // Use the grouped-by-sector map so each sector contributes once
  bySector.forEach((impacts, sector) => {
    // Pick max propagation strength across all impacts for this sector
    const maxProp = impacts.reduce((best, impact) => {
      const p = (PROPAGATION_STRENGTH[impact.impactType] ?? 0.40) * (STRENGTH_WEIGHT[impact.strength] ?? 0.5);
      return p > best ? p : best;
    }, 0);

    // Use the mechanism label from the strongest-propagating impact type
    const bestImpact = impacts.reduce((a, b) => {
      const ap = (PROPAGATION_STRENGTH[a.impactType] ?? 0.40) * (STRENGTH_WEIGHT[a.strength] ?? 0.5);
      const bp = (PROPAGATION_STRENGTH[b.impactType] ?? 0.40) * (STRENGTH_WEIGHT[b.strength] ?? 0.5);
      return bp > ap ? b : a;
    });

    const downstream = SECTOR_DOWNSTREAM[sector] ?? [];
    downstream.forEach(({ sector: target, mechanism, weight }) => {
      if (directSectors.has(target)) return;
      const totalWeight = maxProp * weight;
      if (totalWeight < 0.25) return;
      if (!indirectAccum[target]) indirectAccum[target] = { weight: 0, sources: [] };
      if (totalWeight > indirectAccum[target].weight) indirectAccum[target].weight = totalWeight;
      // Avoid duplicate source entries for the same sector
      if (!indirectAccum[target].sources.find((s) => s.from === sector)) {
        indirectAccum[target].sources.push({ from: sector, mechanism });
      }
    });

    void bestImpact; // used above for propagation strength selection
  });

  // Top 7 indirect nodes by propagation weight
  const indirectEntries = Object.entries(indirectAccum)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 7);

  indirectEntries.forEach(([sector, { weight, sources }]) => {
    const size = 10 + Math.round(weight * 12);
    const tip = [
      `${sector}  (indirect / downstream)`,
      `Propagation strength: ${(weight * 100).toFixed(0)}%`,
      sources.map((s) => `  · ${s.from} → "${s.mechanism}"`).join('\n'),
    ].join('\n');

    nodes.push({
      id: `i_${sector}`,
      label: sector,
      title: tip,
      shape: 'dot',
      size,
      level: 2,
      color: { background: card, border: muted, highlight: { background: card, border: primary } },
      font: { color: muted, size: 11, face: 'inherit' },
    });

    // Draw one edge per unique source sector → indirect sector
    const seen = new Set<string>();
    sources.forEach(({ from, mechanism }) => {
      if (seen.has(from)) return;
      seen.add(from);
      edges.push({
        id: `${from}->i_${sector}`,
        from: `d_${from}`,
        to: `i_${sector}`,
        label: mechanism.length > 28 ? mechanism.slice(0, 26) + '…' : mechanism,
        dashes: true,
        width: 0.5 + weight * 2,
        color: { color: muted, opacity: 0.55 },
        font: { color: muted, size: 9, strokeWidth: 2, strokeColor: card, face: 'inherit', align: 'middle' },
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
        smooth: { enabled: true, type: 'curvedCCW', roundness: 0.25 },
      });
    });
  });

  return { nodes, edges };
};

interface Props {
  bill: Bill;
  height?: number;
}

const BillPropagationGraph = ({ bill, height = 520 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { nodes, edges } = useMemo(() => buildGraph(bill), [bill]);

  useEffect(() => {
    if (!containerRef.current || !bill.impacts.length) return;

    const network = new Network(
      containerRef.current,
      { nodes: new DataSet(nodes), edges: new DataSet(edges) },
      {
        autoResize: true,
        height: `${height}px`,
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            levelSeparation: 190,
            nodeSpacing: 140,
            treeSpacing: 180,
            blockShifting: true,
            edgeMinimization: true,
          },
        },
        physics: { enabled: false },
        interaction: { hover: true, tooltipDelay: 100, zoomView: true, dragView: true, dragNodes: true },
        edges: { selectionWidth: 2 },
      },
    );

    return () => network.destroy();
  }, [nodes, edges, height, bill.impacts.length]);

  if (!bill.impacts.length) return null;

  const indirectCount = nodes.filter((n: object) => (n as {id: string}).id.startsWith('i_')).length;

  return (
    <Card variant="glass" className="p-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold">Impact Propagation Network</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="font-mono text-primary">{bill.number}</span> — direct provisions (center ring) and their downstream ripple effects (outer ring). Hover nodes and edges for detail.
        </p>
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-lg border border-border/50 bg-background/40"
        style={{ height }}
      />

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-primary text-[8px] font-bold text-primary-foreground">⬡</span>
          Bill
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-impact-low inline-block" /> Direct: gain
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-impact-high inline-block" /> Direct: cost / restriction
        </span>
        {indirectCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border border-muted-foreground inline-block" /> Downstream ({indirectCount})
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t border-dashed border-muted-foreground inline-block" /> Propagation
        </span>
      </div>
    </Card>
  );
};

export default BillPropagationGraph;
