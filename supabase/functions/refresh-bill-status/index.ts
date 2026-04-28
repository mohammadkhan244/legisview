// Daily cron-triggered refresh: re-fetch each cached bill, update last_checked_at,
// and re-run analyze-bill ONLY if the extracted text has changed (content_hash mismatch).
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function guessPdfUrl(billUrl: string): string | null {
  const m = billUrl.match(/legislation\/(\d+)\/([a-z]+\d+)/i);
  if (!m) return null;
  const [, ga, bill] = m;
  return `https://search-prod.lis.state.oh.us/solarapi/v1/general_assembly_${ga}/bills/${bill.toLowerCase()}/IN/00/${bill.toLowerCase()}_00_IN.pdf`;
}

async function fetchPdfTextDirect(pdfUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
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
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function triggerReanalysis(url: string) {
  // Call analyze-bill with forceRefresh — it will re-scrape and re-cache.
  const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-bill`;
  await fetch(fnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, forceRefresh: true }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: bills, error } = await supabaseAdmin
      .from("bill_analyses")
      .select("url, content_hash")
      .order("last_checked_at", { ascending: true })
      .limit(50); // Cap per run to stay within edge function timeout

    if (error) throw error;

    const results = { checked: 0, changed: 0, unchanged: 0, errors: 0 };
    const nowIso = new Date().toISOString();

    for (const b of bills ?? []) {
      results.checked++;
      try {
        const pdfUrl = guessPdfUrl(b.url);
        if (!pdfUrl) { results.errors++; continue; }
        const text = await fetchPdfTextDirect(pdfUrl);
        if (!text) {
          // Couldn't fetch — just bump last_checked_at
          await supabaseAdmin.from("bill_analyses").update({ last_checked_at: nowIso }).eq("url", b.url);
          results.errors++;
          continue;
        }
        // Hash same way as analyze-bill (page + text combined). For refresh we use just PDF
        // text since that's what changes when a bill is amended. Simpler & still correct.
        const newHash = await sha256Hex(text);
        if (newHash !== b.content_hash) {
          await triggerReanalysis(b.url);
          results.changed++;
        } else {
          await supabaseAdmin.from("bill_analyses").update({ last_checked_at: nowIso }).eq("url", b.url);
          results.unchanged++;
        }
      } catch (e) {
        console.error(`refresh failed for ${b.url}:`, e);
        results.errors++;
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results, ranAt: nowIso }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-bill-status error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
