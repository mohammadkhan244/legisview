import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Scale, AlertTriangle, Users, DollarSign,
  Split, Loader2, Sparkles, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Bill } from '@/types/legislation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Takeaway {
  text: string;
  tone: 'positive' | 'negative' | 'neutral' | 'contested';
  icon: 'trending-up' | 'trending-down' | 'scale' | 'alert-triangle' | 'users' | 'dollar' | 'split';
}

interface Props {
  bills: Bill[];
}

const ICON_MAP = {
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  scale: Scale,
  'alert-triangle': AlertTriangle,
  users: Users,
  dollar: DollarSign,
  split: Split,
};

const TONE_STYLES: Record<Takeaway['tone'], string> = {
  positive: 'bg-impact-low/10 text-impact-low border-impact-low/30',
  negative: 'bg-impact-high/10 text-impact-high border-impact-high/30',
  contested: 'bg-impact-medium/10 text-impact-medium border-impact-medium/30',
  neutral: 'bg-primary/10 text-primary border-primary/30',
};

const CompareKeyTakeaways = ({ bills }: Props) => {
  const [headline, setHeadline] = useState<string>('');
  const [takeaways, setTakeaways] = useState<Takeaway[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (bills.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        bills: bills.map((b) => ({
          number: b.number,
          title: b.title,
          status: b.status,
          summary: b.summary,
          narrativeBrief: b.narrativeBrief,
          impacts: b.impacts ?? [],
          societalImpacts: b.societalImpacts ?? [],
        })),
      };
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'compare-takeaways',
        { body: payload },
      );
      if (invokeErr) throw invokeErr;
      if (data?.error) throw new Error(data.error);
      setHeadline(data.headline ?? '');
      setTakeaways(data.takeaways ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate takeaways');
    } finally {
      setLoading(false);
    }
  };

  // Regenerate whenever the set of bills changes.
  useEffect(() => {
    const ids = bills.map((b) => b.id).join('|');
    if (bills.length >= 2) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills.map((b) => b.id).join('|')]);

  if (bills.length < 2) return null;

  return (
    <Card variant="gradient" className="overflow-hidden border-primary/20">
      <div className="p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
                Key Takeaways
              </p>
              <p className="text-xs text-muted-foreground">AI-generated comparison brief</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={generate}
            disabled={loading}
            className="gap-1.5 print:hidden"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Regenerate
          </Button>
        </div>

        {loading && takeaways.length === 0 && (
          <div className="space-y-2.5 animate-pulse">
            <div className="h-7 bg-secondary/60 rounded w-3/4" />
            <div className="h-4 bg-secondary/40 rounded w-full" />
            <div className="h-4 bg-secondary/40 rounded w-11/12" />
            <div className="h-4 bg-secondary/40 rounded w-10/12" />
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {headline && (
          <h2 className="text-2xl md:text-[28px] font-bold tracking-tight leading-tight text-foreground">
            {headline}
          </h2>
        )}

        {takeaways.length > 0 && (
          <ul className="grid md:grid-cols-2 gap-2.5">
            {takeaways.map((t, idx) => {
              const Icon = ICON_MAP[t.icon] ?? Scale;
              return (
                <li
                  key={idx}
                  className={`flex gap-3 p-3 rounded-lg border ${TONE_STYLES[t.tone]} bg-card/40`}
                >
                  <div className="shrink-0 w-7 h-7 rounded-md bg-background/60 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-sm text-foreground leading-snug">{t.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default CompareKeyTakeaways;