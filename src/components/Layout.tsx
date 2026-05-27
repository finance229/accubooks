import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, FileText, Users, Settings, Menu, X, TrendingUp, FolderOpen, CreditCard, FolderKanban } from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { name: 'Transaksi', to: '/transactions', icon: Receipt },
  { name: 'Payment Requests', to: '/payment-requests', icon: CreditCard },
  { name: 'Proyek', to: '/projects', icon: FolderKanban },
  { name: 'Dokumen', to: '/documents', icon: FolderOpen },
  { name: 'Kontak', to: '/contacts', icon: Users },
  { name: 'Laporan', to: '/reports', icon: FileText },
  { name: 'Pengaturan', to: '/settings', icon: Settings },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-300 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex h-full flex-col">
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
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-white shadow-lg shadow-accent/30'
                      : 'text-white/70 hover:text-white hover:bg-sidebar-hover'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sidebar-hover">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-semibold text-sm">PT</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">PT Maju Jaya</p>
                <p className="text-xs text-white/50 truncate">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 h-16 bg-surface border-b border-border flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-text-muted hover:text-text">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-text">Periode Akuntansi</p>
              <p className="text-xs text-text-muted">Januari 2024</p>
            </div>
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
