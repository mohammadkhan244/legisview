// Scrape a bill page (and its PDF if linkable) and ask Claude for sector impact analysis
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

interface AnalyzeRequest {
  url: string;
  forceRefresh?: boolean;
  manualText?: string;
}

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CONGRESS_API = "https://api.congress.gov/v3";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CONTROLLED_SECTORS = [
  "Energy", "Healthcare", "Finance", "Agriculture", "Technology", "Transportation",
  "Education", "Housing", "Environment", "Defense", "Government (Federal)",
  "Tribal Governments", "Non-profit/NGOs",
];

const SOCIETAL_DIMENSIONS = [
  "Civil Rights & Liberties", "Public Health & Safety", "Equity & Access",
  "Environmental Justice", "Education Access", "Housing & Community",
  "Criminal Justice", "Workers & Labor", "Privacy & Data Rights",
  "Democratic Participation",
];

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function firecrawlScrape(url: string, opts: { formats?: string[]; attempts?: number; timeoutMs?: number } = {}) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");
  const formats = opts.formats ?? ["markdown", "links"];
  const attempts = opts.attempts ?? 2;
  const timeoutMs = opts.timeoutMs ?? 45000;
  const abortMs = timeoutMs + 5000;
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), abortMs);
    let res: Response;
    try {
      res = await fetch(`${FIRECRAWL_V2}/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats, onlyMainContent: true, waitFor: 500, timeout: timeoutMs }),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(abortTimer);
      lastErr = `fetch aborted/failed: ${e instanceof Error ? e.message : String(e)}`;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    clearTimeout(abortTimer);
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    lastErr = `[${res.status}] ${JSON.stringify(data)}`;
    const transient = res.status >= 500 || res.status === 408 ||
      data?.code === "SCRAPE_SITE_ERROR" || data?.code === "SCRAPE_TIMEOUT";
    if (!transient) break;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Firecrawl scrape failed ${lastErr}`);
}

function guessPdfUrl(billUrl: string): string | null {
  const m = billUrl.match(/legislation\/(\d+)\/([a-z]+\d+)/i);
  if (!m) return null;
  const [, ga, bill] = m;
  return `https://search-prod.lis.state.oh.us/solarapi/v1/general_assembly_${ga}/bills/${bill.toLowerCase()}/IN/00/${bill.toLowerCase()}_00_IN.pdf`;
}

function parseFederalUrl(url: string): { congress: string; type: string; number: string } | null {
  const m = url.match(/congress\.gov\/bill\/(\d+)(?:st|nd|rd|th)-congress\/(house-bill|senate-bill|house-joint-resolution|senate-joint-resolution|house-resolution|senate-resolution|house-concurrent-resolution|senate-concurrent-resolution)\/(\d+)/i);
  if (!m) return null;
  const [, congress, slug, number] = m;
  const typeMap: Record<string, string> = {
    "house-bill": "hr", "senate-bill": "s",
    "house-joint-resolution": "hjres", "senate-joint-resolution": "sjres",
    "house-resolution": "hres", "senate-resolution": "sres",
    "house-concurrent-resolution": "hconres", "senate-concurrent-resolution": "sconres",
  };
  return { congress, type: typeMap[slug.toLowerCase()], number };
}

