import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, TrendingDown, DollarSign, Receipt, Users, FileText, 
  ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Download, 
  Building2, ChevronDown, ChevronUp, Clock, AlertCircle, CheckCircle,
  FileSpreadsheet, Printer
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/accountingHelpers';

// Chart.js
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

// ============================================
// TYPES
// ============================================
type DashboardSummary = {
  totalPendapatan: number;
  totalPengeluaran: number;
  labaBersih: number;
  totalPiutang: number;
  totalHutang: number;
  totalKas: number;
  totalInvoice: number;
  totalPaymentPending: number;
  totalVendorInvoice: number;
  totalPaymentRequestPending: number;
  perubahan: {
    pendapatan: number;
    pengeluaran: number;
    laba: number;
    piutang: number;
    kas: number;
  };
};

type TrendData = {
  labels: string[];
  pendapatan: number[];
  pengeluaran: number[];
  laba: number[];
};

type AgingData = {
  '0-30': number;
  '31-60': number;
  '61-90': number;
  '>90': number;
};

type StatusPaymentData = {
  draft: number;
  submitted: number;
  verified: number;
  approved: number;
  rejected: number;
};

type KategoriTransaksi = Record<string, number>;

type TransaksiTerbaru = {
  id: number;
  tanggal: string;
  tipe: string;
  kategori: string;
  deskripsi: string;
  jumlah: number;
  status: string;
  reference?: string;
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function Dashboard() {
  const navigate = useNavigate();
  const { currentCompany, companies } = useCompany();
  const { user } = useAuth();
  
  // ========== STATE ==========
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [statusPayment, setStatusPayment] = useState<StatusPaymentData | null>(null);
  const [kategoriTransaksi, setKategoriTransaksi] = useState<KategoriTransaksi | null>(null);
  const [transaksiTerbaru, setTransaksiTerbaru] = useState<TransaksiTerbaru[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  
  const isSuperAdmin = user?.role === 'super_admin';
  const isDirektur = user?.role === 'direktur';
  const canSeeAllCompanies = isSuperAdmin || isDirektur;
  
  // ========== EFFECTS ==========
  useEffect(() => {
    if (currentCompany?.id) {
      setSelectedCompanyId(currentCompany.id);
    }
  }, [currentCompany]);
  
  useEffect(() => {
    if (selectedCompanyId && selectedMonth) {
      fetchDashboardData();
    }
  }, [selectedCompanyId, selectedMonth]);
  
  // ========== FETCH DATA ==========
  const fetchDashboardData = async () => {
    if (!selectedCompanyId) return;
    
    setLoading(true);
    try {
      const companyId = selectedCompanyId;
      const [year, month] = selectedMonth.split('-').map(Number);
      
      // ========================================
      // 1. SUMMARY CARDS
      // ========================================
      const summaryData = await fetchSummary(companyId, year, month);
      setSummary(summaryData);
      
      // ========================================
      // 2. TREND DATA (6 months)
      // ========================================
      const trend = await fetchTrendData(companyId, year, month);
      setTrendData(trend);
      
      // ========================================
      // 3. AGING PIUTANG
      // ========================================
      const aging = await fetchAgingData(companyId);
      setAgingData(aging);
      
      // ========================================
      // 4. STATUS PAYMENT REQUEST
      // ========================================
      const status = await fetchStatusPayment(companyId);
      setStatusPayment(status);
      
      // ========================================
      // 5. KATEGORI TRANSAKSI
      // ========================================
      const kategori = await fetchKategoriTransaksi(companyId, year, month);
      setKategoriTransaksi(kategori);
      
      // ========================================
      // 6. TRANSAKSI TERBARU
      // ========================================
      const transaksi = await fetchTransaksiTerbaru(companyId);
      setTransaksiTerbaru(transaksi);
      
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };
  
  // ============================================
  // FETCH FUNCTIONS
  // ============================================
  
  const fetchSummary = async (companyId: number, year: number, month: number) => {
    // Ambil data transaksi bulan ini
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    
    // Data bulan ini
    const { data: txCurrent } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', companyId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);
    
    // Data bulan lalu
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-31`;
    
    const { data: txPrev } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', companyId)
      .gte('transaction_date', prevStart)
      .lte('transaction_date', prevEnd);
    
    // Hitung total pendapatan & pengeluaran
    let pendapatan = 0, pengeluaran = 0;
    (txCurrent || []).forEach(t => {
      if (t.type === 'sale' || t.type === 'income') {
        pendapatan += Math.abs(t.amount);
      } else if (t.type === 'purchase' || t.type === 'expense') {
        pengeluaran += Math.abs(t.amount);
      }
    });
    
    let pendapatanPrev = 0, pengeluaranPrev = 0;
    (txPrev || []).forEach(t => {
      if (t.type === 'sale' || t.type === 'income') {
        pendapatanPrev += Math.abs(t.amount);
      } else if (t.type === 'purchase' || t.type === 'expense') {
        pengeluaranPrev += Math.abs(t.amount);
      }
    });
    
    const laba = pendapatan - pengeluaran;
    const labaPrev = pendapatanPrev - pengeluaranPrev;
    
    // Piutang dari contacts (customer balance > 0)
    const { data: contacts } = await supabase
      .from('contacts')
      .select('balance')
      .eq('company_id', companyId)
      .eq('type', 'customer');
    
    const piutang = (contacts || []).reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    
    // Hutang dari vendor_invoices yang belum lunas
    const { data: vendorInvoices } = await supabase
      .from('vendor_invoices')
      .select('total, paid_amount, status')
      .eq('company_id', companyId)
      .neq('status', 'paid');
    
    const hutang = (vendorInvoices || []).reduce((sum, inv) => {
      return sum + (inv.total - (inv.paid_amount || 0));
    }, 0);
    
    // Kas (akun kas/bank) - ambil dari COA
    const { data: coaKas } = await supabase
      .from('coa')
      .select('id, code')
      .eq('company_id', companyId)
      .ilike('code', '1101%')
      .or('code.ilike.1102%');
    
    const kasIds = (coaKas || []).map(c => c.id);
    let totalKas = 0;
    if (kasIds.length > 0) {
      // Ambil saldo kas dari transaksi
      const { data: kasTx } = await supabase
        .from('transactions')
        .select('amount')
        .eq('company_id', companyId)
        .in('coa_id', kasIds);
      
      totalKas = (kasTx || []).reduce((sum, t) => sum + t.amount, 0);
    }
    
    // Invoice count
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);
    
    // Payment Request pending
    const { count: pendingCount } = await supabase
      .from('payment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['submitted', 'verified']);
    
    // Vendor invoice pending
    const { count: vendorInvoiceCount } = await supabase
      .from('vendor_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['submitted', 'verified']);
    
    // Persentase perubahan
    const calcChange = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return ((current - prev) / Math.abs(prev)) * 100;
    };
    
    return {
      totalPendapatan: pendapatan,
      totalPengeluaran: pengeluaran,
      labaBersih: laba,
      totalPiutang: piutang,
      totalHutang: hutang,
      totalKas: totalKas,
      totalInvoice: invoiceCount || 0,
      totalPaymentPending: pendingCount || 0,
      totalVendorInvoice: vendorInvoiceCount || 0,
      totalPaymentRequestPending: pendingCount || 0,
      perubahan: {
        pendapatan: calcChange(pendapatan, pendapatanPrev),
        pengeluaran: calcChange(pengeluaran, pengeluaranPrev),
        laba: calcChange(laba, labaPrev),
        piutang: 0, // placeholder
        kas: 0, // placeholder
      }
    };
  };
  
  const fetchTrendData = async (companyId: number, year: number, month: number) => {
    const months = [];
    const pendapatan = [];
    const pengeluaran = [];
    const laba = [];
    
    for (let i = 5; i >= 0; i--) {
      let m = month - i;
      let y = year;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      const label = `${String(m).padStart(2, '0')}/${y}`;
      months.push(label);
      
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = `${y}-${String(m).padStart(2, '0')}-31`;
      
      const { data: tx } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('company_id', companyId)
        .gte('transaction_date', start)
        .lte('transaction_date', end);
      
      let p = 0, q = 0;
      (tx || []).forEach(t => {
        if (t.type === 'sale' || t.type === 'income') {
          p += Math.abs(t.amount);
        } else if (t.type === 'purchase' || t.type === 'expense') {
          q += Math.abs(t.amount);
        }
      });
      
      pendapatan.push(p);
      pengeluaran.push(q);
      laba.push(p - q);
    }
    
    return { labels: months, pendapatan, pengeluaran, laba };
  };
  
  const fetchAgingData = async (companyId: number) => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, total, paid_amount, due_date, status')
      .eq('company_id', companyId)
      .neq('status', 'paid');
    
    const today = new Date();
    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    
    (invoices || []).forEach(inv => {
      const remaining = inv.total - (inv.paid_amount || 0);
      if (remaining <= 0) return;
      
      const due = new Date(inv.due_date);
      const diff = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diff <= 0) aging['0-30'] += remaining;
      else if (diff <= 30) aging['0-30'] += remaining;
      else if (diff <= 60) aging['31-60'] += remaining;
      else if (diff <= 90) aging['61-90'] += remaining;
      else aging['>90'] += remaining;
    });
    
    return aging;
  };
  
  const fetchStatusPayment = async (companyId: number) => {
    const { data } = await supabase
      .from('payment_requests')
      .select('status')
      .eq('company_id', companyId);
    
    const result = { draft: 0, submitted: 0, verified: 0, approved: 0, rejected: 0 };
    (data || []).forEach(r => {
      if (result[r.status as keyof typeof result] !== undefined) {
        result[r.status as keyof typeof result] += 1;
      }
    });
    return result;
  };
  
  const fetchKategoriTransaksi = async (companyId: number, year: number, month: number) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    
    const { data } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('company_id', companyId)
      .gte('transaction_date', start)
      .lte('transaction_date', end);
    
    const kategori: Record<string, number> = {};
    (data || []).forEach(t => {
      const key = t.category || 'Lain-lain';
      kategori[key] = (kategori[key] || 0) + Math.abs(t.amount);
    });
    
    // Sort descending dan ambil top 5
    const sorted = Object.entries(kategori).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    return Object.fromEntries(top5);
  };
  
  const fetchTransaksiTerbaru = async (companyId: number) => {
    // Gabungkan dari beberapa sumber (transactions, invoices, payment_requests)
    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    const { data: payments } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    const results: TransaksiTerbaru[] = [];
    
    (tx || []).forEach(t => {
      results.push({
        id: t.id,
        tanggal: t.transaction_date,
        tipe: t.type,
        kategori: t.category || '',
        deskripsi: t.description || '',
        jumlah: t.amount,
        status: t.status || 'pending',
      });
    });
    
    (invoices || []).forEach(inv => {
      results.push({
        id: inv.id,
        tanggal: inv.invoice_date,
        tipe: 'invoice',
        kategori: 'Penjualan',
        deskripsi: `Invoice ${inv.invoice_number} - ${inv.customer_name}`,
        jumlah: inv.total,
        status: inv.status,
        reference: inv.invoice_number,
      });
    });
    
    (payments || []).forEach(p => {
      results.push({
        id: p.id,
        tanggal: p.request_date,
        tipe: 'payment_request',
        kategori: 'Payment Request',
        deskripsi: p.description,
        jumlah: p.amount,
        status: p.status,
        reference: p.request_number,
      });
    });
    
    // Sort by tanggal descending
    results.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    return results.slice(0, 10);
  };
  
  // ============================================
  // RENDER HELPERS
  // ============================================
  
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
  
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-green-100 text-green-800',
      approved: 'bg-green-100 text-green-800',
      verified: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-blue-100 text-blue-800',
      draft: 'bg-gray-100 text-gray-800',
      partial: 'bg-orange-100 text-orange-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };
  
  const getStatusIcon = (status: string) => {
    if (status === 'paid' || status === 'approved') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status === 'rejected' || status === 'cancelled') return <AlertCircle className="w-4 h-4 text-red-600" />;
    if (status === 'submitted' || status === 'verified') return <Clock className="w-4 h-4 text-yellow-600" />;
    return <Clock className="w-4 h-4 text-gray-600" />;
  };
  
  // ============================================
  // CHART OPTIONS
  // ============================================
  
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}J`,
        },
      },
    },
  };
  
  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}J`,
        },
      },
    },
  };
  
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
    },
  };
  
  // ============================================
  // RENDER
  // ============================================
  
  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }
  
  const companyOptions = canSeeAllCompanies ? companies : [currentCompany];
  
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Dashboard</h1>
          <p className="text-text-muted mt-1">
            Selamat datang, {user?.name || user?.email}!
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Company Filter */}
          {canSeeAllCompanies && companies.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-accent transition-colors"
              >
                <Building2 className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">
                  {companies.find(c => c.id === selectedCompanyId)?.name || 'Pilih Perusahaan'}
                </span>
                {showCompanyDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showCompanyDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-lg shadow-lg z-20 overflow-hidden">
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCompanyId(c.id);
                        setShowCompanyDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-background transition-colors ${
                        selectedCompanyId === c.id ? 'bg-accent/10 text-accent font-medium' : 'text-text'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Period Filter */}
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      
      {/* LOADING */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
        </div>
      ) : (
        <>
          {/* ============================================ */}
          {/* SUMMARY CARDS */}
          {/* ============================================ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {summary && [
              { label: 'Pendapatan', value: summary.totalPendapatan, change: summary.perubahan.pendapatan, icon: TrendingUp, color: 'success' },
              { label: 'Pengeluaran', value: summary.totalPengeluaran, change: summary.perubahan.pengeluaran, icon: TrendingDown, color: 'danger' },
              { label: 'Laba Bersih', value: summary.labaBersih, change: summary.perubahan.laba, icon: DollarSign, color: 'info' },
              { label: 'Piutang', value: summary.totalPiutang, change: 0, icon: Receipt, color: 'warning' },
              { label: 'Hutang', value: summary.totalHutang, change: 0, icon: FileText, color: 'danger' },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-surface rounded-xl border border-border p-4 card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-text-muted text-xs font-medium truncate">{stat.label}</p>
                    <p className="text-text text-xl font-bold font-display mt-1 truncate">
                      {formatCurrency(stat.value)}
                    </p>
                    {stat.change !== 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {stat.change > 0 ? (
                          <ArrowUpRight className={`w-3 h-3 text-${stat.color}`} />
                        ) : (
                          <ArrowDownRight className={`w-3 h-3 text-${stat.color}`} />
                        )}
                        <span className={`text-xs font-medium text-${stat.color}`}>
                          {stat.change > 0 ? '+' : ''}{stat.change.toFixed(1)}%
                        </span>
                        <span className="text-text-muted text-xs">vs bulan lalu</span>
                      </div>
                    )}
                  </div>
                  <div className={`w-10 h-10 rounded-lg bg-${stat.color}/10 flex items-center justify-center flex-shrink-0`}>
                    <stat.icon className={`w-5 h-5 text-${stat.color}`} strokeWidth={2} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          
          {/* Additional stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-text-muted text-xs">Total Invoice</p>
              <p className="text-2xl font-bold">{summary?.totalInvoice || 0}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-text-muted text-xs">Payment Request Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{summary?.totalPaymentRequestPending || 0}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-text-muted text-xs">Vendor Invoice Pending</p>
              <p className="text-2xl font-bold text-orange-600">{summary?.totalVendorInvoice || 0}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-text-muted text-xs">Saldo Kas</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(summary?.totalKas || 0)}</p>
            </div>
          </div>
          
          {/* ============================================ */}
          {/* CHARTS ROW 1 */}
          {/* ============================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart: Pendapatan vs Pengeluaran */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Pendapatan vs Pengeluaran</h3>
              <div className="h-64">
                {trendData && (
                  <Bar
                    data={{
                      labels: trendData.labels,
                      datasets: [
                        {
                          label: 'Pendapatan',
                          data: trendData.pendapatan,
                          backgroundColor: 'rgba(34, 197, 94, 0.6)',
                          borderColor: 'rgb(34, 197, 94)',
                          borderWidth: 1,
                        },
                        {
                          label: 'Pengeluaran',
                          data: trendData.pengeluaran,
                          backgroundColor: 'rgba(239, 68, 68, 0.6)',
                          borderColor: 'rgb(239, 68, 68)',
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={barOptions}
                  />
                )}
              </div>
            </div>
            
            {/* Line Chart: Laba */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Trend Laba Bersih</h3>
              <div className="h-64">
                {trendData && (
                  <Line
                    data={{
                      labels: trendData.labels,
                      datasets: [
                        {
                          label: 'Laba Bersih',
                          data: trendData.laba,
                          borderColor: 'rgb(59, 130, 246)',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          fill: true,
                          tension: 0.3,
                        },
                      ],
                    }}
                    options={lineOptions}
                  />
                )}
              </div>
            </div>
          </div>
          
          {/* ============================================ */}
          {/* CHARTS ROW 2 */}
          {/* ============================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Doughnut: Status Payment */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Status Payment Request</h3>
              <div className="h-52">
                {statusPayment && (
                  <Doughnut
                    data={{
                      labels: ['Draft', 'Submitted', 'Verified', 'Approved', 'Rejected'],
                      datasets: [
                        {
                          data: [
                            statusPayment.draft,
                            statusPayment.submitted,
                            statusPayment.verified,
                            statusPayment.approved,
                            statusPayment.rejected,
                          ],
                          backgroundColor: [
                            'rgba(156, 163, 175, 0.8)',
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(234, 179, 8, 0.8)',
                            'rgba(34, 197, 94, 0.8)',
                            'rgba(239, 68, 68, 0.8)',
                          ],
                        },
                      ],
                    }}
                    options={doughnutOptions}
                  />
                )}
              </div>
            </div>
            
            {/* Bar Chart: Aging Piutang */}
            <div className="bg-surface rounded-xl border border-border p-5 lg:col-span-1">
              <h3 className="font-display font-bold text-text mb-4">Aging Piutang</h3>
              <div className="h-52">
                {agingData && (
                  <Bar
                    data={{
                      labels: ['0-30 hari', '31-60 hari', '61-90 hari', '>90 hari'],
                      datasets: [
                        {
                          label: 'Piutang',
                          data: [
                            agingData['0-30'],
                            agingData['31-60'],
                            agingData['61-90'],
                            agingData['>90'],
                          ],
                          backgroundColor: [
                            'rgba(34, 197, 94, 0.7)',
                            'rgba(234, 179, 8, 0.7)',
                            'rgba(251, 146, 60, 0.7)',
                            'rgba(239, 68, 68, 0.7)',
                          ],
                        },
                      ],
                    }}
                    options={barOptions}
                  />
                )}
              </div>
            </div>
            
            {/* Horizontal Bar: Kategori Transaksi */}
            <div className="bg-surface rounded-xl border border-border p-5 lg:col-span-1">
              <h3 className="font-display font-bold text-text mb-4">Kategori Transaksi</h3>
              <div className="h-52">
                {kategoriTransaksi && Object.keys(kategoriTransaksi).length > 0 && (
                  <Bar
  data={{
    labels: Object.keys(kategoriTransaksi),
    datasets: [
      {
        label: 'Jumlah',
        data: Object.values(kategoriTransaksi),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
      },
    ],
  }}
  options={{
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}J`,
        },
      },
    },
  }}
