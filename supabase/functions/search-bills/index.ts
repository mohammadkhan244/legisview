import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface SearchRequest {
  query?: string;
  jurisdiction?: "ohio" | "federal";
  generalAssembly?: string; // Ohio GA, e.g. "136"
  congress?: string;        // Federal Congress #, e.g. "119"
  chamber?: "senate" | "house" | "all";
  status?: string;
  limit?: number;
}

interface BillResult {
  id: string;
  number: string;
  title: string;
  url: string;
  status?: string;
  introducedDate?: string;
  sponsors?: string[];
  summary?: string;
  /** Score used for relevance sort (higher = better). */
  relevance?: number;
  /** ISO date of latest action, used for recency tiebreak. */
  latestActionDate?: string;
}

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const CONGRESS_API = "https://api.congress.gov/v3";

async function firecrawlSearch(query: string, limit: number) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");

  const res = await fetch(`${FIRECRAWL_V2}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `site:legislature.ohio.gov/legislation ${query}`,
      limit,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firecrawl search failed [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

async function firecrawlScrape(url: string, formats: string[] = ["markdown"]) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");

  const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats, onlyMainContent: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firecrawl scrape failed [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

function parseBillFromUrl(url: string): { id: string; number: string; ga: string; chamber: string } | null {
  // /legislation/136/sb2  or /legislation/136/hb15
  const m = url.match(/legislation\/(\d+)\/([a-z]+)(\d+)/i);
  if (!m) return null;
  const [, ga, prefix, num] = m;
  return {
    id: `${ga}-${prefix.toLowerCase()}-${num}`,
    number: `${prefix.toUpperCase()} ${num}`,
    ga,
    chamber: prefix.toLowerCase().startsWith("s") ? "senate" : "house",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: SearchRequest = await req.json().catch(() => ({}));
    const {
      query = "",
      jurisdiction = "ohio",
      generalAssembly = "136",
      congress = "119",
      chamber = "all",
      limit = 12,
    } = body;

    if (jurisdiction === "federal") {
      const apiKey = Deno.env.get("CONGRESS_GOV_API_KEY");
      if (!apiKey) throw new Error("CONGRESS_GOV_API_KEY is not configured");

      const billTypes = chamber === "senate" ? ["s"] : chamber === "house" ? ["hr"] : ["hr", "s"];
      const q = query.trim().toLowerCase();
      // Tokenize query for keyword scoring (drop short / stopwords)
      const STOP = new Set(["the","a","an","of","to","for","and","or","in","on","with","by","from","as","at","is","be","act","bill"]);
      const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));

      // Pull a wider window when searching so client-side matching against title + summary + policy area has more to find.
      const fetchSize = q ? 250 : Math.max(1, Math.ceil(limit / billTypes.length));

      const fetched = await Promise.all(
        billTypes.map(async (t) => {
          const url = `${CONGRESS_API}/bill/${congress}/${t}?api_key=${apiKey}&limit=${fetchSize}&sort=updateDate+desc&format=json`;
          const res = await fetch(url);
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Congress API failed [${res.status}]: ${txt.slice(0, 200)}`);
          }
          const data = await res.json();
          return (data?.bills ?? []) as Array<{
            congress: number; type: string; number: string; title: string;
            updateDate?: string;
            latestAction?: { actionDate?: string; text?: string };
            policyArea?: { name?: string };
          }>;
        }),
      );

      // Initial filter + score (title only — fast)
      const candidates: Array<BillResult & { _b: typeof fetched[number][number] }> = [];
      for (const list of fetched) {
        for (const b of list) {
          const title = b.title || "";
          const policy = b.policyArea?.name ?? "";
          const haystack = `${title} ${policy}`.toLowerCase();
          let score = 0;
          if (tokens.length) {
            for (const tok of tokens) {
              if (haystack.includes(tok)) score += haystack.includes(` ${tok} `) ? 2 : 1;
              if (title.toLowerCase().startsWith(tok)) score += 2;
            }
            if (score === 0) continue;
          }
          const typeLower = b.type.toLowerCase();
          const number = `${b.type.toUpperCase()} ${b.number}`;
          const slug = typeLower === "hr" ? "house-bill" : typeLower === "s" ? "senate-bill"
            : typeLower === "hjres" ? "house-joint-resolution" : typeLower === "sjres" ? "senate-joint-resolution"
            : typeLower === "hres" ? "house-resolution" : "senate-resolution";
          const url = `https://www.congress.gov/bill/${b.congress}th-congress/${slug}/${b.number}`;
          candidates.push({
            _b: b,
            id: `${b.congress}-${typeLower}-${b.number}`,
            number,
            title,
            url,
            status: b.latestAction?.text,
            summary: "",
            relevance: score,
            latestActionDate: b.latestAction?.actionDate,
          });
        }
      }

      // Sort: relevance desc, then latestActionDate desc
      candidates.sort((a, b) => {
        const r = (b.relevance ?? 0) - (a.relevance ?? 0);
        if (r !== 0) return r;
        return (b.latestActionDate ?? "").localeCompare(a.latestActionDate ?? "");
      });

      // Take top N then enrich with CRS summary in parallel (limited)
      const top = candidates.slice(0, limit);
      await Promise.all(
        top.map(async (c) => {
          const b = c._b;
          try {
            const sumRes = await fetch(
              `${CONGRESS_API}/bill/${b.congress}/${b.type.toLowerCase()}/${b.number}/summaries?api_key=${apiKey}&format=json`,
            );
            if (sumRes.ok) {
              const sd = await sumRes.json();
              const summaries = (sd?.summaries ?? []) as Array<{ updateDate?: string; text?: string }>;
              if (summaries.length) {
                // Pick latest by updateDate
                summaries.sort((a, b) => (b.updateDate ?? "").localeCompare(a.updateDate ?? ""));
                const raw = summaries[0]?.text ?? "";
                const clean = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                if (clean.length > 30) c.summary = clean.slice(0, 400) + (clean.length > 400 ? "…" : "");
              }
            }
          } catch (_) { /* best-effort enrichment */ }
          if (!c.summary && b.latestAction?.text) c.summary = `Latest action: ${b.latestAction.text}`;
        }),
      );

      const bills: BillResult[] = top.map(({ _b, ...rest }) => rest);

      return new Response(JSON.stringify({ bills }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build search query targeting Ohio legislature
    const chamberFilter =
      chamber === "senate" ? "senate bill" : chamber === "house" ? "house bill" : "bill";
    const searchQuery = `${query} ${chamberFilter} general assembly ${generalAssembly}`.trim();

    const searchData = await firecrawlSearch(searchQuery, limit);
    // v2 search response: { success, data: { web: [{url,title,description}] } } OR { data: [...] }
    const webResults =
      searchData?.data?.web ??
      (Array.isArray(searchData?.data) ? searchData.data : []) ??
      [];

    const bills: BillResult[] = [];
    const seen = new Set<string>();

    for (const r of webResults) {
      const url: string = r.url || r.link || "";
      if (!url.includes("legislature.ohio.gov/legislation/")) continue;
      const parsed = parseBillFromUrl(url);
      if (!parsed) continue;
      if (parsed.ga !== generalAssembly) continue;
      if (chamber !== "all") {
        if (chamber === "senate" && parsed.chamber !== "senate") continue;
        if (chamber === "house" && parsed.chamber !== "house") continue;
      }
      if (seen.has(parsed.id)) continue;
      seen.add(parsed.id);

      bills.push({
        id: parsed.id,
        number: parsed.number,
        title: r.title?.replace(/\s*-\s*The Ohio Legislature.*/i, "").trim() || parsed.number,
        url,
        summary: r.description || "",
      });
    }

    return new Response(JSON.stringify({ bills }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-bills error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