async function fetchFederalBill(parsed: { congress: string; type: string; number: string }): Promise<{
  meta: Record<string, unknown> | null;
  text: string;
  textUrl: string | null;
  actions: Array<{ date: string; text: string; type?: string }>;
  cosponsors: Array<{ name: string; party?: string; state?: string }>;
  summaries: Array<{ date: string; actionDesc: string; text: string }>;
  cbo: { url: string | null; estimate: string | null };
}> {
  const apiKey = Deno.env.get("CONGRESS_GOV_API_KEY");
  if (!apiKey) throw new Error("CONGRESS_GOV_API_KEY is not configured");
  const base = `${CONGRESS_API}/bill/${parsed.congress}/${parsed.type}/${parsed.number}`;

  let meta: Record<string, unknown> | null = null;
  try {
    const r = await fetch(`${base}?api_key=${apiKey}&format=json`);
    if (r.ok) { const d = await r.json(); meta = d?.bill ?? null; }
  } catch (_) { /* ignore */ }

  let text = "";
  let textUrl: string | null = null;
  try {
    const r = await fetch(`${base}/text?api_key=${apiKey}&format=json`);
    if (r.ok) {
      const d = await r.json();
      const versions = (d?.textVersions ?? []) as Array<{ formats?: Array<{ type: string; url: string }> }>;
      let chosen: { type: string; url: string } | null = null;
      let chosenIsPdf = false;
      for (const v of versions) {
        const fts = v.formats ?? [];
        const ft = fts.find((f) => /Formatted Text/i.test(f.type)) ||
                   fts.find((f) => /Formatted XML/i.test(f.type)) ||
                   fts.find((f) => /HTML/i.test(f.type));
        if (ft) { chosen = ft; break; }
      }
      if (!chosen) {
        for (const v of versions) {
          const fts = v.formats ?? [];
          const pdf = fts.find((f) => /PDF/i.test(f.type));
          if (pdf) { chosen = pdf; chosenIsPdf = true; break; }
        }
      }
      if (chosen) {
        textUrl = chosen.url;
        if (chosenIsPdf) {
          const pdfText = await fetchPdfTextDirect(chosen.url);
          if (pdfText) text = pdfText;
        } else {
          const tr = await fetch(chosen.url);
          if (tr.ok) {
            const raw = await tr.text();
            text = raw
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
              .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
              .replace(/\s+/g, " ").trim().slice(0, 80000);
          }
        }
      }
    }
  } catch (_) { /* ignore */ }

  let actions: Array<{ date: string; text: string; type?: string }> = [];
  try {
    const r = await fetch(`${base}/actions?api_key=${apiKey}&format=json&limit=50`);
    if (r.ok) {
      const d = await r.json();
      const list = (d?.actions ?? []) as Array<{ actionDate?: string; text?: string; type?: string }>;
      actions = list
        .filter((a) => a.actionDate && a.text)
        .map((a) => ({ date: a.actionDate as string, text: a.text as string, type: a.type }))
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
    }
  } catch (_) { /* ignore */ }

  let cosponsors: Array<{ name: string; party?: string; state?: string }> = [];
  try {
    const r = await fetch(`${base}/cosponsors?api_key=${apiKey}&format=json&limit=20`);
    if (r.ok) {
      const d = await r.json();
      const list = (d?.cosponsors ?? []) as Array<{ fullName?: string; party?: string; state?: string }>;
      cosponsors = list.filter((c) => c.fullName)
        .map((c) => ({ name: c.fullName as string, party: c.party, state: c.state })).slice(0, 20);
    }
  } catch (_) { /* ignore */ }

  let summaries: Array<{ date: string; actionDesc: string; text: string }> = [];
  try {
    const r = await fetch(`${base}/summaries?api_key=${apiKey}&format=json`);
    if (r.ok) {
      const d = await r.json();
      const list = (d?.summaries ?? []) as Array<{ actionDate?: string; actionDesc?: string; text?: string }>;
      summaries = list.filter((s) => s.text).map((s) => ({
        date: s.actionDate ?? "",
        actionDesc: s.actionDesc ?? "",
        text: (s.text as string)
          .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
          .replace(/\s+/g, " ").trim(),
      })).sort((a, b) => b.date.localeCompare(a.date));
    }
  } catch (_) { /* ignore */ }

  let cbo: { url: string | null; estimate: string | null } = { url: null, estimate: null };
  try {
    const r = await fetch(`${base}/cost-estimates?api_key=${apiKey}&format=json`);
    if (r.ok) {
      const d = await r.json();
      const list = (d?.costEstimates ?? []) as Array<{ url?: string; title?: string; description?: string; pubDate?: string }>;
      if (list.length > 0) {
        const sorted = [...list].sort((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""));
        const top = sorted[0];
        cbo = { url: top.url ?? null, estimate: [top.title, top.description].filter(Boolean).join(" — ").slice(0, 600) || null };
      }
    }
  } catch (_) { /* ignore */ }

  return { meta, text, textUrl, actions, cosponsors, summaries, cbo };
}

