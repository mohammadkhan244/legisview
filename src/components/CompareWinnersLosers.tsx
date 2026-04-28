import { Trophy, TrendingDown, Medal } from 'lucide-react';
import { Bill } from '@/types/legislation';
import { Card } from '@/components/ui/card';

interface Props {
  bills: Bill[];
}

interface Row {
  sector: string;
  total: number;
  bills: string[]; // bill numbers contributing
}

/**
 * Visual Capitalist signature: ranked winners & losers with medal positions
 * and bold horizontal bars sized proportionally to the impact magnitude.
 */
const CompareWinnersLosers = ({ bills }: Props) => {
  if (bills.length < 2) return null;

  const agg: Record<string, Row> = {};
  for (const b of bills) {
    for (const i of b.impacts ?? []) {
      if (typeof i.economicImpact !== 'number') continue;
      if (!agg[i.sector]) agg[i.sector] = { sector: i.sector, total: 0, bills: [] };
      agg[i.sector].total += i.economicImpact;
      if (!agg[i.sector].bills.includes(b.number)) agg[i.sector].bills.push(b.number);
    }
  }
  const rows = Object.values(agg);
  const winners = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
  const losers = rows.filter((r) => r.total < 0).sort((a, b) => a.total - b.total).slice(0, 3);

  if (winners.length === 0 && losers.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed text-sm text-muted-foreground">
        No quantified sector impacts available to rank winners and losers.
      </Card>
    );
  }

  const maxAbs = Math.max(
    ...winners.map((w) => w.total),
    ...losers.map((l) => Math.abs(l.total)),
    1,
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <RankColumn
        title="Top Winners"
        subtitle="Sectors gaining most"
        rows={winners}
        maxAbs={maxAbs}
        positive
      />
      <RankColumn
        title="Top Losers"
        subtitle="Sectors hit hardest"
        rows={losers}
        maxAbs={maxAbs}
        positive={false}
      />
    </div>
  );
};

const MEDAL_COLORS = [
  'bg-amber-400 text-amber-950', // gold
  'bg-slate-300 text-slate-900', // silver
  'bg-orange-400 text-orange-950', // bronze
];

const RankColumn = ({
  title, subtitle, rows, maxAbs, positive,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  maxAbs: number;
  positive: boolean;
}) => {
  const Icon = positive ? Trophy : TrendingDown;
  const accentText = positive ? 'text-impact-low' : 'text-impact-high';
  const barBg = positive ? 'bg-impact-low' : 'bg-impact-high';
  return (
    <Card variant="elevated" className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${accentText}`} />
        <div>
          <h4 className="text-base font-bold tracking-tight">{title}</h4>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None ranked.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r, i) => {
            const pct = (Math.abs(r.total) / maxAbs) * 100;
            return (
              <li key={r.sector} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${MEDAL_COLORS[i]}`}
                      title={`#${i + 1}`}
                    >
                      <Medal className="w-3 h-3" />
                    </span>
                    <span className="font-semibold text-foreground truncate">{r.sector}</span>
                  </div>
                  <span className={`font-mono text-lg font-bold tabular-nums ${accentText}`}>
                    {positive ? '+' : ''}${r.total.toFixed(1)}B
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className={`h-full ${barBg} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Driven by {r.bills.join(', ')}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};

export default CompareWinnersLosers;