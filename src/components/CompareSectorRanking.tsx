import { Bill } from '@/types/legislation';
import { Card } from '@/components/ui/card';

interface Props {
  bills: Bill[];
  sectors?: string[];
  /** 'magnitude' = absolute size, 'net' = signed net, 'spread' = max disagreement across bills */
  sortBy?: 'magnitude' | 'net' | 'spread';
  onSectorClick?: (sector: string) => void;
  /** Multiplier applied to economicImpact for time-horizon scaling. */
  scale?: number;
}

interface AggRow {
  sector: string;
  net: number;
  abs: number;
  spread: number;
  perBill: Record<string, number | null>;
}

/**
 * VC-style horizontal stacked bar: each sector gets one row, bars per bill stacked on a center axis.
 */
const CompareSectorRanking = ({ bills, sectors, sortBy = 'magnitude', onSectorClick, scale = 1 }: Props) => {
  const allSectors = sectors && sectors.length
    ? sectors
    : Array.from(new Set(bills.flatMap((b) => (b.impacts ?? []).map((i) => i.sector))));

  const rows: AggRow[] = allSectors.map((sector) => {
    const perBill: Record<string, number | null> = {};
    let net = 0;
    let abs = 0;
    const vals: number[] = [];
    for (const b of bills) {
      const i = (b.impacts ?? []).find((x) => x.sector === sector);
      const v = i && typeof i.economicImpact === 'number' ? i.economicImpact * scale : null;
      perBill[b.id] = v;
      if (v !== null) {
        net += v;
        abs += Math.abs(v);
        vals.push(v);
      }
    }
    const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
    return { sector, net, abs, spread, perBill };
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'net') return Math.abs(b.net) - Math.abs(a.net);
    if (sortBy === 'spread') return b.spread - a.spread;
    return b.abs - a.abs;
  });

  const maxAbs = Math.max(...sorted.flatMap((r) => Object.values(r.perBill).map((v) => Math.abs(v ?? 0))), 1);

  // Bill colors using CSS chart tokens
  const billColor = (idx: number) => `hsl(var(--chart-${(idx % 5) + 1}))`;

  if (sorted.every((r) => r.abs === 0)) {
    return (
      <Card className="p-6 text-center border-dashed text-sm text-muted-foreground">
        No quantified impacts to chart yet.
      </Card>
    );
  }

  return (
    <Card variant="elevated" className="p-5 space-y-4 overflow-hidden">
      {/* Bill legend */}
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border/40">
        {bills.map((b, idx) => (
          <div key={b.id} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ background: billColor(idx) }}
            />
            <span className="font-mono text-xs text-foreground">{b.number}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {sorted.map((r) => (
          <div key={r.sector} className="grid grid-cols-[140px_1fr_90px] gap-3 items-center">
            {onSectorClick ? (
              <button
                onClick={() => onSectorClick(r.sector)}
                className="text-left text-sm font-semibold text-foreground truncate hover:text-primary hover:underline transition-colors"
                title={`${r.sector} — click for details`}
              >
                {r.sector}
              </button>
            ) : (
              <p className="text-sm font-semibold text-foreground truncate" title={r.sector}>
                {r.sector}
              </p>
            )}
            <div className="relative h-7 flex items-center">
              {/* center axis */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/60" />
              {/* per-bill bars stacked on either side of axis */}
              <div className="relative w-full h-full">
                {bills.map((b, idx) => {
                  const v = r.perBill[b.id];
                  if (v === null || v === 0) return null;
                  const widthPct = (Math.abs(v) / maxAbs) * 50; // each side = 50%
                  const offsetTop = (idx / bills.length) * 100;
                  const heightPct = 100 / bills.length;
                  return (
                    <div
                      key={b.id}
                      className="absolute rounded-sm transition-all hover:brightness-110"
                      style={{
                        background: billColor(idx),
                        height: `${heightPct - 6}%`,
                        top: `${offsetTop + 3}%`,
                        width: `${widthPct}%`,
                        ...(v >= 0
                          ? { left: '50%' }
                          : { right: '50%' }),
                      }}
                      title={`${b.number}: ${v >= 0 ? '+' : ''}$${v.toFixed(1)}B`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="text-right">
              <p className={`font-mono text-base font-bold tabular-nums ${r.net >= 0 ? 'text-impact-low' : 'text-impact-high'}`}>
                {r.net >= 0 ? '+' : ''}${r.net.toFixed(1)}B
              </p>
              <p className="text-[10px] text-muted-foreground">net</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-2">
        Bars extend right for gains, left for losses. Each bill is a colored band.
      </p>
    </Card>
  );
};

export default CompareSectorRanking;