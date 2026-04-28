import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bill, SectorImpact } from '@/types/legislation';

interface Props {
  bills: Bill[];
}

/** Aligns sectors across bills into a single matrix for side-by-side comparison. */
const CompareDiffTable = ({ bills }: Props) => {
  // Collect all sectors across bills
  const sectors = Array.from(
    new Set(bills.flatMap((b) => (b.impacts ?? []).map((i) => i.sector))),
  ).sort();

  const lookup = (b: Bill, sector: string): SectorImpact | undefined =>
    (b.impacts ?? []).find((i) => i.sector === sector);

  if (sectors.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
        No sector impacts to compare yet.
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40">
          <tr>
            <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-secondary/40 z-10 min-w-[160px]">
              Sector
            </th>
            {bills.map((b) => (
              <th key={b.id} className="text-left p-3 font-medium min-w-[200px]">
                <div className="font-mono text-primary text-xs">{b.number}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">{b.title}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector) => (
            <tr key={sector} className="border-t border-border/40 align-top">
              <td className="p-3 font-medium text-foreground sticky left-0 bg-card z-10">
                {sector}
              </td>
              {bills.map((b) => {
                const i = lookup(b, sector);
                if (!i) {
                  return (
                    <td key={b.id} className="p-3 text-muted-foreground text-xs italic">
                      Not addressed
                    </td>
                  );
                }
                const dollars =
                  typeof i.economicImpact === 'number'
                    ? `${i.economicImpact >= 0 ? '+' : ''}$${i.economicImpact.toFixed(1)}B`
                    : '—';
                return (
                  <td key={b.id} className="p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={i.strength.toLowerCase() as 'high' | 'medium' | 'low'}>
                        {i.strength}
                      </Badge>
                      <span
                        className={`text-xs font-mono ${
                          typeof i.economicImpact === 'number'
                            ? i.economicImpact >= 0
                              ? 'text-impact-low'
                              : 'text-impact-high'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {dollars}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3">{i.explanation}</p>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CompareDiffTable;