import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, GitCompare, X } from 'lucide-react';
import {
  CompareHistoryEntry,
  compareEntryHref,
  readCompareHistory,
  removeCompareEntry,
} from '@/lib/compareHistory';

/**
 * A horizontal strip of recent comparisons. Renders nothing when empty so it
 * stays out of the way for first-time users.
 */
const CompareHistoryStrip = ({ compact = false }: { compact?: boolean }) => {
  const [entries, setEntries] = useState<CompareHistoryEntry[]>([]);

  useEffect(() => { setEntries(readCompareHistory()); }, []);

  if (entries.length === 0) return null;

  const tone = (j: CompareHistoryEntry['jurisdiction']) =>
    j === 'federal'
      ? 'border-primary/30 bg-primary/5 text-primary'
      : j === 'ohio'
        ? 'border-impact-low/30 bg-impact-low/5 text-impact-low'
        : 'border-border/60 bg-secondary/50 text-foreground';

  return (
    <section
      aria-label="Recent comparisons"
      className={compact ? 'mb-4' : 'mb-8'}
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          Recent comparisons
        </h3>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {entries.map((e) => (
          <div
            key={e.key}
            className={`group relative flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full border transition-colors ${tone(e.jurisdiction)}`}
          >
            <Link
              to={compareEntryHref(e)}
              className="flex items-center gap-2 text-xs font-mono whitespace-nowrap hover:opacity-80"
            >
              <GitCompare className="w-3.5 h-3.5" />
              {e.labels.slice(0, 3).join(' · ')}
              {e.labels.length > 3 && ` +${e.labels.length - 3}`}
            </Link>
            <button
              onClick={(ev) => {
                ev.preventDefault();
                setEntries(removeCompareEntry(e.key));
              }}
              aria-label="Remove from history"
              className="rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-background/40 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CompareHistoryStrip;