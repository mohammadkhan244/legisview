import { AlertTriangle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfidenceResult } from '@/lib/billConfidence';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: ConfidenceResult;
  /** Compact mode hides the label, showing only an icon (for use inside chips). */
  compact?: boolean;
  className?: string;
}

const ConfidenceBadge = ({ confidence, compact = false, className }: ConfidenceBadgeProps) => {
  if (confidence.level === 'good') return null;

  const isLow = confidence.level === 'low';
  const Icon = isLow ? AlertTriangle : Info;
  const label = isLow ? 'Low data' : 'Partial data';

  const colorClasses = isLow
    ? 'bg-impact-high/15 text-impact-high border-impact-high/40'
    : 'bg-impact-medium/15 text-impact-medium border-impact-medium/40';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border font-medium cursor-help',
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
              colorClasses,
              className,
            )}
            aria-label={`${label}: confidence warning`}
          >
            <Icon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            {!compact && <span>{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold mb-1">
            {isLow ? 'Low-confidence analysis' : 'Partial data extracted'}
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            The source page or PDF returned limited content. Treat numerical projections as
            rough estimates only.
          </p>
          <ul className="text-xs space-y-0.5 list-disc pl-4">
            {confidence.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ConfidenceBadge;