async function fetchPdfTextDirect(pdfUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(pdfUrl, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 LegisView/1.0" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 200) return null;
    let text = "";
    let run = "";
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) {
        run += String.fromCharCode(c);
      } else {
        if (run.length >= 4) text += run + " ";
        run = "";
      }
    }
    if (run.length >= 4) text += run;
    text = text.replace(/\s+/g, " ").trim();
    if (text.length < 200) return null;
    return text.slice(0, 80000);
  } catch { return null; }
}

// Anthropic tool format (uses input_schema, not parameters)
const ANALYSIS_TOOL = {
  name: "report_bill_impact",
  description: "Return a structured economic AND societal impact analysis for an Ohio legislative bill.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      number: { type: "string" },
      status: { type: "string" },
      introducedDate: { type: "string" },
      sponsors: { type: "array", items: { type: "string" } },
      summary: {
        type: "string",
        description:
          "Plain-language 2-4 sentence factual summary of operative provisions, grounded ONLY in extracted text. If too sparse, return exactly: 'Bill text could not be extracted in enough detail to produce an accurate summary.'",
      },
      narrativeBrief: {
        type: "string",
        description:
          "A 3-4 sentence stakeholder-oriented policy brief explaining what this bill means in plain language for everyday Ohioans, businesses, and communities. MUST be grounded in the extracted text and the impacts you identified — no speculation. If text is too sparse, return empty string.",
      },
      impacts: {
        type: "array",
        description: "Per-sector ECONOMIC impacts using the controlled taxonomy.",
        items: {
          type: "object",
          properties: {
            sector: {
              type: "string",
              description: `Use one of these controlled sectors when applicable: ${CONTROLLED_SECTORS.join(", ")}. If the bill genuinely affects a sector not in this list, prefix with 'Other: ' (e.g. 'Other: Insurance').`,
            },
            impactType: {
              type: "string",
              enum: ["funding support", "regulation increase", "regulation decrease", "tax change", "subsidy", "deregulation", "program establishment", "administrative change", "definition clarification", "market restriction"],
            },
            strength: { type: "string", enum: ["High", "Medium", "Low"] },
            economicImpact: {
              type: ["number", "null"],
              description: "Projected $B over 5 years. Null unless bill text has a specific quantitative anchor (appropriation, tax rate, program size). Never fabricate from baselines.",
            },
            quantitativeBasis: {
              type: "string",
              description: "If economicImpact is a number, quote the bill text that justifies it. If null, leave empty.",
            },
            explanation: { type: "string", description: "1-3 sentence reasoning citing a quoted phrase from the bill text." },
            assumptions: { type: "string" },
            confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          },
          required: ["sector", "impactType", "strength", "explanation", "confidence"],
        },
      },
      societalImpacts: {
        type: "array",
        description: "SOCIETAL impacts (orthogonal to economic). Same strict grounding rules — must cite bill text.",
        items: {
          type: "object",
          properties: {
            dimension: {
              type: "string",
              description: `Use one of these dimensions when applicable: ${SOCIETAL_DIMENSIONS.join(", ")}. Use 'Other: <name>' for novel dimensions.`,
            },
            direction: { type: "string", enum: ["Expands", "Restricts", "Reforms", "Mixed"] },
            strength: { type: "string", enum: ["High", "Medium", "Low"] },
            affectedGroups: { type: "string", description: "Who is affected (e.g. 'low-income tenants', 'public school students', 'tribal members')." },
            explanation: { type: "string", description: "1-3 sentence reasoning citing a quoted phrase from the bill text." },
            confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          },
          required: ["dimension", "direction", "strength", "affectedGroups", "explanation", "confidence"],
        },
      },
    },
    required: ["title", "number", "summary", "impacts", "societalImpacts"],
  },
};

