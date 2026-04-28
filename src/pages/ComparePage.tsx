import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Share2, GitCompare, Trash2, Plus, Search,
  Printer, Landmark, Building2, Sparkles, Download, SlidersHorizontal,
  ArrowUpDown, X, ExternalLink, FileText, Calculator, Clock,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Bill } from '@/types/legislation';
import { decodeBillSlug, encodeBillSlug } from '@/lib/billUrl';
import { recordCompare } from '@/lib/compareHistory';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import CompareDiffTable from '@/components/CompareDiffTable';
import CompareDeltaSummary from '@/components/CompareDeltaSummary';
import SocietalImpactPanel from '@/components/SocietalImpactPanel';
import CompareKeyTakeaways from '@/components/CompareKeyTakeaways';
import CompareWinnersLosers from '@/components/CompareWinnersLosers';
import CompareSectorHeatmap from '@/components/CompareSectorHeatmap';
import CompareSectorRanking from '@/components/CompareSectorRanking';
import SectorDrilldown from '@/components/SectorDrilldown';
import SectorCovarianceGraph from '@/components/SectorCovarianceGraph';
import { Slider } from '@/components/ui/slider';

const detectJurisdiction = (u: string): 'federal' | 'ohio' | 'unknown' =>
  /legislature\.ohio\.gov|ohiohouse\.gov|ohiosenate\.gov/i.test(u)
    ? 'ohio'
    : /congress\.gov/i.test(u)
      ? 'federal'
      : 'unknown';

