import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ohioEconomicData } from '@/data/mockData';

const COLORS = [
  'hsl(187, 85%, 53%)',
  'hsl(162, 73%, 46%)',
  'hsl(38, 92%, 50%)',
  'hsl(280, 65%, 60%)',
  'hsl(346, 77%, 60%)',
  'hsl(200, 70%, 50%)',
  'hsl(120, 50%, 50%)',
  'hsl(45, 80%, 55%)',
  'hsl(260, 60%, 55%)',
  'hsl(15, 75%, 55%)',
];

const EconomicOverview = () => {
  const totalGDP = ohioEconomicData.reduce((sum, sector) => sum + sector.gdpContribution, 0);
  const totalEmployment = ohioEconomicData.reduce((sum, sector) => sum + sector.employment, 0);

  const pieData = ohioEconomicData.map(sector => ({
    name: sector.sector,
    value: sector.gdpContribution,
  }));

  return (
    <Card variant="glass" className="animate-fade-in">
      <CardHeader>
        <CardTitle className="text-lg">Ohio Economic Overview</CardTitle>
        <CardDescription>GDP contribution by sector (in billions)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(222, 47%, 11%)',
                    border: '1px solid hsl(187, 85%, 53%)',
                    borderRadius: '10px',
                    color: 'hsl(210, 40%, 98%)',
                    padding: '10px 14px',
                    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.6)',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                  itemStyle={{ color: 'hsl(210, 40%, 98%)' }}
                  labelStyle={{ color: 'hsl(210, 40%, 98%)', fontWeight: 600, marginBottom: 4 }}
                  formatter={(value: number) => [`$${value.toFixed(1)}B`, 'GDP']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend & Stats */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card variant="default" className="p-3">
                <p className="text-xs text-muted-foreground">Total GDP</p>
                <p className="text-xl font-bold text-primary">${totalGDP.toFixed(1)}B</p>
              </Card>
              <Card variant="default" className="p-3">
                <p className="text-xs text-muted-foreground">Employment</p>
                <p className="text-xl font-bold text-foreground">{(totalEmployment / 1000).toFixed(1)}M</p>
              </Card>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              {ohioEconomicData.slice(0, 6).map((sector, idx) => (
                <div key={sector.sector} className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: COLORS[idx] }}
                  />
                  <span className="text-muted-foreground truncate">{sector.sector}</span>
                  <span className="text-foreground font-medium ml-auto">${sector.gdpContribution}B</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EconomicOverview;