const SYSTEM_PROMPT = `You are a legislative policy analyst (Ohio state bills AND U.S. federal bills). Report ONLY what the bill text actually says — never speculate, infer, or fabricate.

ABSOLUTE RULES (no exceptions):
1. Every economic AND societal impact MUST be grounded in a direct quote from the extracted bill text OR from an official CRS summary section (clearly labeled 'CRS Summary' in the input). Put the quote in 'explanation' (use quotation marks). CRS summaries published by the Library of Congress count as authoritative source text.
2. NEVER invent sectors or societal dimensions based on title/number alone. If the text doesn't substantively discuss it, do NOT include it.
3. economicImpact MUST be null unless bill text contains a specific quantitative anchor (appropriation $, tax rate %, program size). When provided, the exact justifying quote MUST appear in 'quantitativeBasis'.
4. NEVER use GDP/sector baselines to manufacture figures.
5. If the text supports NO grounded impacts, return EMPTY arrays. Empty is the correct honest answer.
6. SECTOR TAXONOMY: Prefer the controlled list. Use 'Other: <name>' only when truly novel.
7. SOCIETAL IMPACTS: Same strict grounding. Civil rights, public health, equity, environmental justice, etc. — only when the text substantively addresses them.
8. SUMMARY: Paraphrase operative provisions only (CRS summary sections fully count as substance). If genuinely too sparse: 'Bill text could not be extracted in enough detail to produce an accurate summary.'
9. NARRATIVE BRIEF: 3-4 sentences explaining in plain language what this means for the bill's constituents (Ohioans for Ohio bills, Americans for federal bills). Must reflect the impacts you identified — no speculation beyond them. Empty string if text is too sparse.

Always call report_bill_impact.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { url, forceRefresh, manualText } = (await req.json()) as AnalyzeRequest;
    const isFederal = !!url && /(?:^|\/\/)(?:www\.)?congress\.gov\//i.test(url);
    const isOhio = !!url && url.includes("legislature.ohio.gov");
    if (!url || (!isFederal && !isOhio)) {
      return new Response(JSON.stringify({ error: "Valid Ohio legislature or congress.gov URL required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!forceRefresh && !manualText) {
      const { data: cached } = await supabaseAdmin.from("bill_analyses").select("*").eq("url", url).maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({
          url, title: cached.title, number: cached.number, status: cached.status,
          introducedDate: cached.introduced_date, summary: cached.summary, sponsors: cached.sponsors,
          impacts: cached.impacts,
          societalImpacts: (cached as { societal_impacts?: unknown }).societal_impacts ?? [],
          narrativeBrief: (cached as { narrative_brief?: string }).narrative_brief ?? "",
          lastCheckedAt: (cached as { last_checked_at?: string }).last_checked_at,
          sourceUrl: url,
          cboUrl: (cached as { cbo_url?: string | null }).cbo_url ?? null,
          cboEstimate: (cached as { cbo_estimate?: string | null }).cbo_estimate ?? null,
          cached: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    let pageMd = "";
    let pdfMd = "";
    let pdfLink: string | null = isOhio ? guessPdfUrl(url) : null;
    let federalMeta: Record<string, unknown> | null = null;
    let federalActions: Array<{ date: string; text: string; type?: string }> = [];
    let federalCosponsors: Array<{ name: string; party?: string; state?: string }> = [];
    let federalSummaries: Array<{ date: string; actionDesc: string; text: string }> = [];
    let cboInfo: { url: string | null; estimate: string | null } = { url: null, estimate: null };
    let textExcerpt = "";

    if (manualText && manualText.trim().length > 50) {
      pdfMd = manualText.trim().slice(0, 80000);
    } else if (isFederal) {
      const parsed = parseFederalUrl(url);
      if (!parsed) {
        return new Response(JSON.stringify({ error: "Could not parse congress.gov bill URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fed = await fetchFederalBill(parsed);
      federalMeta = fed.meta;
      pdfMd = fed.text;
      pdfLink = fed.textUrl;
      federalActions = fed.actions;
      federalCosponsors = fed.cosponsors;
      federalSummaries = fed.summaries;
      cboInfo = fed.cbo;
      if (federalSummaries.length > 0) {
        const summaryBlock = federalSummaries
          .map((s) => `## CRS Summary (${s.actionDesc}, ${s.date})\n${s.text}`)
          .join("\n\n");
        pdfMd = `${summaryBlock}\n\n${pdfMd}`.slice(0, 80000);
      }
      if (federalMeta) {
        const m = federalMeta as Record<string, unknown>;
        const sponsors = Array.isArray(m.sponsors) ? (m.sponsors as Array<{ fullName?: string }>).map((s) => s.fullName).filter(Boolean).join(", ") : "";
        const latest = (m.latestAction as { actionDate?: string; text?: string } | undefined);
        pageMd = `# ${m.title ?? ""}\n\nBill: ${parsed.type.toUpperCase()} ${parsed.number} (Congress ${parsed.congress})\nIntroduced: ${m.introducedDate ?? ""}\nSponsors: ${sponsors}\nLatest action: ${latest?.actionDate ?? ""} — ${latest?.text ?? ""}\nPolicy area: ${(m.policyArea as { name?: string } | undefined)?.name ?? ""}`;
      }
    } else {
      if (pdfLink) {
        const direct = await fetchPdfTextDirect(pdfLink);
        if (direct) pdfMd = direct;
      }
      const needPdfScrape = !pdfMd && !!pdfLink;
      const [pageRes, pdfRes] = await Promise.allSettled([
        firecrawlScrape(url, { attempts: 2, timeoutMs: 45000 }),
        needPdfScrape ? firecrawlScrape(pdfLink!, { formats: ["markdown"], attempts: 2, timeoutMs: 45000 }) : Promise.reject("skipped"),
      ]);
      let links: string[] = [];
      if (pageRes.status === "fulfilled") {
        pageMd = pageRes.value.data?.markdown ?? pageRes.value.markdown ?? "";
        links = pageRes.value.data?.links ?? pageRes.value.links ?? [];
      }
      if (!pdfMd) {
        if (pdfRes.status === "fulfilled") {
          pdfMd = pdfRes.value.data?.markdown ?? pdfRes.value.markdown ?? "";
        }
      }
      if (!pdfMd && links.length) {
        const linkPdf = links.find((l) => /\.pdf(\?|$)/i.test(l) && /(legislature\.ohio\.gov|lis\.state\.oh\.us)/i.test(l));
        if (linkPdf && linkPdf !== pdfLink) {
          const direct = await fetchPdfTextDirect(linkPdf);
          if (direct) { pdfMd = direct; pdfLink = linkPdf; }
        }
      }
    }

    if (!pageMd && !pdfMd) {
      return new Response(JSON.stringify({
        error: isFederal
          ? "Could not retrieve bill text from Congress.gov right now. You can paste the bill text manually below."
          : "The Ohio Legislature site is not responding right now (timeout). You can paste the bill text manually below.",
        fallback: true, allowManual: true, pdfUrl: pdfLink,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const combined = `# Bill page\n${pageMd}\n\n# Bill text\n${pdfMd}`.slice(0, 60000);
    const contentHash = await sha256Hex(combined);
    textExcerpt = (pdfMd || "").slice(0, 1500);

    const aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-7",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Source URL: ${url}\n\nAnalyze the bill text below. Report ONLY impacts you can ground in a direct quote. Return empty arrays if there's nothing to cite.\n\n${combined}`,
          },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: "report_bill_impact" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429 || aiRes.status === 529) {
        return new Response(JSON.stringify({ error: "Claude is rate-limited or overloaded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Anthropic API failed [${aiRes.status}]: ${t}`);
    }

    const aiData = await aiRes.json();
    const toolUse = (aiData?.content ?? []).find((b: { type: string }) => b.type === "tool_use");
    if (!toolUse) throw new Error("Claude did not return structured analysis");
    const analysis = (toolUse as { input: Record<string, unknown> }).input;

    const nowIso = new Date().toISOString();
    try {
      await supabaseAdmin.from("bill_analyses").upsert({
        url,
        number: analysis.number ?? "",
        title: analysis.title ?? "",
        status: analysis.status ?? null,
        introduced_date: analysis.introducedDate || null,
        summary: analysis.summary ?? "",
        sponsors: analysis.sponsors ?? [],
        impacts: analysis.impacts ?? [],
        societal_impacts: analysis.societalImpacts ?? [],
        narrative_brief: analysis.narrativeBrief ?? "",
        content_hash: contentHash,
        analyzed_at: nowIso,
        last_checked_at: nowIso,
        cbo_url: cboInfo.url,
        cbo_estimate: cboInfo.estimate,
      });
    } catch (cacheErr) {
      console.warn("Failed to cache analysis:", cacheErr);
    }

    return new Response(JSON.stringify({
      url, sourceUrl: url, pdfUrl: pdfLink || null,
      cboUrl: cboInfo.url, cboEstimate: cboInfo.estimate,
      ...analysis,
      actions: federalActions,
      cosponsors: federalCosponsors,
      textExcerpt,
      lastCheckedAt: nowIso,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-bill error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
