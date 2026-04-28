// Generate plain-English "Key Takeaways" bullets comparing 2-4 bills
// using the loaded analysis data already produced by analyze-bill.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface BillSummaryInput {
  number: string;
  title: string;
  status?: string;
  summary?: string;
  narrativeBrief?: string;
  impacts: Array<{
    sector: string;
    strength: string;
    economicImpact?: number | null;
    explanation?: string;
  }>;
  societalImpacts?: Array<{
    dimension: string;
    direction: string;
    strength: string;
    affectedGroups?: string;
  }>;
}

const TAKEAWAYS_TOOL = {
  type: "function",
  function: {
    name: "report_comparison_takeaways",
    description:
      "Return 4-6 short, specific, plain-English bullet takeaways comparing the bills. Each bullet must reference at least one bill by its number.",
    parameters: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          description:
            "One single sentence (max 120 chars) summarizing the comparison's biggest insight, like a magazine headline.",
        },
        takeaways: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description:
                  "A single specific insight, max 200 chars. Use bill numbers and sector names. Avoid hedging language.",
              },
              tone: {
                type: "string",
                enum: ["positive", "negative", "neutral", "contested"],
                description:
                  "positive = clear winner/expansion, negative = clear loser/restriction, contested = bills disagree, neutral = factual contrast.",
              },
              icon: {
                type: "string",
                enum: [
                  "trending-up",
                  "trending-down",
                  "scale",
                  "alert-triangle",
                  "users",
                  "dollar",
                  "split",
                ],
                description: "Icon hint for the bullet.",
              },
            },
            required: ["text", "tone", "icon"],
          },
        },
      },
      required: ["headline", "takeaways"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bills } = (await req.json()) as { bills: BillSummaryInput[] };
    if (!Array.isArray(bills) || bills.length < 2) {
      return new Response(
        JSON.stringify({ error: "Provide at least 2 bills." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Compact the input so we don't burn tokens on noise.
    const compact = bills.map((b) => ({
      number: b.number,
      title: b.title,
      status: b.status,
      summary: (b.summary || "").slice(0, 400),
      brief: (b.narrativeBrief || "").slice(0, 400),
      impacts: (b.impacts ?? []).slice(0, 12).map((i) => ({
        sector: i.sector,
        strength: i.strength,
        $B: i.economicImpact ?? null,
        why: (i.explanation || "").slice(0, 180),
      })),
      societal: (b.societalImpacts ?? []).slice(0, 6).map((s) => ({
        dim: s.dimension,
        dir: s.direction,
        strength: s.strength,
        who: (s.affectedGroups || "").slice(0, 100),
      })),
    }));

    const SYSTEM = `You are a policy analyst writing in the voice of Visual Capitalist: bold, specific, and scannable. Compare the bills and produce 4-6 plain-English bullet takeaways. RULES:
- Each bullet must name at least one bill (by its number, e.g. "HR 776").
- Be specific: cite sectors and dollar amounts when present.
- Highlight contrasts ("Bill A funds X while Bill B cuts Y").
- No hedging fluff ("may", "could potentially"). Use direct language.
- Never invent numbers — only cite figures present in the data.`;

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Compare these ${compact.length} bills and return takeaways:\n\n${JSON.stringify(compact, null, 2)}`,
          },
        ],
        tools: [TAKEAWAYS_TOOL],
        tool_choice: { type: "function", function: { name: "report_comparison_takeaways" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit reached. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI gateway failed [${aiRes.status}]: ${t}`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured takeaways");
    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Failed to generate takeaways" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});