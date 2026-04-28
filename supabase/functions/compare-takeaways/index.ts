// Generate plain-English "Key Takeaways" bullets comparing 2-4 bills using Claude
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

interface BillSummaryInput {
  number: string;
  title: string;
  status?: string;
  summary?: string;
  narrativeBrief?: string;
  impacts: Array<{ sector: string; strength: string; economicImpact?: number | null; explanation?: string }>;
  societalImpacts?: Array<{ dimension: string; direction: string; strength: string; affectedGroups?: string }>;
}

// Anthropic tool format (input_schema, not parameters)
const TAKEAWAYS_TOOL = {
  name: "report_comparison_takeaways",
  description: "Return 4-6 short, specific, plain-English bullet takeaways comparing the bills. Each bullet must reference at least one bill by its number.",
  input_schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "One single sentence (max 120 chars) summarizing the comparison's biggest insight, like a magazine headline.",
      },
      takeaways: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "A single specific insight, max 200 chars. Use bill numbers and sector names. Avoid hedging language.",
            },
            tone: {
              type: "string",
              enum: ["positive", "negative", "neutral", "contested"],
              description: "positive = clear winner/expansion, negative = clear loser/restriction, contested = bills disagree, neutral = factual contrast.",
            },
            icon: {
              type: "string",
              enum: ["trending-up", "trending-down", "scale", "alert-triangle", "users", "dollar", "split"],
              description: "Icon hint for the bullet.",
            },
          },
          required: ["text", "tone", "icon"],
        },
      },
    },
    required: ["headline", "takeaways"],
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

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

    const aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Compare these ${compact.length} bills and return takeaways:\n\n${JSON.stringify(compact, null, 2)}`,
          },
        ],
        tools: [TAKEAWAYS_TOOL],
        tool_choice: { type: "tool", name: "report_comparison_takeaways" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429 || aiRes.status === 529) {
        return new Response(
          JSON.stringify({ error: "Claude is rate-limited or overloaded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Anthropic API failed [${aiRes.status}]: ${t}`);
    }

    const aiData = await aiRes.json();
    const toolUse = (aiData?.content ?? []).find((b: { type: string }) => b.type === "tool_use");
    if (!toolUse) throw new Error("Claude did not return structured takeaways");
    const parsed = (toolUse as { input: Record<string, unknown> }).input;

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