const ComparePage = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const slugs = (params.get('bills') ?? '').split(',').filter(Boolean);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addSearching, setAddSearching] = useState(false);
  type PickerResult = { url: string; number: string; title: string };
  const [addResults, setAddResults] = useState<PickerResult[]>([]);
  // Filter & sort state for the analytical modules
  const [sectorFilter, setSectorFilter] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'magnitude' | 'net' | 'spread'>('magnitude');
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [drillSector, setDrillSector] = useState<string | null>(null);
  /** Time horizon for projecting economic impacts (impacts are 5-year baselines). */
  const [horizonYears, setHorizonYears] = useState(5);

  useEffect(() => {
    const urls = slugs.map(decodeBillSlug).filter(Boolean);
    if (urls.length === 0) {
      setError('No bills selected for comparison.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all(
      urls.map(async (url) => {
        const { data, error } = await supabase.functions.invoke('analyze-bill', { body: { url } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const b: Bill = {
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
          sourceUrl: data.sourceUrl ?? url,
          pdfUrl: data.pdfUrl ?? undefined,
          cboUrl: data.cboUrl ?? undefined,
          cboEstimate: data.cboEstimate ?? undefined,
        };
        return b;
      }),
    )
      .then((loaded) => {
        setBills(loaded);
        const labels: Record<string, string> = {};
        for (const b of loaded) labels[b.id] = b.number;
        recordCompare(loaded.map((b) => b.id), labels);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load bills'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('bills')]);

  const removeBill = (id: string) => {
    const next = bills.filter((b) => b.id !== id).map((b) => encodeBillSlug(b.id));
    if (next.length === 0) {
      navigate('/');
      return;
    }
    setParams({ bills: next.join(',') });
  };

  const addAnother = (otherUrl: string) => {
    const cleaned = (otherUrl || '').trim();
    if (!cleaned) return;
    const norm = (u: string) => u.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (bills.some((b) => norm(b.id) === norm(cleaned))) {
      toast({ title: 'Already added', description: 'That bill is already in this comparison.' });
      return;
    }
    if (bills.length >= 4) {
      toast({ title: 'Comparison full', description: 'Remove a bill before adding another (max 4).' });
      return;
    }
    const next = [...bills.map((b) => b.id), cleaned].map(encodeBillSlug).join(',');
    setAddOpen(false);
    setAddQuery('');
    setAddResults([]);
    setParams({ bills: next });
  };

  const inferGa = () => {
    const m = bills.map((b) => b.id).join(' ').match(/\/legislation\/(\d+)\//);
    return m ? m[1] : '136';
  };
  const inferCongress = () => {
    const m = bills.map((b) => b.id).join(' ').match(/(\d+)(?:st|nd|rd|th)-congress/i);
    return m ? m[1] : '119';
  };

  const runAddSearch = async () => {
    const q = addQuery.trim();
    if (!q) return;
    if (/^https?:\/\//i.test(q)) { addAnother(q); return; }

    // Determine jurisdiction context from existing bills
    const juris = new Set(bills.map((b) => detectJurisdiction(b.id)));
    juris.delete('unknown');
    const ctx: 'federal' | 'ohio' = juris.has('federal') && !juris.has('ohio')
      ? 'federal'
      : juris.has('ohio') && !juris.has('federal') ? 'ohio' : 'federal';

    if (ctx === 'ohio') {
      const oh = q.match(/^(sb|hb|sr|hr|sjr|hjr|scr|hcr)\s*\.?\s*(\d+)$/i);
      if (oh) {
        addAnother(`https://www.legislature.ohio.gov/legislation/${inferGa()}/${oh[1].toLowerCase()}${oh[2]}`);
        return;
      }
    } else {
      const fed = q.match(/^(hr|s|hjres|sjres|hres|sres|hconres|sconres)\s*\.?\s*(\d+)$/i);
      if (fed) {
        const map: Record<string, string> = {
          hr: 'house-bill', s: 'senate-bill',
          hjres: 'house-joint-resolution', sjres: 'senate-joint-resolution',
          hres: 'house-resolution', sres: 'senate-resolution',
          hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution',
        };
        const cong = inferCongress();
        const ord = (n: string) => {
          const v = parseInt(n, 10), s = ['th', 'st', 'nd', 'rd'], rem = v % 100;
          return n + (s[(rem - 20) % 10] || s[rem] || s[0]);
        };
        addAnother(`https://www.congress.gov/bill/${ord(cong)}-congress/${map[fed[1].toLowerCase()]}/${fed[2]}`);
        return;
      }
    }

    setAddSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-bills', {
        body: { query: q, jurisdiction: ctx, limit: 8 },
      });
      if (error) throw error;
      const r: PickerResult[] = (data?.bills ?? data?.results ?? [])
        .map((x: PickerResult) => ({ url: x.url, number: x.number, title: x.title }))
        .filter((x: PickerResult) => x.url && !bills.some((b) => b.id === x.url));
      setAddResults(r);
      if (r.length === 0) toast({ title: 'No matches', description: 'Try different keywords or paste a URL.' });
    } catch (e) {
      toast({ title: 'Search failed', description: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setAddSearching(false);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: 'Comparison link copied', description: 'Share the link to show this side-by-side comparison.' });
    } catch {
      toast({ title: 'Copy failed', description: window.location.href });
    }
  };

  const exportImage = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: 'hsl(222 47% 6%)',
      });
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `legisview-comparison-${stamp}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: 'Comparison exported', description: 'PNG saved to your downloads.' });
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setExporting(false);
    }
  };

  // Aggregate KPIs across loaded bills.
  const scale = horizonYears / 5;
  const kpis = useMemo(() => {
    const totals = bills.map((b) =>
      (b.impacts ?? []).filter((i) => typeof i.economicImpact === 'number')
        .reduce((s, i) => s + (i.economicImpact as number) * scale, 0),
    );
    const sectorSet = new Set(bills.flatMap((b) => (b.impacts ?? []).map((i) => i.sector)));
    const sharedSectors = [...sectorSet].filter((s) =>
      bills.every((b) => (b.impacts ?? []).some((i) => i.sector === s)),
    );
    const highCounts = bills.map((b) => (b.impacts ?? []).filter((i) => i.strength === 'High').length);
    return {
      net: totals.reduce((a, b) => a + b, 0),
      anyQuant: totals.some((t) => t !== 0),
      sectors: sectorSet.size,
      sharedSectors: sharedSectors.length,
      highTotal: highCounts.reduce((a, b) => a + b, 0),
    };
  }, [bills, scale]);

  const allSectors = useMemo(
    () => Array.from(new Set(bills.flatMap((b) => (b.impacts ?? []).map((i) => i.sector)))).sort(),
    [bills],
  );

  const activeSectors = useMemo(
    () => (sectorFilter.size === 0 ? allSectors : allSectors.filter((s) => sectorFilter.has(s))),
    [allSectors, sectorFilter],
  );

  const filteredBills = useMemo<Bill[]>(() => {
    if (sectorFilter.size === 0) return bills;
    return bills.map((b) => ({
      ...b,
      impacts: (b.impacts ?? []).filter((i) => sectorFilter.has(i.sector)),
    }));
  }, [bills, sectorFilter]);

  /** Bills with economic impacts re-scaled to the chosen time horizon (baseline = 5y). */
  const scaledBills = useMemo<Bill[]>(() => {
    return filteredBills.map((b) => ({
      ...b,
      impacts: (b.impacts ?? []).map((i) => ({
        ...i,
        economicImpact:
          typeof i.economicImpact === 'number' ? i.economicImpact * scale : i.economicImpact,
      })),
    }));
  }, [filteredBills, scale]);

  const toggleSector = (s: string) => {
    setSectorFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8 max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-40" />
          </div>
          <Card className="border-border/50 overflow-hidden">
            <CardHeader className="border-b border-border/50 space-y-3">
              <Skeleton className="h-6 w-72" />
              <div className="flex gap-2">
                {Array.from({ length: slugs.length || 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-40 rounded-full" />
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-64 rounded-xl" />
              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Analyzing {slugs.length || 'your'} bills…
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-16">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-4 gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Card className="p-12 text-center border-dashed">
            <p className="text-foreground mb-2">{error}</p>
            <Link to="/" className="text-primary underline text-sm">Return to search</Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8 max-w-6xl print:max-w-none print:py-2">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to search
          </Button>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportImage}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              Export PNG
            </Button>
            <Button variant="outline" size="sm" onClick={share} className="gap-1.5">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>
        </div>

        <Card variant="elevated" className="border-border/50 overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-gradient-to-b from-secondary/30 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <GitCompare className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-xl tracking-tight">
                  Comparing {bills.length} {bills.length === 1 ? 'Bill' : 'Bills'}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Side-by-side analysis of sector and societal impacts.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {bills.map((b) => {
                const j = detectJurisdiction(b.id);
                const Icon = j === 'federal' ? Landmark : j === 'ohio' ? Building2 : GitCompare;
                return (
                  <div
                    key={b.id}
                    className="group flex items-center gap-2 pl-2.5 pr-1 py-1.5 rounded-full bg-card border border-border/60 shadow-sm hover:border-primary/40 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <Link
                      to={`/bill/${encodeBillSlug(b.id)}`}
                      className="font-mono text-sm text-primary hover:underline whitespace-nowrap"
                    >
                      {b.number}
                    </Link>
                    <span className="text-xs text-muted-foreground max-w-[180px] truncate hidden sm:inline">
                      {b.title}
                    </span>
                    <button
                      onClick={() => removeBill(b.id)}
                      className="rounded-full p-1 hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${b.number}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {bills.length < 4 && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-border/70 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors print:hidden"
                >
                  <Plus className="w-3.5 h-3.5" /> Add bill
                </button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6" ref={exportRef as React.RefObject<HTMLDivElement>}>
            {/* AI Key Takeaways — Visual Capitalist style headline + bullets */}
            <CompareKeyTakeaways bills={bills} />

            {/* Source citations strip — direct links to congress.gov / Ohio Legislature, bill text, and CBO when present. */}
            <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight">Sources & citations</h3>
                <span className="text-[11px] text-muted-foreground">Verify every claim against the original.</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {bills.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/bill/${encodeBillSlug(b.id)}`} className="font-mono text-xs text-primary hover:underline">
                        {b.number}
                      </Link>
                      {b.cboUrl
                        ? <Badge variant="sector" className="text-[9px] gap-1"><Calculator className="w-2.5 h-2.5" /> CBO</Badge>
                        : <Badge variant="outline" className="text-[9px] text-muted-foreground">No CBO</Badge>}
                    </div>
                    <p className="text-[11px] text-foreground/80 line-clamp-2">{b.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-1">
                      <a href={b.sourceUrl ?? b.id} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> Source
                      </a>
                      {b.pdfUrl && (
                        <a href={b.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <FileText className="w-3 h-3" /> Bill text
                        </a>
                      )}
                      {b.cboUrl ? (
                        <a href={b.cboUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Calculator className="w-3 h-3" /> CBO estimate
                        </a>
                      ) : (
                        <span className="text-muted-foreground italic">No CBO info available</span>
                      )}
                    </div>
                    {b.cboEstimate && (
                      <p className="text-[10px] text-muted-foreground border-l-2 border-primary/40 pl-2 mt-1 line-clamp-2">
                        {b.cboEstimate}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* KPI strip — Apple-style metric tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile
                label="Net economic impact"
                value={kpis.anyQuant ? `${kpis.net >= 0 ? '+' : ''}$${kpis.net.toFixed(1)}B` : '—'}
                hint={kpis.anyQuant ? 'Sum across all bills' : 'No $ anchors found'}
                tone={kpis.anyQuant ? (kpis.net >= 0 ? 'pos' : 'neg') : 'neutral'}
              />
              <MetricTile
                label="Sectors covered"
                value={kpis.sectors.toString()}
                hint={`${kpis.sharedSectors} addressed by all bills`}
                tone="primary"
              />
              <MetricTile
                label="High-impact callouts"
                value={kpis.highTotal.toString()}
                hint="Strength = High"
                tone="warn"
              />
              <MetricTile
                label="Bills compared"
                value={bills.length.toString()}
                hint="Up to 4 supported"
                tone="neutral"
              />
            </div>

            {/* Winners & Losers podium */}
            <div>
              <SectionHeader
                title="Winners & Losers"
                subtitle="Top 3 sectors gaining and losing across all bills, ranked by net dollar impact."
              />
              <CompareWinnersLosers bills={scaledBills} />
            </div>

            {/* Time horizon slider */}
            <div className="rounded-xl border border-border/50 bg-card/40 p-4 print:hidden">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold tracking-tight">Projection horizon</h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-primary">{horizonYears}</span>
                  <span className="text-xs text-muted-foreground">{horizonYears === 1 ? 'year' : 'years'}</span>
                </div>
              </div>
              <Slider
                value={[horizonYears]}
                onValueChange={(v) => setHorizonYears(v[0])}
                min={1}
                max={10}
                step={1}
                aria-label="Time horizon in years"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                <span>1y</span><span>5y baseline</span><span>10y</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                AI estimates are anchored to a 5-year window; this slider linearly scales projections so
                you can see short- and long-horizon effects. Not a CBO-grade forecast.
              </p>
            </div>

            {/* Filter + sort controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 -mb-2 print:hidden">
              <SectionHeader
                title="Sector Impact Visualizations"
                subtitle="Heatmap and ranked bars — filter to your sectors of interest."
              />
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Sectors
                      {sectorFilter.size > 0 && (
                        <Badge variant="sector" className="ml-1 text-[10px]">{sectorFilter.size}</Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                    <DropdownMenuLabel>Show only…</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allSectors.length === 0 && (
                      <DropdownMenuItem disabled>No sectors yet</DropdownMenuItem>
                    )}
                    {allSectors.map((s) => (
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={sectorFilter.has(s)}
                        onCheckedChange={() => toggleSector(s)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {s}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {sectorFilter.size > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setSectorFilter(new Set())}>
                          <X className="w-3.5 h-3.5 mr-2" /> Clear filter
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      Sort: {sortBy === 'magnitude' ? 'Biggest impact' : sortBy === 'net' ? 'Net winner→loser' : 'Most disagreement'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setSortBy('magnitude')}>
                      Biggest absolute impact
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSortBy('net')}>
                      Net winner → loser
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSortBy('spread')}>
                      Where bills disagree most
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Sector ranking bars (VC signature) */}
            <CompareSectorRanking
              bills={filteredBills}
              sectors={activeSectors}
              sortBy={sortBy}
              scale={scale}
              onSectorClick={setDrillSector}
            />

            {/* Heatmap */}
            <div>
              <SectionHeader
                title="Sector × Bill Heatmap"
                subtitle="Color encodes direction; intensity encodes magnitude. Hover for the analyst's note."
              />
              <CompareSectorHeatmap
                bills={filteredBills}
                sectors={activeSectors}
                scale={scale}
                onSectorClick={setDrillSector}
              />
            </div>

            {/* CoRisk-style sector co-impact network */}
            <div>
              <SectionHeader
                title="Sector Co-Impact Network"
                subtitle="Inspired by 2008-era CoRisk graphs — see which sectors are entangled by these bills."
              />
              <SectorCovarianceGraph
                bills={filteredBills}
                sectors={activeSectors}
                scale={scale}
              />
            </div>

            {/* Existing aggregated highlights + side-by-side detail */}
            <CompareDeltaSummary bills={scaledBills} />

            <div>
              <SectionHeader
                title="Side-by-side Sector Detail"
                subtitle="Full explanations row-by-row, aligned across bills."
              />
              <CompareDiffTable bills={scaledBills} />
            </div>

            <div>
              <SectionHeader
                title="Societal Impact by Bill"
                subtitle="Who benefits, who is burdened — per bill."
              />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bills.map((b) => (
                  <div key={b.id} className="space-y-2 rounded-xl border border-border/40 bg-card/40 p-3">
                    <div className="flex items-center justify-between">
                      <Link
                        to={`/bill/${encodeBillSlug(b.id)}`}
                        className="font-mono text-sm text-primary hover:underline"
                      >
                        {b.number}
                      </Link>
                      <Badge variant="sector" className="text-[10px]">{b.status}</Badge>
                    </div>
                    <SocietalImpactPanel impacts={b.societalImpacts ?? []} />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-2 border-t border-border/40">
              <Sparkles className="w-3 h-3 text-primary" />
              Comparisons are AI-generated estimates grounded in each bill's text.
              Always verify against the official source before citing.
            </p>
          </CardContent>
        </Card>
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Add a bill to this comparison
            </DialogTitle>
            <DialogDescription>
              Search by keyword, paste a Congress.gov / Ohio Legislature URL, or type a bill number
              (e.g. <span className="font-mono">HR 776</span> or <span className="font-mono">SB 2</span>).
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runAddSearch(); }}
              placeholder="e.g. clean energy, HR 776, or paste a bill URL"
              autoFocus
            />
            <Button onClick={runAddSearch} disabled={addSearching} className="gap-1.5">
              {addSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>
          {addResults.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-2 mt-2">
              {addResults.map((r) => (
                <button
                  key={r.url}
                  onClick={() => addAnother(r.url)}
                  className="w-full text-left p-3 rounded-lg border border-border/60 hover:border-primary/60 hover:bg-secondary/40 transition-colors"
                >
                  <div className="font-mono text-sm text-primary mb-0.5">{r.number}</div>
                  <div className="text-sm text-foreground line-clamp-2">{r.title}</div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SectorDrilldown
        sector={drillSector}
        bills={bills}
        scale={scale}
        horizonYears={horizonYears}
        onClose={() => setDrillSector(null)}
      />
    </div>
  );
};

/** Compact metric tile inspired by Apple's Settings & Microsoft Fluent. */
const MetricTile = ({
  label, value, hint, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'pos' | 'neg' | 'primary' | 'warn' | 'neutral';
}) => {
  const valueClass =
    tone === 'pos' ? 'text-impact-low'
    : tone === 'neg' ? 'text-impact-high'
    : tone === 'warn' ? 'text-impact-medium'
    : tone === 'primary' ? 'text-primary'
    : 'text-foreground';
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-3 transition-colors hover:border-primary/30">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight mt-1 ${valueClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
};

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-3">
    <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
    {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
  </div>
);

export default ComparePage;