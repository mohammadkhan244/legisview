import { useEffect, useMemo, useRef, useState } from 'react';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data/standalone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Network as NetworkIcon, Info } from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Bill, SectorImpact } from '@/types/legislation';

interface Props {
  bills: Bill[];
  /** Optional pre-filtered sector list (e.g. from compare page filter). */
  sectors?: string[];
  /** Multiplier applied to economic impacts (time-horizon scaling). */
  scale?: number;
  /** Compact rendering for embedded contexts. */
  height?: number;
}

type EdgeMode = 'quantitative' | 'qualitative';

const cssVar = (name: string, fallback = '#888') => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
};

/**
 * Build a sector × sector covariance matrix.
 *
 * - **Quantitative mode**: edge weight is Pearson-style cosine similarity of the
 *   two sectors' economic-impact vectors across the loaded bills. Strength is the
 *   absolute correlation; sign indicates co-direction (both gain / both lose vs
 *   opposing). Falls back to magnitude-proximity when only one bill is loaded.
 * - **Qualitative mode**: edge weight counts bills where both sectors are touched
 *   by the same impactType (or any impact at all if types differ). Captures
 *   "this provision hits both sectors" — useful when $ figures are missing.
 */
const buildCovariance = (
  bills: Bill[],
  sectorList: string[],
  mode: EdgeMode,
  scale: number,
) => {
  // Build per-sector vector of (signed $) per bill, plus impact-type signature.
  const vectors: Record<string, (number | null)[]> = {};
  const types: Record<string, Set<string>[]> = {};
  const totals: Record<string, number> = {};
  const presence: Record<string, number> = {};

  for (const sector of sectorList) {
    vectors[sector] = bills.map(() => null);
    types[sector] = bills.map(() => new Set<string>());
    totals[sector] = 0;
    presence[sector] = 0;
  }

  bills.forEach((b, bi) => {
    (b.impacts ?? []).forEach((i: SectorImpact) => {
      if (!sectorList.includes(i.sector)) return;
      const v = typeof i.economicImpact === 'number'
        ? i.economicImpact * scale
        : (i.strength === 'High' ? 1 : i.strength === 'Medium' ? 0.5 : 0.25)
            * (i.impactType.includes('decrease') || i.impactType === 'market restriction' ? -1 : 1);
      vectors[i.sector][bi] = v;
      types[i.sector][bi].add(i.impactType);
      totals[i.sector] += typeof i.economicImpact === 'number' ? i.economicImpact * scale : 0;
      presence[i.sector] += 1;
    });
  });

  // Edges
  type Edge = { a: string; b: string; weight: number; signedWeight: number; basis: string };
  const edges: Edge[] = [];

  for (let i = 0; i < sectorList.length; i++) {
    for (let j = i + 1; j < sectorList.length; j++) {
      const a = sectorList[i];
      const b = sectorList[j];
      const va = vectors[a];
      const vb = vectors[b];

      if (mode === 'quantitative') {
        // Cosine similarity over bills where both have a value.
        const pairs: Array<[number, number]> = [];
        for (let k = 0; k < bills.length; k++) {
          if (va[k] !== null && vb[k] !== null) pairs.push([va[k] as number, vb[k] as number]);
        }
        if (pairs.length === 0) continue;

        if (bills.length === 1 || pairs.length === 1) {
          // Single observation → use magnitude-proximity heuristic.
          const [x, y] = pairs[0];
          const mag = (Math.abs(x) + Math.abs(y)) / 2;
          const sameDir = (x >= 0 && y >= 0) || (x < 0 && y < 0);
          const w = Math.min(1, mag / 5); // saturate at $5B scale
          if (w < 0.05) continue;
          edges.push({
            a, b,
            weight: w,
            signedWeight: sameDir ? w : -w,
            basis: `Both touched by this bill (avg |$| = ${mag.toFixed(1)}B)`,
          });
        } else {
          // Cosine similarity (–1..+1)
          let dot = 0, na = 0, nb = 0;
          for (const [x, y] of pairs) { dot += x * y; na += x * x; nb += y * y; }
          if (na === 0 || nb === 0) continue;
          const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
          const w = Math.abs(cos);
          if (w < 0.15) continue;
          edges.push({
            a, b,
            weight: w,
            signedWeight: cos,
            basis: `Co-impact across ${pairs.length} bills (corr = ${cos.toFixed(2)})`,
          });
        }
      } else {
        // Qualitative: count bills where both sectors are touched; bonus if shared impactType
        let shared = 0, sharedType = 0;
        let dirSum = 0;
        for (let k = 0; k < bills.length; k++) {
          if (va[k] !== null && vb[k] !== null) {
            shared += 1;
            const ta = types[a][k];
            const tb = types[b][k];
            for (const t of ta) if (tb.has(t)) { sharedType += 1; break; }
            // Direction from sign of values when known
            const sa = va[k] as number;
            const sb = vb[k] as number;
            if ((sa >= 0 && sb >= 0) || (sa < 0 && sb < 0)) dirSum += 1;
            else dirSum -= 1;
          }
        }
        if (shared === 0) continue;
        const w = Math.min(1, (shared + sharedType * 0.5) / Math.max(bills.length, 1));
        const sign = dirSum >= 0 ? 1 : -1;
        edges.push({
          a, b,
          weight: w,
          signedWeight: sign * w,
          basis: `Co-occurs in ${shared}/${bills.length} bills${sharedType ? ` · ${sharedType} shared action type${sharedType > 1 ? 's' : ''}` : ''}`,
        });
      }
    }
  }

  return { edges, totals, presence };
};

