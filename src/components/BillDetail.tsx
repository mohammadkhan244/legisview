import { useEffect, useMemo, useState } from 'react';
import { X, FileText, Calendar, Users, ExternalLink, Plus, Search, Loader2, Trash2, Layers, Columns, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Bill, SectorImpact } from '@/types/legislation';
import { assessBillConfidence } from '@/lib/billConfidence';
import ConfidenceBadge from './ConfidenceBadge';
import ImpactTable from './ImpactTable';
import SectorChart from './SectorChart';
import ImpactNetworkGraph from './ImpactNetworkGraph';
import SocietalImpactPanel from './SocietalImpactPanel';

interface BillDetailProps {
  bills: Bill[];
  onClose: () => void;
  onBillsChange: (bills: Bill[]) => void;
}

const MAX_BILLS = 3;

/** Sum economicImpact per sector across all bills (used for combined chart + table). Preserves null when no bill has a $ figure for that sector. */
const aggregateImpacts = (bills: Bill[]): SectorImpact[] => {
  const map: Record<string, SectorImpact & { _hasFigure: boolean }> = {};
  bills.forEach((b) =>
    (b.impacts ?? []).forEach((i) => {
      const key = i.sector;
      const hasFig = typeof i.economicImpact === 'number';
      if (!map[key]) {
        map[key] = { ...i, economicImpact: hasFig ? (i.economicImpact as number) : null, _hasFigure: hasFig };
      } else {
        if (hasFig) {
          map[key].economicImpact = (map[key]._hasFigure ? (map[key].economicImpact as number) : 0) + (i.economicImpact as number);
          map[key]._hasFigure = true;
        }
        map[key].explanation = `${map[key].explanation} | ${b.number}: ${i.explanation}`;
      }
    }),
  );
  return Object.values(map).map(({ _hasFigure, ...rest }) => rest);
};

