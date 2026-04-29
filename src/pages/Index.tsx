import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, ExternalLink, Filter, GitCompare, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import EconomicOverview from '@/components/EconomicOverview';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { encodeBillSlug } from '@/lib/billUrl';
import { recordCompare } from '@/lib/compareHistory';
import CompareHistoryStrip from '@/components/CompareHistoryStrip';

interface SearchResult {
  id: string;
  number: string;
  title: string;
  url: string;
  summary?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [jurisdiction, setJurisdiction] = useState<'ohio' | 'federal'>('ohio');
  const [ga, setGa] = useState('136');
  const [congress, setCongress] = useState('119');
  const [chamber, setChamber] = useState<'all' | 'senate' | 'house'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** URLs selected for comparison (max 3). */
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const runSearch = async () => {
    const raw = query.trim();
    if (!raw) return;

    // 1) If user pasted a full bill URL, jump straight to analysis.
    //    Supports both Congress.gov and Ohio Legislature URLs regardless of current toggle.
    const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
    const candidate = urlMatch ? urlMatch[0] : raw;

    // Congress.gov bill URL — e.g. /bill/119th-congress/house-bill/1 or 102nd-congress/...
    const congressUrl = candidate.match(
      /congress\.gov\/bill\/(\d+)(?:st|nd|rd|th)-congress\/([a-z-]+)\/(\d+)/i,
    );
    if (congressUrl) {
      // Strip query string (?hl=…&s=…&r=…) so the slug encodes a clean canonical URL.
      const [, cong, slug, num] = congressUrl;
      const clean = `https://www.congress.gov/bill/${cong}th-congress/${slug.toLowerCase()}/${num}`;
      if (jurisdiction !== 'federal') setJurisdiction('federal');
      // Auto-sync the Congress filter to whatever the pasted URL refers to.
      if (cong !== congress) setCongress(cong);
      openBill(clean);
      return;
    }

    // Ohio Legislature bill URL — e.g. /legislation/136/sb2
    const ohioUrl = candidate.match(/legislature\.ohio\.gov\/legislation\/\d+\/[a-z]+\d+/i);
    if (ohioUrl) {
      const clean = ohioUrl[0].startsWith('http') ? ohioUrl[0] : `https://www.${ohioUrl[0]}`;
      if (jurisdiction !== 'ohio') setJurisdiction('ohio');
      openBill(clean);
      return;
    }

    // 2) Bill-number shortcut for federal (e.g. "HR 776", "S. 1020", "HR776").
    if (jurisdiction === 'federal') {
      const m = raw.match(/^\s*(hr|s|hjres|sjres|hres|sres)\.?\s*(\d+)\s*$/i);
      if (m) {
        const type = m[1].toLowerCase();
        const num = m[2];
        const slug =
          type === 'hr' ? 'house-bill' :
          type === 's' ? 'senate-bill' :
          type === 'hjres' ? 'house-joint-resolution' :
          type === 'sjres' ? 'senate-joint-resolution' :
          type === 'hres' ? 'house-resolution' : 'senate-resolution';
        openBill(`https://www.congress.gov/bill/${congress}th-congress/${slug}/${num}`);
        return;
      }
    }

    // 3) Fallback to keyword search.
    setSearching(true);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('search-bills', {
        body: { query: raw, jurisdiction, generalAssembly: ga, congress, chamber, limit: 12 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data?.bills ?? []);
      if (!data?.bills?.length) {
        toast({ title: 'No bills found', description: 'Try a broader query or different filters.' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      toast({ title: 'Search failed', description: msg, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  /** Navigate to a dedicated, shareable bill page. */
  const openBill = (rawUrl: string) => {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    navigate(`/bill/${encodeBillSlug(url)}`);
  };

  const toggleCompare = (url: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      if (prev.length >= 3) {
        toast({ title: 'Maximum 3 bills', description: 'Remove one before adding another.' });
        return prev;
      }
      return [...prev, url];
    });
  };

  const goToCompare = () => {
    if (selectedForCompare.length < 2) return;
    // Build a quick label map from the current results so chips show "HR 776"
    // rather than a raw URL fragment on first record.
    const labels: Record<string, string> = {};
    for (const r of results) labels[r.url] = r.number;
    recordCompare(selectedForCompare, labels);
    const slugs = selectedForCompare.map(encodeBillSlug).join(',');
    navigate(`/compare?bills=${slugs}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />

      <main className="container mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <CompareHistoryStrip />

        {/* Sticky compare bar */}
        {selectedForCompare.length > 0 && (
          <div className="sticky top-2 z-30 mb-4 flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 rounded-lg border border-primary/40 bg-card/95 backdrop-blur shadow-lg">
            <div className="flex items-center gap-2 text-sm">
              <GitCompare className="w-4 h-4 text-primary" />
              <span className="font-medium">{selectedForCompare.length} selected for comparison</span>
              <span className="text-xs text-muted-foreground">(2–3 bills)</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedForCompare([])}>Clear</Button>
              <Button
                variant="hero"
                size="sm"
                onClick={goToCompare}
                disabled={selectedForCompare.length < 2}
                className="gap-1.5"
              >
                <GitCompare className="w-4 h-4" /> Compare
              </Button>
            </div>
          </div>
        )}

        <section className="mb-12">
          <EconomicOverview />
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              Search {jurisdiction === 'federal' ? 'Federal' : 'Ohio'} Legislation
            </h2>
            <p className="text-muted-foreground">
              {jurisdiction === 'federal'
                ? 'Live search of congress.gov via the official Congress API. Click "Analyze" to project sector impact with AI.'
                : 'Live search of legislature.ohio.gov. Click "Analyze" to project sector impact with AI.'}
            </p>
          </div>

          {/* Jurisdiction toggle */}
          <div className="mb-6 inline-flex rounded-lg border border-border/60 bg-secondary/40 p-1">
            {(['ohio', 'federal'] as const).map((j) => (
              <button
                key={j}
                onClick={() => {
                  setJurisdiction(j);
                  setResults([]);
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  jurisdiction === j
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {j === 'ohio' ? 'Ohio (State)' : 'U.S. Congress (Federal)'}
              </button>
            ))}
          </div>

          {/* Mobile filter toggle */}
          <div className="lg:hidden mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              className="gap-2 w-full sm:w-auto"
            >
              <Filter className="w-4 h-4" />
              {filtersOpen ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </div>

          <div className="grid lg:grid-cols-[260px_1fr] gap-6">
            {/* Filter sidebar */}
            <Card className={`p-5 h-fit space-y-5 border-border/60 ${filtersOpen ? 'block' : 'hidden'} lg:block`}>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Filter className="w-4 h-4" /> Filters
              </div>

              {jurisdiction === 'ohio' ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">General Assembly</Label>
                  <Select value={ga} onValueChange={setGa}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="136">136th (2025–2026)</SelectItem>
                      <SelectItem value="135">135th (2023–2024)</SelectItem>
                      <SelectItem value="134">134th (2021–2022)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Congress</Label>
                  <Select value={congress} onValueChange={setCongress}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="119">119th (2025–2026)</SelectItem>
                      <SelectItem value="118">118th (2023–2024)</SelectItem>
                      <SelectItem value="117">117th (2021–2022)</SelectItem>
                      <SelectItem value="116">116th (2019–2020)</SelectItem>
                      <SelectItem value="115">115th (2017–2018)</SelectItem>
                      <SelectItem value="114">114th (2015–2016)</SelectItem>
                      <SelectItem value="113">113th (2013–2014)</SelectItem>
                      <SelectItem value="112">112th (2011–2012)</SelectItem>
                      <SelectItem value="111">111th (2009–2010)</SelectItem>
                      <SelectItem value="110">110th (2007–2008)</SelectItem>
                      <SelectItem value="109">109th (2005–2006)</SelectItem>
                      <SelectItem value="108">108th (2003–2004)</SelectItem>
                      <SelectItem value="107">107th (2001–2002)</SelectItem>
                      <SelectItem value="106">106th (1999–2000)</SelectItem>
                      <SelectItem value="105">105th (1997–1998)</SelectItem>
                      <SelectItem value="104">104th (1995–1996)</SelectItem>
                      <SelectItem value="103">103rd (1993–1994)</SelectItem>
                      <SelectItem value="102">102nd (1991–1992)</SelectItem>
                      <SelectItem value="101">101st (1989–1990)</SelectItem>
                      <SelectItem value="100">100th (1987–1988)</SelectItem>
                      <SelectItem value="99">99th (1985–1986)</SelectItem>
                      <SelectItem value="98">98th (1983–1984)</SelectItem>
                      <SelectItem value="97">97th (1981–1982)</SelectItem>
                      <SelectItem value="96">96th (1979–1980)</SelectItem>
                      <SelectItem value="95">95th (1977–1978)</SelectItem>
                      <SelectItem value="94">94th (1975–1976)</SelectItem>
                      <SelectItem value="93">93rd (1973–1974)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-snug pt-1">
                    Tip: For older Congresses (pre-113th), keyword search results may be sparse.
                    Pasting a congress.gov bill URL or typing a bill number (e.g. <span className="font-mono">HR 776</span>) works for any Congress.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Chamber</Label>
                <Select value={chamber} onValueChange={(v) => setChamber(v as typeof chamber)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="senate">Senate {jurisdiction === 'federal' ? '(S)' : ''}</SelectItem>
                    <SelectItem value="house">House {jurisdiction === 'federal' ? '(HR)' : ''}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <p className="mb-2">Or paste a bill URL directly:</p>
                <Input
                  placeholder={
                    jurisdiction === 'federal'
                      ? 'congress.gov/bill/119th-congress/house-bill/1'
                      : 'legislature.ohio.gov/legislation/136/sb2'
                  }
                  className="text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) openBill(v);
                    }
                  }}
                />
              </div>
            </Card>

            {/* Results */}
            <div>
              <div className="flex gap-2 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={
                      jurisdiction === 'federal'
                        ? 'Search keywords, paste a congress.gov URL, or type a bill number (e.g. HR 776)…'
                        : 'Search keywords or paste a legislature.ohio.gov bill URL…'
                    }
                    className="pl-10 bg-secondary/50 border-border"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  />
                </div>
                <Button onClick={runSearch} disabled={searching} variant="hero">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </Button>
              </div>

              {searching && (
                <div className="text-center py-16 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                  {jurisdiction === 'federal' ? 'Searching Congress.gov...' : 'Searching the Ohio Legislature...'}
                </div>
              )}

              {!searching && results.length === 0 && (
                <Card className="p-12 text-center border-dashed border-border/60">
                  <p className="text-muted-foreground mb-2">
                    Search for bills, or try the example below.
                  </p>
                  <Button
                    variant="link"
                    onClick={() =>
                      openBill(
                        jurisdiction === 'federal'
                          ? 'https://www.congress.gov/bill/119th-congress/house-bill/1'
                          : 'https://www.legislature.ohio.gov/legislation/136/sb2',
                      )
                    }
                  >
                    {jurisdiction === 'federal' ? 'Try analyzing HR 1 (119th Congress)' : 'Try analyzing SB 2 (136th GA)'}
                  </Button>
                </Card>
              )}

              <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                {results.map((r) => {
                  const isSelected = selectedForCompare.includes(r.url);
                  return (
                    <Card
                      key={r.id}
                      className={`p-5 border-border/60 hover:border-primary/50 transition-colors ${
                        isSelected ? 'border-primary ring-1 ring-primary/40' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="font-mono text-sm text-primary">{r.number}</span>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Open source"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                      <h3 className="font-medium mb-2 line-clamp-2">{r.title}</h3>
                      {r.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{r.summary}</p>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => openBill(r.url)}>
                          Analyze Impact
                        </Button>
                        <Button
                          size="sm"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => toggleCompare(r.url)}
                          aria-label={isSelected ? 'Remove from comparison' : 'Add to comparison'}
                          title={isSelected ? 'Remove from comparison' : 'Add to comparison (max 3)'}
                        >
                          {isSelected ? <Check className="w-4 h-4" /> : <GitCompare className="w-4 h-4" />}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
