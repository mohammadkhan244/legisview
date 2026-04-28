import { Users2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SocietalImpact } from '@/types/legislation';

interface Props {
  impacts: SocietalImpact[];
}

const directionColor: Record<SocietalImpact['direction'], string> = {
  Expands: 'text-impact-low border-impact-low/40 bg-impact-low/10',
  Restricts: 'text-impact-high border-impact-high/40 bg-impact-high/10',
  Reforms: 'text-primary border-primary/40 bg-primary/10',
  Mixed: 'text-impact-medium border-impact-medium/40 bg-impact-medium/10',
};

const SocietalImpactPanel = ({ impacts }: Props) => {
  if (!impacts || impacts.length === 0) {
    return (
      <Card variant="glass" className="p-6 text-center border-dashed">
        <Users2 className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No societal impacts could be grounded in this bill's extracted text.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {impacts.map((imp, idx) => (
        <Card key={idx} variant="default" className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="sector" className="font-medium">{imp.dimension}</Badge>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${directionColor[imp.direction]}`}>
                {imp.direction}
              </span>
              <Badge variant={imp.strength.toLowerCase() as 'high' | 'medium' | 'low'}>
                {imp.strength}
              </Badge>
            </div>
            {imp.confidence && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {imp.confidence} confidence
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-1.5">
            <span className="font-medium text-foreground">Affected: </span>{imp.affectedGroups}
          </p>
          <p className="text-sm text-foreground/90">{imp.explanation}</p>
        </Card>
      ))}
    </div>
  );
};

export default SocietalImpactPanel;
