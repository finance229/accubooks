import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, DollarSign, Clock, CheckCircle, Download, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

export default function Invoices() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    customer: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchInvoices();
    }
  }, [currentCompany]);

  const fetchInvoices = async () => {
    if (!currentCompany?.id) return;
    
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', currentCompany.id)
      .eq('type', 'sale')
      .order('transaction_date', { ascending: false });
    
    setInvoices(data || []);
    setLoading(false);
  };

  const handleCreateInvoice = async () => {
    if (!newInvoice.customer || !newInvoice.amount) {
      alert('Mohon isi customer dan jumlah');
      return;
    }
    if (!currentCompany?.id) return;

    const { error } = await supabase
      .from('transactions')
      .insert([{
        company_id: currentCompany.id,
        transaction_number: `INV-${Date.now()}`,
        type: 'sale',
        category: newInvoice.customer,
        amount: parseInt(newInvoice.amount),
        status: 'pending',
        payment_method: 'Transfer',
        transaction_date: newInvoice.date,
        description: `Invoice untuk ${newInvoice.customer}`
      }]);
    
    if (error) {
      alert('Gagal membuat invoice');
    } else {
      alert('Invoice berhasil dibuat');
      setShowModal(false);
      fetchInvoices();
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.transaction_number?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const matchesFilter = filterStatus === 'all' || inv.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.abs(amount));
  };

  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, inv) => sum + Math.abs(inv.amount || 0), 0),
    paid: invoices.filter(i => i.status === 'paid').length,
    pending: invoices.filter(i => i.status === 'pending').length,
    outstanding: invoices.filter(i => i.status === 'pending').reduce((sum, inv) => sum + Math.abs(inv.amount || 0), 0),
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = { 
      paid: 'bg-success/10 text-success', 
      pending: 'bg-warning/10 text-warning', 
      cancelled: 'bg-danger/10 text-danger' 
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };
  
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { 
      paid: 'Lunas', 
      pending: 'Pending', 
      cancelled: 'Dibatalkan' 
    };
    return labels[status] || status;
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Invoice</h1>
          <p className="text-text-muted mt-1">Kelola faktur penjualan</p>
        </div>
        <button 
          onClick={() => setShowModal(true)} 
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30"
        >
          <Plus className="w-5 h-5" /> Buat Invoice
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Total Invoice</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.total}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Total Amount</p>
          <p className="text-text text-lg font-bold font-display mt-1">{formatCurrency(stats.totalAmount)}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Lunas</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.paid}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Outstanding</p>
          <p className="text-text text-lg font-bold font-display mt-1">{formatCurrency(stats.outstanding)}</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input 
              type="text" 
              placeholder="Cari nomor invoice..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" 
            />
          </div>
          <div className="flex gap-2">
            {['all', 'pending', 'paid'].map(status => (
              <button 
                key={status} 
                onClick={() => setFilterStatus(status)} 
                className={`px-4 py-2.5 rounded-lg font-medium capitalize ${filterStatus === status ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}
              >
                {status === 'all' ? 'Semua' : getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kategori</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Total</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
              ) : (
                filteredInvoices.map((invoice, index) => (
                  <motion.tr 
                    key={invoice.id} 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    transition={{ delay: index * 0.05 }} 
                    className="hover:bg-background transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono font-semibold text-text">{invoice.transaction_number}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{invoice.transaction_date}</td>
                    <td className="px-6 py-4 text-sm text-text">{invoice.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono font-semibold text-text">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg transition-colors">
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold text-text">Buat Invoice Baru</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Nama Customer" 
                value={newInvoice.customer} 
                onChange={(e) => setNewInvoice({...newInvoice, customer: e.target.value})} 
                className="w-full px-4 py-2 border border-border rounded-lg" 
              />
              <input 
                type="number" 
                placeholder="Jumlah (Rp)" 
                value={newInvoice.amount} 
                onChange={(e) => setNewInvoice({...newInvoice, amount: e.target.value})} 
                className="w-full px-4 py-2 border border-border rounded-lg" 
              />
              <input 
                type="date" 
                value={newInvoice.date} 
                onChange={(e) => setNewInvoice({...newInvoice, date: e.target.value})} 
                className="w-full px-4 py-2 border border-border rounded-lg" 
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleCreateInvoice} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
