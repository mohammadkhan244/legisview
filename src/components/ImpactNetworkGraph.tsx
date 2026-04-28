import { useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data/standalone';
import { Card } from '@/components/ui/card';
import { Bill } from '@/types/legislation';

interface ImpactNetworkGraphProps {
  bills: Bill[];
  /** "unified" merges all bills into a single ecosystem; "split" renders one graph per bill. */
  mode?: 'unified' | 'split';
}

// Ohio macro indicators every sector connects to (status-quo ecosystem)
const MACRO_NODES = [
  { id: 'macro-gdp', label: 'Ohio GDP' },
  { id: 'macro-jobs', label: 'Employment' },
  { id: 'macro-tax', label: 'Tax Revenue' },
  { id: 'macro-prices', label: 'Consumer Prices' },
  { id: 'macro-investment', label: 'Capital Investment' },
];

// Heuristic: how each sector flows into macro indicators (0-1 weights)
const SECTOR_TO_MACRO: Record<string, Partial<Record<string, number>>> = {
  Energy:         { 'macro-gdp': 0.6, 'macro-jobs': 0.4, 'macro-prices': 0.8, 'macro-investment': 0.7 },
  Manufacturing:  { 'macro-gdp': 0.9, 'macro-jobs': 0.9, 'macro-tax': 0.7, 'macro-investment': 0.6 },
  Healthcare:     { 'macro-gdp': 0.8, 'macro-jobs': 0.9, 'macro-prices': 0.6, 'macro-tax': 0.5 },
  Finance:        { 'macro-gdp': 0.7, 'macro-tax': 0.8, 'macro-investment': 0.9 },
  Technology:     { 'macro-gdp': 0.5, 'macro-jobs': 0.4, 'macro-investment': 0.8 },
  Agriculture:    { 'macro-gdp': 0.4, 'macro-jobs': 0.5, 'macro-prices': 0.7 },
  Transportation: { 'macro-gdp': 0.6, 'macro-jobs': 0.6, 'macro-prices': 0.5 },
  Education:      { 'macro-jobs': 0.7, 'macro-tax': 0.6, 'macro-investment': 0.4 },
  Retail:         { 'macro-gdp': 0.5, 'macro-jobs': 0.7, 'macro-prices': 0.6, 'macro-tax': 0.5 },
  Construction:   { 'macro-gdp': 0.6, 'macro-jobs': 0.7, 'macro-investment': 0.6 },
};

const DEFAULT_MACRO_LINKS: Partial<Record<string, number>> = {
  'macro-gdp': 0.5,
  'macro-jobs': 0.5,
  'macro-tax': 0.4,
};

const cssVar = (name: string) => {
  if (typeof window === 'undefined') return '#888';
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : '#888';
};

interface BuildOptions {
  bills: Bill[];
  /** Optional prefix to scope node ids when rendering multiple graphs on one page. */
  scope?: string;
}

const buildGraph = ({ bills, scope = '' }: BuildOptions) => {
  const primary = cssVar('--primary');
  const accent = cssVar('--accent');
  const fg = cssVar('--foreground');
  const muted = cssVar('--muted-foreground');
  const card = cssVar('--card');
  const impactLow = cssVar('--impact-low');
  const impactHigh = cssVar('--impact-high');

  const sid = (s: string) => `${scope}${s}`;
  const nodeList: any[] = [];
  const edgeList: any[] = [];

  // Aggregate sector impacts across all bills (sum). Track per-bill breakdown for tooltips.
  const sectorAgg: Record<
    string,
    { total: number; entries: { billNumber: string; impact: number; explanation: string }[] }
  > = {};

  bills.forEach((bill) => {
    // Bill node
    nodeList.push({
      id: sid(`bill-${bill.id}`),
      label: bill.number,
      title: `${bill.number}\n${bill.title}`,
      shape: 'hexagon',
      size: 30,
      color: { background: primary, border: accent },
      font: { color: fg, size: 16, face: 'inherit', strokeWidth: 0 },
    });

    (bill.impacts ?? []).forEach((impact) => {
      const hasFigure = typeof impact.economicImpact === 'number';
      const econ = hasFigure ? (impact.economicImpact as number) : 0;
      if (!sectorAgg[impact.sector]) sectorAgg[impact.sector] = { total: 0, entries: [] };
      sectorAgg[impact.sector].total += econ;
      sectorAgg[impact.sector].entries.push({
        billNumber: bill.number,
        impact: econ,
        explanation: impact.explanation,
      });

      // Bill → sector edge (per-bill)
      const isPos = econ >= 0;
      const mag = hasFigure ? Math.abs(econ || 0.5) : 0.5;
      const muted = cssVar('--muted-foreground');
      edgeList.push({
        from: sid(`bill-${bill.id}`),
        to: sid(`sector-${impact.sector}`),
        label: hasFigure ? `${isPos ? '+' : ''}$${mag.toFixed(1)}B` : 'qualitative',
        value: mag,
        width: 1 + Math.min(mag, 6),
        color: { color: hasFigure ? (isPos ? impactLow : impactHigh) : muted, opacity: hasFigure ? 0.85 : 0.5 },
        font: { color: fg, size: 11, strokeWidth: 3, strokeColor: card, face: 'inherit' },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        smooth: { enabled: true, type: 'continuous', roundness: 0.3 },
        dashes: !hasFigure,
      });
    });
  });

  // Sector nodes (size + color based on aggregated impact)
  Object.entries(sectorAgg).forEach(([sector, agg]) => {
    const isPos = agg.total >= 0;
    const mag = Math.abs(agg.total);
    const breakdown = agg.entries
      .map((e) => `${e.billNumber}: ${e.impact >= 0 ? '+' : ''}$${e.impact.toFixed(1)}B`)
      .join('\n');

    nodeList.push({
      id: sid(`sector-${sector}`),
      label: sector,
      title: `${sector}\nNet: ${isPos ? '+' : ''}$${agg.total.toFixed(1)}B\n\n${breakdown}`,
      shape: 'dot',
      size: 18 + Math.min(mag * 4, 26),
      color: { background: isPos ? impactLow : impactHigh, border: accent },
      font: { color: fg, size: 13, face: 'inherit', strokeWidth: 0 },
    });
  });

  // Macro nodes
  MACRO_NODES.forEach((m) => {
    nodeList.push({
      id: sid(m.id),
      label: m.label,
      shape: 'box',
      color: { background: card, border: primary },
      font: { color: fg, size: 12, face: 'inherit', strokeWidth: 0 },
      margin: 8,
      shapeProperties: { borderRadius: 6 },
    });
  });

  // Sector → macro edges (use aggregated sector impact)
  Object.entries(sectorAgg).forEach(([sector, agg]) => {
    const links = SECTOR_TO_MACRO[sector] ?? DEFAULT_MACRO_LINKS;
    const mag = Math.abs(agg.total || 0.5);
    const isPos = agg.total >= 0;

    Object.entries(links).forEach(([macroId, influence]) => {
      if (!influence) return;
      const weight = mag * influence;
      edgeList.push({
        from: sid(`sector-${sector}`),
        to: sid(macroId),
        label: `${isPos ? '+' : '-'}${weight.toFixed(2)}`,
        value: weight,
        width: 0.5 + Math.min(weight * 1.5, 4),
        color: { color: muted, opacity: 0.5 },
        font: { color: muted, size: 10, strokeWidth: 2, strokeColor: card, face: 'inherit' },
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
        dashes: true,
        smooth: { enabled: true, type: 'continuous', roundness: 0.2 },
      });
    });
  });

  return { nodes: nodeList, edges: edgeList };
};

interface SingleGraphProps {
  bills: Bill[];
  scope?: string;
  height?: number;
}

const SingleGraph = ({ bills, scope, height = 500 }: SingleGraphProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { nodes, edges } = useMemo(() => buildGraph({ bills, scope }), [bills, scope]);

  useEffect(() => {
    if (!containerRef.current) return;

    const data = {
      nodes: new DataSet(nodes),
      edges: new DataSet(edges),
    };

    const network = new Network(containerRef.current, data, {
      autoResize: true,
      height: `${height}px`,
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -60,
          centralGravity: 0.01,
          springLength: 140,
          springConstant: 0.08,
          damping: 0.5,
        },
        stabilization: { iterations: 200, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true },
      edges: { selectionWidth: 2 },
    });

    return () => {
      network.destroy();
    };
  }, [nodes, edges, height]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-border/50 bg-background/40"
      style={{ height }}
    />
  );
};

