import { ArrowRight, Sparkles, TrendingUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HeroSection = () => {
  return (
    <section className="relative py-16 overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      <div className="container mx-auto px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">AI-Powered Legislative Analysis</span>
          </div>
          
          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            Understand the
            <span className="text-gradient"> Economic Impact </span>
            of Ohio Legislation
          </h1>
          
          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Analyze how proposed bills affect Ohio's economic sectors. Get structured insights on funding, regulations, and projected market impacts.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <Button variant="hero" size="xl">
              Analyze a Bill
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="glass" size="lg">
              View Sample Analysis
            </Button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <StatItem icon={<TrendingUp className="w-5 h-5" />} value="127" label="Bills Tracked" />
            <StatItem icon={<Shield className="w-5 h-5" />} value="12" label="Sectors Analyzed" />
            <StatItem icon={<Sparkles className="w-5 h-5" />} value="$680B" label="Ohio GDP" />
          </div>
        </div>
      </div>
    </section>
  );
};

const StatItem = ({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) => (
  <div className="text-center">
    <div className="flex items-center justify-center gap-2 text-primary mb-1">
      {icon}
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </div>
    <span className="text-sm text-muted-foreground">{label}</span>
  </div>
);

export default HeroSection;
