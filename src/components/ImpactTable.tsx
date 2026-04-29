import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectorImpact, ImpactStrength } from '@/types/legislation';
import EstimatedBadge from './EstimatedBadge';

interface ImpactTableProps {
  impacts: SectorImpact[];
}

const getStrengthVariant = (strength: ImpactStrength): 'high' | 'medium' | 'low' =>
  strength.toLowerCase() as 'high' | 'medium' | 'low';

const getStrengthIcon = (strength: ImpactStrength) => {
  switch (strength) {
    case 'High': return <TrendingUp className="w-4 h-4" />;
    case 'Low': return <Minus className="w-4 h-4" />;
    default: return <TrendingDown className="w-4 h-4 rotate-180" />;
  }
};

const strengthDot = (strength: ImpactStrength) =>
  strength === 'High' ? 'bg-impact-high' : strength === 'Medium' ? 'bg-impact-medium' : 'bg-impact-low';

const ImpactTable = ({ impacts }: ImpactTableProps) => {
  return (
    <div className="rounded-xl border border-border overflow-hidden">

      {/* ── Mobile card list (xs only) ── */}
      <div className="sm:hidden divide-y divide-border">
        {impacts.map((impact, idx) => {
          const hasFigure = typeof impact.economicImpact === 'number';
          return (
            <div
              key={idx}
              className="p-4 bg-secondary/10 animate-fade-in"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${strengthDot(impact.strength)}`} />
                  <span className="font-medium text-foreground text-sm leading-tight">{impact.sector}</span>
                </div>
                <Badge variant={getStrengthVariant(impact.strength)} className="gap-1 flex-shrink-0 text-xs">
                  {getStrengthIcon(impact.strength)}
                  {impact.strength}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground capitalize">{impact.impactType}</span>
                {hasFigure ? (
                  <div className="inline-flex items-center gap-1">
                    <span className={`font-mono text-sm font-semibold ${
                      impact.economicImpact! >= 0 ? 'text-impact-low' : 'text-impact-high'
                    }`}>
                      {impact.economicImpact! >= 0 ? '+' : ''}${impact.economicImpact!.toFixed(1)}B
                    </span>
                    <EstimatedBadge basis={impact.quantitativeBasis} assumptions={impact.assumptions} />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">—</span> Qualitative
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table (sm+) ── */}
      <table className="w-full hidden sm:table">
        <thead>
          <tr className="bg-secondary/50">
            <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Sector</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Impact Type</th>
            <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Strength</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Est. Impact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {impacts.map((impact, idx) => {
            const hasFigure = typeof impact.economicImpact === 'number';
            return (
              <tr
                key={idx}
                className="hover:bg-secondary/30 transition-colors animate-fade-in"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${strengthDot(impact.strength)}`} />
                    <span className="font-medium text-foreground">{impact.sector}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-muted-foreground capitalize">{impact.impactType}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={getStrengthVariant(impact.strength)} className="gap-1">
                    {getStrengthIcon(impact.strength)}
                    {impact.strength}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {hasFigure ? (
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <span className={`font-mono font-medium ${
                        impact.economicImpact! >= 0 ? 'text-impact-low' : 'text-impact-high'
                      }`}>
                        {impact.economicImpact! >= 0 ? '+' : ''}${impact.economicImpact!.toFixed(1)}B
                      </span>
                      <EstimatedBadge basis={impact.quantitativeBasis} assumptions={impact.assumptions} />
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">—</span>
                      <span className="rounded-full border border-border px-1.5 py-0.5">Qualitative</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ImpactTable;