const BillDetail = ({ bills, onClose, onBillsChange }: BillDetailProps) => {
  const [graphMode, setGraphMode] = useState<'unified' | 'split'>('unified');
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  // Manual-paste fallback when ohio.gov scraping times out
  const [manualFallback, setManualFallback] = useState<{ url: string; pdfUrl?: string | null } | null>(null);
  const [manualText, setManualText] = useState('');
  const [related, setRelated] = useState<Array<{ id: string; number: string; title: string; url: string; summary?: string }>>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Derive simple keywords from the primary bill's title for the related search
  const primaryBill = bills[0];
  const relatedQuery = useMemo(() => {
    if (!primaryBill?.title) return '';
    const stop = new Set(['the','a','an','of','to','for','and','or','in','on','with','by','from','as','at','is','be','regarding','relating','enact','amend','sections','section']);
    return primaryBill.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w))
      .slice(0, 5)
      .join(' ');
  }, [primaryBill?.title]);

  // Fetch related bills whenever the primary bill changes
  useEffect(() => {
    if (!relatedQuery) return;
    let cancelled = false;
    setRelatedLoading(true);
    setRelated([]);
    const ga = primaryBill?.id?.match(/legislation\/(\d+)\//)?.[1] ?? '136';
    supabase.functions
      .invoke('search-bills', { body: { query: relatedQuery, generalAssembly: ga, chamber: 'all', limit: 8 } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) {
          setRelated([]);
          return;
        }
        const excludeIds = new Set(bills.map((b) => b.id));
        const filtered = (data?.bills ?? []).filter(
          (r: { url: string; number: string }) =>
            !excludeIds.has(r.url) && !bills.some((b) => b.number === r.number),
        );
        setRelated(filtered.slice(0, 5));
      })
      .finally(() => !cancelled && setRelatedLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedQuery, bills.length]);

  const isCompare = bills.length > 1;
  const aggregated = isCompare ? aggregateImpacts(bills) : (bills[0].impacts ?? []);
  const quantified = aggregated.filter((i) => typeof i.economicImpact === 'number');
  const totalImpact = quantified.reduce((sum, i) => sum + (i.economicImpact as number), 0);
  const sectorsAffected = aggregated.length;
  const highImpactCount = aggregated.filter((i) => i.strength === 'High').length;
  const hasQuantData = quantified.length > 0;

  const addBill = async (rawUrl: string, manualTextArg?: string) => {
    const url = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    if (bills.some((b) => b.id === url) && !manualTextArg) {
      toast({ title: 'Already added', description: 'That bill is already in the comparison.' });
      return;
    }
    setAdding(true);
    setAddingUrl(url);
    try {
      const body: { url: string; manualText?: string } = { url };
      if (manualTextArg && manualTextArg.trim().length > 50) body.manualText = manualTextArg.trim();
      const { data, error } = await supabase.functions.invoke('analyze-bill', { body });
      if (error) throw error;
      if (data?.allowManual && !manualTextArg) {
        // Scraping failed — open the manual paste fallback
        setManualFallback({ url, pdfUrl: data.pdfUrl });
        setManualText('');
        return;
      }
      if (data?.error) throw new Error(data.error);
      const bill: Bill = {
        id: url,
        title: data.title,
        number: data.number,
        status: (data.status as Bill['status']) || 'Introduced',
        introducedDate: data.introducedDate || new Date().toISOString(),
        summary: data.summary,
        sponsors: data.sponsors?.length ? data.sponsors : ['Unknown'],
        impacts: data.impacts ?? [],
        societalImpacts: data.societalImpacts ?? [],
        narrativeBrief: data.narrativeBrief ?? '',
        lastCheckedAt: data.lastCheckedAt,
      };
      onBillsChange([...bills, bill]);
      setAddUrl('');
      setShowAdd(false);
      setManualFallback(null);
      setManualText('');
      toast({ title: 'Bill added', description: `${bill.number} added to comparison.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add bill';
      toast({ title: 'Failed to add bill', description: msg, variant: 'destructive' });
    } finally {
      setAdding(false);
      setAddingUrl(null);
    }
  };

  const reanalyzeBill = async (id: string) => {
    setAddingUrl(id);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-bill', {
        body: { url: id, forceRefresh: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const fresh: Bill = {
        id,
        title: data.title,
        number: data.number,
        status: (data.status as Bill['status']) || 'Introduced',
        introducedDate: data.introducedDate || new Date().toISOString(),
        summary: data.summary,
        sponsors: data.sponsors?.length ? data.sponsors : ['Unknown'],
        impacts: data.impacts ?? [],
        societalImpacts: data.societalImpacts ?? [],
        narrativeBrief: data.narrativeBrief ?? '',
        lastCheckedAt: data.lastCheckedAt,
      };
      onBillsChange(bills.map((b) => (b.id === id ? fresh : b)));
      toast({
        title: 'Re-analyzed',
        description: `${fresh.number} refreshed with the latest strict analysis.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Re-analysis failed';
      toast({ title: 'Re-analysis failed', description: msg, variant: 'destructive' });
    } finally {
      setAddingUrl(null);
    }
  };

  const removeBill = (id: string) => {
    if (bills.length <= 1) {
      onClose();
      return;
    }
    onBillsChange(bills.filter((b) => b.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-10">
      <div className="w-full max-w-5xl mx-4 animate-scale-in">
        <Card variant="elevated" className="border-border/50">
          {/* Header */}
          <CardHeader className="border-b border-border/50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl">
                        {isCompare ? `Comparing ${bills.length} Bills` : bills[0].title}
                      </CardTitle>
                      {!isCompare && (
                        <ConfidenceBadge confidence={assessBillConfidence(bills[0])} />
                      )}
                    </div>
                    {!isCompare && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-primary text-sm">{bills[0].number}</span>
                        <Badge variant="sector">{bills[0].status}</Badge>
                      </div>
                    )}
                  </div>
                </div>

                {!isCompare && (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      Introduced{' '}
                      {new Date(bills[0].introducedDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      {bills[0].sponsors.join(', ')}
                    </div>
                  </div>
                )}
              </div>

              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Bill chips (always visible — manage comparison set) */}
            <div className="flex flex-wrap items-center gap-2">
              {bills.map((b) => {
                const conf = assessBillConfidence(b);
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-secondary/60 border border-border/60"
                  >
                    <span className="font-mono text-sm text-primary">{b.number}</span>
                    <span className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {b.title}
                    </span>
                    {conf.level !== 'good' && (
                      <ConfidenceBadge confidence={conf} compact />
                    )}
                    <button
                      onClick={() => reanalyzeBill(b.id)}
                      disabled={addingUrl === b.id}
                      className="rounded-full p-1 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      aria-label={`Re-analyze ${b.number}`}
                      title="Re-analyze with latest strict prompt"
                    >
                      {addingUrl === b.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => removeBill(b.id)}
                      className="rounded-full p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${b.number}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {bills.length < MAX_BILLS && !showAdd && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
                  <Plus className="w-4 h-4" />
                  Add another bill
                </Button>
            )}

            {/* Related bills suggestions */}
            {bills.length < MAX_BILLS && (relatedLoading || related.length > 0) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Related bills
                  {relatedLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </div>
                {related.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {related.map((r) => (
                      <Card
                        key={r.id}
                        variant="glass"
                        className="p-3 flex items-start justify-between gap-3 hover:border-primary/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs text-primary">{r.number}</span>
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Open on Ohio Legislature"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <p className="text-xs text-foreground line-clamp-2">{r.title}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-8"
                          onClick={() => addBill(r.url)}
                          disabled={adding}
                        >
                          {addingUrl === r.url ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Inline add-bill search */}
            {showAdd && (
              <Card variant="glass" className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Add a bill to compare ({bills.length}/{MAX_BILLS})
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Paste a bill URL, e.g. legislature.ohio.gov/legislation/136/sb1"
                      className="pl-10"
                      value={addUrl}
                      onChange={(e) => setAddUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && addUrl.trim() && !adding) addBill(addUrl);
                      }}
                      disabled={adding}
                    />
                  </div>
                  <Button
                    onClick={() => addBill(addUrl)}
                    disabled={!addUrl.trim() || adding}
                    variant="hero"
                  >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: open the search results behind this dialog and copy a bill URL.
                </p>
              </Card>
            )}

            {/* Manual paste fallback when ohio.gov scraping times out */}
            {manualFallback && (
              <Card variant="glass" className="p-4 space-y-3 border-impact-medium/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Ohio Legislature site is slow — paste the bill text manually
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open the{' '}
                      {manualFallback.pdfUrl ? (
                        <a href={manualFallback.pdfUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                          bill PDF
                        </a>
                      ) : (
                        <a href={manualFallback.url} target="_blank" rel="noreferrer" className="text-primary underline">
                          bill page
                        </a>
                      )}
                      , copy the text, and paste it below. The AI will analyze your pasted text directly.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setManualFallback(null);
                      setManualText('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Paste the bill text here (at least a few paragraphs)..."
                  className="min-h-[180px] font-mono text-xs"
                  disabled={adding}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {manualText.trim().length} characters{' '}
                    {manualText.trim().length < 50 && '(need at least 50)'}
                  </p>
                  <Button
                    onClick={() => addBill(manualFallback.url, manualText)}
                    disabled={manualText.trim().length < 50 || adding}
                    variant="hero"
                  >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyze pasted text'}
                  </Button>
                </div>
              </Card>
            )}

            {/* Summary + Narrative Brief */}
            {!isCompare && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Bill Summary</h3>
                  <p className="text-foreground">{bills[0].summary}</p>
                </div>
                {bills[0].narrativeBrief && bills[0].narrativeBrief.trim() && (
                  <Card variant="glass" className="p-4 border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-medium text-primary">What this means for Ohioans</h3>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{bills[0].narrativeBrief}</p>
                  </Card>
                )}
                {bills[0].lastCheckedAt && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" />
                    Last checked against Ohio Legislature: {new Date(bills[0].lastCheckedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Impact Summary Card */}
            <div className="grid grid-cols-3 gap-4">
              <Card variant="glass" className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  {isCompare ? 'Combined Net Impact' : 'Total Est. Impact'}
                </p>
                {hasQuantData ? (
                  <p
                    className={`text-2xl font-bold ${
                      totalImpact >= 0 ? 'text-impact-low' : 'text-impact-high'
                    }`}
                  >
                    {totalImpact >= 0 ? '+' : ''}${totalImpact.toFixed(1)}B
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-muted-foreground">—</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">No $ anchor in bill text</p>
                  </>
                )}
              </Card>
              <Card variant="glass" className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Sectors Affected</p>
                <p className="text-2xl font-bold text-primary">{sectorsAffected}</p>
              </Card>
              <Card variant="glass" className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">High Impact Areas</p>
                <p className="text-2xl font-bold text-impact-medium">{highImpactCount}</p>
              </Card>
            </div>

            {/* Mode toggle (only when comparing) */}
            {isCompare && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">View mode</p>
                <ToggleGroup
                  type="single"
                  value={graphMode}
                  onValueChange={(v) => v && setGraphMode(v as 'unified' | 'split')}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="unified" aria-label="Unified network">
                    <Layers className="w-4 h-4 mr-1.5" />
                    Unified
                  </ToggleGroupItem>
                  <ToggleGroupItem value="split" aria-label="Side-by-side networks">
                    <Columns className="w-4 h-4 mr-1.5" />
                    Side-by-side
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {/* Network Graph */}
            <ImpactNetworkGraph bills={bills} mode={graphMode} />

            {/* Chart (always combined when comparing) */}
            <SectorChart impacts={aggregated} />

            {/* Impact Table */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {isCompare ? 'Combined Sector Analysis' : 'Detailed Sector Analysis'}
              </h3>
              <ImpactTable impacts={aggregated} />
            </div>

            {/* Societal Impact Section */}
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 flex-wrap">
                Societal Impact
                <span className="text-xs font-normal text-muted-foreground">
                  Civil rights, public health, equity, and community effects
                </span>
              </h3>
              {isCompare ? (
                <div className="space-y-5 mt-3">
                  {bills.map((b) => (
                    <div key={b.id}>
                      <p className="text-sm font-mono text-primary mb-2">{b.number}</p>
                      <SocietalImpactPanel impacts={b.societalImpacts ?? []} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <SocietalImpactPanel impacts={bills[0].societalImpacts ?? []} />
                </div>
              )}
            </div>

            {/* Per-bill explanations */}
            {bills.map((bill) => (
              <div key={bill.id}>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span className="font-mono text-primary text-base">{bill.number}</span>
                  <span className="text-muted-foreground text-sm font-normal">
                    — {bill.title}
                  </span>
                </h3>
                {isCompare && (
                  <p className="text-sm text-muted-foreground mb-3">{bill.summary}</p>
                )}
                <div className="space-y-3">
                  {(bill.impacts ?? []).map((impact, idx) => (
                    <Card key={idx} variant="default" className="p-4">
                      <div className="flex items-start gap-3">
                        <Badge
                          variant={impact.strength.toLowerCase() as 'high' | 'medium' | 'low'}
                        >
                          {impact.sector}
                        </Badge>
                        <p className="text-sm text-muted-foreground flex-1">
                          {impact.explanation}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border/50">
              <Button variant="hero" className="flex-1">
                Generate Full Report
              </Button>
              {!isCompare && (
                <Button variant="outline" className="gap-2" asChild>
                  <a href={bills[0].id} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4" />
                    View on Ohio Legislature
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BillDetail;
