import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Receipt, FileText, Users, Settings, Menu, X, 
  TrendingUp, FolderOpen, CreditCard, FolderKanban, Truck, 
  BookOpen, BookMarked, Book, BarChart3, Repeat, Database, 
  ChevronDown, ChevronRight, LogOut 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import CompanyDropdown from './CompanyDropdown';

type MenuItem = {
  name: string;
  to: string;
  icon: any;
};

type MenuGroup = {
  name: string;
  icon: any;
  items?: MenuItem[]; // items jadi optional
  isSingle?: boolean; // flag untuk single link
  to?: string; // untuk single link
};

const menuGroups: MenuGroup[] = [
  // ============================================
  // DASHBOARD - SINGLE LINK (LANGSUNG, TANPA DROPDOWN)
  // ============================================
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
    isSingle: true,
    to: '/dashboard',
  },
  // ============================================
  // MENU LAINNYA (TETAP DENGAN DROPDOWN)
  // ============================================
  {
    name: 'Akuntansi & Keuangan',
    icon: Database,
    items: [
      { name: 'Jurnal Umum', to: '/journal-entries', icon: BookOpen },
      { name: 'Buku Besar', to: '/ledger', icon: Book },
      { name: 'Chart of Accounts', to: '/chart-of-accounts', icon: BookMarked },
    ]
  },
  {
    name: 'Piutang & Hutang',
    icon: CreditCard,
    items: [
      { name: 'Invoice (AR)', to: '/invoices', icon: FileText },
      { name: 'Account Payable (AP)', to: '/purchase-invoices', icon: Truck },
      { name: 'Payment Requests', to: '/payment-requests', icon: CreditCard },
    ]
  },
  {
    name: 'Manajemen',
    icon: FolderKanban,
    items: [
      { name: 'Proyek', to: '/projects', icon: FolderKanban },
      { name: 'Kontak', to: '/contacts', icon: Users },
      { name: 'Vendor', to: '/vendors', icon: Truck },
      { name: 'Dokumen', to: '/documents', icon: FolderOpen },
      { name: 'Fixed Assets', to: '/fixed-assets', icon: TrendingUp },
      { name: 'Transaksi Berulang', to: '/recurring-transactions', icon: Repeat },
    ]
  },
  {
    name: 'Laporan',
    icon: BarChart3,
    items: [
      { name: 'Laba Rugi', to: '/income-statement', icon: TrendingUp },
      { name: 'Neraca', to: '/balance-sheet', icon: BarChart3 },
      { name: 'Pajak & Cashflow', to: '/reports-general', icon: FileText },
    ]
  },
  {
    name: 'Pengaturan',
    icon: Settings,
    items: [
      { name: 'Pengaturan', to: '/settings', icon: Settings },
    ]
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([]));
  const { user, signOut } = useAuth();
  const { currentCompany } = useCompany();
  const navigate = useNavigate();

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-300 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex h-full flex-col">
          {/* LOGO */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <span className="font-display text-xl font-bold text-white">AccuBooks</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/70 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* NAVIGATION */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            {menuGroups.map((group) => {
              const Icon = group.icon;
              
              // ============================================
              // SINGLE LINK (Dashboard)
              // ============================================
              if (group.isSingle && group.to) {
                return (
                  <div key={group.name} className="mb-2">
                    <NavLink
                      to={group.to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'bg-accent text-white shadow-lg shadow-accent/30'
                            : 'text-white/70 hover:text-white hover:bg-sidebar-hover'
                        }`
                      }
                    >
                      <Icon className="w-5 h-5" />
                      <span>{group.name}</span>
                    </NavLink>
                  </div>
                );
              }
              
              // ============================================
              // GROUP WITH DROPDOWN
              // ============================================
              const isExpanded = expandedGroups.has(group.name);
              const hasItems = group.items && group.items.length > 0;
              
              if (!hasItems) return null;
              
              return (
                <div key={group.name} className="mb-2">
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-sidebar-hover transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5" />
                      <span>{group.name}</span>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.name}
                          to={item.to}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                              isActive
                                ? 'bg-accent text-white shadow-lg shadow-accent/30'
                                : 'text-white/70 hover:text-white hover:bg-sidebar-hover'
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          {item.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* USER INFO */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sidebar-hover">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-semibold text-sm">
                  {user?.name?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name || user?.email}</p>
                <p className="text-xs text-white/50 truncate">
                  {currentCompany?.name || 'Pilih Perusahaan'} • {user?.role || 'staff'}
                </p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* OVERLAY */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* MAIN CONTENT */}
      <div className="lg:pl-64">
        {/* HEADER */}
        <header className="sticky top-0 z-30 h-16 bg-surface border-b border-border flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-text-muted hover:text-text">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <CompanyDropdown />
            <div className="text-right">
              <p className="text-sm font-medium text-text">{currentCompany?.name || 'AccuBooks'}</p>
              <p className="text-xs text-text-muted">{user?.role || 'User'} • {new Date().getFullYear()}</p>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
