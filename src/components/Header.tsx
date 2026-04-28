import { FileText, TrendingUp, BarChart3 } from 'lucide-react';

const Header = () => {
  return (
    <header className="border-b border-border/50 glass sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">LegisView</h1>
              <p className="text-xs text-muted-foreground">Ohio Legislative Intelligence</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-1">
            <NavItem icon={<BarChart3 className="w-4 h-4" />} label="Dashboard" active />
            <NavItem icon={<FileText className="w-4 h-4" />} label="Bills" />
            <NavItem icon={<TrendingUp className="w-4 h-4" />} label="Trends" />
          </nav>
        </div>
      </div>
    </header>
  );
};

const NavItem = ({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) => (
  <button
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default Header;
