import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, ArrowUpDown, Loader2, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

const typeLabels = {
  sale: 'Penjualan',
  purchase: 'Pembelian',
  expense: 'Biaya',
  income: 'Pendapatan',
};

const statusLabels = {
  paid: 'Lunas',
  pending: 'Pending',
  cancelled: 'Dibatalkan',
};

export default function Transactions() {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('Semua');

  useEffect(() => {
    if (currentCompany?.id) {
      fetchTransactions();
    }
  }, [currentCompany]);

  const fetchTransactions = async () => {
    if (!currentCompany?.id) return;
    
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('transaction_date', { ascending: false });
    
    setTransactions(data || []);
    setLoading(false);
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'Semua' || 
                         (filterType === 'Penjualan' && t.type === 'sale') ||
                         (filterType === 'Pembelian' && t.type === 'purchase') ||
                         (filterType === 'Biaya' && t.type === 'expense');
    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const handleRowClick = (id: string) => {
    navigate(`/transactions/${id}`);
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Transaksi</h1>
          <p className="text-text-muted mt-1">Kelola semua transaksi keuangan Anda</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" strokeWidth={2} />
          Transaksi Baru
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Cari transaksi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-text-muted" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-surface"
            >
              <option>Semua</option>
              <option>Penjualan</option>
              <option>Pembelian</option>
              <option>Biaya</option>
            </select>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-background transition-colors">
            <Download className="w-5 h-5" />
            <span className="hidden md:inline">Export</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. Transaksi</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kategori</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Jumlah</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTransactions.map((transaction, index) => (
                  <motion.tr
                    key={transaction.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-background transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono font-semibold text-text">{transaction.transaction_number}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{transaction.transaction_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        transaction.type === 'sale' ? 'bg-green-100 text-green-800' :
                        transaction.type === 'purchase' ? 'bg-blue-100 text-blue-800' :
                        transaction.type === 'income' ? 'bg-cyan-100 text-cyan-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {typeLabels[transaction.type]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{transaction.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-bold">
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
                        {statusLabels[transaction.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleRowClick(transaction.id)}
                        className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-text-muted">
              Menampilkan <span className="font-medium text-text">{filteredTransactions.length}</span> dari <span className="font-medium text-text">{transactions.length}</span> transaksi
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
