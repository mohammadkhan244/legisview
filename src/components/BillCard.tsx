import { Calendar, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bill, ImpactStrength } from '@/types/legislation';

interface BillCardProps {
  bill: Bill;
  onClick: () => void;
}

const getStatusColor = (status: Bill['status']) => {
  switch (status) {
    case 'Enacted':
      return 'bg-impact-low/20 text-impact-low border-impact-low/30';
    case 'Passed':
      return 'bg-primary/20 text-primary border-primary/30';
    case 'In Committee':
      return 'bg-impact-medium/20 text-impact-medium border-impact-medium/30';
    case 'Introduced':
      return 'bg-secondary text-secondary-foreground border-border';
    case 'Vetoed':
      return 'bg-impact-high/20 text-impact-high border-impact-high/30';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
};

const getStrengthVariant = (strength: ImpactStrength): 'high' | 'medium' | 'low' => {
  return strength.toLowerCase() as 'high' | 'medium' | 'low';
};

const BillCard = ({ bill, onClick }: BillCardProps) => {
  const totalImpact = bill.impacts.reduce((sum, impact) => sum + (impact.economicImpact || 0), 0);
  const isPositive = totalImpact >= 0;

  return (
    <Card 
      variant="interactive" 
      className="group animate-fade-in"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-primary">{bill.number}</span>
              <Badge className={getStatusColor(bill.status)}>
                {bill.status}
              </Badge>
            </div>
            <CardTitle className="text-lg group-hover:text-primary transition-colors">
              {bill.title}
            </CardTitle>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${
            isPositive ? 'bg-impact-low/10' : 'bg-impact-high/10'
          }`}>
            {isPositive ? (
              <TrendingUp className="w-4 h-4 text-impact-low" />
            ) : (
              <TrendingDown className="w-4 h-4 text-impact-high" />
            )}
            <span className={`font-semibold ${isPositive ? 'text-impact-low' : 'text-impact-high'}`}>
              {isPositive ? '+' : ''}{totalImpact.toFixed(1)}B
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {bill.summary}
        </p>
        
        {/* Impact Preview */}
        <div className="flex flex-wrap gap-2 mb-4">
          {bill.impacts.slice(0, 3).map((impact, idx) => (
            <Badge key={idx} variant={getStrengthVariant(impact.strength)}>
              {impact.sector}
            </Badge>
          ))}
          {bill.impacts.length > 3 && (
            <Badge variant="secondary">+{bill.impacts.length - 3} more</Badge>
          )}
        </div>
        
        {/* Meta info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(bill.introducedDate).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {bill.sponsors.length} sponsor{bill.sponsors.length > 1 ? 's' : ''}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BillCard;
