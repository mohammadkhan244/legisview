import { Bill, SectorImpact } from '@/types/legislation';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  bills: Bill[];
  sectors?: string[]; // optional filter
  onSectorClick?: (sector: string) => void;
  /** Multiplier for time-horizon scaling. */
  scale?: number;
}

/**
 * VC-style heatmap: sectors as rows, bills as columns, color intensity
 * encodes magnitude, color hue encodes direction (gain vs loss).
 */
const CompareSectorHeatmap = ({ bills, sectors, onSectorClick, scale = 1 }: Props) => {
  const allSectors = sectors && sectors.length
    ? sectors
    : Array.from(new Set(bills.flatMap((b) => (b.impacts ?? []).map((i) => i.sector)))).sort();

  if (allSectors.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed text-sm text-muted-foreground">
        No sector data to plot.
      </Card>
    );
  }

  const lookup = (b: Bill, sector: string): SectorImpact | undefined =>
    (b.impacts ?? []).find((i) => i.sector === sector);

  // Determine max magnitude for color scaling.
  // Anchor to the unscaled baseline max so cell intensity visually deepens as the horizon extends
  const allValues = bills.flatMap((b) =>
    (b.impacts ?? []).map((i) => (typeof i.economicImpact === 'number' ? Math.abs(i.economicImpact) : 0)),
  );
  const maxMag = Math.max(...allValues, 1);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-secondary/40">
            <tr>
              <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-secondary/40 z-10 min-w-[140px] text-xs uppercase tracking-wide">
                Sector
              </th>
              {bills.map((b) => (
                <th key={b.id} className="text-center p-2.5 min-w-[110px]">
                  <div className="font-mono text-primary text-xs">{b.number}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSectors.map((sector) => (
              <tr key={sector} className="border-t border-border/40">
                <td className="p-3 font-medium text-foreground sticky left-0 bg-card z-10 text-sm">
                  {onSectorClick ? (
                    <button
                      onClick={() => onSectorClick(sector)}
                      className="text-left hover:text-primary hover:underline focus-visible:text-primary transition-colors"
                    >
                      {sector}
                    </button>
                  ) : (
                    sector
                  )}
                </td>
                {bills.map((b) => {
                  const i = lookup(b, sector);
                  return (
                    <td key={b.id} className="p-1.5">
                      <HeatCell impact={i} maxMag={maxMag} scale={scale} onClick={onSectorClick ? () => onSectorClick(sector) : undefined} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <Legend />
      </div>
    </TooltipProvider>
  );
};

const HeatCell = ({
  impact, maxMag, scale = 1, onClick,
}: {
  impact: SectorImpact | undefined;
  maxMag: number;
  scale?: number;
  onClick?: () => void;
}) => {
  if (!impact) {
    return (
      <div className="h-14 rounded-md border border-dashed border-border/40 flex items-center justify-center text-[10px] text-muted-foreground/60 italic">
        n/a
      </div>
    );
  }

  const raw = typeof impact.economicImpact === 'number' ? impact.economicImpact : null;
  const v = raw !== null ? raw * scale : null;
  // Strength fallback for color intensity if no $ figure
  const strengthWeight = impact.strength === 'High' ? 0.85 : impact.strength === 'Medium' ? 0.55 : 0.25;
  const intensity = v !== null ? Math.min(1, Math.abs(v) / maxMag) : strengthWeight;
  const positive = v !== null ? v >= 0 : impact.strength !== 'High'; // unknown direction → primary tone

  const bg = v === null
    ? `hsl(var(--primary) / ${0.15 + intensity * 0.5})`
    : positive
      ? `hsl(var(--impact-low) / ${0.15 + intensity * 0.7})`
      : `hsl(var(--impact-high) / ${0.15 + intensity * 0.7})`;

  const label = v !== null ? `${v >= 0 ? '+' : ''}$${v.toFixed(1)}B` : impact.strength;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          onClick={onClick}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
          className={`h-14 rounded-md flex flex-col items-center justify-center transition-transform hover:scale-[1.04] ${onClick ? 'cursor-pointer' : 'cursor-help'}`}
          style={{ background: bg }}
        >
          <span className="font-mono text-sm font-bold text-foreground tabular-nums">{label}</span>
          <span className="text-[9px] uppercase tracking-wider text-foreground/70">
            {impact.strength}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs leading-snug">{impact.explanation}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const Legend = () => (
  <div className="flex items-center justify-end gap-4 px-3 py-2 border-t border-border/40 text-[10px] text-muted-foreground bg-card/40">
    <span>Color = direction · Intensity = magnitude</span>
    <div className="flex items-center gap-1">
      <span className="w-3 h-3 rounded" style={{ background: 'hsl(var(--impact-high) / 0.7)' }} />
      <span>Loss</span>
    </div>
    <div className="flex items-center gap-1">
      <span className="w-3 h-3 rounded" style={{ background: 'hsl(var(--primary) / 0.5)' }} />
      <span>Qualitative</span>
    </div>
    <div className="flex items-center gap-1">
      <span className="w-3 h-3 rounded" style={{ background: 'hsl(var(--impact-low) / 0.7)' }} />
      <span>Gain</span>
    </div>
  </div>
);

export default CompareSectorHeatmap;