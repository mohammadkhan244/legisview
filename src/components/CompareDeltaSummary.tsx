import { TrendingUp, TrendingDown, Award, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Bill } from '@/types/legislation';

interface Props {
  bills: Bill[];
}

interface SectorAgg {
  sector: string;
  total: number;          // sum of economicImpact across bills (with figures)
  highCount: number;      // # of bills marking it High
  billsTouching: number;
}

const CompareDeltaSummary = ({ bills }: Props) => {
  if (bills.length < 2) return null;

  const agg: Record<string, SectorAgg> = {};
  for (const b of bills) {
    for (const i of b.impacts ?? []) {
      if (!agg[i.sector]) agg[i.sector] = { sector: i.sector, total: 0, highCount: 0, billsTouching: 0 };
      agg[i.sector].billsTouching += 1;
      if (i.strength === 'High') agg[i.sector].highCount += 1;
      if (typeof i.economicImpact === 'number') agg[i.sector].total += i.economicImpact;
    }
  }
  const list = Object.values(agg);
  const winners = [...list].filter((s) => s.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
  const losers = [...list].filter((s) => s.total < 0).sort((a, b) => a.total - b.total).slice(0, 3);
  const mostContested = [...list].sort((a, b) => b.highCount - a.highCount).filter((s) => s.highCount > 0).slice(0, 3);
  const sharedSectors = list.filter((s) => s.billsTouching === bills.length).map((s) => s.sector);
  const uniqueSectors = list.filter((s) => s.billsTouching === 1).length;

  return (
    <Card variant="gradient" className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Award className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Comparison Highlights</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="flex items-center gap-1.5 text-impact-low font-medium mb-2">
            <TrendingUp className="w-4 h-4" /> Top sectors gaining
          </div>
          {winners.length === 0 ? (
            <p className="text-xs text-muted-foreground">No quantified gainers.</p>
          ) : (
            <ul className="space-y-1">
              {winners.map((w) => (
                <li key={w.sector} className="flex justify-between gap-3">
                  <span className="text-foreground">{w.sector}</span>
                  <span className="font-mono text-impact-low">+${w.total.toFixed(1)}B</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-impact-high font-medium mb-2">
            <TrendingDown className="w-4 h-4" /> Top sectors losing
          </div>
          {losers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No quantified losers.</p>
          ) : (
            <ul className="space-y-1">
              {losers.map((w) => (
                <li key={w.sector} className="flex justify-between gap-3">
                  <span className="text-foreground">{w.sector}</span>
                  <span className="font-mono text-impact-high">${w.total.toFixed(1)}B</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm border-t border-border/50 pt-3">
        <div>
          <div className="flex items-center gap-1.5 text-impact-medium font-medium mb-2">
            <AlertTriangle className="w-4 h-4" /> Most contested sectors
          </div>
          {mostContested.length === 0 ? (
            <p className="text-xs text-muted-foreground">No high-impact overlap.</p>
          ) : (
            <ul className="space-y-1">
              {mostContested.map((m) => (
                <li key={m.sector} className="flex justify-between gap-3">
                  <span className="text-foreground">{m.sector}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.highCount} of {bills.length} bills mark High
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="font-medium text-foreground mb-2">Overlap</div>
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{sharedSectors.length}</span> sector{sharedSectors.length === 1 ? '' : 's'}{' '}
            addressed by all {bills.length} bills
            {sharedSectors.length > 0 && `: ${sharedSectors.slice(0, 4).join(', ')}${sharedSectors.length > 4 ? '…' : ''}`}.
            <br />
            <span className="text-foreground font-medium">{uniqueSectors}</span> sector{uniqueSectors === 1 ? '' : 's'} unique to a single bill.
          </p>
        </div>
      </div>
    </Card>
  );
};

export default CompareDeltaSummary;