/>
                )}
              </div>
            </div>
          </div>
          
          {/* ============================================ */}
          {/* TRANSAKSI TERBARU */}
          {/* ============================================ */}
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-bold text-text">Transaksi Terbaru</h3>
              <button
                onClick={() => navigate('/transactions')}
                className="text-sm text-accent hover:underline"
              >
                Lihat Semua →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase">Jumlah</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transaksiTerbaru.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-text-muted">
                        Belum ada transaksi
                      </td>
                    </tr>
                  ) : (
                    transaksiTerbaru.slice(0, 8).map((t, idx) => (
                      <motion.tr
                        key={idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.03 }}
                        className="hover:bg-background transition-colors cursor-pointer"
                        onClick={() => {
                          if (t.tipe === 'invoice') navigate(`/invoices/${t.id}`);
                          else if (t.tipe === 'payment_request') navigate(`/payment-requests/${t.id}`);
                          else navigate(`/transactions/${t.id}`);
                        }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{formatDate(t.tanggal)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.tipe === 'sale' || t.tipe === 'income' || t.tipe === 'invoice' ? 'bg-green-100 text-green-800' :
                            t.tipe === 'purchase' || t.tipe === 'expense' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {t.tipe}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm truncate max-w-xs">{t.deskripsi}</td>
                        <td className={`px-4 py-3 whitespace-nowrap text-right font-mono font-semibold ${
                          t.jumlah > 0 ? 'text-success' : 'text-danger'
                        }`}>
                          {formatCurrency(t.jumlah)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getStatusIcon(t.status)}
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>
                              {t.status}
                            </span>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* ============================================ */}
          {/* QUICK ACTIONS */}
          {/* ============================================ */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="font-display font-bold text-text mb-4">Aksi Cepat</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                onClick={() => navigate('/invoices')}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-border hover:border-accent hover:bg-accent/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-text">Faktur Penjualan</span>
              </button>
              <button
                onClick={() => navigate('/purchase-invoices')}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-border hover:border-accent hover:bg-accent/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Receipt className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-text">Faktur Pembelian</span>
              </button>
              <button
                onClick={() => navigate('/payment-requests')}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-border hover:border-accent hover:bg-accent/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-yellow-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-text">Payment Request</span>
              </button>
              <button
                onClick={() => navigate('/contacts')}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-border hover:border-accent hover:bg-accent/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-text">Kontak Baru</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
