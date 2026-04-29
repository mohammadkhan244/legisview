import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SectorImpact } from '@/types/legislation';

interface SectorChartProps {
  impacts: SectorImpact[];
}

interface TooltipPayloadEntry {
  payload: { name: string; value: number; strength: string };
  value: number;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) => {
  if (!active || !payload?.length) return null;
  const { name, value, strength } = payload[0].payload;
  const positive = value >= 0;
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm shadow-xl px-3 py-2 text-sm">
      <p className="font-semibold text-popover-foreground mb-0.5">{name}</p>
      <p className={positive ? 'text-impact-low font-mono' : 'text-impact-high font-mono'}>
        {positive ? '+' : ''}${value.toFixed(1)}B (est.)
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">Strength: {strength}</p>
    </div>
  );
};

const SectorChart = ({ impacts }: SectorChartProps) => {
  const chartData = impacts
    .filter((impact) => typeof impact.economicImpact === 'number')
    .map((impact) => ({
      name: impact.sector,
      value: impact.economicImpact as number,
      strength: impact.strength,
    }));

  const qualitativeCount = impacts.length - chartData.length;

  const getBarColor = (value: number) =>
    value >= 0 ? 'hsl(var(--impact-low))' : 'hsl(var(--impact-high))';

  const chartHeight = Math.max(220, chartData.length * 48);

  return (
    <Card variant="glass" className="animate-fade-in">
      <CardHeader>
        <CardTitle className="text-lg">Economic Impact by Sector</CardTitle>
        <CardDescription>
          AI-projected 5-year impact in billions ($B). Sectors without quantitative anchors in the bill are excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-8 text-center">
            <p className="text-sm font-medium text-foreground mb-1">
              No quantitative projections for this bill
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              The bill text doesn't contain appropriations, tax rates, or other quantitative anchors
              that would justify dollar estimates. See the qualitative impacts below.
            </p>
          </div>
        ) : (
          <>
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 4, right: 52, top: 8, bottom: 8 }}
                  barCategoryGap="25%"
                >
                  <XAxis
                    type="number"
                    tickFormatter={(value) => `$${value}B`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 500 }}
                    width={90}
                  />
                  <ReferenceLine x={0} stroke="hsl(var(--border))" />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.value)} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: number) => `${v >= 0 ? '+' : ''}$${v.toFixed(1)}B`}
                      style={{ fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {qualitativeCount > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                + {qualitativeCount} additional qualitative {qualitativeCount === 1 ? 'impact' : 'impacts'} not shown (no $ figure justified by bill text).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SectorChart;
