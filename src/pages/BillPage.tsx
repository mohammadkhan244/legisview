import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Calendar, Users, Sparkles, RefreshCw, Share2, Clock, FileText, GitCompare, Search, Plus, Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Bill } from '@/types/legislation';
import { decodeBillSlug, encodeBillSlug } from '@/lib/billUrl';
import { recordCompare } from '@/lib/compareHistory';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { assessBillConfidence } from '@/lib/billConfidence';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import ImpactTable from '@/components/ImpactTable';
import SectorChart from '@/components/SectorChart';
import SocietalImpactPanel from '@/components/SocietalImpactPanel';
import BillPropagationGraph from '@/components/BillPropagationGraph';

const BillPage = () => {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const sourceUrl = decodeBillSlug(slug);
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareQuery, setCompareQuery] = useState('');
  const [compareSearching, setCompareSearching] = useState(false);
  type PickerResult = { url: string; number: string; title: string };
  const [compareResults, setCompareResults] = useState<PickerResult[]>([]);

  const detectJurisdiction = (u: string): 'federal' | 'ohio' =>
    /legislature\.ohio\.gov|ohiohouse\.gov|ohiosenate\.gov/i.test(u) ? 'ohio' : 'federal';

  const goCompareWith = (otherUrl: string) => {
    const cleaned = (otherUrl || '').trim();
    if (!cleaned) return;
    // Normalize for same-bill check: strip query/hash + trailing slash
    const norm = (u: string) => u.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (norm(cleaned) === norm(sourceUrl)) {
      toast({ title: 'Same bill', description: 'Pick a different bill to compare against.' });
      return;
    }
    const slugs = [encodeBillSlug(sourceUrl), encodeBillSlug(cleaned)].join(',');
    const labels: Record<string, string> = {};
    if (bill?.number) labels[sourceUrl] = bill.number;
    recordCompare([sourceUrl, cleaned], labels);
    setCompareOpen(false);
    navigate(`/compare?bills=${slugs}`);
  };

  const runCompareSearch = async () => {
    const q = compareQuery.trim();
    if (!q) return;
    // Direct URL paste → jump straight to compare
    if (/^https?:\/\//i.test(q)) {
      goCompareWith(q);
      return;
    }
    const jurisdiction = bill ? detectJurisdiction(bill.id) : 'federal';

    // Ohio shortcut: "SB 2", "HB 15", "HR 4", "SR 1" — assumes the same GA as
    // the current bill's URL (falls back to 136th).
    if (jurisdiction === 'ohio') {
      const ohMatch = q.match(/^(sb|hb|sr|hr|sjr|hjr|scr|hcr)\s*\.?\s*(\d+)$/i);
      if (ohMatch) {
        const prefix = ohMatch[1].toLowerCase();
        const num = ohMatch[2];
        const gaMatch = sourceUrl.match(/\/legislation\/(\d+)\//);
        const ga = gaMatch ? gaMatch[1] : '136';
        goCompareWith(`https://www.legislature.ohio.gov/legislation/${ga}/${prefix}${num}`);
        return;
      }
    }

    // Federal bill-number shortcut, e.g. "HR 776" or "S 123"
    const billNumMatch = q.match(/^(hr|s|hjres|sjres|hres|sres|hconres|sconres)\s*\.?\s*(\d+)$/i);
    if (billNumMatch && jurisdiction === 'federal') {
      const typeMap: Record<string, string> = {
        hr: 'house-bill', s: 'senate-bill',
        hjres: 'house-joint-resolution', sjres: 'senate-joint-resolution',
        hres: 'house-resolution', sres: 'senate-resolution',
        hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution',
      };
      const type = typeMap[billNumMatch[1].toLowerCase()];
      const num = billNumMatch[2];
      // Try to infer congress from current bill URL
      const congMatch = sourceUrl.match(/(\d+)(?:st|nd|rd|th)-congress/i);
      const cong = congMatch ? congMatch[1] : '119';
      const ord = (n: string) => {
        const v = parseInt(n, 10), s = ['th', 'st', 'nd', 'rd'], rem = v % 100;
        return n + (s[(rem - 20) % 10] || s[rem] || s[0]);
      };
      goCompareWith(`https://www.congress.gov/bill/${ord(cong)}-congress/${type}/${num}`);
      return;
    }
    setCompareSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-bills', {
        body: { query: q, jurisdiction, limit: 8 },
      });
      if (error) throw error;
      const results: PickerResult[] = (data?.bills ?? data?.results ?? [])
        .map((r: { url: string; number: string; title: string }) => ({ url: r.url, number: r.number, title: r.title }))
        .filter((r: PickerResult) => r.url && r.url !== sourceUrl);
      setCompareResults(results);
      if (results.length === 0) toast({ title: 'No matches', description: 'Try a different keyword or paste a bill URL.' });
    } catch (e) {
      toast({ title: 'Search failed', description: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setCompareSearching(false);
    }
  };

  const load = async (forceRefresh = false) => {
    if (!sourceUrl) {
      setError('Invalid bill link.');
      setLoading(false);
      return;
    }
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-bill', {
        body: { url: sourceUrl, forceRefresh },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBill({
        id: sourceUrl,
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
        actions: data.actions ?? [],
        cosponsors: data.cosponsors ?? [],
        textExcerpt: data.textExcerpt ?? '',
        sourceUrl: data.sourceUrl ?? sourceUrl,
        pdfUrl: data.pdfUrl ?? undefined,
        cboUrl: data.cboUrl ?? undefined,
        cboEstimate: data.cboEstimate ?? undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load bill';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const share = async () => {
    const url = `${window.location.origin}/bill/${encodeBillSlug(sourceUrl)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Shareable bill link copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: url });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-16 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
          Loading bill analysis...
        </main>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-16">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-4 gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to search
          </Button>
          <Card className="p-12 text-center border-dashed">
            <p className="text-foreground mb-2">{error ?? 'Bill not found.'}</p>
            <Link to="/" className="text-primary underline text-sm">Return to search</Link>
          </Card>
        </main>
      </div>
    );
  }

  const conf = assessBillConfidence(bill);
  const totalImpact = bill.impacts.filter((i) => typeof i.economicImpact === 'number')
    .reduce((s, i) => s + (i.economicImpact as number), 0);
  const hasQuant = bill.impacts.some((i) => typeof i.economicImpact === 'number');

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to search
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={share} className="gap-1.5">
              <Share2 className="w-4 h-4" /> Share
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} className="gap-1.5">
              <GitCompare className="w-4 h-4" /> Compare with another bill
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-analyze
            </Button>
          </div>
        </div>

        <Card variant="elevated" className="border-border/50">
          <CardHeader className="border-b border-border/50">
            <div className="flex items-start gap-3 mb-2 flex-wrap">
              <CardTitle className="text-2xl flex-1 min-w-[200px]">{bill.title}</CardTitle>
              <ConfidenceBadge confidence={conf} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-primary text-sm">{bill.number}</span>
              <Badge variant="sector">{bill.status}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Introduced {new Date(bill.introducedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {bill.sponsors.join(', ')}
              </div>
              <a href={bill.id} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <ExternalLink className="w-4 h-4" /> Source
              </a>
              {bill.pdfUrl && (
                <a href={bill.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                  <FileText className="w-4 h-4" /> Bill text
                </a>
              )}
              {bill.cboUrl ? (
                <a href={bill.cboUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                  <Calculator className="w-4 h-4" /> CBO estimate
                </a>
              ) : (
                <span className="flex items-center gap-1.5 italic">
                  <Calculator className="w-4 h-4" /> No CBO info available
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Summary + brief */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Bill Summary</h3>
                <p className="text-foreground">{bill.summary}</p>
              </div>
              {bill.narrativeBrief?.trim() && (
                <Card variant="glass" className="p-4 border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-medium text-primary">What this means in plain language</h3>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{bill.narrativeBrief}</p>
                </Card>
              )}
            </div>

            {/* Impact summary */}
            <div className="grid grid-cols-3 gap-4">
              <Card variant="glass" className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Total Est. Impact</p>
                {hasQuant ? (
                  <p className={`text-2xl font-bold ${totalImpact >= 0 ? 'text-impact-low' : 'text-impact-high'}`}>
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
                <p className="text-2xl font-bold text-primary">{bill.impacts.length}</p>
              </Card>
              <Card variant="glass" className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">High Impact Areas</p>
                <p className="text-2xl font-bold text-impact-medium">
                  {bill.impacts.filter((i) => i.strength === 'High').length}
                </p>
              </Card>
            </div>

            <SectorChart impacts={bill.impacts} />

            {bill.impacts.length >= 1 && (
              <BillPropagationGraph bill={bill} height={480} />
            )}

            <div>
              <h3 className="text-lg font-semibold mb-4">Detailed Sector Analysis</h3>
              <ImpactTable impacts={bill.impacts} />
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Societal Impact</h3>
              <SocietalImpactPanel impacts={bill.societalImpacts ?? []} />
            </div>

            {/* Action history (federal) */}
            {bill.actions && bill.actions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" /> Action History
                </h3>
                <ol className="space-y-2 border-l border-border/60 ml-2">
                  {bill.actions.map((a, idx) => (
                    <li key={idx} className="pl-4 relative">
                      <span className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-primary/60 border-2 border-background" />
                      <div className="text-xs text-muted-foreground">
                        {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {a.type ? ` · ${a.type}` : ''}
                      </div>
                      <p className="text-sm text-foreground">{a.text}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Cosponsors (federal) */}
            {bill.cosponsors && bill.cosponsors.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Cosponsors ({bill.cosponsors.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {bill.cosponsors.map((c, i) => (
                    <Badge key={i} variant="secondary" className="font-normal">
                      {c.name}{c.party ? ` (${c.party}${c.state ? '-' + c.state : ''})` : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Text excerpt */}
            {bill.textExcerpt && bill.textExcerpt.length > 50 && (
              <details className="group">
                <summary className="cursor-pointer text-lg font-semibold mb-3 flex items-center gap-2 list-none">
                  <FileText className="w-5 h-5 text-primary" />
                  Bill Text Excerpt
                  <span className="text-xs font-normal text-muted-foreground ml-auto group-open:hidden">click to expand</span>
                </summary>
                <Card variant="glass" className="p-4 mt-2">
                  <pre className="whitespace-pre-wrap text-xs font-mono text-foreground/80 leading-relaxed">
                    {bill.textExcerpt}
                    {bill.textExcerpt.length >= 1500 && '\n\n…(truncated)'}
                  </pre>
                </Card>
              </details>
            )}

            {bill.lastCheckedAt && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Last checked: {new Date(bill.lastCheckedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Add another bill to compare
            </DialogTitle>
            <DialogDescription>
              Search by keyword, paste a Congress.gov / Ohio Legislature URL, or type a bill number (e.g. HR 776).
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={compareQuery}
              onChange={(e) => setCompareQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runCompareSearch(); }}
              placeholder="e.g. clean energy, HR 776, or paste a bill URL"
              autoFocus
            />
            <Button onClick={runCompareSearch} disabled={compareSearching} className="gap-1.5">
              {compareSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>
          {compareResults.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-2 mt-2">
              {compareResults.map((r) => (
                <button
                  key={r.url}
                  onClick={() => goCompareWith(r.url)}
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
    </div>
  );
};

export default BillPage;