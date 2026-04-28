import { Bill, SectorImpact } from '@/types/legislation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, FileText, Quote, AlertCircle } from 'lucide-react';

interface Props {
  sector: string | null;
  bills: Bill[];
  /** Multiplier applied to economicImpact for the active time horizon. */
  scale?: number;
  horizonYears?: number;
  onClose: () => void;
}

/** Apple/Microsoft-style drilldown panel for a single sector. */
const SectorDrilldown = ({ sector, bills, scale = 1, horizonYears = 5, onClose }: Props) => {
  const open = !!sector;
  const lookup = (b: Bill): SectorImpact | undefined =>
    sector ? (b.impacts ?? []).find((i) => i.sector === sector) : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-2 h-6 rounded-sm bg-primary" />
            {sector ?? ''}
          </DialogTitle>
          <DialogDescription>
            How each bill addresses this sector — with the source quote driving the estimate.
            Figures shown over {horizonYears}-year horizon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {bills.map((b) => {
            const i = lookup(b);
            const v = i && typeof i.economicImpact === 'number' ? i.economicImpact * scale : null;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-mono text-sm text-primary">{b.number}</div>
                    <div className="text-sm font-medium text-foreground line-clamp-2">{b.title}</div>
                  </div>
                  {v !== null && (
                    <div className="text-right">
                      <p
                        className={`font-mono text-xl font-bold tabular-nums ${
                          v >= 0 ? 'text-impact-low' : 'text-impact-high'
                        }`}
                      >
                        {v >= 0 ? '+' : ''}${v.toFixed(1)}B
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        over {horizonYears}y
                      </p>
                    </div>
                  )}
                </div>

                {!i && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                    <AlertCircle className="w-3.5 h-3.5" /> Not addressed in this bill.
                  </div>
                )}

                {i && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={i.strength.toLowerCase() as 'high' | 'medium' | 'low'}>
                        {i.strength} impact
                      </Badge>
                      <Badge variant="sector" className="text-[10px]">{i.impactType}</Badge>
                      {i.confidence && (
                        <Badge variant="outline" className="text-[10px]">
                          Confidence: {i.confidence}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{i.explanation}</p>
                    {i.quantitativeBasis && (
                      <div className="rounded-lg border-l-2 border-primary/60 bg-primary/5 px-3 py-2">
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary mb-0.5">
                          <Quote className="w-3 h-3" /> Quantitative basis
                        </div>
                        <p className="text-xs text-foreground/85 italic leading-snug">
                          “{i.quantitativeBasis}”
                        </p>
                      </div>
                    )}
                    {i.assumptions && (
                      <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
                        <span className="font-semibold uppercase tracking-wide mr-1">Assumptions:</span>
                        {i.assumptions}
                      </p>
                    )}
                  </>
                )}

                <div className="flex flex-wrap gap-3 pt-1 text-[11px] border-t border-border/40">
                  <a
                    href={b.sourceUrl ?? b.id}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Source page
                  </a>
                  {b.pdfUrl && (
                    <a
                      href={b.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="w-3 h-3" /> Bill text
                    </a>
                  )}
                  {b.cboUrl ? (
                    <a
                      href={b.cboUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> CBO estimate
                    </a>
                  ) : (
                    <span className="text-muted-foreground italic">No CBO info available</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SectorDrilldown;