const SectorCovarianceGraph = ({ bills, sectors, scale = 1, height = 520 }: Props) => {
  const [mode, setMode] = useState<EdgeMode>('quantitative');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sectorList = useMemo(() => {
    if (sectors && sectors.length) return sectors;
    return Array.from(
      new Set(bills.flatMap((b) => (b.impacts ?? []).map((i) => i.sector))),
    ).sort();
  }, [bills, sectors]);

  const { edges, totals, presence } = useMemo(
    () => buildCovariance(bills, sectorList, mode, scale),
    [bills, sectorList, mode, scale],
  );

  // Quantitative is only meaningful with at least 1 bill that has $ figures.
  const hasQuant = bills.some((b) =>
    (b.impacts ?? []).some((i) => typeof i.economicImpact === 'number'),
  );

  useEffect(() => {
    if (!containerRef.current || sectorList.length < 2) return;

    const fg = cssVar('--foreground');
    const card = cssVar('--card');
    const muted = cssVar('--muted-foreground');
    const primary = cssVar('--primary');
    const accent = cssVar('--accent');
    const impactLow = cssVar('--impact-low');
    const impactHigh = cssVar('--impact-high');
    const impactMed = cssVar('--impact-medium');

    const maxTotal = Math.max(...sectorList.map((s) => Math.abs(totals[s] || 0)), 1);

    const nodes = sectorList.map((sector) => {
      const total = totals[sector] ?? 0;
      const mag = Math.abs(total);
      const isPos = total >= 0;
      const sized = 18 + Math.min((mag / maxTotal) * 30, 30) + Math.min(presence[sector], 4) * 2;
      const tip = total !== 0
        ? `${sector}\nNet: ${isPos ? '+' : ''}$${total.toFixed(1)}B across ${presence[sector]} bill(s)`
        : `${sector}\nQualitative impact in ${presence[sector]} bill(s)`;
      return {
        id: sector,
        label: sector,
        title: tip,
        shape: 'dot',
        size: sized,
        color: total === 0
          ? { background: primary, border: accent }
          : { background: isPos ? impactLow : impactHigh, border: accent },
        font: { color: fg, size: 13, face: 'inherit', strokeWidth: 0 },
      };
    });

    const visEdges = edges.map((e) => {
      const sameDir = e.signedWeight >= 0;
      const color = sameDir
        ? (mode === 'quantitative'
            ? cssVar('--impact-low')
            : primary)
        : impactMed;
      return {
        from: e.a,
        to: e.b,
        value: e.weight,
        width: 0.5 + e.weight * 6,
        label: e.weight >= 0.4 ? e.weight.toFixed(2) : undefined,
        title: `${e.a} ↔ ${e.b}\n${e.basis}\n${sameDir ? 'Move together' : 'Move opposite'}`,
        color: { color, opacity: 0.35 + e.weight * 0.5 },
        font: { color: muted, size: 10, strokeWidth: 2, strokeColor: card, face: 'inherit' },
        smooth: { enabled: true, type: 'continuous', roundness: 0.2 },
      };
    });

    const data = {
      nodes: new DataSet(nodes as any),
      edges: new DataSet(visEdges as any),
    };

    const network = new Network(containerRef.current, data, {
      autoResize: true,
      height: `${height}px`,
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -55,
          centralGravity: 0.015,
          springLength: 130,
          springConstant: 0.07,
          damping: 0.55,
          avoidOverlap: 0.6,
        },
        stabilization: { iterations: 250, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true },
      edges: { selectionWidth: 2 },
    });

    return () => network.destroy();
  }, [edges, totals, presence, sectorList, mode, height]);

  if (sectorList.length < 2) {
    return (
      <Card className="p-6 text-center border-dashed text-sm text-muted-foreground">
        Need at least 2 sectors to draw a co-impact network.
      </Card>
    );
  }

  return (
    <Card variant="glass" className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NetworkIcon className="w-4 h-4 text-primary" />
            <h3 className="text-lg font-semibold tracking-tight">Sector Co-Impact Network</h3>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button aria-label="What is this?" className="text-muted-foreground hover:text-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm text-xs leading-snug">
                  Inspired by the CoRisk graphs used during the 2008 financial crisis to map
                  interconnections between banks. Here, nodes are sectors and edges show how
                  closely two sectors move together under the loaded bill(s) — a structural
                  view of which sectors are entangled by the same legislative actions.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === 'quantitative'
              ? bills.length > 1
                ? 'Edges = correlation of dollar impact across the compared bills.'
                : 'Edges = magnitude proximity within this bill (load more bills for true correlation).'
              : 'Edges = how often two sectors are co-affected by the same provisions.'}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border/60 bg-card/60 p-0.5 text-xs">
          <Button
            type="button"
            size="sm"
            variant={mode === 'quantitative' ? 'default' : 'ghost'}
            onClick={() => setMode('quantitative')}
            className="h-7 px-2.5"
          >
            Quantitative
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'qualitative' ? 'default' : 'ghost'}
            onClick={() => setMode('qualitative')}
            className="h-7 px-2.5"
          >
            Qualitative
          </Button>
        </div>
      </div>

      {edges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
          Not enough overlap to draw co-impact edges yet. Try the {mode === 'quantitative' ? 'Qualitative' : 'Quantitative'} view, or add more bills.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full rounded-lg border border-border/50 bg-background/40"
          style={{ height }}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-impact-low inline-block" /> Net gain sector
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-impact-high inline-block" /> Net loss sector
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-impact-low inline-block" /> Move together
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-impact-medium inline-block" /> Move opposite
        </span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {sectorList.length} sectors · {edges.length} links
        </Badge>
      </div>
    </Card>
  );
};

export default SectorCovarianceGraph;