const ImpactNetworkGraph = ({ bills, mode = 'unified' }: ImpactNetworkGraphProps) => {
  if (!bills.length) return null;

  const isCompare = bills.length > 1;
  const description = isCompare
    ? mode === 'unified'
      ? `Combined ripple effects of ${bills.map((b) => b.number).join(', ')} across Ohio. Sector nodes show net (summed) impact; per-bill breakdown on hover.`
      : `Side-by-side networks for each bill. Compare sector reach and macro influence independently.`
    : `How ${bills[0].number} ripples through Ohio's economic ecosystem. Edge labels show projected impact in $B; dashed edges show sector → macro indicator influence.`;

  return (
    <Card variant="glass" className="p-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold">Impact Network</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {mode === 'unified' || !isCompare ? (
        <SingleGraph bills={bills} scope="u-" />
      ) : (
        <div className={`grid gap-4 ${bills.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {bills.map((bill) => (
            <div key={bill.id}>
              <div className="mb-2 text-sm font-medium text-foreground">
                <span className="font-mono text-primary">{bill.number}</span>{' '}
                <span className="text-muted-foreground">— {bill.title.slice(0, 50)}{bill.title.length > 50 ? '…' : ''}</span>
              </div>
              <SingleGraph bills={[bill]} scope={`s-${bill.id}-`} height={380} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-impact-low inline-block" /> Positive net impact
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-impact-high inline-block" /> Negative net impact
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-muted-foreground inline-block" /> Direct (bill → sector)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-muted-foreground inline-block" />{' '}
          Indirect (sector → macro)
        </span>
      </div>
    </Card>
  );
};

export default ImpactNetworkGraph;
