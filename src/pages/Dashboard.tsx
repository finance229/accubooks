import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Receipt, Users, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

const quickActions = [
  { name: 'Faktur Penjualan', icon: FileText, color: 'bg-blue-500', path: '/invoices' },
  { name: 'Faktur Pembelian', icon: Receipt, color: 'bg-purple-500', path: '/transactions' },
  { name: 'Kas & Bank', icon: DollarSign, color: 'bg-green-500', path: '/transactions' },
  { name: 'Kontak Baru', icon: Users, color: 'bg-orange-500', path: '/contacts' },
];

const typeLabels: Record<string, string> = {
  sale: 'Penjualan',
  purchase: 'Pembelian',
  expense: 'Biaya',
  income: 'Pendapatan',
};

const statusLabels: Record<string, string> = {
  paid: 'Lunas',
  pending: 'Pending',
  cancelled: 'Dibatalkan',
};

export default function Dashboard() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchData();
    }
  }, [currentCompany]);

  const fetchData = async () => {
    if (!currentCompany?.id) return;
    
    setLoading(true);
    
    const { data: transactionsData } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('transaction_date', { ascending: false });
    
    const { data: contactsData } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', currentCompany.id);
    
    setTransactions(transactionsData || []);
    setContacts(contactsData || []);
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyTransactions = (transactionsData || []).filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    monthlyTransactions.forEach(t => {
      if (t.type === 'sale' || t.type === 'income') {
        totalIncome += Math.abs(t.amount);
      } else if (t.type === 'purchase' || t.type === 'expense') {
        totalExpense += Math.abs(t.amount);
      }
    });
    
    const netProfit = totalIncome - totalExpense;
    const receivables = (contactsData || []).filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0);
    
    setStats([
      { name: 'Total Pendapatan', value: totalIncome, change: '+12.5%', trend: 'up', icon: TrendingUp, color: 'success' },
      { name: 'Total Pengeluaran', value: totalExpense, change: '+8.2%', trend: 'up', icon: TrendingDown, color: 'danger' },
      { name: 'Laba Bersih', value: netProfit, change: netProfit > 0 ? '+18.7%' : '-5.2%', trend: netProfit > 0 ? 'up' : 'down', icon: DollarSign, color: 'info' },
      { name: 'Piutang', value: receivables, change: '-5.4%', trend: 'down', icon: Receipt, color: 'warning' },
    ]);
    
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const recentTransactions = transactions.slice(0, 5);

  const handleActionClick = (path: string) => {
    navigate(path);
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Dashboard</h1>
        <p className="text-text-muted mt-1">Selamat datang, {user?.name || user?.email}!</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-surface rounded-xl border border-border p-6 card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-text-muted text-sm font-medium">{stat.name}</p>
                    <p className="text-text text-2xl font-bold font-display mt-2">{formatCurrency(stat.value)}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {stat.trend === 'up' ? (
                        <ArrowUpRight className={`w-4 h-4 text-${stat.color}`} />
                      ) : (
                        <ArrowDownRight className={`w-4 h-4 text-${stat.color}`} />
                      )}
                      <span className={`text-sm font-medium text-${stat.color}`}>{stat.change}</span>
                      <span className="text-text-muted text-xs">vs bulan lalu</span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-lg bg-${stat.color}/10 flex items-center justify-center`}>
                    <stat.icon className={`w-6 h-6 text-${stat.color}`} strokeWidth={2} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-surface rounded-xl border border-border p-6"
          >
            <h2 className="font-display text-xl font-bold text-text mb-4">Aksi Cepat</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {quickActions.map((action) => (
                <button
                  key={action.name}
                  onClick={() => handleActionClick(action.path)}
                  className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-border hover:border-accent hover:bg-accent/5 transition-all duration-200 group"
                >
                  <div className={`${action.color} w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <action.icon className="w-6 h-6 text-white" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-medium text-text text-center">{action.name}</span>
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-surface rounded-xl border border-border overflow-hidden"
          >
            <div className="p-6 border-b border-border">
              <h2 className="font-display text-xl font-bold text-text">Transaksi Terbaru</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kategori</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Jumlah</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-background transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{transaction.transaction_date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          transaction.type === 'sale' ? 'bg-green-100 text-green-800' :
                          transaction.type === 'purchase' ? 'bg-blue-100 text-blue-800' :
                          transaction.type === 'income' ? 'bg-cyan-100 text-cyan-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {typeLabels[transaction.type] || transaction.type}
                        </span>
                       </td>
                      <td className="px-6 py-4 text-sm text-text">{transaction.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-semibold">
                        <span className={transaction.amount > 0 ? 'text-success' : 'text-danger'}>
                          {formatCurrency(transaction.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          transaction.status === 'paid' ? 'bg-success/10 text-success' : 
                          transaction.status === 'pending' ? 'bg-warning/10 text-warning' :
                          'bg-danger/10 text-danger'
                        }`}>
                          {statusLabels[transaction.status] || transaction.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
